/**
 * MediaService.gs: private media in Google Drive.
 * Uploads use the Drive resumable-upload protocol, proxied in chunks through Apps Script,
 * so large videos never have to fit in one request. Files are never shared publicly.
 */

function mediaTypeFromMime(mime) {
  if (/^image\//.test(mime)) return 'image';
  if (/^video\//.test(mime)) return 'video';
  throw new AppError('Only images and videos can be attached.', 'VALIDATION');
}

function trashFile(fileId) {
  if (!fileId) return;
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* already gone */ }
}

/** Confirms a Drive file exists, sits in the journal media folder, and is an image/video. */
function verifyMediaFile(fileId) {
  let file;
  try { file = DriveApp.getFileById(fileId); } catch (e) { throw new AppError('Uploaded file could not be found in Drive.', 'DRIVE'); }
  const folderId = getProp('MEDIA_FOLDER_ID');
  let inFolder = false;
  const parents = file.getParents();
  while (parents.hasNext()) { if (parents.next().getId() === folderId) { inFolder = true; break; } }
  if (!inFolder) throw new AppError('That file is not in the journal media folder.', 'FORBIDDEN');
  const mime = file.getMimeType();
  return { fileId: file.getId(), fileName: file.getName(), mimeType: mime, mediaType: mediaTypeFromMime(mime), fileUrl: file.getUrl(), size: file.getSize() };
}

/** Step 1 of an upload: validate, open a resumable session, remember it server-side. */
function startUpload(meta) {
  const name = clean(meta && meta.fileName, 200) || 'upload';
  const mime = clean(meta && meta.mimeType, 100).toLowerCase();
  const size = Number(meta && meta.size);
  const type = mediaTypeFromMime(mime);
  if (!(size > 0)) throw new AppError(name + ' is empty.', 'VALIDATION');
  const s = getSettings();
  const maxMb = Number(type === 'image' ? s.MAX_IMAGE_MB : s.MAX_VIDEO_MB);
  if (size > maxMb * 1024 * 1024) throw new AppError(name + ' is larger than the ' + maxMb + ' MB limit for ' + type + 's.', 'VALIDATION');

  const resp = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(size) },
    payload: JSON.stringify({ name: name, mimeType: mime, parents: [getProp('MEDIA_FOLDER_ID')] }),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) throw new AppError('Drive refused the upload (code ' + resp.getResponseCode() + ').', 'DRIVE');
  const h = resp.getAllHeaders();
  const uri = h['Location'] || h['location'];
  if (!uri) throw new AppError('Drive did not return an upload session.', 'DRIVE');
  const uploadId = uid('up');
  CacheService.getScriptCache().put('up_' + uploadId, JSON.stringify({ uri: uri, size: size, mime: mime, received: 0 }), 21600);
  return ok({ uploadId: uploadId, chunkBytes: CHUNK_BYTES });
}

/** Step 2: send one chunk (base64). Chunks must arrive in order. */
function uploadChunk(p) {
  const id = clean(p && p.uploadId, 40);
  const cache = CacheService.getScriptCache();
  const st = JSON.parse(cache.get('up_' + id) || 'null');
  if (!st) throw new AppError('This upload session expired. Please add the file again.', 'UPLOAD');
  const start = Number(p.start);
  if (start !== st.received) throw new AppError('Upload went out of sync. Please add the file again.', 'UPLOAD');
  const bytes = Utilities.base64Decode(String(p.data || ''));
  if (!bytes.length) throw new AppError('Empty upload chunk.', 'UPLOAD');
  const end = start + bytes.length - 1;
  if (end >= st.size) throw new AppError('Upload is larger than declared.', 'UPLOAD');

  const resp = UrlFetchApp.fetch(st.uri, {
    method: 'put',
    contentType: st.mime,
    headers: { 'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size },
    payload: bytes,
    muteHttpExceptions: true,
    followRedirects: false
  });
  const code = resp.getResponseCode();
  if (code === 308) {
    st.received = end + 1;
    cache.put('up_' + id, JSON.stringify(st), 21600);
    return ok({ done: false, received: st.received });
  }
  if (code === 200 || code === 201) {
    cache.remove('up_' + id);
    const driveId = JSON.parse(resp.getContentText()).id;
    return ok({ done: true, file: verifyMediaFile(driveId) });
  }
  throw new AppError('Upload failed (code ' + code + ').', 'UPLOAD');
}

function findMedia(mediaId) {
  const m = readAll(SHEET_DEFS.MEDIA).filter(x => x.mediaId === clean(mediaId, 40))[0];
  if (!m) throw new AppError('Attachment not found.', 'NOT_FOUND');
  return m;
}

function getMedia(mediaId) {
  return ok(mediaToClient(findMedia(mediaId)));
}

/** Small preview image served through the backend, so the Drive file stays private. */
function getMediaThumb(mediaId) {
  const m = findMedia(mediaId);
  if (!m.fileId) return ok(null);
  let blob = null;
  try { blob = DriveApp.getFileById(m.fileId).getThumbnail(); } catch (e) { blob = null; }
  if (!blob) return ok(null);
  return ok({ dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) });
}

/** Full-size image for the viewer (up to 6 MB; larger files fall back to Drive's own viewer). */
function getMediaImage(mediaId) {
  const m = findMedia(mediaId);
  if (!m.fileId || m.mediaType !== 'image') return ok(null);
  const file = DriveApp.getFileById(m.fileId);
  if (file.getSize() > 6 * 1024 * 1024 || !/^image\/(jpeg|png|gif|webp)$/.test(file.getMimeType())) return ok(null);
  const blob = file.getBlob();
  return ok({ dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) });
}

function deleteMedia(mediaId) {
  return withLock(() => {
    const m = findMedia(mediaId);
    deleteRowsWhere(SHEET_DEFS.MEDIA, 'mediaId', m.mediaId);
    trashFile(m.fileId);
    const left = readAll(SHEET_DEFS.MEDIA).filter(x => x.entryId === m.entryId).length;
    if (findRowNumber(SHEET_DEFS.JOURNAL, 'entryId', m.entryId)) updateRowById(SHEET_DEFS.JOURNAL, 'entryId', m.entryId, { attachmentCount: String(left), updatedAt: nowIso() });
    return ok({ mediaId: m.mediaId }, 'Attachment removed.');
  });
}

/**
 * Maintenance (run manually or on a daily trigger): moves to Drive's trash any file in the media
 * folder that no journal entry references and that is older than 24 hours (abandoned uploads).
 */
function cleanupOrphanMedia() {
  const used = {};
  readAll(SHEET_DEFS.MEDIA).forEach(m => { if (m.fileId) used[m.fileId] = true; });
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const files = DriveApp.getFolderById(getProp('MEDIA_FOLDER_ID')).getFiles();
  let n = 0;
  while (files.hasNext()) {
    const f = files.next();
    if (!used[f.getId()] && f.getDateCreated().getTime() < cutoff) { f.setTrashed(true); n++; }
  }
  console.log('Orphan files moved to trash: ' + n);
  return n;
}

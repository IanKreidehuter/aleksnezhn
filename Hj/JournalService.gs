/** JournalService.gs: validation, CRUD, search and filtering for journal entries. */

function parseEmotions(json) {
  try { const a = JSON.parse(json); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

function mediaToClient(m) {
  return { mediaId: m.mediaId, fileName: m.fileName, mimeType: m.mimeType, fileId: m.fileId, fileUrl: m.fileUrl, mediaType: m.mediaType, external: !m.fileId };
}

function rowToEntry(r, media, moods) {
  return {
    entryId: r.entryId, entryDate: r.entryDate, entryTime: r.entryTime,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
    event: r.event, thoughts: r.thoughts, emotions: parseEmotions(r.emotionsJson),
    behaviourResponse: r.behaviourResponse, physicalResponse: r.physicalResponse,
    additionalNotes: r.additionalNotes, location: r.location,
    attachmentCount: Number(r.attachmentCount) || 0, status: r.status,
    edited: r.updatedAt !== r.createdAt,
    media: media.map(mediaToClient),
    moodRecords: moods.map(m => ({ moodId: m.moodId, event: m.event, thoughts: m.thoughts, emotion: m.emotion, behaviourResponse: m.behaviourResponse, physicalResponse: m.physicalResponse }))
  };
}

function entryToRow(id, e, createdAt, updatedAt, count) {
  return {
    entryId: id, entryDate: e.entryDate, entryTime: e.entryTime, createdAt: createdAt, updatedAt: updatedAt,
    event: e.event, thoughts: e.thoughts, emotionsJson: JSON.stringify(e.emotions),
    behaviourResponse: e.behaviourResponse, physicalResponse: e.physicalResponse,
    additionalNotes: e.additionalNotes, location: e.location, attachmentCount: String(count), status: 'active'
  };
}

function buildEntry(entryId) {
  const row = readAll(SHEET_DEFS.JOURNAL).filter(r => r.entryId === entryId)[0];
  if (!row) throw new AppError('Entry not found.', 'NOT_FOUND');
  const media = readAll(SHEET_DEFS.MEDIA).filter(m => m.entryId === entryId);
  const moods = readAll(SHEET_DEFS.MOOD).filter(m => m.entryId === entryId);
  return rowToEntry(row, media, moods);
}

/* ---------- validation ---------- */

function validateEmotions(list) {
  if (!Array.isArray(list) || list.length !== 3) throw new AppError('Choose exactly three emotions.', 'VALIDATION');
  const seen = {};
  return list.map(x => {
    const name = clean(x && x.name, 60);
    const category = clean(x && x.category, 30);
    if (!Object.prototype.hasOwnProperty.call(EMOTIONS, category) || EMOTIONS[category].indexOf(name) < 0) {
      throw new AppError('One of the emotions is not recognised.', 'VALIDATION');
    }
    if (seen[name.toLowerCase()]) throw new AppError('Each emotion can only be chosen once.', 'VALIDATION');
    seen[name.toLowerCase()] = true;
    return { name: name, category: category };
  });
}

function validateAttachments(list) {
  list = Array.isArray(list) ? list : [];
  const max = Number(getSettings().MAX_ATTACHMENTS) || 10;
  if (list.length > max) throw new AppError('You can attach up to ' + max + ' files.', 'VALIDATION');
  const seen = {};
  return list.map(a => {
    if (a && a.mediaId) {
      const id = clean(a.mediaId, 40);
      if (seen[id]) throw new AppError('An attachment was listed twice.', 'VALIDATION');
      seen[id] = true;
      return { kind: 'existing', mediaId: id };
    }
    if (a && a.fileId) {
      const id = clean(a.fileId, 120);
      if (seen[id]) throw new AppError('An attachment was listed twice.', 'VALIDATION');
      seen[id] = true;
      const info = verifyMediaFile(id);
      return { kind: 'new', fileId: info.fileId, fileName: info.fileName, mimeType: info.mimeType, fileUrl: info.fileUrl, mediaType: info.mediaType };
    }
    if (a && a.external) {
      const url = clean(a.fileUrl, 2000);
      if (!/^https:\/\/[^\s]+$/i.test(url)) throw new AppError('External media links must start with https://', 'VALIDATION');
      const name = clean(a.fileName, 200) || url.split('?')[0].split('/').pop() || 'link';
      return { kind: 'external', fileId: '', fileName: name, mimeType: '', fileUrl: url, mediaType: a.mediaType === 'video' ? 'video' : 'image' };
    }
    throw new AppError('One of the attachments is invalid.', 'VALIDATION');
  });
}

function validateMoodRecords(list) {
  list = Array.isArray(list) ? list.slice(0, LIMITS.MAX_MOOD_ROWS) : [];
  return list.map(r => ({
    event: clean(r && r.event, LIMITS.LONG), thoughts: clean(r && r.thoughts, LIMITS.LONG),
    emotion: clean(r && r.emotion, LIMITS.LONG), behaviourResponse: clean(r && r.behaviourResponse, LIMITS.LONG),
    physicalResponse: clean(r && r.physicalResponse, LIMITS.LONG)
  })).filter(r => r.event || r.thoughts || r.emotion || r.behaviourResponse || r.physicalResponse);
}

function validateEntryInput(data) {
  if (!data || typeof data !== 'object') throw new AppError('No data received.', 'VALIDATION');
  const e = {
    entryDate: clean(data.entryDate, 10), entryTime: clean(data.entryTime, 5),
    event: clean(data.event, LIMITS.LONG), thoughts: clean(data.thoughts, LIMITS.LONG),
    behaviourResponse: clean(data.behaviourResponse, LIMITS.LONG), physicalResponse: clean(data.physicalResponse, LIMITS.LONG),
    additionalNotes: clean(data.additionalNotes, LIMITS.LONG), location: clean(data.location, LIMITS.SHORT)
  };
  if (!isValidDate(e.entryDate)) throw new AppError('Choose a valid date.', 'VALIDATION');
  if (!isValidTime(e.entryTime)) throw new AppError('Choose a valid time.', 'VALIDATION');
  if (!e.event) throw new AppError('Describe what happened.', 'VALIDATION');
  e.emotions = validateEmotions(data.emotions);
  e.moodRecords = validateMoodRecords(data.moodRecords);
  e.attachments = validateAttachments(data.attachments);
  return e;
}

/* ---------- write path (call only inside withLock) ---------- */

function persistEntry(entryId, e, createdAt, updatedAt, isNew) {
  const existing = isNew ? [] : readAll(SHEET_DEFS.MEDIA).filter(m => m.entryId === entryId);
  const keepIds = e.attachments.filter(a => a.kind === 'existing').map(a => a.mediaId);
  keepIds.forEach(id => {
    if (!existing.some(m => m.mediaId === id)) throw new AppError('An attachment does not belong to this entry.', 'VALIDATION');
  });
  const usedFiles = {};
  readAll(SHEET_DEFS.MEDIA).forEach(m => { if (m.fileId) usedFiles[m.fileId] = true; });
  const added = e.attachments.filter(a => a.kind !== 'existing').map(a => {
    if (a.fileId && usedFiles[a.fileId]) throw new AppError('That upload is already attached to an entry.', 'DUPLICATE');
    return { mediaId: uid('med'), entryId: entryId, fileName: a.fileName, mimeType: a.mimeType, fileId: a.fileId, fileUrl: a.fileUrl, mediaType: a.mediaType, createdAt: updatedAt };
  });
  const removed = existing.filter(m => keepIds.indexOf(m.mediaId) < 0);
  const row = entryToRow(entryId, e, createdAt, updatedAt, keepIds.length + added.length);

  if (isNew) insertRows(SHEET_DEFS.JOURNAL, [row]);
  else updateRowById(SHEET_DEFS.JOURNAL, 'entryId', entryId, row);

  removed.forEach(m => { deleteRowsWhere(SHEET_DEFS.MEDIA, 'mediaId', m.mediaId); trashFile(m.fileId); });
  insertRows(SHEET_DEFS.MEDIA, added);
  // Mood records are replaced as a set, so edits never duplicate them.
  deleteRowsWhere(SHEET_DEFS.MOOD, 'entryId', entryId);
  insertRows(SHEET_DEFS.MOOD, e.moodRecords.map(r => ({ moodId: uid('mood'), entryId: entryId, event: r.event, thoughts: r.thoughts, emotion: r.emotion, behaviourResponse: r.behaviourResponse, physicalResponse: r.physicalResponse, createdAt: updatedAt })));
}

/* ---------- public service functions ---------- */

function createJournalEntry(data) {
  const e = validateEntryInput(data);
  const requestId = clean(data.requestId, 64);
  return withLock(() => {
    const cache = CacheService.getScriptCache();
    if (requestId) {
      const prev = cache.get('req_' + requestId);
      if (prev) return ok(buildEntry(prev), 'Journal entry already saved.');
    }
    const entryId = uid('jrn');
    const ts = nowIso();
    persistEntry(entryId, e, ts, ts, true);
    if (requestId) cache.put('req_' + requestId, entryId, 600);
    return ok(buildEntry(entryId), 'Journal entry saved successfully.');
  });
}

function updateJournalEntry(entryId, data) {
  entryId = clean(entryId, 40);
  const e = validateEntryInput(data);
  return withLock(() => {
    const row = readAll(SHEET_DEFS.JOURNAL).filter(r => r.entryId === entryId)[0];
    if (!row) throw new AppError('Entry not found.', 'NOT_FOUND');
    persistEntry(entryId, e, row.createdAt, nowIso(), false);
    return ok(buildEntry(entryId), 'Journal entry updated.');
  });
}

function deleteJournalEntry(entryId) {
  entryId = clean(entryId, 40);
  return withLock(() => {
    if (!findRowNumber(SHEET_DEFS.JOURNAL, 'entryId', entryId)) throw new AppError('Entry not found.', 'NOT_FOUND');
    readAll(SHEET_DEFS.MEDIA).filter(m => m.entryId === entryId).forEach(m => trashFile(m.fileId));
    deleteRowsWhere(SHEET_DEFS.MEDIA, 'entryId', entryId);
    deleteRowsWhere(SHEET_DEFS.MOOD, 'entryId', entryId);
    deleteRowsWhere(SHEET_DEFS.JOURNAL, 'entryId', entryId);
    return ok({ entryId: entryId }, 'Journal entry deleted.');
  });
}

function getJournalEntry(entryId) {
  return ok(buildEntry(clean(entryId, 40)));
}

function getJournalEntries(filters) {
  return filterJournal(filters);
}

function searchJournal(query) {
  return filterJournal({ query: query });
}

function filterJournal(f) {
  f = f || {};
  const s = getSettings();
  const q = clean(f.query, 200).toLowerCase();
  const from = isValidDate(clean(f.dateFrom, 10)) ? clean(f.dateFrom, 10) : '';
  const to = isValidDate(clean(f.dateTo, 10)) ? clean(f.dateTo, 10) : '';
  const cat = clean(f.category, 30);
  const emo = clean(f.emotion, 60).toLowerCase();
  const emoCat = clean(f.emotionCategory, 30);

  let rows = readAll(SHEET_DEFS.JOURNAL).filter(r => r.status !== 'deleted').map(r => ({ r: r, emotions: parseEmotions(r.emotionsJson) }));
  rows = rows.filter(x => {
    const r = x.r;
    if (q && (r.event + '\n' + r.thoughts).toLowerCase().indexOf(q) < 0) return false;
    if (from && r.entryDate < from) return false;
    if (to && r.entryDate > to) return false;
    if (cat && !x.emotions.some(e => e.category === cat)) return false;
    if (emo && !x.emotions.some(e => e.name.toLowerCase() === emo && (!emoCat || e.category === emoCat))) return false;
    if (f.mediaOnly && !(Number(r.attachmentCount) > 0)) return false;
    return true;
  });
  rows.sort((a, b) => (b.r.entryDate + b.r.entryTime + b.r.createdAt).localeCompare(a.r.entryDate + a.r.entryTime + a.r.createdAt));

  const size = Math.min(50, Math.max(1, Number(f.pageSize) || Number(s.PAGE_SIZE) || 10));
  const page = Math.max(1, Number(f.page) || 1);
  const slice = rows.slice((page - 1) * size, page * size);
  const ids = {};
  slice.forEach(x => { ids[x.r.entryId] = true; });
  const media = readAll(SHEET_DEFS.MEDIA).filter(m => ids[m.entryId]);
  const moods = readAll(SHEET_DEFS.MOOD).filter(m => ids[m.entryId]);
  const items = slice.map(x => rowToEntry(x.r, media.filter(m => m.entryId === x.r.entryId), moods.filter(m => m.entryId === x.r.entryId)));
  return ok({ items: items, total: rows.length, page: page, pageSize: size, hasMore: page * size < rows.length });
}

function createMoodRecord(data) {
  const entryId = clean(data && data.entryId, 40);
  const recs = validateMoodRecords([data]);
  if (!recs.length) throw new AppError('Fill in at least one mood checker field.', 'VALIDATION');
  return withLock(() => {
    if (!findRowNumber(SHEET_DEFS.JOURNAL, 'entryId', entryId)) throw new AppError('Entry not found.', 'NOT_FOUND');
    const r = recs[0];
    const rec = { moodId: uid('mood'), entryId: entryId, event: r.event, thoughts: r.thoughts, emotion: r.emotion, behaviourResponse: r.behaviourResponse, physicalResponse: r.physicalResponse, createdAt: nowIso() };
    insertRows(SHEET_DEFS.MOOD, [rec]);
    return ok(rec, 'Mood record added.');
  });
}

function getMoodRecords(entryId) {
  entryId = clean(entryId, 40);
  return ok(readAll(SHEET_DEFS.MOOD).filter(m => m.entryId === entryId));
}

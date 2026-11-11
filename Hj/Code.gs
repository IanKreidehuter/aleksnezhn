/** Code.gs: web app entry point, API dispatcher and one-time setup. */

/** Serves index (timeline) or admin (composer). Both are HtmlService templates. */
function doGet(e) {
  try {
    assertOwner();
  } catch (err) {
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:2rem">' + (err.name === 'AppError' ? err.message : 'Not authorised.') + '</p>').setTitle('Mood Journal');
  }
  const p = (e && e.parameter) || {};
  const t = HtmlService.createTemplateFromFile(p.page === 'admin' ? 'admin' : 'index');
  t.baseUrl = ScriptApp.getService().getUrl();
  t.editId = String(p.edit || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);
  return t.evaluate().setTitle('Mood Journal').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

const ROUTES = {
  init: () => initializeDatabase(),
  getTaxonomy: () => ok({ categories: EMOTIONS }),
  getSettings: () => ok(getSettings()),
  list: p => filterJournal(p),
  search: p => searchJournal(p.query),
  get: p => getJournalEntry(p.entryId),
  create: p => createJournalEntry(p.data),
  update: p => updateJournalEntry(p.entryId, p.data),
  delete: p => deleteJournalEntry(p.entryId),
  addMood: p => createMoodRecord(p.data),
  getMoods: p => getMoodRecords(p.entryId),
  startUpload: p => startUpload(p),
  uploadChunk: p => uploadChunk(p),
  thumb: p => getMediaThumb(p.mediaId),
  image: p => getMediaImage(p.mediaId),
  getMedia: p => getMedia(p.mediaId),
  deleteMedia: p => deleteMedia(p.mediaId),
  verifyToken: () => ok(null, 'Token accepted.')
};

/** Actions that change data (or unlock the admin page) require the admin token. */
const TOKEN_ACTIONS = { create: 1, update: 1, delete: 1, addMood: 1, startUpload: 1, uploadChunk: 1, deleteMedia: 1, verifyToken: 1 };

/**
 * Single entry point for google.script.run. Every call is authorised, routed by an allow-list,
 * and returns {success, data, message}. Journal content is never logged.
 */
function api(action, payload, token) {
  try {
    assertOwner();
    if (!Object.prototype.hasOwnProperty.call(ROUTES, action)) return fail('Unknown request.', 'BAD_REQUEST');
    if (TOKEN_ACTIONS[action]) assertAdminToken(token);
    return ROUTES[action](payload || {});
  } catch (err) {
    if (err && err.name === 'AppError') return fail(err.message, err.code);
    console.error('api(' + action + ') failed: ' + (err && err.message));
    return fail('Something went wrong on the server: ' + (err && err.message ? err.message : 'unknown error'), 'SERVER');
  }
}

/**
 * Run ONCE from the Apps Script editor. Creates the spreadsheet and the private media folder
 * (unless SPREADSHEET_ID / MEDIA_FOLDER_ID are already set), records you as the owner,
 * and builds the sheets.
 */
function setupProject() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SPREADSHEET_ID')) props.setProperty('SPREADSHEET_ID', SpreadsheetApp.create('Mood Journal Database').getId());
  if (!props.getProperty('MEDIA_FOLDER_ID')) props.setProperty('MEDIA_FOLDER_ID', DriveApp.createFolder('Mood Journal Media').getId());
  props.setProperty('OWNER_EMAIL', Session.getEffectiveUser().getEmail());
  initializeDatabase();
  if (!props.getProperty('ADMIN_TOKEN_HASH')) generateAdminToken();
  console.log('Spreadsheet: ' + SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID')).getUrl());
  console.log('Media folder: ' + DriveApp.getFolderById(props.getProperty('MEDIA_FOLDER_ID')).getUrl());
  console.log('Setup complete. Now deploy as a web app.');
}

/* ---------- admin token (second factor for anything that writes) ---------- */

function hashToken(token, salt) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + token));
}

/**
 * Run from the editor to create or rotate the admin token. The token is printed ONCE in the
 * execution log; only its salted hash is stored (Script Properties). Save it in a password manager.
 */
function generateAdminToken() {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({ ADMIN_TOKEN_SALT: salt, ADMIN_TOKEN_HASH: hashToken(token, salt) });
  console.log('ADMIN TOKEN (shown once, copy it now): ' + token);
}

function assertAdminToken(token) {
  const hash = getProp('ADMIN_TOKEN_HASH');
  if (!hash) throw new AppError('Admin token is not set. Run generateAdminToken() in the editor.', 'SETUP');
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('tok_fail') || 0);
  if (fails >= 5) throw new AppError('Too many wrong tokens. Try again in 15 minutes.', 'LOCKED');
  const given = hashToken(String(token || '').slice(0, 200), getProp('ADMIN_TOKEN_SALT'));
  let diff = given.length ^ hash.length;
  for (let i = 0; i < Math.min(given.length, hash.length); i++) diff |= given.charCodeAt(i) ^ hash.charCodeAt(i);
  if (diff !== 0) {
    cache.put('tok_fail', String(fails + 1), 900);
    throw new AppError('Wrong admin token.', 'FORBIDDEN');
  }
  cache.remove('tok_fail');
}

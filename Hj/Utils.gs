/** Utils.gs: response helpers, validation helpers, locking, owner check. */

class AppError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AppError';
    this.code = code || 'ERROR';
  }
}

function ok(data, message) {
  return { success: true, data: data === undefined ? null : data, message: message || '' };
}

function fail(message, code) {
  return { success: false, data: null, message: message, code: code || 'ERROR' };
}

function uid(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function nowIso() {
  return new Date().toISOString();
}

/** Trim, strip control characters, cap length. Output is escaped by the frontend when rendered. */
function clean(value, max) {
  let s = value === null || value === undefined ? '' : String(value);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  return s.length > max ? s.slice(0, max) : s;
}

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const p = s.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
}

function isValidTime(s) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Serialises writes so two requests cannot interleave. */
function withLock(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    throw new AppError('The journal is busy. Please try again in a moment.', 'BUSY');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Backend authorisation. The primary gate is the deployment setting
 * (Execute as: Me, Who has access: Only myself). This check is a second layer:
 * if Google reveals the caller's email and it is not the owner, refuse.
 */
function assertOwner() {
  const owner = getProp('OWNER_EMAIL');
  if (!owner) throw new AppError('Setup is not finished. Run setupProject() once in the Apps Script editor.', 'SETUP');
  const active = Session.getActiveUser().getEmail();
  if (active && active.toLowerCase() !== owner.toLowerCase()) throw new AppError('Not authorised.', 'FORBIDDEN');
}

/** Used by HTML templates: <?!= include('Styles') ?> */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

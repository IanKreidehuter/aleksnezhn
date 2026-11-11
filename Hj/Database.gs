/** Database.gs: Google Sheets access layer. Records are found by ID, never by row number. */

function getSpreadsheet() {
  const id = getProp('SPREADSHEET_ID');
  if (!id) throw new AppError('SPREADSHEET_ID is not set. Run setupProject().', 'SETUP');
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    throw new AppError('Cannot open the journal spreadsheet. Check SPREADSHEET_ID and permissions.', 'SPREADSHEET');
  }
}

function getSheet(def) {
  const sh = getSpreadsheet().getSheetByName(def.name);
  if (!sh) throw new AppError('Database is not initialised. Run setupProject().', 'SETUP');
  return sh;
}

/** Creates any missing sheets, headers and default settings. Safe to run repeatedly. */
function initializeDatabase() {
  const ss = getSpreadsheet();
  Object.keys(SHEET_DEFS).forEach(k => {
    const def = SHEET_DEFS[k];
    let sh = ss.getSheetByName(def.name);
    if (!sh) sh = ss.insertSheet(def.name);
    const n = def.headers.length;
    if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
    // Plain-text format: stops Sheets from turning "=..." or "2026-01-01" into formulas/dates.
    sh.getRange(1, 1, sh.getMaxRows(), n).setNumberFormat('@');
    sh.getRange(1, 1, 1, n).setValues([def.headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  const cfg = getSheet(SHEET_DEFS.CONFIG);
  if (cfg.getLastRow() < 2) insertRows(SHEET_DEFS.CONFIG, DEFAULT_SETTINGS.map(r => ({ key: r[0], value: r[1], description: r[2] })));
  const blank = ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);
  return ok(null, 'Database ready.');
}

function readAll(def) {
  const sh = getSheet(def);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, def.headers.length).getValues();
  return vals.map(r => {
    const o = {};
    def.headers.forEach((h, i) => { o[h] = r[i] === null || r[i] === undefined ? '' : String(r[i]); });
    return o;
  }).filter(o => o[def.headers[0]] !== '');
}

function insertRows(def, objs) {
  if (!objs.length) return;
  const sh = getSheet(def);
  const n = def.headers.length;
  const start = sh.getLastRow() + 1;
  const need = start + objs.length - 1;
  if (need > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  sh.getRange(start, 1, objs.length, n)
    .setNumberFormat('@')
    .setValues(objs.map(o => def.headers.map(h => (o[h] === null || o[h] === undefined ? '' : String(o[h])))));
}

function findRowNumber(def, idField, id) {
  const sh = getSheet(def);
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const col = def.headers.indexOf(idField) + 1;
  const vals = sh.getRange(2, col, last - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) return i + 2;
  }
  return 0;
}

function updateRowById(def, idField, id, patch) {
  const sh = getSheet(def);
  const row = findRowNumber(def, idField, id);
  if (!row) throw new AppError('Record not found.', 'NOT_FOUND');
  const rng = sh.getRange(row, 1, 1, def.headers.length);
  const cur = rng.getValues()[0];
  const next = def.headers.map((h, i) => (Object.prototype.hasOwnProperty.call(patch, h) ? String(patch[h]) : String(cur[i])));
  rng.setNumberFormat('@').setValues([next]);
}

function deleteRowsWhere(def, field, value) {
  const sh = getSheet(def);
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const col = def.headers.indexOf(field) + 1;
  const vals = sh.getRange(2, col, last - 1, 1).getValues();
  const rows = [];
  vals.forEach((v, i) => { if (String(v[0]) === String(value)) rows.push(i + 2); });
  for (let i = rows.length - 1; i >= 0; i--) sh.deleteRow(rows[i]);
  return rows.length;
}

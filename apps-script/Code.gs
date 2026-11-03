/**
 * MAD Receipts bridge: a Google Apps Script web app.
 *
 * It lets the app use Google Sheets and Drive through YOUR Google account, without a Google Cloud
 * project or service account key. The app (server side only) sends JSON with a secret; this script
 * does the work as you.
 *
 * Safety:
 *  - Every request must carry the SECRET script property, or it is refused.
 *  - It only touches spreadsheets listed in ALLOWED_SHEET_IDS and folders listed in
 *    ALLOWED_FOLDER_IDS. Nothing else in your Drive or Sheets is reachable through it.
 *  - It never inserts, deletes or reformats rows or cells. It only reads, writes the cells it is
 *    told to write, appends rows, and creates files in the allowed folder.
 *
 * Setup: see "Google Apps Script bridge" in README.md.
 */

var MAX_BASE64_CHARS = 14 * 1024 * 1024; // ~10 MB file

function doGet() {
  // Lets you open the web app URL in a browser to check it is deployed. Reveals nothing.
  return json_({ ok: true, data: 'MAD Receipts bridge is running' });
}

function doPost(e) {
  var reply;
  try {
    var request = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    reply = { ok: true, data: handle_(request) };
  } catch (err) {
    reply = failure_(err);
  }
  return json_(reply);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function handle_(req) {
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!secret || !sameText_(String(req.secret || ''), secret)) {
    throw httpError_(401, 'Unauthorized');
  }
  switch (req.action) {
    case 'ping':
      return 'pong';
    case 'sheets.get':
      return sheetsGet_(req);
    case 'sheets.update':
      return withLock_(function () {
        return sheetsWrite_(req, false);
      });
    case 'sheets.append':
      return withLock_(function () {
        return sheetsWrite_(req, true);
      });
    case 'drive.find':
      return driveFind_(req);
    case 'drive.upload':
      return driveUpload_(req);
    default:
      throw httpError_(400, 'Unknown action');
  }
}

// ---- Sheets ----

/** Text of every cell of a tab, as displayed. Empty trailing cells and rows are left out. */
function sheetsGet_(req) {
  allowed_('ALLOWED_SHEET_IDS', req.spreadsheetId);
  var range = parseRange_(req.range);
  if (range.row !== null) throw httpError_(400, 'Reading a cell range is not supported');
  var rows = openTab_(req.spreadsheetId, range.tab).getDataRange().getDisplayValues();

  rows = rows.map(function (row) {
    var end = row.length;
    while (end > 0 && row[end - 1] === '') end--;
    return row.slice(0, end);
  });
  while (rows.length > 0 && rows[rows.length - 1].length === 0) rows.pop();
  return rows;
}

/** Writes values starting at a cell (update) or below the last row (append). */
function sheetsWrite_(req, append) {
  allowed_('ALLOWED_SHEET_IDS', req.spreadsheetId);
  var values = req.values;
  if (!Array.isArray(values) || !values.every(Array.isArray)) {
    throw httpError_(400, 'values must be rows of cells');
  }
  var range = parseRange_(req.range);
  var sheet = openTab_(req.spreadsheetId, range.tab);

  var width = 0;
  values.forEach(function (row) {
    width = Math.max(width, row.length);
  });
  if (values.length === 0 || width === 0) return null;

  var row;
  var col;
  if (append) {
    row = sheet.getLastRow() + 1;
    col = 1;
  } else {
    if (range.row === null) throw httpError_(400, 'update needs a start cell, like E3');
    row = range.row;
    col = range.col;
  }

  var grid = values.map(function (cells) {
    var out = [];
    for (var i = 0; i < width; i++) out.push(i < cells.length ? cell_(cells[i]) : '');
    return out;
  });
  sheet.getRange(row, col, grid.length, width).setValues(grid);
  return null;
}

/**
 * Keeps text as typed. setValues would turn "2556" or "2026-11-02" into a number or date, so
 * those get a leading apostrophe (Sheets stores the text without it). Numbers stay numbers.
 * The cell's number format is never changed.
 */
function cell_(value) {
  if (typeof value === 'number') return value;
  var text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@']/.test(text) || /^\d/.test(text) || /^(true|false)$/i.test(text)) {
    return "'" + text;
  }
  return text;
}

/** "'Tab Name'" or "'Tab Name'!E3" (the only forms the app uses). */
function parseRange_(range) {
  var match = /^'((?:[^']|'')+)'(?:!([A-Z]+)(\d+))?$/.exec(String(range || ''));
  if (!match) throw httpError_(400, 'Bad range');
  return {
    tab: match[1].replace(/''/g, "'"),
    col: match[2] ? columnNumber_(match[2]) : null,
    row: match[3] ? Number(match[3]) : null,
  };
}

function columnNumber_(letters) {
  var n = 0;
  for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n;
}

function openTab_(spreadsheetId, tab) {
  var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(tab);
  if (!sheet) throw httpError_(400, 'Tab "' + tab + '" was not found');
  return sheet;
}

// ---- Drive ----

function driveFind_(req) {
  allowed_('ALLOWED_FOLDER_IDS', req.folderId);
  var files = DriveApp.getFolderById(req.folderId).getFilesByName(String(req.name));
  return files.hasNext() ? files.next().getId() : null;
}

function driveUpload_(req) {
  allowed_('ALLOWED_FOLDER_IDS', req.folderId);
  var base64 = String(req.base64 || '');
  if (!base64) throw httpError_(400, 'The file is empty');
  if (base64.length > MAX_BASE64_CHARS) throw httpError_(413, 'The file is too large');
  var blob = Utilities.newBlob(
    Utilities.base64Decode(base64),
    String(req.mimeType || 'image/jpeg'),
    String(req.name)
  );
  return DriveApp.getFolderById(req.folderId).createFile(blob).getId();
}

// ---- Helpers ----

function allowed_(property, id) {
  var list = (PropertiesService.getScriptProperties().getProperty(property) || '')
    .split(',')
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  if (!id || list.indexOf(String(id)) === -1) {
    throw httpError_(403, 'That file is not allowed. Add its id to the ' + property + ' script property.');
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function sameText_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function httpError_(code, message) {
  var err = new Error(message);
  err.code = code;
  return err;
}

function failure_(err) {
  var message = String((err && err.message) || err);
  var code = err && err.code;
  if (typeof code !== 'number') {
    // Errors thrown by Google's own services.
    if (/permission|access|authorization/i.test(message)) code = 403;
    else if (/not found|openById|No item with the given ID|Unexpected error/i.test(message)) code = 404;
    else code = 500;
    if (code === 500) message = 'Script error: ' + message;
  }
  return { ok: false, code: code, message: message };
}

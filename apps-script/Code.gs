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
 *  - The car-documents actions (docs.*) only work inside the two folders named by the
 *    DOC_AVAILABLE_ID and DOC_SOLD_ID script properties. They can list, read previews, add files and
 *    move a car folder from Available to Sold. They never delete or rename anything.
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
    case 'docs.listFolders':
      return docsListFolders_(req);
    case 'docs.findFolder':
      return docsFindFolder_(req);
    case 'docs.listFiles':
      return docsListFiles_(req);
    case 'docs.upload':
      return docsUpload_(req);
    case 'docs.preview':
      return docsPreview_(req);
    case 'docs.move':
      return withLock_(function () {
        return docsMove_(req);
      });
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


// ---- Car documents (Available units / Sold units) ----

var PREVIEW_MAX_BYTES = 4 * 1024 * 1024;
var DIRECT_TYPES = /^image\/(jpeg|png|webp)$/;

function docRoot_(which) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(which === 'sold' ? 'DOC_SOLD_ID' : 'DOC_AVAILABLE_ID');
  if (!id) throw httpError_(400, 'Set the ' + (which === 'sold' ? 'DOC_SOLD_ID' : 'DOC_AVAILABLE_ID') + ' script property');
  return id;
}

function normPlate_(text) {
  return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Which root ('available' or 'sold') the folder sits under (up to 4 levels deep), or null. */
function rootOf_(folder) {
  var available = docRoot_('available');
  var sold = docRoot_('sold');
  var current = folder;
  for (var depth = 0; depth < 5 && current; depth++) {
    var id = current.getId();
    if (id === available) return 'available';
    if (id === sold) return 'sold';
    var parents = current.getParents();
    current = parents.hasNext() ? parents.next() : null;
  }
  return null;
}

function carFolder_(folderId) {
  var folder = DriveApp.getFolderById(String(folderId));
  var root = rootOf_(folder);
  if (!root) throw httpError_(403, 'That folder is not inside the Available or Sold folder');
  return { folder: folder, root: root };
}

function folderRow_(folder, root) {
  return { id: folder.getId(), name: folder.getName(), url: folder.getUrl(), root: root };
}

/** Every car folder directly inside Available or Sold. */
function docsListFolders_(req) {
  var which = req.root === 'sold' ? 'sold' : 'available';
  var out = [];
  var it = DriveApp.getFolderById(docRoot_(which)).getFolders();
  while (it.hasNext() && out.length < 3000) out.push(folderRow_(it.next(), which));
  return out;
}

/** Car folders whose name holds this plate (dashes, spaces and case ignored), in Available and Sold. */
function docsFindFolder_(req) {
  var plate = normPlate_(req.plate);
  if (plate.length < 5) throw httpError_(400, 'That plate is too short to search');
  var digits = (plate.match(/\d+/g) || []).sort(function (a, b) { return b.length - a.length; })[0] || '';
  var out = [];
  ['available', 'sold'].forEach(function (which) {
    var parent = DriveApp.getFolderById(docRoot_(which));
    var it = digits.length >= 3
      ? parent.searchFolders("title contains '" + digits + "'")
      : parent.getFolders();
    while (it.hasNext()) {
      var folder = it.next();
      if (normPlate_(folder.getName()).indexOf(plate) !== -1) out.push(folderRow_(folder, which));
    }
  });
  return out.slice(0, 10);
}

/** Files in a car folder, and in its sub-folders one level down (named "Sub/File"). */
function docsListFiles_(req) {
  var info = carFolder_(req.folderId);
  var out = [];
  function add(folder, prefix) {
    var files = folder.getFiles();
    while (files.hasNext() && out.length < 300) {
      var f = files.next();
      out.push({
        id: f.getId(),
        name: prefix + f.getName(),
        mimeType: f.getMimeType(),
        size: f.getSize(),
        createdAt: f.getDateCreated().toISOString(),
        url: f.getUrl(),
      });
    }
  }
  add(info.folder, '');
  var subs = info.folder.getFolders();
  while (subs.hasNext()) {
    var sub = subs.next();
    add(sub, sub.getName() + '/');
  }
  return { root: info.root, files: out };
}

function docsUpload_(req) {
  var info = carFolder_(req.folderId);
  var base64 = String(req.base64 || '');
  if (!base64) throw httpError_(400, 'The file is empty');
  if (base64.length > MAX_BASE64_CHARS) throw httpError_(413, 'The file is too large');
  var blob = Utilities.newBlob(
    Utilities.base64Decode(base64),
    String(req.mimeType || 'image/jpeg'),
    String(req.name)
  );
  var file = info.folder.createFile(blob);
  return { id: file.getId(), url: file.getUrl() };
}

/**
 * A picture the app can read: the file itself when it is a normal image of a sensible size,
 * otherwise Google's own JPEG preview (this is how HEIC photos and scanned PDFs become readable).
 */
function docsPreview_(req) {
  var file = DriveApp.getFileById(String(req.fileId));
  var parents = file.getParents();
  if (!parents.hasNext() || !rootOf_(parents.next())) {
    throw httpError_(403, 'That file is not inside the Available or Sold folder');
  }
  var mime = file.getMimeType();
  if (DIRECT_TYPES.test(mime) && file.getSize() <= PREVIEW_MAX_BYTES) {
    return { mimeType: mime, base64: Utilities.base64Encode(file.getBlob().getBytes()), via: 'file' };
  }
  var token = ScriptApp.getOAuthToken();
  var meta = JSON.parse(
    UrlFetchApp.fetch(
      'https://www.googleapis.com/drive/v3/files/' + file.getId() + '?fields=thumbnailLink&supportsAllDrives=true',
      { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true }
    ).getContentText() || '{}'
  );
  if (!meta.thumbnailLink) throw httpError_(422, 'Google has no preview for this file (yet)');
  var size = Math.max(600, Math.min(2000, Number(req.size) || 1600));
  var image = UrlFetchApp.fetch(String(meta.thumbnailLink).replace(/=s\d+$/, '=s' + size), {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  if (image.getResponseCode() !== 200) throw httpError_(422, 'Could not get a preview of this file');
  return { mimeType: 'image/jpeg', base64: Utilities.base64Encode(image.getContent()), via: 'preview' };
}

/** Moves a car folder from Available to Sold. Refuses when Sold already has a folder with that name. */
function docsMove_(req) {
  var info = carFolder_(req.folderId);
  if (info.root !== 'available') throw httpError_(409, 'That folder is already in Sold');
  if (info.folder.getParents().next().getId() !== docRoot_('available')) {
    throw httpError_(409, 'Only a folder directly inside Available can be moved');
  }
  var sold = DriveApp.getFolderById(docRoot_('sold'));
  if (sold.getFoldersByName(info.folder.getName()).hasNext()) {
    throw httpError_(409, 'Sold already has a folder named "' + info.folder.getName() + '"');
  }
  info.folder.moveTo(sold);
  return folderRow_(info.folder, 'sold');
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

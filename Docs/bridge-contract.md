# The Google gateway contract

Everything the app needs from Google goes through **one web endpoint**. Today that is the Apps Script (`apps-script/Code.gs`). The grokbot gateway has to answer the same requests in the same format. Then the only change in the app is the address and the secret in the server settings (`APPS_SCRIPT_URL` and `APPS_SCRIPT_SECRET` today; Phase 2 adds `BRIDGE_URL` and `BRIDGE_SECRET` as the same thing under neutral names).

Check a gateway with `node scripts/bridge-check.mjs` (read-only, see the end).

## The call

```
POST <BRIDGE_URL>
Content-Type: text/plain;charset=utf-8        (a simple request; the body is read as raw text)
Body: { "secret": "<BRIDGE_SECRET>", "action": "<name>", ...parameters }
```
The gateway follows no redirects of its own; the app follows them (Apps Script answers through one).

Success: `{ "ok": true, "data": <result> }`. Failure: `{ "ok": false, "code": <http-style number>, "message": "<text safe to show staff>" }`.
Codes the app reacts to: **401** wrong secret, **403** not allowed (outside the allow-list), **404** not found (sheet), **400** bad request or tab name, **409** conflict (Sold already has that folder), **413** file too large, **422** no preview, **429** busy. The message must never contain secrets, addresses or tokens.

## Safety rules the gateway keeps (the app relies on them)
1. Refuse any request with the wrong secret (compare in constant time). `GET` may answer `{ "ok": true, "data": "running" }` and nothing else.
2. Touch only the **allow-listed** spreadsheets and folders (`ALLOWED_SHEET_IDS`, `ALLOWED_FOLDER_IDS`) and, for the documents, only inside the *Available units* and *Sold units* folders.
3. **Never delete, rename or reformat.** Writes only set the cells they are told to set, append rows, create files, and move a car folder from Available to Sold.
4. Serialise writes (one at a time) so two requests never overwrite each other's cells.
5. Never put a secret in a log or an error.

## Actions the app uses today

| Action | Parameters | `data` on success |
|---|---|---|
| `ping` | none | `"pong"` |
| `sheets.get` | `spreadsheetId`, `range` = `'Tab name'` (the whole tab only) | rows of text exactly as displayed, `string[][]`; empty trailing cells and rows left out |
| `sheets.update` | `spreadsheetId`, `range` = `'Tab name'!E3` (start cell), `values: (string\|number)[][]` | `null`. Text is stored as typed (a leading apostrophe stops `2556` or a date turning into a number); numbers stay numbers; the number format is never changed |
| `sheets.append` | `spreadsheetId`, `range` = `'Tab name'`, `values` | `null`. Rows are added below the last row of the tab |
| `drive.find` | `folderId`, `name` | the file id of a file with exactly that name in the folder, or `null` |
| `drive.upload` | `folderId`, `name`, `mimeType`, `base64` | the new file's id. Up to about 10 MB |
| `docs.listFolders` | `root` = `"available"` or `"sold"` | the car folders directly inside it: `[{ id, name, url, root }]` (up to 3000) |
| `docs.findFolder` | `plate` | car folders in Available and Sold whose name holds the plate (dashes, spaces and case ignored), at most 10, same shape. Refuse a plate shorter than 5 characters |
| `docs.listFiles` | `folderId` (must be inside Available or Sold) | `{ root, files: [{ id, name, mimeType, size, createdAt (ISO), url }] }`, the folder's files and one level of sub-folders (named `Sub/File`), up to 300 |
| `docs.upload` | `folderId`, `name`, `mimeType`, `base64` | `{ id, url }` |
| `docs.preview` | `fileId`, `size` (600 to 2000, default 1600) | `{ mimeType, base64, via }`: the file itself if it is a JPEG, PNG or WebP of at most 4 MB, otherwise a JPEG preview (this is how HEIC photos and scanned PDFs become readable). `422` when no preview exists |
| `docs.move` | `folderId` | `{ id, name, url, root: "sold" }`. Moves a car folder from Available to Sold. `409` if Sold already has a folder of that name or it is already in Sold |

## Actions the new workflow adds (Phase 3)

| Action | Parameters | `data` |
|---|---|---|
| `docs.createFolder` | `name` (like `14 Toyota Vios (AAX-3622)`) | `{ id, name, url, root: "available" }`. Creates it inside *Available units*; if a folder with that plate already exists, returns it (`created: false`) instead of making another |
| `sheets.update` / `sheets.append` | on the **Docs Bible** and the inventory workbook | as above. The Docs Bible and INVENTORY 2026 IDs go on the allow-list |

No other action is needed for the IN and OUT flows. Telegram does not go through the gateway; it is its own bot (Phase 2).

## How text must be written to a sheet (encoding)
The app sends every cell as text and expects to read **the same text back**. A gateway that writes through the Google Sheets API must therefore use the raw/literal mode (`valueInputOption=RAW`), or add the leading apostrophe the Apps Script adds, so that:
- `2556`, `00123`, `09171234567`, `11/2`, `1/2`, `2026-11-02` and `1e5` stay text (not a number or a date);
- `=SUM(1,2)`, `+63917...`, `-5`, `@handle` and `'quoted` are stored as text, never run as a formula;
- `true` and `FALSE` stay text; accents, `₱`, Japanese, emoji, quotes, commas, semicolons and line breaks come back unchanged;
- numbers sent as numbers stay numbers; the cell's number format is never changed; a long text (900 characters) is kept whole.
Reads return the cells **as displayed** (`getDisplayValues` in Apps Script; `FORMATTED_VALUE` in the Sheets API).

`node scripts/bridge-encoding-check.mjs` proves all of this. It writes about 27 rows into a **test tab** you create (`BRIDGE TEST`) in a **test spreadsheet** (`BRIDGE_TEST_SHEET_ID`, on the gateway's allow-list) and reads them back. It refuses the app's real sheets and never deletes anything.

## Moving off Apps Script, in order
1. Build the gateway to this page. Run `scripts/bridge-check.mjs` against it on the **test copies**.
2. Put its address and secret in the **test** settings and run a real approval and a Replay on the test sheet.
3. Switch the server settings. Keep the Apps Script project for a week, switched off, as the way back.

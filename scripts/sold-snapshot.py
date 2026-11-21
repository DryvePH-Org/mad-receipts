"""Reads the 2026 part of the SOLD INFORMATION workbook into one JSON snapshot (Docs/sheets-private/, which git ignores).
   python3 scripts/sold-snapshot.py "/path/to/SOLD INFORMATION .xlsx"
Only 2026 is taken: the tab SOLD - FOR TRANSFER from its JANUARY 2026 block to the end (with each row's color and the block it sits in), and the tab SOLD 2026."""
import json, sys, re, datetime
import openpyxl
from openpyxl.utils import column_index_from_string as ci

path = sys.argv[1] if len(sys.argv) > 1 else "SOLD INFORMATION .xlsx"
wb = openpyxl.load_workbook(path, data_only=True)
wf = openpyxl.load_workbook(path)  # the same book with the cell formats, for the row colors
COLORS = {"FFEA9999": "red", "FF00FF00": "green", "FFFFFFFF": "white", "FFFFFF00": "yellow", "FFDD7E6B": "brown"}

def val(v):
    if isinstance(v, datetime.datetime): return v.date().isoformat()
    if isinstance(v, float) and v.is_integer(): return str(int(v))
    if v is None: return None
    s = str(v).strip()
    return s or None

ft, ftf = wb["SOLD - FOR TRANSFER"], wf["SOLD - FOR TRANSFER"]
cols = ["A","B","C","D","E","F","G","H","I","J","K","L","M","O","P","Q","R","S","T","U","V","W","X","Y","Z","AA","AB","AC","AD","AE","AF","AG","AH","AI","AJ"]
start = next(r for r in range(1, ft.max_row + 1) if str(ft.cell(r, ci("AD")).value or "").strip().upper() == "JANUARY 2026")
rows, block = [], None
for r in range(start, ft.max_row + 1):
    plate = ft.cell(r, ci("E")).value
    marker = ft.cell(r, ci("AD")).value
    if not plate:
        if marker and re.match(r"^[A-Za-z]+( \d{4})?$", str(marker).strip()) or isinstance(marker, datetime.datetime): block = str(marker).strip()
        continue
    fill = ftf.cell(r, ci("E")).fill
    color = COLORS.get(fill.fgColor.rgb, "none") if fill.fill_type == "solid" and fill.fgColor.type == "rgb" else "none"
    rows.append({"row": r, "block": block, "color": color, **{c: val(ft.cell(r, ci(c)).value) for c in cols}})

s26 = wb["SOLD 2026"]
names = ["YEAR","MAKE","MODEL","PLATE","FUEL","COLOR","DATE","PRICE","BUYER","CONTACT","ADDRESS","SALES","ONLINE","SOURCE","TRANSFER","LIAISON","REMARKS"]
sold = []
for r in range(3, s26.max_row + 1):
    if s26.cell(r, 4).value:
        sold.append({"row": r, **{n: val(s26.cell(r, i + 1).value) for i, n in enumerate(names)}})

out = {"taken": datetime.date.today().isoformat(), "file": path.split("/")[-1], "for_transfer_2026": rows, "sold_2026_tab": sold}
dest = "Docs/sheets-private/sold-information.snapshot.json"
json.dump(out, open(dest, "w"), indent=1)
print(f"{dest}: {len(rows)} rows from SOLD - FOR TRANSFER (rows {rows[0]['row']}-{rows[-1]['row']}), {len(sold)} rows from SOLD 2026")

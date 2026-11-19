#!/usr/bin/env python3
"""Reads the MAD PRICE LIST workbook (File > Download > Microsoft Excel) and writes a plain JSON snapshot of what the app takes over:
the INVENTORY 2026 tab (with the body-type headings it sits under), REPAIRS REPORT and FOR RENEWAL (2026). Nothing is written to the app here.
    python3 scripts/pricelist-snapshot.py "/path/MAD PRICE LIST.xlsx"   ->   Docs/sheets-private/pricelist.snapshot.json
"""
import datetime, json, re, sys
import openpyxl

src = sys.argv[1]
wb = openpyxl.load_workbook(src, data_only=True)

def cell(v):
    if isinstance(v, (datetime.datetime, datetime.date)): return v.strftime("%Y-%m-%d")
    if isinstance(v, float) and v.is_integer(): return int(v)
    if isinstance(v, str): return v.strip() or None
    return v

def table(ws, header_row):
    hdr = [re.sub(r"\s+", " ", str(c.value or "")).strip().upper() for c in ws[header_row]]
    out = []
    for i, r in enumerate(ws.iter_rows(min_row=header_row + 1, values_only=True), start=header_row + 1):
        row = {h: cell(v) for h, v in zip(hdr, r) if h and cell(v) is not None}
        # the heading rows put their text in the NO. OF DAYS column; a few columns have no header of their own
        row["_row"] = i
        row["_D"] = cell(ws.cell(row=i, column=4).value) if header_row == 2 else None  # the sheet's narrow, header-less column D (1 = can be sold)
        out.append(row)
    return out

inv = table(wb["INVENTORY 2026"], 2)
GROUPS = {"HATCHBACK", "SEDAN", "CROSSOVER", "SUV/MPV", "PICK UP", "VAN", "HIGH-END/LUXURY", "MANILA UNIT TO CEBU"}
cars, group, order = [], None, 0
for r in inv:
    heading = r.get("NO. OF DAYS IN THE INVENTORY")
    if isinstance(heading, str) and heading.upper() in GROUPS and "PLATE NUMBER" not in r:
        group = heading.upper(); continue
    if "PLATE NUMBER" not in r: continue
    order += 1
    cars.append({**r, "_group": group, "_order": order})

def keyed(name, header_row, plate_col):
    rows = table(wb[name], header_row)
    return [r for r in rows if plate_col in r]

snapshot = {
    "source": "MAD PRICE LIST.xlsx", "taken": datetime.date.today().isoformat(),
    "inventory": cars,
    "repairs": keyed("REPAIRS REPORT ", 1, "PLATE NUMBER"),
    "renewals": keyed("FOR RENEWAL (2026)", 1, "PLATE NUMBER"),
}
out = "Docs/sheets-private/pricelist.snapshot.json"
json.dump(snapshot, open(out, "w"), ensure_ascii=False, indent=1)
print(f"{out}: {len(cars)} cars, {len(snapshot['repairs'])} repairs, {len(snapshot['renewals'])} renewals")

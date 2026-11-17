#!/usr/bin/env python3
"""Freezes a downloaded Docs Bible workbook (.xlsx) into one JSON snapshot the importer reads.
Usage: python3 scripts/docs-bible-snapshot.py Docs/sheets-private/live-docs-bible.xlsx Docs/sheets-private/live-docs-bible.snapshot.json
Every non-empty cell is kept with its shown value, its type and its formula text. Nothing is changed or dropped."""
import hashlib, json, sys, datetime
import openpyxl

src, out = sys.argv[1], sys.argv[2]
sha = hashlib.sha256(open(src, "rb").read()).hexdigest()
wf = openpyxl.load_workbook(src)
wv = openpyxl.load_workbook(src, data_only=True)
tabs = {}
for ws in wv.worksheets:
    f = wf[ws.title]
    cells = []
    for row in ws.iter_rows():
        for c in row:
            v = c.value
            fv = f[c.coordinate].value
            formula = fv if isinstance(fv, str) and fv.startswith("=") else None
            if v in (None, "") and not formula:
                continue
            if isinstance(v, (datetime.datetime, datetime.date)):
                t, s = "d", v.strftime("%Y-%m-%d")
            elif isinstance(v, bool):
                t, s = "b", str(v)
            elif isinstance(v, (int, float)):
                t, s = "n", repr(v)
            else:
                t, s = ("e" if isinstance(v, str) and v.startswith("#") else "s"), ("" if v is None else str(v))
            cells.append([c.row, c.column, s, t, formula])
    tabs[ws.title] = {"hidden": ws.sheet_state != "visible", "maxRow": ws.max_row, "maxCol": ws.max_column, "cells": cells}
json.dump({"snapshot": src.split("/")[-1], "sha256": sha, "takenAt": datetime.datetime.utcnow().isoformat() + "Z", "tabs": tabs}, open(out, "w"))
print("snapshot", sha[:12], {k: len(v["cells"]) for k, v in tabs.items()})

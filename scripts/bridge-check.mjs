// Read-only check that the Google gateway answers the way Docs/bridge-contract.md says. It writes nothing.
// Usage: node scripts/bridge-check.mjs   (reads .env.local, or the environment: BRIDGE_URL/BRIDGE_SECRET, else APPS_SCRIPT_URL/APPS_SCRIPT_SECRET)
import { readFileSync, existsSync } from "node:fs";

const env = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const url = env.APPS_SCRIPT_URL, secret = env.APPS_SCRIPT_SECRET;
if (!url || !secret) { console.error("Set APPS_SCRIPT_URL and APPS_SCRIPT_SECRET."); process.exit(2); }

let bad = 0;
const call = async (action, params = {}, withSecret = secret) => {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret: withSecret, action, ...params }), redirect: "follow", signal: AbortSignal.timeout(60_000) });
  return res.json().catch(() => null);
};
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); if (!ok) bad++; };

const ping = await call("ping");
check("ping answers pong", ping?.ok === true && ping.data === "pong");
const wrong = await call("ping", {}, "not-the-secret");
check("a wrong secret is refused", wrong?.ok === false && wrong.code === 401, `code=${wrong?.code}`);
const unknown = await call("nothing.here");
check("an unknown action is refused", unknown?.ok === false);

for (const root of ["available", "sold"]) {
  const r = await call("docs.listFolders", { root });
  check(`docs.listFolders ${root}`, r?.ok && Array.isArray(r.data) && r.data.every((f) => f.id && f.name && f.url && f.root === root), `${r?.data?.length ?? 0} folders`);
  if (root === "available" && r?.ok && r.data.length) {
    const f = r.data.find((x) => /\(([^()]+)\)\s*$/.test(x.name)) ?? r.data[0];
    const files = await call("docs.listFiles", { folderId: f.id });
    check("docs.listFiles shape", files?.ok && files.data?.root && Array.isArray(files.data.files) && files.data.files.every((x) => x.id && x.name && x.mimeType !== undefined && x.createdAt), `${files?.data?.files?.length ?? 0} files`);
    const plate = /\(([^()]+)\)\s*$/.exec(f.name)?.[1];
    if (plate && plate.replace(/[^A-Za-z0-9]/g, "").length >= 5) { const found = await call("docs.findFolder", { plate }); check("docs.findFolder finds it", found?.ok && found.data.some((x) => x.id === f.id)); }
    const first = files?.data?.files?.[0];
    if (first) { const p = await call("docs.preview", { fileId: first.id, size: 800 }); check("docs.preview returns a picture", p?.ok && typeof p.data?.base64 === "string" && /^image\//.test(p.data.mimeType), p?.ok ? p.data.via : p?.message); }
  }
}
if (env.INVENTORY_SHEET_ID) {
  const rows = await call("sheets.get", { spreadsheetId: env.INVENTORY_SHEET_ID, range: `'${env.INVENTORY_SHEET_TAB || "INVENTORY 2026"}'` });
  check("sheets.get reads the inventory tab", rows?.ok && Array.isArray(rows.data) && rows.data.every(Array.isArray), `${rows?.data?.length ?? 0} rows`);
  const outside = await call("sheets.get", { spreadsheetId: "1" + "x".repeat(43), range: "'Sheet1'" });
  check("a sheet outside the allow-list is refused", outside?.ok === false, `code=${outside?.code}`);
}
console.log(bad ? `\n${bad} check(s) failed.` : "\nAll checks passed. This gateway matches the contract.");
process.exit(bad ? 1 : 0);

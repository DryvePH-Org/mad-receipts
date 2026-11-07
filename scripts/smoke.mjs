// A last check on the PRODUCTION build, needing no secrets: start it, then make sure the login page answers, every protected page
// and API sends a signed-out visitor away, and the safety headers are on. Run after `npm run build`.
import { spawn } from "node:child_process";

const PORT = 3197;
const base = `http://localhost:${PORT}`;
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: "ignore", env: process.env });
const stop = () => server.kill("SIGTERM");
process.on("exit", stop);

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failures.push(what); };

async function ready() {
  for (let i = 0; i < 60; i++) {
    try { await fetch(`${base}/login`); return; } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  throw new Error("The server did not start");
}

try {
  await ready();
  const login = await fetch(`${base}/login`);
  check(login.status === 200, "login page answers 200");

  // Every module's pages send a signed-out visitor to the login page; APIs answer 401.
  const pages = ["/", "/new", "/deals", "/approvals", "/reminders", "/documents", "/upload-documents", "/cash", "/activity", "/settings", "/admin/users", "/admin/sync", "/dashboard", "/dashboard/buy", "/dashboard/sell"];
  for (const p of pages) {
    const r = await fetch(base + p, { redirect: "manual" });
    check(r.status === 307 && (r.headers.get("location") ?? "").endsWith("/login"), `${p} sends a signed-out visitor to /login`);
  }
  for (const p of ["/api/voice", "/api/docs/upload"]) {
    const r = await fetch(base + p, { method: "POST", redirect: "manual" });
    check(r.status === 401, `${p} refuses a signed-out request (401)`);
  }
  for (const p of ["/api/sync/run", "/api/reminders/run"]) {
    const r = await fetch(base + p, { method: "POST", redirect: "manual" });
    check(r.status === 401, `${p} refuses a request without the cron secret (401)`);
  }

  const h = login.headers;
  check(h.get("x-content-type-options") === "nosniff", "header: X-Content-Type-Options nosniff");
  check(h.get("x-frame-options") === "SAMEORIGIN", "header: X-Frame-Options SAMEORIGIN");
  check((h.get("content-security-policy") ?? "").includes("frame-ancestors 'self'"), "header: Content-Security-Policy frame-ancestors");
  check((h.get("strict-transport-security") ?? "").includes("max-age"), "header: Strict-Transport-Security");
  check(!!h.get("referrer-policy"), "header: Referrer-Policy");
  check((h.get("permissions-policy") ?? "").includes("microphone=(self)"), "header: Permissions-Policy (microphone for voice notes)");
  check(!h.get("x-powered-by"), "no X-Powered-By header");
} catch (e) {
  failures.push(String(e));
  console.log("FAIL", String(e));
} finally {
  stop();
}
process.exit(failures.length ? 1 : 0);

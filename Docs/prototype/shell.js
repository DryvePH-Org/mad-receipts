/* The sidebar and role switcher shared by every page of the prototype. */
(function () {
  const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" id="shell-sprite">
<symbol id="i-receipt" viewBox="0 0 24 24"><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6"/></symbol>
<symbol id="i-car" viewBox="0 0 24 24"><path d="M3 17v-4l2-5h14l2 5v4M3 17h18M7 17v2M17 17v2"/><circle cx="7.5" cy="13" r="1"/><circle cx="16.5" cy="13" r="1"/></symbol>
<symbol id="i-file" viewBox="0 0 24 24"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6"/></symbol>
<symbol id="i-printer" viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="8"/></symbol>
<symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></symbol>
<symbol id="i-bell" viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
<symbol id="i-cash" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></symbol>
<symbol id="i-history" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/></symbol>
<symbol id="i-warn" viewBox="0 0 24 24"><path d="M12 3 2 21h20zM12 10v5M12 18h.01"/></symbol>
<symbol id="i-bank" viewBox="0 0 24 24"><path d="M3 10 12 4l9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/></symbol>
<symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
<symbol id="i-send" viewBox="0 0 24 24"><path d="m22 2-11 11M22 2l-7 20-4-9-9-4z"/></symbol>
<symbol id="i-list2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></symbol>
<symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></symbol>
</svg>`;
  if (!document.getElementById("shell-sprite")) document.body.insertAdjacentHTML("afterbegin", SPRITE);
  const ico = (n, c) => `<svg class="i ${c || ""}"><use href="#i-${n}"/></svg>`;
  window.ico = ico;
  const S = MADS, role = S.db.role, page = document.body.dataset.page || "";
  const nots = S.forMe(S.notifications());
  const pend = S.db.receipts.filter((r) => r.status === "pending").length;
  const items = [
    ["index.html", "receipt", "New receipt", "new", ["sales", "admin", "approver"]],
    ["deals.html", "car", "Transactions", "deals", ["sales", "admin", "approver"]],
    ["approvals.html", "shield", "Approvals", "approvals", ["admin", "approver"], pend],
    ["reminders.html", "bell", "Reminders", "reminders", ["sales", "admin", "approver"], nots.length],
    ["cash.html", "cash", "Daily cash report", "cash", ["admin", "approver"]],
    ["activity.html", "history", "Activity log", "activity", ["admin", "approver"]],
    ["settings.html", "list2", "Settings", "settings", ["admin"]],
  ];
  const side = document.getElementById("side");
  if (!side) return;
  side.innerHTML = `<div class="brand"><b>${ico("receipt")}</b>MAD Receipts</div>
<nav class="nav"><small>Operations</small>
${items.filter((i) => i[4].includes(role)).map((i) => `<a class="${page === i[3] ? "on" : ""}" href="${i[0]}">${ico(i[1], "lg")}${i[2]}${i[5] ? `<span class="nbadge">${i[5]}</span>` : ""}</a>`).join("")}
<small style="margin-top:1.25rem">Prototype</small>
<a class="${page === "start" ? "on" : ""}" href="start.html">${ico("list2", "lg")}Start here</a>
<a class="${page === "check" ? "on" : ""}" href="math-check.html">${ico("check", "lg")}Math check</a>
<a class="${page === "prints" ? "on" : ""}" href="prints.html">${ico("printer", "lg")}Print layouts</a></nav>
<div class="rolebox"><small>Viewing as</small>
<span class="seg">${Object.entries(S.ROLES).map(([k, v]) => `<input class="rc" type="radio" name="role" id="role-${k}" value="${k}" ${k === role ? "checked" : ""}><label for="role-${k}">${v.label}</label>`).join("")}</span>
<p><b>${S.ROLES[role].user}</b> · ${S.ROLES[role].blurb}</p></div>
<div class="user"><button class="btn sm" id="reset-demo" type="button" style="width:100%">Reset demo data</button></div>`;
  side.addEventListener("change", (e) => { if (e.target.name === "role") { S.setRole(e.target.value); location.reload(); } });
  document.getElementById("reset-demo").addEventListener("click", () => { S.reset(); location.reload(); });
})();

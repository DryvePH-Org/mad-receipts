/* Transactions, deal page, approvals, reminders, cash report and activity log. Front end only. */
(function () {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const { fmt, esc, toC, prettyDate } = MAD, S = MADS, db = S.db, role = db.role, user = S.user();
  const main = $("#main"), which = document.body.dataset.render;
  const pill = (s, label) => `<span class="pill p-${s}">${esc(label || (S.STATUS[s] || {}).label || s)}</span>`;
  const RLAB = { pending: "Waiting approval", approved: "Approved", rejected: "Rejected", void: "Voided" };
  const rpill = (r) => pill(r.status, RLAB[r.status]);
  const unitName = (d) => d.s.units.map((u) => u.makeType || u.plate).join(" + ");
  const plates = (d) => d.s.units.map((u) => u.plate).join(", ");
  const head = (title, desc, actions) => `<div class="head"><div><h1>${title}</h1><p>${desc}</p></div><div style="display:flex;gap:.5rem;align-items:center">${actions || ""}</div></div>`;
  const rel = (iso) => { const n = S.diffDays(iso, S.TODAY); return n === 0 ? "today" : n > 0 ? `in ${n} ${n === 1 ? "day" : "days"}` : `${-n} ${n === -1 ? "day" : "days"} late`; };
  const dueCell = (d, c) => {
    if (c.balance <= 0 || d.cancelled) return "—";
    const iso = S.dueISO(d);
    if (iso) { const n = S.diffDays(iso, S.TODAY); return `${prettyDate(iso)}<small class="${n < 0 ? "neg" : ""}">${rel(iso)}</small>`; }
    return esc(d.s.dueText || "No date given");
  };
  function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3800); }
  function ask({ title, text, fields, confirm, danger }) {
    return new Promise((res) => {
      const d = document.createElement("dialog"); d.className = "ask";
      d.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text || "")}</p>${(fields || []).map((f) => `<div class="field"><label for="ask-${f.id}">${esc(f.label)}</label>${f.type === "textarea" ? `<textarea id="ask-${f.id}" placeholder="${esc(f.placeholder || "")}" style="min-height:5rem">${esc(f.value || "")}</textarea>` : f.type === "money" ? `<div class="affix money"><span>₱</span><input id="ask-${f.id}" type="text" value="${esc(f.value || "")}" inputmode="decimal"></div>` : `<input id="ask-${f.id}" type="${f.type || "text"}" value="${esc(f.value || "")}" placeholder="${esc(f.placeholder || "")}">`}<p class="hint bad" id="err-${f.id}" hidden>Required</p></div>`).join("")}
<div style="display:flex;gap:.5rem;justify-content:flex-end"><button class="btn" data-no type="button">Cancel</button><button class="btn ${danger ? "" : "primary"}" data-yes type="button" ${danger ? 'style="background:#b91c1c;border-color:#b91c1c;color:#fff"' : ""}>${esc(confirm || "Confirm")}</button></div>`;
      document.body.appendChild(d); d.showModal();
      const close = (v) => { d.close(); d.remove(); res(v); };
      d.querySelector("[data-no]").onclick = () => close(null);
      d.addEventListener("cancel", () => close(null));
      d.querySelector("[data-yes]").onclick = () => {
        const out = {}; let ok = true;
        (fields || []).forEach((f) => { const v = $(`#ask-${f.id}`, d).value.trim(); out[f.id] = v; const bad = f.required && !v; $(`#err-${f.id}`, d).hidden = !bad; if (bad) ok = false; });
        if (ok) close(out);
      };
    });
  }
  const rowHtml = (r) => `<div class="lr r-${r.k} ${r.tone || ""}"><div class="ll"><b>${esc(r.label)}</b>${r.detail ? `<small>${esc(r.detail)}</small>` : ""}${r.note ? `<small>${esc(r.note)}</small>` : ""}</div><div class="la">${r.k === "less" ? "− " : ""}${fmt(Math.abs(r.amt))}</div></div>`;
  const allRows = () => db.deals.map((d) => { const c = S.calc(d); return { d, c, st: S.status(d, c) }; });

  // ---- a printable state for a saved receipt ----
  function stateOfReceipt(d, r) {
    if (r.state) return Object.assign({}, r.state, { unapproved: r.status !== "approved" });
    const earlier = S.receiptsOf(d.id).filter((x) => x !== r && x.status === "approved" && x.date <= r.date && db.receipts.indexOf(x) < db.receipts.indexOf(r)).reduce((n, x) => n + x.amount, 0);
    const cash = r.methods.find((m) => m.name === "Cash"), others = r.methods.filter((m) => m.name !== "Cash");
    return Object.assign({}, JSON.parse(JSON.stringify(d.s)), { receiptNo: r.no, date: r.date, kind: r.kind, earlier: String(earlier / 100), cash: cash ? String(cash.amt / 100) : "", cashProofs: cash ? cash.proofs : 0,
      methods: others.map((m) => (m.name === "Check" ? { type: "check", name: "Check", amount: String(m.amt / 100), checkNo: "", bank: "", branch: "", proofs: m.proofs } : { type: "wallet", name: m.name, amount: String(m.amt / 100), ref: "", proofs: m.proofs })), unapproved: r.status !== "approved" });
  }
  function printReceipt(d, r) {
    const payload = { s: stateOfReceipt(d, r), layout: "form", copies: 3, names: [] };
    window.open(`print-form.html#${btoa(unescape(encodeURIComponent(JSON.stringify(payload))))}`, "_blank");
  }

  // ================= TRANSACTIONS =================
  function pageDeals() {
    let filter = "all", q = "";
    const rows = allRows();
    const live = rows.filter((x) => x.st !== "cancelled");
    const owe = live.filter((x) => x.c.balance > 0), od = rows.filter((x) => x.st === "overdue"), ln = rows.filter((x) => x.st === "lender");
    const pend = db.receipts.filter((r) => r.status === "pending");
    const bucket = (lo, hi) => od.filter((x) => { const n = -S.diffDays(S.dueISO(x.d), S.TODAY); return n >= lo && n <= hi; }).reduce((n, x) => n + x.c.balance, 0);
    main.innerHTML = head("Transactions", "Every deal and its receipts. A financed car takes more than one receipt, so check here what is still unpaid.", `<a class="btn primary" href="index.html">${ico("plus")}New receipt</a>`) + `
<div class="stats">
  <div class="stat"><small>Still to collect</small><b>${fmt(owe.reduce((n, x) => n + x.c.balance, 0))}</b><span>${owe.length} open ${owe.length === 1 ? "deal" : "deals"}</span></div>
  <div class="stat red"><small>Overdue</small><b>${fmt(od.reduce((n, x) => n + x.c.balance, 0))}</b><span>${od.length} ${od.length === 1 ? "deal" : "deals"} · 1–30 days ${fmt(bucket(1, 30))} · 31–60 ${fmt(bucket(31, 60))} · 60+ ${fmt(bucket(61, 9999))}</span></div>
  <div class="stat teal"><small>Waiting for the lender</small><b>${ln.length}</b><span>${fmt(ln.reduce((n, x) => n + x.c.t.loan, 0))} in loans not released</span></div>
  <div class="stat purple"><small>Waiting for approval</small><b>${pend.length}</b><span>${fmt(pend.reduce((n, r) => n + r.amount, 0))} in receipts</span></div>
</div>
<div class="toolbar"><div class="affix search"><span>${ico("search")}</span><input id="q" type="text" placeholder="Search buyer, plate, car, receipt no. or salesperson"></div><div class="fchips" id="chips"></div></div>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Car</th><th>Buyer</th><th>Sale</th><th class="r">Price</th><th class="r">Received</th><th class="r">Balance</th><th>Due</th><th>Status</th><th>Receipts</th></tr></thead><tbody id="tb"></tbody></table></div>`;
    const FILTERS = [["all", "All"], ["open", "Open"], ["soon", "Due soon"], ["overdue", "Overdue"], ["lender", "Waiting for lender"], ["settled", "Settled"], ["cancelled", "Cancelled"]];
    const count = (k) => (k === "all" ? rows.length : rows.filter((x) => x.st === k).length);
    function draw() {
      $("#chips").innerHTML = FILTERS.map(([k, l]) => `<button type="button" data-f="${k}" class="${filter === k ? "on" : ""}">${l} <i>${count(k)}</i></button>`).join("");
      const needle = q.toLowerCase().split(/\s+/).filter(Boolean);
      const list = rows.filter((x) => (filter === "all" || x.st === filter) && needle.every((w) => (`${unitName(x.d)} ${plates(x.d)} ${x.d.s.receivedFrom} ${x.d.by} ${x.d.s.institution} ${x.c.recs.map((r) => r.no).join(" ")}`).toLowerCase().includes(w)))
        .sort((a, b) => S.STATUS[a.st].rank - S.STATUS[b.st].rank || (a.d.created < b.d.created ? 1 : -1));
      $("#tb").innerHTML = list.length ? list.map(({ d, c, st }) => {
        const pend = c.recs.filter((r) => r.status === "pending").length;
        return `<tr class="link" data-id="${d.id}"><td><b>${esc(unitName(d))}</b><small class="mono">${esc(plates(d))}</small></td><td>${esc(d.s.receivedFrom)}<small>${esc(d.by)}</small></td>
<td>${d.s.sale === "financing" ? `Financing<small>${esc(d.s.institution)}</small>` : "Cash"}</td><td class="r">${fmt(c.t.price)}</td><td class="r">${fmt(c.approved)}</td>
<td class="r b ${c.balance > 0 && st === "overdue" ? "neg" : ""}">${d.cancelled ? "—" : fmt(Math.max(0, c.balance))}</td><td>${dueCell(d, c)}</td><td>${pill(st)}</td>
<td>${c.recs.filter((r) => r.status !== "rejected").length}${pend ? `<small style="color:#5b21b6">${pend} waiting approval</small>` : ""}</td></tr>`;
      }).join("") : `<tr><td colspan="9" class="empty">No deals match. Try another word or filter.</td></tr>`;
    }
    $("#q").addEventListener("input", (e) => { q = e.target.value; draw(); });
    main.addEventListener("click", (e) => { const f = e.target.closest("[data-f]"); if (f) { filter = f.dataset.f; draw(); } const tr = e.target.closest("tr[data-id]"); if (tr) location.href = `deal.html?id=${tr.dataset.id}`; });
    draw();
  }

  // ================= ONE DEAL =================
  function pageDeal() {
    const id = new URLSearchParams(location.search).get("id"), d = db.deals.find((x) => x.id === id);
    if (!d) { main.innerHTML = head("Deal not found", "It may have been reset.", `<a class="btn" href="deals.html">Back to transactions</a>`); return; }
    const c = S.calc(d), st = S.status(d, c), t = c.t, isAdmin = role === "admin";
    const state = Object.assign({}, JSON.parse(JSON.stringify(d.s)), { earlier: String(c.approved / 100), cash: "", methods: [], payout: "", cashProofs: 0 });
    const L = MAD.ledger(state), pct = t.due > 0 ? Math.max(0, Math.min(100, Math.round((c.approved / t.due) * 100))) : 100;
    const b = MAD.balanceInfo(Object.assign({}, t, { balance: c.balance }));
    const recRows = c.recs.map((r) => `<tr><td><b class="mono">${esc(r.no)}</b><small>${esc(MAD.KINDS[r.kind] || r.kind)}</small></td><td>${prettyDate(r.date)}<small>by ${esc(r.by)}</small></td>
<td>${r.methods.map((m) => `${esc(m.name)} ${fmt(m.amt)}`).join("<br>")}</td><td class="r b">${fmt(r.amount)}</td>
<td>${rpill(r)}${r.status === "rejected" ? `<small>${esc(r.rejectReason || "")}</small>` : r.status === "void" ? `<small>${esc(r.voidReason || "")}</small>` : r.approvedBy ? `<small>by ${esc(r.approvedBy)}</small>` : ""}</td>
<td class="r"><button class="btn sm" data-print="${r.id}">${ico("printer")}Print</button>${isAdmin && r.status === "approved" ? ` <button class="btn sm danger" data-void="${r.id}">Void</button>` : ""}</td></tr>`).join("");
    const history = db.log.filter((l) => l.dealId === d.id).map((l) => `<li><time>${prettyDate(l.ts)}</time><span>${esc(l.text)}</span></li>`).join("") || `<li><span class="hint">Nothing yet.</span></li>`;
    const invs = d.s.units.map((u) => `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem"><span><b>${esc(u.makeType || "")}</b><br><small class="mono" style="color:var(--muted-fg)">${esc(u.plate)}</small></span><span class="pill p-${S.invStatus(u.plate)}">${S.invStatus(u.plate)}</span></div>`).join("");
    main.innerHTML = head(`${esc(d.s.receivedFrom)} <span style="font-weight:400;color:var(--muted-fg)">· ${esc(unitName(d))}</span>`, `Deal ${d.id} · ${esc(plates(d))} · opened ${prettyDate(d.created)} by ${esc(d.by)}`,
      `<a class="btn" href="deals.html">All transactions</a>${!d.cancelled && c.balance > 0 ? `<a class="btn primary" href="index.html?deal=${d.id}">${ico("plus")}Add a payment</a>` : ""}`) + `
<div class="two"><div class="stack2">
<section class="card"><header><span class="tile">${ico("cash", "lg")}</span><div><h2>Where the money stands</h2><p>Only approved receipts are counted${c.pending ? `. ${fmt(c.pending)} is still waiting for approval.` : "."}</p></div><span style="margin-left:auto">${pill(st)}</span></header>
<div class="bar" style="margin-bottom:1rem"><i style="width:${pct}%"></i></div>
<div class="ledger">${L.rows.map(rowHtml).join("")}<div class="proof ${L.proves ? "ok" : "bad"}">${L.proves ? "✓ Adds up" : "✕ Does not add up"}: ${esc(L.proof)}</div></div></section>
<section class="card"><header><span class="tile">${ico("file", "lg")}</span><div><h2>Receipts on this deal</h2><p>${c.recs.length} in all. Receipt numbers are in the order they were filled in.</p></div></header>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No.</th><th>Date</th><th>Paid through</th><th class="r">Amount</th><th>Status</th><th></th></tr></thead><tbody>${recRows}</tbody></table></div></section>
<section class="card"><header><span class="tile">${ico("history", "lg")}</span><div><h2>History</h2><p>Who did what on this deal</p></div></header><ul class="timeline">${history}</ul></section>
</div><div class="stack2">
<section class="card"><header><div><h2>Status</h2></div><span style="margin-left:auto">${pill(st)}</span></header>
<dl class="kv"><dt>Balance</dt><dd class="${st === "overdue" ? "neg" : ""}">${d.cancelled ? "—" : fmt(Math.max(0, c.balance))}</dd><dt>Due</dt><dd>${c.balance > 0 && !d.cancelled ? (S.dueISO(d) ? `${prettyDate(S.dueISO(d))} (${rel(S.dueISO(d))})` : esc(d.s.dueText || "No date")) : "—"}</dd><dt>Sale</dt><dd>${d.s.sale === "financing" ? "Financing" : "Cash"}</dd><dt>Salesperson</dt><dd>${esc(d.by)}</dd>${d.cancelled ? `<dt>Cancelled</dt><dd>${prettyDate(d.cancelled.on)}</dd>` : ""}</dl>
${d.cancelled ? `<p class="hint">${esc(d.cancelled.reason)} Refunded ${fmt(d.cancelled.refund || 0)}.</p>` : ""}</section>
${d.s.sale === "financing" ? `<section class="card"><header><span class="tile">${ico("bank", "lg")}</span><div><h2>The lender</h2><p>${esc(d.s.institution)}</p></div></header>
<dl class="kv"><dt>Loan</dt><dd>${fmt(t.loan)}</dd><dt>Processing fee</dt><dd>${fmt(t.fee)}</dd><dt>Loan</dt><dd>${d.loanStatus === "released" ? `<span class="pill p-settled">Released ${prettyDate(d.loanReleasedOn)}</span>` : `<span class="pill p-lender">Waiting${d.loanSince ? ` since ${prettyDate(d.loanSince)}` : ""}</span>`}</dd></dl>
<p class="hint">The fee is owed by the buyer to the lender, not to us. The loan is paid to us by the lender and is not in the buyer's balance.</p>
${!d.cancelled ? `<div style="margin-top:.75rem">${isAdmin ? (d.loanStatus === "released" ? `<button class="btn sm" data-loan="waiting">Mark as waiting again</button>` : `<button class="btn primary" data-loan="released">${ico("check")}Mark the loan as released</button>`) : `<p class="hint">Only the Admin can mark the loan as released.</p>`}</div>` : ""}</section>` : ""}
<section class="card"><header><span class="tile">${ico("car", "lg")}</span><div><h2>Inventory sheet</h2><p>What the REMARKS column shows</p></div></header>${invs}
<p class="hint">Reserved while anything is unpaid. It becomes Sold only when the buyer's part is paid${d.s.sale === "financing" ? " and the loan is released" : ""}. A cancelled deal frees the car again.</p></section>
${d.s.hasLieu && toC(d.s.lieuAmount) ? `<section class="card"><header><span class="tile">${ico("file", "lg")}</span><div><h2>Documents held</h2><p>In lieu of ${fmt(toC(d.s.lieuAmount))}</p></div></header><p class="hint" style="margin:0">We hold the buyer's documents until ${prettyDate(d.s.lieuUntil)}${S.diffDays(d.s.lieuUntil, S.TODAY) < 0 ? ` (${rel(d.s.lieuUntil)})` : ` (${rel(d.s.lieuUntil)})`}. No money moved, so the balance is not affected.</p></section>` : ""}
${isAdmin && !d.cancelled ? `<button class="btn danger" data-cancel type="button" style="justify-self:start">Cancel this deal</button>` : ""}
</div></div>`;
    main.addEventListener("click", async (e) => {
      const t0 = e.target.closest("button"); if (!t0) return;
      if (t0.dataset.print) printReceipt(d, db.receipts.find((r) => r.id === t0.dataset.print));
      if (t0.dataset.void) { const r = db.receipts.find((x) => x.id === t0.dataset.void); const v = await ask({ title: `Void receipt ${r.no}?`, text: `${fmt(r.amount)} will stop counting toward this deal. This is logged.`, fields: [{ id: "reason", label: "Why is it being voided?", type: "textarea", required: true }], confirm: "Void receipt", danger: true }); if (v) { r.status = "void"; r.voidReason = v.reason; S.log("void", `Voided receipt ${r.no} (${fmt(r.amount)}) of ${d.s.receivedFrom}: ${v.reason}`, d.id); S.save(); location.reload(); } }
      if (t0.dataset.loan) { if (t0.dataset.loan === "released") { const v = await ask({ title: "Mark the loan as released?", text: `${d.s.institution} paid ${fmt(t.loan)}. ${c.balance <= 0 ? "The car will show as Sold in the inventory sheet." : "The buyer still has a balance, so the car stays Reserved."}`, fields: [{ id: "on", label: "Release date", type: "date", value: S.TODAY, required: true }], confirm: "Mark as released" }); if (v) { d.loanStatus = "released"; d.loanReleasedOn = v.on; S.log("loan", `Marked the ${d.s.institution} loan as released for ${d.s.receivedFrom} (${plates(d)}).`, d.id); S.save(); location.reload(); } } else { d.loanStatus = "waiting"; d.loanReleasedOn = null; S.log("loan", `Marked the ${d.s.institution} loan as waiting again for ${d.s.receivedFrom}.`, d.id); S.save(); location.reload(); } }
      if (t0.hasAttribute("data-cancel")) { const v = await ask({ title: "Cancel this deal?", text: "The car becomes Available again. Earnest money and partial payments are non-refundable unless you enter a refund.", fields: [{ id: "reason", label: "Reason", type: "textarea", required: true }, { id: "refund", label: "Amount refunded to the buyer", type: "money", value: "0" }], confirm: "Cancel the deal", danger: true }); if (v) { const refund = toC(v.refund); d.cancelled = { reason: v.reason, on: S.TODAY, refund, by: user }; S.log("cancel", `Cancelled the deal of ${d.s.receivedFrom} (${plates(d)}). Refunded ${fmt(refund)}. ${v.reason}`, d.id); S.save(); location.reload(); } }
    });
  }

  // ================= APPROVALS =================
  function pageApprovals() {
    if (role === "sales") { main.innerHTML = head("Approvals", "Receipts waiting for the Approver.") + `<div class="tbl-wrap"><div class="note-lock">Only the Approver and the Admin can open this page.<br>Switch “Viewing as” in the sidebar to see it.</div></div>`; return; }
    const pend = db.receipts.filter((r) => r.status === "pending");
    const card = (r) => {
      const d = db.deals.find((x) => x.id === r.dealId), c = S.calc(d), after = c.balance - r.amount - c.pending + r.amount;
      const after2 = c.t.due - c.approved - r.amount, own = r.by === user;
      return `<div class="acard"><header><div><h3>Receipt <span class="mono">${esc(r.no)}</span> · ${esc(MAD.KINDS[r.kind] || r.kind)} · ${fmt(r.amount)}</h3><div class="sub2">${esc(d.s.receivedFrom)} · ${esc(unitName(d))} · <span class="mono">${esc(plates(d))}</span></div></div><div style="text-align:right">${rpill(r)}<div class="sub2" style="margin-top:.25rem">filled in by ${esc(r.by)} · ${prettyDate(r.submitted)}</div></div></header>
<div class="mini">${r.methods.map((m) => `<span class="${m.proofs ? "ok" : "no"}">${esc(m.name)} ${fmt(m.amt)}</span>`).join("")}</div>
<dl class="kv"><dt>Amount due from the buyer on this deal</dt><dd>${fmt(c.t.due)}</dd><dt>Already approved</dt><dd>${fmt(c.approved)}</dd><dt>Balance after this receipt</dt><dd class="${after2 < 0 ? "neg" : ""}">${after2 < 0 ? "Overpaid " + fmt(-after2) : fmt(after2)}</dd><dt>Sale</dt><dd>${d.s.sale === "financing" ? "Financing · " + esc(d.s.institution) : "Cash"}</dd></dl>
<div class="acts">${role === "approver" ? (own ? `<span class="hint">You filled this in, so someone else must approve it.</span>` : `<a class="btn" href="deal.html?id=${d.id}">Open deal</a><button class="btn danger" data-reject="${r.id}" type="button">Reject</button><button class="btn primary" data-approve="${r.id}" type="button">${ico("check")}Approve</button>`) : `<a class="btn" href="deal.html?id=${d.id}">Open deal</a><span class="hint">Only the Approver can approve.</span>`}</div></div>`;
    };
    const done = db.receipts.filter((r) => ["approved", "rejected"].includes(r.status)).sort((a, b) => ((b.approvedOn || b.submitted) > (a.approvedOn || a.submitted) ? 1 : -1)).slice(0, 6);
    main.innerHTML = head("Approvals", `Every receipt needs the Approver before it goes to Drive, Sheets, the inventory sheet and Telegram. ${role === "admin" ? "You are viewing as Admin, so you can look but not approve." : ""}`) +
      `<div class="stack2" style="max-width:62rem">${pend.length ? pend.map(card).join("") : `<div class="tbl-wrap"><div class="empty">Nothing is waiting for approval.</div></div>`}</div>
<h2 style="font-size:16px;font-weight:500;margin:2rem 0 .75rem">Recently decided</h2><div class="tbl-wrap" style="max-width:62rem"><table class="tbl"><tbody>${done.map((r) => { const d = db.deals.find((x) => x.id === r.dealId); return `<tr class="link" data-id="${d.id}"><td><b class="mono">${esc(r.no)}</b></td><td>${esc(d.s.receivedFrom)}<small>${esc(unitName(d))}</small></td><td class="r">${fmt(r.amount)}</td><td>${rpill(r)}<small>${r.status === "rejected" ? esc(r.rejectReason || "") : "by " + esc(r.approvedBy || "")}</small></td></tr>`; }).join("")}</tbody></table></div>`;
    main.addEventListener("click", async (e) => {
      const tr = e.target.closest("tr[data-id]"); if (tr && !e.target.closest("button")) return (location.href = `deal.html?id=${tr.dataset.id}`);
      const a = e.target.closest("[data-approve]"), j = e.target.closest("[data-reject]");
      if (a) { const r = db.receipts.find((x) => x.id === a.dataset.approve), d = db.deals.find((x) => x.id === r.dealId); r.status = "approved"; r.approvedBy = user; r.approvedOn = S.TODAY; S.log("approve", `Approved receipt ${r.no} of ${d.s.receivedFrom}: ${fmt(r.amount)}.`, d.id); S.save(); toast("Approved. Drive, Sheets, the inventory sheet and Telegram will update now (demo)."); setTimeout(() => location.reload(), 1200); }
      if (j) { const r = db.receipts.find((x) => x.id === j.dataset.reject), d = db.deals.find((x) => x.id === r.dealId); const v = await ask({ title: `Reject receipt ${r.no}?`, text: "The salesperson is told why and fills in a new receipt.", fields: [{ id: "reason", label: "Reason", type: "textarea", required: true, placeholder: "e.g. The check photo is blurry" }], confirm: "Reject", danger: true }); if (v) { r.status = "rejected"; r.rejectReason = v.reason; S.log("reject", `Rejected receipt ${r.no} of ${d.s.receivedFrom}: ${v.reason}`, d.id); S.save(); location.reload(); } }
    });
  }

  // ================= REMINDERS =================
  function pageReminders() {
    const st = db.settings;
    const sw = (k, label, small) => `<label class="sw"><input class="rc" type="checkbox" data-set="${k}" ${st[k] ? "checked" : ""}><span class="track"></span><span>${label}<small>${small || ""}</small></span></label>`;
    function draw() {
      const list = S.forMe(S.notifications());
      const grp = (title, f) => { const items = list.filter(f); return items.length ? `<h2 style="font-size:13px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--muted-fg);margin:1.25rem 0 .5rem">${title}</h2><div class="tbl-wrap">${items.map(item).join("")}</div>` : ""; };
      const item = (n) => `<div class="nrow ${n.level}"><span class="ic">${ico(n.icon, "lg")}</span><div><b>${esc(n.title)}</b><p>${esc(n.detail)}</p><div class="who">For ${esc(n.who)}</div></div><div class="act">${db.sent[n.key] === S.TODAY ? `<span class="pill p-settled">Sent today</span>` : `<button class="btn sm" data-send="${n.key}" type="button">${ico("send")}Send reminder</button>`}<a class="btn sm ghost" href="deal.html?id=${n.dealId}">Open deal</a></div></div>`;
      $("#nlist").innerHTML = list.length ? grp("Needs action now", (n) => n.level === "red") + grp("Coming up", (n) => ["amber", "blue"].includes(n.level)) + grp("Waiting for approval", (n) => n.level === "purple") : `<div class="tbl-wrap"><div class="empty">${ico("check", "lg")}<br>Nothing needs attention.</div></div>`;
      $("#ncount").textContent = list.length;
    }
    main.innerHTML = head("Reminders", `What needs a nudge, for ${S.ROLES[role].user} (${S.ROLES[role].label}). Reminders go out every morning at 8:00 (demo).`, `<button class="btn primary" id="run" type="button">${ico("send")}Send today's reminders now</button>`) + `
<div class="two"><div><div style="font-size:13px;color:var(--muted-fg)"><b id="ncount" style="color:var(--fg)">0</b> reminders for you today</div><div id="nlist"></div></div>
<section class="card settings"><header><span class="tile">${ico("bell", "lg")}</span><div><h2>When to remind</h2><p>Applies to the whole team</p></div></header>
${sw("before7", "7 days before the due date")}${sw("before3", "3 days before the due date")}${sw("dueDay", "On the due day")}${sw("overdueDaily", "Every day when it is overdue")}
<div class="field" style="margin:.5rem 0 1rem"><label>A loan has waited for the lender more than</label><div class="affix"><input type="text" id="lenderDays" value="${st.lenderDays}" style="text-align:right"><span>days</span></div></div>
<div class="field" style="margin-bottom:1rem"><label>A receipt has waited for approval more than</label><div class="affix"><input type="text" id="approvalHours" value="${st.approvalHours}" style="text-align:right"><span>hours</span></div></div>
<div class="sub">Where reminders go</div>${sw("telegram", "Telegram", "To the salesperson, and the group for overdue items")}${sw("inApp", "In this app", "The red number in the menu")}
<p class="hint">The collateral date of documents we hold also triggers a reminder 7 days ahead.</p></section></div>`;
    main.addEventListener("change", (e) => { if (e.target.dataset.set) { st[e.target.dataset.set] = e.target.checked; S.save(); draw(); } });
    main.addEventListener("input", (e) => { if (e.target.id === "lenderDays" || e.target.id === "approvalHours") { const v = parseInt(e.target.value, 10); if (v > 0) { st[e.target.id] = v; S.save(); draw(); } } });
    main.addEventListener("click", (e) => {
      const b = e.target.closest("[data-send]"); if (b) { db.sent[b.dataset.send] = S.TODAY; S.save(); toast("Reminder sent to Telegram (demo)."); draw(); }
      if (e.target.closest("#run")) { const list = S.forMe(S.notifications()); list.forEach((n) => (db.sent[n.key] = S.TODAY)); S.save(); toast(`Sent ${list.length} reminders to Telegram (demo).`); draw(); }
    });
    draw();
  }

  // ================= DAILY CASH REPORT =================
  function pageCash() {
    if (role === "sales") { main.innerHTML = head("Daily cash report", "What each person collected.") + `<div class="tbl-wrap"><div class="note-lock">Only the Admin and the Approver can open this page.</div></div>`; return; }
    main.innerHTML = head("Daily cash report", "What was collected on a day, by person and by how it was paid. Use it to match the cash and the proof photos.", `<button class="btn" id="pr" type="button">${ico("printer")}Print</button>`) + `
<div class="toolbar"><div class="field" style="max-width:14rem"><label for="day">Day</label><input type="date" id="day" value="${S.TODAY}"></div><label class="sw" style="margin-left:1rem"><input class="rc" type="checkbox" id="wait" checked><span class="track"></span><span>Include receipts waiting for approval</span></label></div><div id="rep"></div>`;
    const kind = (n) => (n === "Cash" ? 0 : n === "Check" ? 1 : 2);
    function draw() {
      const day = $("#day").value, withPending = $("#wait").checked;
      const recs = db.receipts.filter((r) => r.date === day && (r.status === "approved" || (withPending && r.status === "pending")));
      const tot = (list, k) => list.reduce((n, r) => n + r.methods.filter((m) => kind(m.name) === k).reduce((a, m) => a + m.amt, 0), 0);
      const people = [...new Set(recs.map((r) => r.by))];
      const proofOk = recs.reduce((n, r) => n + r.methods.filter((m) => m.proofs).length, 0), proofAll = recs.reduce((n, r) => n + r.methods.length, 0);
      $("#rep").innerHTML = recs.length ? `<div class="stats"><div class="stat"><small>Cash to turn in</small><b>${fmt(tot(recs, 0))}</b><span>physical cash only</span></div><div class="stat"><small>Checks</small><b>${fmt(tot(recs, 1))}</b><span>${recs.filter((r) => r.methods.some((m) => kind(m.name) === 1)).length} receipts</span></div><div class="stat"><small>E-wallet and bank</small><b>${fmt(tot(recs, 2))}</b><span>GCash, Maya, transfers</span></div><div class="stat ${proofOk < proofAll ? "red" : ""}"><small>Proof files</small><b>${proofOk} of ${proofAll}</b><span>payments with a proof attached</span></div></div>
<div class="tbl-wrap" style="margin-bottom:1.25rem"><table class="tbl"><thead><tr><th>Person</th><th class="r">Cash</th><th class="r">Check</th><th class="r">E-wallet / bank</th><th class="r">Total</th></tr></thead><tbody>${people.map((p) => { const l = recs.filter((r) => r.by === p); return `<tr><td><b>${esc(p)}</b><small>${l.length} ${l.length === 1 ? "receipt" : "receipts"}</small></td><td class="r">${fmt(tot(l, 0))}</td><td class="r">${fmt(tot(l, 1))}</td><td class="r">${fmt(tot(l, 2))}</td><td class="r b">${fmt(tot(l, 0) + tot(l, 1) + tot(l, 2))}</td></tr>`; }).join("")}<tr><td><b>Everyone</b></td><td class="r b">${fmt(tot(recs, 0))}</td><td class="r b">${fmt(tot(recs, 1))}</td><td class="r b">${fmt(tot(recs, 2))}</td><td class="r b">${fmt(recs.reduce((n, r) => n + r.amount, 0))}</td></tr></tbody></table></div>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Receipt</th><th>Buyer</th><th>By</th><th class="r">Cash</th><th class="r">Check</th><th class="r">E-wallet / bank</th><th class="r">Total</th><th>Status</th></tr></thead><tbody>${recs.map((r) => { const d = db.deals.find((x) => x.id === r.dealId); return `<tr class="link" data-id="${d.id}"><td><b class="mono">${esc(r.no)}</b></td><td>${esc(d.s.receivedFrom)}<small>${esc(unitName(d))}</small></td><td>${esc(r.by)}</td><td class="r">${fmt(tot([r], 0))}</td><td class="r">${fmt(tot([r], 1))}</td><td class="r">${fmt(tot([r], 2))}</td><td class="r b">${fmt(r.amount)}</td><td>${rpill(r)}</td></tr>`; }).join("")}</tbody></table></div>` : `<div class="tbl-wrap"><div class="empty">No receipts on ${prettyDate(day)}. Try another day.</div></div>`;
    }
    main.addEventListener("input", draw); main.addEventListener("change", draw);
    main.addEventListener("click", (e) => { if (e.target.closest("#pr")) window.print(); const tr = e.target.closest("tr[data-id]"); if (tr) location.href = `deal.html?id=${tr.dataset.id}`; });
    draw();
  }

  // ================= ACTIVITY LOG =================
  function pageActivity() {
    if (role === "sales") { main.innerHTML = head("Activity log", "Who did what, and when.") + `<div class="tbl-wrap"><div class="note-lock">Only the Admin and the Approver can open this page.</div></div>`; return; }
    const TYPES = { all: "Everything", receipt: "Receipts filled in", approve: "Approved", reject: "Rejected", void: "Voided", cancel: "Cancelled deals and refunds", loan: "Loan released" };
    main.innerHTML = head("Activity log", "Every approval, rejection, void, cancellation, refund and loan release. Nothing here can be edited.") + `<div class="toolbar"><div class="fchips" id="tc">${Object.entries(TYPES).map(([k, l]) => `<button type="button" data-t="${k}" class="${k === "all" ? "on" : ""}">${l}</button>`).join("")}</div></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Who</th><th>What</th><th></th></tr></thead><tbody id="lb"></tbody></table></div>`;
    const draw = (t) => { const list = db.log.filter((l) => t === "all" || l.type === t); $("#lb").innerHTML = list.length ? list.map((l) => `<tr><td style="white-space:nowrap">${prettyDate(l.ts)}</td><td><b>${esc(l.user)}</b><small>${S.ROLES[l.role].label}</small></td><td>${esc(l.text)}</td><td class="r">${l.dealId ? `<a class="btn sm" href="deal.html?id=${l.dealId}">Open deal</a>` : ""}</td></tr>`).join("") : `<tr><td colspan="4" class="empty">Nothing here yet.</td></tr>`; };
    main.addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) { $$("#tc button").forEach((x) => x.classList.toggle("on", x === b)); draw(b.dataset.t); } });
    draw("all");
  }


  // ================= ADMIN SETTINGS =================
  function pageSettings() {
    if (role !== "admin") { main.innerHTML = head("Settings", "Everything the form offers.") + `<div class="tbl-wrap"><div class="note-lock">Only the Admin can change settings.<br>Switch “Viewing as” in the left menu to Admin.</div></div>`; return; }
    const C = S.config; let tab = "colors";
    const TABS = [["colors", "Colors"], ["pay", "Payments and lenders"], ["text", "Notes and phrases"], ["fields", "Fields and rules"], ["print", "Print and company"], ["people", "People"]];
    const flash = () => { const f = $("#saved"); f.textContent = "Saved ✓"; f.style.opacity = 1; clearTimeout(flash.t); flash.t = setTimeout(() => (f.style.opacity = 0), 1600); };
    const save = () => { S.save(); S.applyConfig(); flash(); };
    const colorsOf = (attr) => (attr === "common" ? C.colors.common : C.colors.brands[attr.slice(6)]);
    const strList = (key, title, hint, ph) => `<section class="card"><header><div><h2>${title}</h2><p>${hint}</p></div></header>${C[key].map((v, i) => `<div class="lrow"><input type="text" value="${esc(v)}" data-slist="${key}" data-i="${i}"><button class="btn ghost icon sm danger" data-sdel="${key}" data-i="${i}" title="Remove" type="button">${ico("trash")}</button></div>`).join("")}<div class="lrow add"><input type="text" placeholder="${ph}" data-sinp="${key}"><button class="btn sm primary" data-sadd="${key}" type="button">${ico("plus")}Add</button></div></section>`;
    const colorList = (attr, title, hint) => `<section class="card ${attr === "common" ? "" : "brand-card"}"><header><div><h2>${title}</h2>${hint ? `<p>${hint}</p>` : ""}</div>${attr !== "common" ? `<button class="btn ghost icon sm danger" style="margin-left:auto" data-bdel="${esc(attr.slice(6))}" title="Remove this brand" type="button">${ico("trash")}</button>` : ""}</header>${colorsOf(attr).map(([n, h], i) => `<div class="lrow"><input type="color" value="${h}" data-cl="${esc(attr)}" data-i="${i}" data-f="1"><input type="text" value="${esc(n)}" data-cl="${esc(attr)}" data-i="${i}" data-f="0"><button class="btn ghost icon sm danger" data-cdel="${esc(attr)}" data-i="${i}" type="button" title="Remove">${ico("trash")}</button></div>`).join("")}<div class="lrow add"><input type="color" value="#cccccc" data-cainp="${esc(attr)}" data-f="1"><input type="text" placeholder="Color name" data-cainp="${esc(attr)}" data-f="0"><button class="btn sm primary" data-cadd="${esc(attr)}" type="button">${ico("plus")}Add</button></div></section>`;
    const sw = (attr, on, label, small) => `<label class="sw" style="margin-bottom:.9rem"><input class="rc" type="checkbox" ${attr} ${on ? "checked" : ""}><span class="track"></span><span>${label}${small ? `<small>${small}</small>` : ""}</span></label>`;
    const panels = {
      colors: () => `<p class="swatch-note">Colors appear as choices on every vehicle card. Brand colors show up when the car's make matches the brand name. Make and type themselves come from the inventory sheet, so they are not edited here.</p><div class="sgrid">${colorList("common", "Common colors", "Always shown, for any car")}${Object.keys(C.colors.brands).map((b) => colorList("brand:" + b, `<input type="text" data-brandname="${esc(b)}" value="${esc(b)}" title="Rename the brand">`, "Factory colors for this brand")).join("")}</div><section class="card" style="margin-top:1.25rem"><header><div><h2>Add a brand</h2><p>Give it its own list of factory color names</p></div></header><div class="lrow"><input type="text" id="new-brand" placeholder="Brand name, e.g. Kia"><button class="btn primary" data-badd type="button">${ico("plus")}Add brand</button></div></section>`,
      pay: () => `<div class="sgrid">${strList("wallets", "E-wallets and other payment methods", "The “Also paid by” buttons in the Payment step", "e.g. PayMaya QR")}${strList("banks", "Banks for checks", "The Bank list in the check row", "e.g. Landbank")}${strList("institutions", "Financing institutions", "The Institution list for financing", "e.g. Home Credit")}${strList("years", "Years to pay", "The Years buttons for financing", "e.g. 6")}</div>`,
      text: () => `<div class="sgrid"><section class="card"><header><div><h2>Standard notes</h2><p>Printed on every receipt. “On by default” decides whether a new receipt starts with it.</p></div></header>${C.notes.map((n, i) => `<div class="lrow"><input type="text" value="${esc(n.text)}" data-note="${i}"><label class="sw"><input class="rc" type="checkbox" data-noteon="${i}" ${n.on ? "checked" : ""}><span class="track"></span><span>On by default</span></label><button class="btn ghost icon sm danger" data-ndel="${i}" type="button" title="Remove">${ico("trash")}</button></div>`).join("")}<div class="lrow add"><input type="text" placeholder="Write a standard note" data-ninp><button class="btn sm primary" data-nadd type="button">${ico("plus")}Add</button></div></section><div class="stack2">${strList("phrases", "Ready-made remark lines", "The “Tap to add a line” buttons under Remarks", "e.g. Spare tire included.")}${strList("duePhrases", "“On or before” phrases", "The quick words next to the balance date", "e.g. Upon registration")}</div></div>`,
      fields: () => `<div class="sgrid"><section class="card"><header><div><h2>Required fields</h2><p>Staff cannot send a receipt for approval until these are filled in. Receipt number, buyer, plate, price and payment are always required.</p></div></header>${sw('data-req="contact"', C.required.contact, "Contact number", "11 digits starting with 09")}${sw('data-req="address"', C.required.address, "Postal address")}${sw('data-req="motor"', C.required.motor, "Motor number")}${sw('data-req="chassis"', C.required.chassis, "Chassis number")}${sw('data-req="color"', C.required.color, "Color")}${sw('data-req="proofs"', C.required.proofs, "Proof of every payment", "Photo of the cash, check photo, receipt or screenshot")}</section>
<div class="stack2"><section class="card"><header><div><h2>Parts of the form</h2><p>Turn a part off to hide it from the form</p></div></header>${sw('data-sec="trade"', C.sections.trade, "Trade-in")}${sw('data-sec="lieu"', C.sections.lieu, "In lieu of documents")}${sw('data-sec="remarks"', C.sections.remarks, "Remarks")}</section>
<section class="card"><header><div><h2>Financing rules</h2><p>Used for the default fee and the warnings</p></div></header><div class="grid"><div class="field s3"><label>Standard processing fee</label><div class="affix"><input type="text" data-num="feeStd" value="${esc(C.feeStd)}" style="text-align:right"><span>% of the loan</span></div></div><div class="field s3"><label>Lowest usual down payment</label><div class="affix"><input type="text" data-num="minDownPct" value="${esc(C.minDownPct)}" style="text-align:right"><span>% of the price</span></div></div></div><p class="hint">Staff can still type any other fee percent. A down payment below this number only shows a warning.</p></section></div></div>`,
      print: () => `<div class="sgrid"><section class="card"><header><div><h2>Company on the receipt</h2><p>Shown at the top of every printed copy</p></div></header><div class="field" style="margin-bottom:.9rem"><label>Business name</label><input type="text" data-co="name" value="${esc(C.company.name)}"></div><div class="field" style="margin-bottom:.9rem"><label>Title</label><input type="text" data-co="tagline" value="${esc(C.company.tagline)}"></div><div class="field"><label>Address line</label><textarea data-co="address" style="min-height:5rem">${esc(C.company.address)}</textarea></div></section>${strList("copyNames", "Names of the printed copies", "Copy 1, 2, 3… are named in this order. The staff can still rename them when printing.", "e.g. Bank copy")}</div>`,
      people: () => `<section class="card" style="max-width:34rem"><header><div><h2>People</h2><p>Names shown for each role, and on new receipts and approvals</p></div></header>${[["sales", "Sales (fills in receipts)"], ["admin", "Admin (manages everything)"], ["approver", "Approver (approves every receipt)"]].map(([k, l]) => `<div class="field" style="margin-bottom:.9rem"><label>${l}</label><input type="text" data-person="${k}" value="${esc(C.people[k])}"></div>`).join("")}<p class="hint">Records already saved keep the name they had at the time.</p></section>`,
    };
    function draw() {
      $("#panel").innerHTML = panels[tab]();
      $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    }
    main.innerHTML = head("Settings", "Control every list and option the form uses. Changes apply to the next receipt that is filled in.", `<span id="saved"></span><button class="btn" id="reset-cfg" type="button">Restore all defaults</button>`) +
      `<div class="toolbar"><div class="fchips" id="tabs">${TABS.map(([k, l]) => `<button type="button" data-tab="${k}">${l}</button>`).join("")}</div></div><div id="panel"></div>`;
    main.addEventListener("click", async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.tab) { tab = b.dataset.tab; return draw(); }
      if (b.id === "reset-cfg") { const v = await ask({ title: "Restore all defaults?", text: "Every list, rule and name on this page goes back to how it started. Receipts and deals are not touched.", confirm: "Restore defaults", danger: true, fields: [] }); if (v) { S.resetConfig(); flash(); draw(); } return; }
      const row = b.closest(".lrow");
      if (b.dataset.sdel) { C[b.dataset.sdel].splice(+b.dataset.i, 1); save(); draw(); }
      if (b.dataset.sadd) { const i = $(`[data-sinp="${b.dataset.sadd}"]`, row), v = i.value.trim(); if (v && !C[b.dataset.sadd].includes(v)) { C[b.dataset.sadd].push(v); save(); draw(); } else i.focus(); }
      if (b.dataset.cdel) { colorsOf(b.dataset.cdel).splice(+b.dataset.i, 1); save(); draw(); }
      if (b.dataset.cadd) { const n = $(`[data-cainp="${b.dataset.cadd}"][data-f="0"]`, row), h = $(`[data-cainp="${b.dataset.cadd}"][data-f="1"]`, row); if (n.value.trim()) { colorsOf(b.dataset.cadd).push([n.value.trim(), h.value]); save(); draw(); } else n.focus(); }
      if (b.dataset.bdel) { const v = await ask({ title: `Remove ${b.dataset.bdel}?`, text: "Its factory colors disappear from the form. Plain colors stay.", confirm: "Remove brand", danger: true, fields: [] }); if (v) { delete C.colors.brands[b.dataset.bdel]; save(); draw(); } }
      if (b.hasAttribute("data-badd")) { const i = $("#new-brand"), v = i.value.trim(); if (v && !C.colors.brands[v]) { C.colors.brands[v] = []; save(); draw(); } else i.focus(); }
      if (b.dataset.ndel) { C.notes.splice(+b.dataset.ndel, 1); save(); draw(); }
      if (b.hasAttribute("data-nadd")) { const i = $("[data-ninp]", row); if (i.value.trim()) { C.notes.push({ text: i.value.trim(), on: true }); save(); draw(); } else i.focus(); }
    });
    main.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.slist) { const v = t.value.trim(); if (v) C[t.dataset.slist][+t.dataset.i] = v; else C[t.dataset.slist].splice(+t.dataset.i, 1); save(); draw(); }
      if (t.dataset.cl) { colorsOf(t.dataset.cl)[+t.dataset.i][+t.dataset.f] = t.value.trim() || colorsOf(t.dataset.cl)[+t.dataset.i][0]; save(); }
      if (t.dataset.note) { C.notes[+t.dataset.note].text = t.value.trim() || C.notes[+t.dataset.note].text; save(); }
      if (t.dataset.noteon) { C.notes[+t.dataset.noteon].on = t.checked; save(); }
      if (t.dataset.req) { C.required[t.dataset.req] = t.checked; save(); }
      if (t.dataset.sec) { C.sections[t.dataset.sec] = t.checked; save(); }
      if (t.dataset.num) { const v = parseFloat(t.value); if (v >= 0 && v <= 100) { C[t.dataset.num] = String(v); save(); } else t.value = C[t.dataset.num]; }
      if (t.dataset.co) { C.company[t.dataset.co] = t.value.trim() || C.company[t.dataset.co]; save(); }
      if (t.dataset.person) { C.people[t.dataset.person] = t.value.trim() || C.people[t.dataset.person]; save(); }
      if (t.dataset.brandname) { const old = t.dataset.brandname, nu = t.value.trim(); if (nu && nu !== old && !C.colors.brands[nu]) { const o = {}; Object.keys(C.colors.brands).forEach((k) => (o[k === old ? nu : k] = C.colors.brands[k])); C.colors.brands = o; save(); draw(); } }
    });
    draw();
  }

  ({ deals: pageDeals, deal: pageDeal, approvals: pageApprovals, reminders: pageReminders, cash: pageCash, activity: pageActivity, settings: pageSettings })[which]();
})();

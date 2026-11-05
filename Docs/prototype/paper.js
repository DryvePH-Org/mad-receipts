/* Shared by the form page and the print pages: turns the typed-in values into the printed receipt. Front end only. */
(function () {
  const ONES = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  const under1000 = (n) => { const p = []; if (n >= 100) { p.push(ONES[Math.floor(n / 100)], "hundred"); n %= 100; } if (n >= 20) { p.push(TENS[Math.floor(n / 10)]); n %= 10; if (n) p.push(ONES[n]); } else if (n) p.push(ONES[n]); return p.join(" "); };
  const intWords = (n) => { if (n === 0) return "zero"; const p = []; for (const [v, name] of [[1e9,"billion"],[1e6,"million"],[1e3,"thousand"]]) if (n >= v) { p.push(under1000(Math.floor(n / v)), name); n %= v; } if (n) p.push(under1000(n)); return p.join(" "); };
  const title = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  const words = (cents) => { if (cents <= 0) return ""; const pesos = Math.floor(cents / 100), c = cents % 100; return `${title(intWords(pesos))} ${pesos === 1 ? "Peso" : "Pesos"}${c ? ` and ${String(c).padStart(2, "0")}/100` : ""} Only`; };
  const toC = (s) => { const t = String(s || "").replace(/[₱,\s]/g, ""); if (!/^\d*\.?\d{0,2}$/.test(t) || t === "" || t === ".") return 0; return Math.round(parseFloat(t) * 100); };
  const fmt = (c) => { const a = Math.abs(c), p = Math.floor(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","), k = a % 100; return `${c < 0 ? "-" : ""}₱${p}${k ? "." + String(k).padStart(2, "0") : ""}`; };
  const prettyDate = (iso) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return ""; const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }); };
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const KINDS = { earnest: "Earnest money", partial: "Partial payment", full: "Full payment" };
  const COPY_NAMES = ["Customer's copy", "Office copy", "Accounting copy", "File copy", "Extra copy"];

  /* ---------- the money math (one place, used by the form, the ledger and the print) ----------
     Agreed price                                   P
     - trade-in value (the buyer's old car)         T   not cash, so never part of the balance
     - loan (financing: price - down payment)       L   paid by the lender, not by the buyer
     = amount due from the buyer in cash            D   = (down payment or price) - T   (negative: we pay the buyer)
     - earlier payments - payments today            R
     + paid out to the buyer (only when D < 0)      X
     = balance                                      D - R + X     and always:  P = T + L + R - X + balance
     Processing fee (financing only) is owed by the buyer to the lender. We only collect the down payment, so the fee is shown for information and is never in this math.
     In lieu of documents = the buyer's documents (OR/CR) that WE hold as collateral for an unpaid amount until a date.
     No money moves, so it is never in this math; it should not be more than the balance it secures.
     Financing: the down payment already includes the trade-in, so a trade-in cannot be worth more than it. */
  function totals(s) {
    const price = toC(s.price), fin = s.sale === "financing", dp = fin ? toC(s.dp) : 0;
    const tv = s.hasTi ? toC(s.ti.value) : 0;
    const dpSet = fin && dp > 0;
    const share = dpSet ? Math.min(dp, price) : price;
    const loan = dpSet ? price - share : 0;
    const fee = fin ? toC(s.fee) : 0; // processing fee: owed by the buyer to the lender, NOT to us, so it is never in our math
    const due = share - tv;
    const today = toC(s.cash) + (s.methods || []).reduce((n, m) => n + toC(m.amount), 0);
    const earlier = toC(s.earlier), paid = earlier + today;
    const payout = due < 0 ? toC(s.payout) : 0; // cash we hand to the buyer when the trade-in is worth more than their share
    const balance = due - paid + payout;
    const lieu = s.hasLieu ? toC(s.lieuAmount) : 0; // collateral: documents we hold, no money moves
    const years = +s.years || 0, monthly = toC(s.monthly);
    return { price, tv, dp, dpSet, share, loan, fee, due, today, earlier, paid, payout, balance, lieu, years, monthly, months: years * 12, repay: monthly * years * 12 };
  }
  function balanceInfo(t) {
    if (t.balance > 0) return { label: "Balance", note: "the buyer still owes this", amt: t.balance, tone: "owe" };
    if (t.balance === 0) return { label: "Balance", note: t.due < 0 ? "settled with the buyer" : "paid in full", amt: 0, tone: "ok" };
    if (t.due < 0) return { label: "We still owe the buyer", note: "the trade-in is worth more than what the buyer must pay", amt: -t.balance, tone: "we" };
    return { label: "Overpaid by", note: "more was received than the buyer owes", amt: -t.balance, tone: "bad" };
  }
  const dueText = (s) => (s.dueMode === "date" ? prettyDate(s.dueDate) : (s.dueText || "").trim());
  const yearsLabel = (s) => (s.years ? `${s.years} ${s.years === "1" ? "year" : "years"}` : "");
  const unitsText = (s) => (s.units.length > 1 ? ` (${s.units.length} units)` : "");

  /* Every line of the working-out, with the label staff should read. amt is signed: minus lines take away. */
  function ledger(s) {
    const t = totals(s), rows = [], n = s.units.length;
    rows.push({ k: "plus", label: `Agreed price${n > 1 ? ` for ${n} units` : ""}`, amt: t.price });
    if (t.tv) rows.push({ k: "less", label: "Trade-in value", detail: [[s.ti.year, s.ti.unit].filter(Boolean).join(" "), s.ti.plate].filter(Boolean).join(" · "), note: "The buyer's old car. It lowers what they pay, so it is not part of the balance.", amt: -t.tv });
    if (t.loan) rows.push({ k: "less", label: `Loan paid by ${s.institution || "the lender"}`, detail: `Price ${fmt(t.price)} − down payment ${fmt(t.dp)}`, note: "The lender pays this, so it is not part of the balance.", amt: -t.loan });
    rows.push({ k: "sub", label: t.due < 0 ? "We pay the buyer" : "Buyer must pay us in cash", note: t.due < 0 ? "The trade-in is worth more than the buyer's share of the price" : s.sale === "financing" && t.dpSet ? (t.tv ? "Down payment less the trade-in" : "The down payment") : t.tv ? "Price less the trade-in" : "The agreed price", amt: Math.abs(t.due), tone: t.due < 0 ? "we" : "" });
    if (t.earlier) rows.push({ k: "less", label: "Earlier payments", note: "Received before this receipt", amt: -t.earlier });
    const proofText = (n) => (n ? `Proof: ${n} ${n === 1 ? "file" : "files"}` : "No proof attached yet");
    payRows(s).forEach((r) => rows.push({ k: "less", label: `Paid today · ${r.label}`, detail: [r.detail, proofText(r.proofs)].filter(Boolean).join(" · "), amt: -r.amt }));
    if (t.earlier || t.today) rows.push({ k: "sub", label: "Total received", note: t.earlier && t.today ? `Earlier ${fmt(t.earlier)} + today ${fmt(t.today)}` : "", amt: t.paid });
    if (t.payout) rows.push({ k: "plus", label: "Paid out to the buyer", detail: proofText(s.payoutProofs), note: "Cash we handed to the buyer, because the trade-in is worth more than their share. It settles what we owe.", amt: t.payout });
    const b = balanceInfo(t);
    rows.push({ k: "total", label: b.label, note: b.note, amt: b.amt, tone: b.tone });
    const sum = t.tv + t.loan + t.paid - t.payout + t.balance;
    const si = rows.findIndex((r) => r.k === "sub");
    rows.forEach((r, i) => (r.stage = i <= si ? "deal" : "pay"));
    return { t, rows, balance: b, proves: t.price > 0 && sum === t.price,
      proof: `${fmt(t.price)} = ${[t.tv && `trade-in ${fmt(t.tv)}`, t.loan && `loan ${fmt(t.loan)}`, `received ${fmt(t.paid)}`, t.payout && `paid out −${fmt(t.payout)}`, `balance ${fmt(t.balance)}`].filter(Boolean).join(" + ").replace("+ paid out", "")}`,
      info: [
        s.sale === "financing" && t.dpSet && { label: "Down payment", text: `${fmt(t.dp)} · ${t.price ? Math.round((Math.min(t.dp, t.price) / t.price) * 1000) / 10 : 0}% of the price` },
        s.sale === "financing" && t.monthly && t.years && { label: `Loan repayment to ${s.institution || "the lender"}`, text: `${fmt(t.monthly)} × ${t.months} months = ${fmt(t.repay)}. Paid by the buyer to the lender, not to us.` },
        t.fee && { label: `Processing fee to ${s.institution || "the lender"}`, text: `${fmt(t.fee)}${t.loan ? ` (${Math.round((t.fee / t.loan) * 10000) / 100}% of the loan)` : ""}. The buyer owes this to the lender, not to us. We only collect the down payment, so it is not in the balance.` },
        t.loan && { label: `Loan from ${s.institution || "the lender"}`, text: `${fmt(t.loan)} is paid to us by the lender, not by the buyer, so it is not in the balance. What the buyer pays the lender afterwards is between them.` },
        t.lieu && { label: "In lieu of documents", text: `We hold the buyer's documents as collateral for ${fmt(t.lieu)} until ${prettyDate(s.lieuUntil) || "the date given"}. No money is received, so it does not change the balance.` },
      ].filter(Boolean) };
  }

  /* Who pays for the price: the buyer in cash, the buyer's old car, and the lender. They always add up to the price. */
  function sources(s) {
    const t = totals(s), rows = [], bi = balanceInfo(t);
    rows.push({ label: "Buyer, in cash", note: t.paid || t.payout ? `${fmt(t.paid)} received${t.payout ? `, ${fmt(t.payout)} paid out` : ""}, ${bi.label.toLowerCase()} ${fmt(bi.amt)}` : "Nothing received yet", amt: t.due });
    if (t.tv) rows.push({ label: "Trade-in car", note: [s.ti.year, s.ti.unit].filter(Boolean).join(" ") || "The buyer's old car", amt: t.tv });
    if (t.loan) rows.push({ label: s.institution ? `Lender: ${s.institution}` : "Lender", note: "Pays the loan to us after approval", amt: t.loan });
    const total = rows.reduce((n, r) => n + r.amt, 0);
    return { rows, total, proves: t.price > 0 && total === t.price };
  }

  function payRows(s) {
    const r = [];
    if (toC(s.cash)) r.push({ label: "Cash", detail: "", amt: toC(s.cash), proofs: s.cashProofs || 0 });
    for (const m of s.methods || []) {
      if (!toC(m.amount)) continue;
      if (m.type === "check") r.push({ label: "Check", detail: [m.checkNo && "No. " + m.checkNo, m.bank, m.branch && "Br. " + m.branch].filter(Boolean).join(" · "), amt: toC(m.amount), proofs: m.proofs || 0 });
      else r.push({ label: m.name || "Other", detail: m.ref || "", amt: toC(m.amount), proofs: m.proofs || 0 });
    }
    return r;
  }
  function saleLine(s, t) {
    if (s.sale !== "financing") return "Cash sale";
    const bits = [s.institution, t.dpSet && `DP ${fmt(t.dp)}`, t.monthly && `${fmt(t.monthly)}/month`, yearsLabel(s)].filter(Boolean);
    return "Financing · " + bits.join(" · ");
  }
  function tradeLine(s, t) {
    const ti = s.ti;
    return { unit: [ti.year, ti.unit].filter(Boolean).join(" "), plate: ti.plate, mileage: ti.mileage ? ti.mileage + " km" : "", value: fmt(t.tv) };
  }
  function remarksHtml(text, cls) {
    return String(text || "").split("\n").filter((l) => l.trim()).map((line) => {
      const bullet = /^\s*[-•]\s+/.test(line), body = esc(line.replace(/^\s*[-•]\s+/, "")).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
      return bullet ? `<p class="${cls || "b"}">• ${body}</p>` : `<p>${body}</p>`;
    }).join("");
  }
  const noteList = (s) => (s.notes || []).filter((n) => n.on && n.text.trim());
  const v = (x) => (x ? esc(x) : "&nbsp;");
  const minus = (c) => "− " + fmt(c);

  const companyOf = (s) => Object.assign({ name: "Manila Auto Display", tagline: "Acknowledgement of Payment", address: "" }, s.company || {});
  function formHtml(s, cls, copy) {
    const co = companyOf(s), t = totals(s), rows = payRows(s), notes = noteList(s), ti = s.hasTi ? tradeLine(s, t) : null, bi = balanceInfo(t), n = s.units.length;
    const kinds = Object.keys(KINDS).map((k) => `<span class="bx"><i>${s.kind === k ? "✕" : ""}</i> ${KINDS[k]}</span>`).join("");
    const terms = [`<div><b>Sale:</b> ${esc(saleLine(s, t))}${t.loan ? ` · Loan ${fmt(t.loan)}, paid by ${esc(s.institution || "the lender")}` : ""}${t.fee ? ` · Processing fee ${fmt(t.fee)}, owed to the lender` : ""}</div>`];
    if (ti) terms.push(`<div><b>Trade-in:</b> ${esc(ti.unit || "—")}${ti.plate ? " · " + esc(ti.plate) : ""}${ti.mileage ? " · " + esc(ti.mileage) : ""} · valued ${ti.value}, taken off the price</div>`);
    if (s.hasLieu) terms.push(`<div><b>In lieu of documents:</b> documents held as collateral for ${fmt(toC(s.lieuAmount))} until ${esc(prettyDate(s.lieuUntil) || "—")}</div>`);
    const units = s.units.map((u, i) => `<div class="g veh">
<div class="f s4"><span class="k">${n > 1 ? `Unit ${i + 1} of ${n} · ` : ""}Make / type</span><div class="v">${v(u.makeType)}</div></div>
<div class="f s2"><span class="k">Color</span><div class="v">${v(u.color)}</div></div>
<div class="f s2"><span class="k">Plate number</span><div class="v mono">${v(u.plate)}</div></div>
<div class="f s2"><span class="k">Motor number</span><div class="v mono">${v(u.motor)}</div></div>
<div class="f s2"><span class="k">Chassis number</span><div class="v mono">${v(u.chassis)}</div></div></div>`).join("");
    const paidThrough = (t.earlier ? `<div class="ln"><span>Earlier payments</span><b>${fmt(t.earlier)}</b></div>` : "") +
      rows.map((r) => `<div class="ln"><span>${esc(r.label)}${r.detail ? ` <small>· ${esc(r.detail)}</small>` : ""}</span><b>${fmt(r.amt)}</b></div>`).join("");
    return `<article class="paper ${cls}">
${s.unapproved ? '<div class="wm">UNAPPROVED</div>' : ""}
<header class="top"><div class="logo"><b>${esc((co.name.match(/\b\w/g) || ["M"]).slice(0, 3).join("").toUpperCase())}</b><div><strong>${esc(co.name)}</strong><em>${esc(co.tagline)}</em></div></div>
<div class="no"><span class="k">No.</span><div class="n">${esc(s.receiptNo) || "____"}</div><div>${esc(prettyDate(s.date))}</div></div></header>
${co.address ? `<div class="addr">${esc(co.address)}</div>` : ""}
<div class="g">
<div class="f s4"><span class="k">Received from</span><div class="v">${v(s.receivedFrom)}</div></div>
<div class="f s2"><span class="k">Contact no.</span><div class="v mono">${v(s.contact)}</div></div>
<div class="f s6"><span class="k">Postal address</span><div class="v">${v(s.address)}</div></div>
<div class="f s4"><span class="k">The sum of pesos</span><div class="v">${v(words(t.today))}</div></div>
<div class="f s2"><span class="k">In numbers</span><div class="v mono">${t.today ? fmt(t.today) : "&nbsp;"}</div></div></div>
<div class="kinds">${kinds}<span class="r">in purchase of <b>(${n})</b> unit${n === 1 ? "" : "s"}, described as follows:</span></div>
${units}
<div class="two"><div><span class="k">Price</span>
<div class="ln"><span>Agreed price${unitsText(s)}</span><b>${t.price ? fmt(t.price) : "&nbsp;"}</b></div>
${t.tv ? `<div class="ln"><span>Less: trade-in value</span><b>${minus(t.tv)}</b></div>` : ""}
${t.loan ? `<div class="ln"><span>Less: loan <small>· ${esc(s.institution || "lender")}</small></span><b>${minus(t.loan)}</b></div>` : ""}
${t.tv || t.loan ? `<div class="ln due"><span>${t.due < 0 ? "We pay the buyer" : "Amount due from buyer"}</span><b>${fmt(Math.abs(t.due))}</b></div>` : ""}
<div class="ln"><span>Less: payment <small>${t.earlier && t.today ? "· earlier + today" : ""}</small></span><b>${t.paid ? minus(t.paid) : "&nbsp;"}</b></div>
${t.payout ? `<div class="ln"><span>Add: paid out to buyer</span><b>${fmt(t.payout)}</b></div>` : ""}
<div class="ln bal"><span>${esc(bi.label)}</span><b>${t.price ? fmt(bi.amt) : "&nbsp;"}</b></div></div>
<div><span class="k">Paid through</span>${paidThrough || '<div class="ln">&nbsp;</div>'}
${t.today && (t.earlier || rows.length > 1) ? `<div class="ln"><span><b>Paid today</b></span><b>${fmt(t.today)}</b></div>` : ""}</div></div>
<div class="g"><div class="f s3"><span class="k">Balance of (in words)</span><div class="v">${t.balance > 0 ? esc(words(t.balance)) : t.price ? (t.balance === 0 ? (t.due < 0 ? "Nil, settled" : "Nil, paid in full") : "—") : "&nbsp;"}</div></div>
<div class="f s1"><span class="k">In numbers</span><div class="v mono">${t.price ? fmt(Math.max(0, t.balance)) : "&nbsp;"}</div></div>
<div class="f s2"><span class="k">Shall be given on or before</span><div class="v">${t.balance > 0 ? v(dueText(s)) : "&nbsp;"}</div></div></div>
<div class="terms">${terms.join("")}</div>
${s.hasRem && s.remarks.trim() ? `<div class="rem"><span class="k">Remarks</span>${remarksHtml(s.remarks)}</div>` : ""}
${notes.length ? `<ul class="notes">${notes.map((x) => `<li>• ${esc(x.text)}</li>`).join("")}</ul>` : ""}
<div class="sign"><div>Received by (signature over printed name)</div><div>Buyer's conformity</div></div>
<footer class="cp"><span>${esc(copy)}</span><span>${esc(co.name)}</span></footer></article>`;
  }

  function slipHtml(s, copy) {
    const co = companyOf(s), t = totals(s), rows = payRows(s), notes = noteList(s), ti = s.hasTi ? tradeLine(s, t) : null, bi = balanceInfo(t), n = s.units.length;
    const R = (k, val, cls) => `<div class="r ${cls || ""}"><span>${k}</span><span>${val || "&nbsp;"}</span></div>`;
    const U = (x) => esc(String(x || "").toUpperCase());
    const units = s.units.map((u, i) => `<div>${n > 1 ? `UNIT ${i + 1} OF ${n}` : "1 UNIT"}</div><div class="bold">${v(u.makeType)}</div>${R("PLATE", esc(u.plate))}${R("COLOR", esc(u.color))}${R("MOTOR", esc(u.motor))}${R("CHASSIS", esc(u.chassis))}${i < n - 1 ? "<hr>" : ""}`).join("");
    return `<article class="paper slip">
${s.unapproved ? '<div class="c bold" style="border:1px solid #000;padding:.2rem;margin-bottom:.4rem">*** UNAPPROVED COPY ***</div>' : ""}
<div class="c"><div class="t">${U(co.name)}</div><div style="letter-spacing:.18em">${U(co.tagline)}</div></div><hr>
${R("NO.", esc(s.receiptNo), "bold")}${R("DATE", U(prettyDate(s.date)))}${R("TYPE", U(KINDS[s.kind]))}<hr>
<div>RECEIVED FROM</div><div class="bold">${v(s.receivedFrom)}</div><div style="margin-top:.25rem">${esc(s.address)}</div><div>${esc(s.contact)}</div><hr>
${units}<hr>
${R("AGREED PRICE", t.price ? fmt(t.price) : "")}
${t.tv ? R("LESS TRADE-IN", minus(t.tv)) : ""}${t.loan ? R("LESS LOAN", minus(t.loan)) : ""}
${t.tv || t.loan ? R(t.due < 0 ? "WE PAY BUYER" : "AMOUNT DUE", fmt(Math.abs(t.due)), "bold") : ""}
${t.earlier ? R("EARLIER PAYMENTS", minus(t.earlier)) : ""}${R("PAID TODAY", t.today ? minus(t.today) : "")}${t.payout ? R("PAID OUT TO BUYER", fmt(t.payout)) : ""}
${R(U(bi.label), t.price ? fmt(bi.amt) : "", "bold")}<hr>
${rows.map((r) => R(U(r.label), fmt(r.amt)) + (r.detail ? `<div class="dim">${esc(r.detail)}</div>` : "")).join("")}
<div class="r bold tot"><span>PAID TODAY</span><span>${t.today ? fmt(t.today) : "&nbsp;"}</span></div>
<div class="small" style="margin-top:.25rem">${U(words(t.today))}</div><hr>
<div>BALANCE OF</div><div class="small">${t.balance > 0 ? U(words(t.balance)) : t.price ? (t.balance === 0 ? "NIL, PAID IN FULL" : "—") : "&nbsp;"}</div>${t.balance > 0 ? R("DUE ON/BEFORE", U(dueText(s))) : ""}<hr>
<div class="bold">${U(saleLine(s, t))}</div>
${t.loan ? R("LOAN BY " + U(s.institution || "LENDER"), fmt(t.loan)) : ""}${t.fee ? R("PROC. FEE (TO LENDER)", fmt(t.fee)) : ""}
${ti ? `<div style="margin-top:.25rem">TRADE-IN: ${esc(ti.unit)}</div><div class="dim">${esc([ti.plate, ti.mileage].filter(Boolean).join(" · "))}</div>${R("VALUE", ti.value)}` : ""}
${s.hasLieu ? `<div style="margin-top:.25rem">IN LIEU OF DOCS ${fmt(toC(s.lieuAmount))}</div><div class="dim">DOCUMENTS HELD AS COLLATERAL UNTIL ${U(prettyDate(s.lieuUntil))}</div>` : ""}
${s.hasRem && s.remarks.trim() ? `<hr><div>REMARKS</div>${remarksHtml(s.remarks, "")}` : ""}
${notes.length ? `<hr>${notes.map((x) => `<div class="small">* ${esc(x.text)}</div>`).join("")}` : ""}
<div class="sg">RECEIVED BY</div><div class="sg">BUYER'S CONFORMITY</div><hr><div class="bar"></div>
<div class="c" style="margin-top:.25rem;letter-spacing:.15em">*** ${U(copy)} ***</div><div class="c small">THANK YOU</div></article>`;
  }

  const SAMPLE = {
    receiptNo: "2541", date: "2026-11-04", receivedFrom: "Maria Teresa Santos", contact: "0917 123 4567", address: "27 Maginhawa St., Sikatuna Village, Quezon City",
    kind: "partial",
    units: [{ makeType: "2023 Toyota Vios 1.3 XLE A/T", plate: "NBC 4821", motor: "2NZ5160482", chassis: "MR053REF7K4012345", color: "Silver Metallic" }],
    price: "720000", earlier: "10000", cash: "20000",
    methods: [{ type: "check", name: "Check", amount: "15000", checkNo: "0048213", bank: "BDO", branch: "Katipunan", ref: "", proofs: 1 }, { type: "wallet", name: "GCash", amount: "5000", ref: "9023 118 4471", proofs: 1 }],
    dueMode: "date", dueDate: "2026-12-15", dueText: "", sale: "financing", institution: "BDO", dp: "150000", fee: "39900", feePct: "7", monthly: "14250", years: "5",
    hasTi: true, ti: { year: "2008", unit: "Toyota Vios 1.3 J M/T", plate: "ABX 1190", mileage: "142,000", value: "60000" },
    hasLieu: true, lieuAmount: "15000", lieuUntil: "2026-11-30", payout: "", cashProofs: 1, payoutProofs: 0, hasRem: true,
    remarks: "**Free:** one year registration.\n- Tint and floor mats included\n- Unit to be released after full payment.",
    notes: [{ text: "Unit is sold AS IS, WHERE IS.", on: true }, { text: "Earnest money and partial payments are NON-REFUNDABLE.", on: true }, { text: "The balance must be settled on or before the date stated above.", on: true }],
  };

  window.MAD = { words, toC, fmt, prettyDate, esc, totals, balanceInfo, ledger, sources, payRows, dueText, KINDS, COPY_NAMES, SAMPLE, copyName: (i, names) => (names && names[i]) || COPY_NAMES[i % COPY_NAMES.length],
    render: (s, layout, copy) => (layout === "slip" ? slipHtml(s, copy) : formHtml(s, layout === "half" ? "half" : "form", copy)) };
})();

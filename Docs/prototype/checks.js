/* A self-test for the money. It uses its own, separate calculator (whole centavos) and compares it with what the prototype shows. */
(function () {
  const num = (x) => parseFloat(String(x || 0).replace(/[₱,\s]/g, "")) || 0; // the form keeps amounts as typed, e.g. "720,000"
  const C = (x) => Math.round(num(x) * 100);
  const sumC = (list) => list.reduce((n, a) => n + C(a), 0);
  // The independent calculator: written from the rules, not from the prototype's code.
  function indep(c) {
    const P = C(c.price), T = C(c.trade || 0);
    let share = P, loan = 0;
    if (c.fin) { const dp = C(c.dp); share = Math.min(dp, P); loan = P - share; }
    const due = share - T, today = C(c.cash || 0) + sumC(c.methods || []), paid = C(c.earlier || 0) + today;
    const payout = due < 0 ? C(c.payout || 0) : 0;
    return { P, T, loan, due, today, paid, payout, bal: due - paid + payout };
  }
  const mk = (c) => ({ units: [{ makeType: "Test car", plate: "TST 0001", motor: "M", chassis: "C", color: "White" }], price: String(c.price), sale: c.fin ? "financing" : "cash", dp: c.fin ? String(c.dp) : "", fee: c.fin ? String(c.fee || 0) : "", institution: "BDO", monthly: "", years: "", hasTi: !!c.trade, ti: { year: "", unit: "Old car", plate: "", mileage: "", value: c.trade ? String(c.trade) : "" }, earlier: String(c.earlier || 0), cash: String(c.cash || 0), methods: (c.methods || []).map((a) => ({ type: "wallet", name: "GCash", amount: String(a), ref: "" })), payout: String(c.payout || 0), hasLieu: !!c.lieu, lieuAmount: c.lieu ? String(c.lieu) : "", lieuUntil: "2026-12-31", dueMode: "date", dueDate: "2026-12-31", dueText: "", kind: "partial", notes: [], remarks: "", hasRem: false, hasLieu2: false, receiptNo: "1", date: "2026-11-04", receivedFrom: "X", contact: "", address: "" });

  const cases = [
    ["Cash, nothing paid", { price: 500000 }],
    ["Cash, part paid", { price: 500000, cash: 100000 }],
    ["Cash, earlier + today", { price: 720000, earlier: 20000, cash: 40000 }],
    ["Cash, cash + e-wallets", { price: 720000, cash: 20000, methods: [15000, 5000] }],
    ["Cash, paid in full", { price: 300000, cash: 300000 }],
    ["Cash, centavos", { price: 1000.5, cash: 0.25 }],
    ["Cash + trade-in below price", { price: 720000, trade: 310000, cash: 100000 }],
    ["Cash + trade-in equals price", { price: 400000, trade: 400000 }],
    ["Cash + trade-in worth more, no payout yet", { price: 500000, trade: 580000 }],
    ["Cash + trade-in worth more, partly paid out", { price: 500000, trade: 580000, payout: 30000 }],
    ["Cash + trade-in worth more, fully paid out", { price: 500000, trade: 580000, payout: 80000 }],
    ["Payout ignored when the buyer owes", { price: 500000, payout: 10000 }],
    ["Financing, standard", { price: 720000, fin: 1, dp: 150000, fee: 39900, cash: 50000 }],
    ["Financing, fee changes nothing (fee 0)", { price: 720000, fin: 1, dp: 150000, fee: 0, cash: 50000 }],
    ["Financing, fee huge changes nothing", { price: 720000, fin: 1, dp: 150000, fee: 999999, cash: 50000 }],
    ["Financing + trade-in", { price: 720000, fin: 1, dp: 150000, fee: 39900, trade: 60000, earlier: 10000, cash: 40000 }],
    ["Financing, trade-in equals down payment", { price: 720000, fin: 1, dp: 130000, fee: 9100, trade: 130000 }],
    ["Financing, down payment fully paid", { price: 720000, fin: 1, dp: 150000, fee: 39900, cash: 150000 }],
    ["Financing, loan 130,000 (receipt 2540 shape)", { price: 720000, fin: 1, dp: 590000, fee: 9100, earlier: 20000, cash: 570000 }],
    ["Financing, odd centavos", { price: 333333.33, fin: 1, dp: 100001.01, fee: 16333.24, cash: 1000.99 }],
    ["Cash with in-lieu collateral changes nothing", { price: 720000, cash: 100000, lieu: 25000 }],
  ];
  // plenty of random ones, with a fixed seed so the result is the same every time
  let seed = 20261104; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const pesos = (lo, hi) => Math.round((lo + rnd() * (hi - lo)) * 100) / 100;
  for (let i = 0; i < 300; i++) {
    const fin = rnd() < 0.5, price = pesos(150000, 2500000), c = { price, fin: fin ? 1 : 0 };
    if (fin) { c.dp = pesos(price * 0.1, price * 0.9); c.fee = pesos(0, 120000); }
    if (rnd() < 0.4) c.trade = pesos(10000, fin ? c.dp : price * 1.1);
    if (rnd() < 0.5) c.earlier = pesos(0, 80000);
    c.cash = pesos(0, 200000); if (rnd() < 0.5) c.methods = [pesos(0, 60000), pesos(0, 40000)];
    if (rnd() < 0.3) c.payout = pesos(0, 100000); if (rnd() < 0.2) c.lieu = pesos(5000, 50000);
    cases.push([`Random #${i + 1}`, c]);
  }

  function run() {
    const rows = [], add = (group, name, pass, detail) => rows.push({ group, name, pass: !!pass, detail: detail || "" });
    // ---- 1. the form's math vs the independent calculator ----
    for (const [name, c] of cases) {
      const s = mk(c), t = MAD.totals(s), e = indep(c), L = MAD.ledger(s), so = MAD.sources(s), html = MAD.render(s, "form", "c");
      const same = t.price === e.P && t.tv === e.T && t.loan === e.loan && t.due === e.due && t.today === e.today && t.paid === e.paid && t.payout === e.payout && t.balance === e.bal;
      const identity = e.P === e.T + e.loan + e.paid - e.payout + e.bal;
      const printed = (e.today === 0 || html.includes(MAD.fmt(e.today))) && (e.P === 0 || html.includes(MAD.fmt(Math.max(0, e.bal))) || e.bal <= 0);
      const group = name.startsWith("Random") ? "Random scenarios (300)" : "Named scenarios";
      add(group, name, same && identity && L.proves && so.proves && printed,
        same ? (identity && L.proves && so.proves && printed ? "" : `proof line ${L.proves}, sources ${so.proves}, printed numbers ${printed}`) : `shown due ${MAD.fmt(t.due)} bal ${MAD.fmt(t.balance)} / expected due ${MAD.fmt(e.due)} bal ${MAD.fmt(e.bal)}`);
    }
    // ---- 2. the demo data: transactions, deals, cash report ----
    const db = MADS.db, S = MADS;
    add("Saved receipts", "Every receipt amount equals the sum of what it was paid through", db.receipts.every((r) => r.amount === r.methods.reduce((n, m) => n + m.amt, 0)), db.receipts.filter((r) => r.amount !== r.methods.reduce((n, m) => n + m.amt, 0)).map((r) => r.no).join(", "));
    for (const d of db.deals) {
      const c = S.calc(d), e = indep({ price: num(d.s.price), fin: d.s.sale === "financing", dp: num(d.s.dp), trade: d.s.hasTi ? num(d.s.ti.value) : 0 });
      const approved = db.receipts.filter((r) => r.dealId === d.id && r.status === "approved").reduce((n, r) => n + r.amount, 0);
      const balance = e.due - approved;
      add("Deals (balance and status)", `${d.id} ${d.s.receivedFrom}: balance`, c.balance === balance && c.t.due === e.due, `${MAD.fmt(c.balance)} vs ${MAD.fmt(balance)}`);
      const st = (() => { if (d.cancelled) return "cancelled"; if (balance > 0) { const due = d.s.dueMode === "date" && d.s.dueDate ? d.s.dueDate : ""; if (due) { const n = S.diffDays(due, S.TODAY); if (n < 0) return "overdue"; if (n <= 7) return "soon"; } return "open"; } return d.s.sale === "financing" && d.loanStatus !== "released" ? "lender" : "settled"; })();
      add("Deals (balance and status)", `${d.id}: status is ${st}`, S.status(d, c) === st);
      const state = Object.assign({}, JSON.parse(JSON.stringify(d.s)), { earlier: String(approved / 100), cash: "", methods: [], payout: "" }), L = MAD.ledger(state);
      add("Deals (balance and status)", `${d.id}: the deal page's proof line adds up`, L.proves && L.t.balance === balance);
      const sold = S.invStatus(d.s.units[0].plate) === "Sold";
      add("Inventory status", `${d.id}: Sold only when settled`, d.cancelled ? !sold : sold === (st === "settled"));
    }
    const days = [...new Set(db.receipts.map((r) => r.date))];
    for (const day of days) {
      const recs = db.receipts.filter((r) => r.date === day && ["approved", "pending"].includes(r.status));
      const cat = (n) => (n === "Cash" ? 0 : n === "Check" ? 1 : 2);
      const byCat = [0, 1, 2].map((k) => recs.reduce((n, r) => n + r.methods.filter((m) => cat(m.name) === k).reduce((a, m) => a + m.amt, 0), 0));
      add("Daily cash report", `${day}: cash + check + other equals the day's receipts`, byCat.reduce((a, b) => a + b, 0) === recs.reduce((n, r) => n + r.amount, 0), recs.length ? "" : "no receipts");
    }
    const overdue = db.deals.filter((d) => S.status(d) === "overdue").length, expectOverdue = db.deals.filter((d) => !d.cancelled && S.calc(d).balance > 0 && d.s.dueMode === "date" && d.s.dueDate && d.s.dueDate < S.TODAY).length;
    add("Transactions summary", "Overdue count matches the due dates", overdue === expectOverdue, `${overdue} vs ${expectOverdue}`);
    const owe = db.deals.filter((d) => !d.cancelled && S.calc(d).balance > 0).reduce((n, d) => n + S.calc(d).balance, 0);
    add("Transactions summary", "'Still to collect' equals the sum of open balances", owe === db.deals.filter((d) => !d.cancelled).reduce((n, d) => n + Math.max(0, S.calc(d).balance), 0), MAD.fmt(owe));
    return rows;
  }
  let cache;
  const get = () => (cache = cache || run());
  window.MADCHECKS = { run: get, summary() { const r = get(), bad = r.filter((x) => !x.pass).length; return bad ? `${bad} failed` : `${r.length} of ${r.length} pass`; } };
})();

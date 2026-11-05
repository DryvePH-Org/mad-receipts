/* Demo data and rules for the transaction history, reminders and approvals. Front end only: it lives in this browser (localStorage). */
(function () {
  const KEY = "mad-proto-v4", DAY = 86400000;
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const TODAY = iso(new Date());
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
  const diffDays = (a, b) => Math.round((new Date(a + "T00:00:00") - new Date(b + "T00:00:00")) / DAY);
  const ROLES = { sales: { label: "Sales", user: "David", blurb: "Fills in receipts" }, admin: { label: "Admin", user: "Aaron", blurb: "Manages deals, loans, voids" }, approver: { label: "Approver", user: "Karl", blurb: "Approves every receipt" } };
  const STATUS = {
    overdue: { label: "Overdue", rank: 0 }, soon: { label: "Due soon", rank: 1 }, open: { label: "Open", rank: 2 },
    lender: { label: "Waiting for lender", rank: 3 }, settled: { label: "Settled", rank: 4 }, cancelled: { label: "Cancelled", rank: 5 },
  };
  const DEFAULT_NOTES = [{ text: "Unit is sold AS IS, WHERE IS.", on: true }, { text: "Earnest money and partial payments are NON-REFUNDABLE.", on: true }, { text: "The balance must be settled on or before the date stated above.", on: true }];
  const unitOf = (plate) => { const u = (window.INVENTORY || []).find((x) => x.plate === plate) || {}; return { makeType: u.makeType || "", plate, motor: u.motor || "", chassis: u.chassis || "", color: u.color || "" }; };
  const base = (o) => Object.assign({ receiptNo: "", date: TODAY, receivedFrom: "", contact: "", address: "", kind: "partial", units: [], price: "", earlier: "", cash: "", cashProofs: 0, payout: "", payoutProofs: 0, methods: [], dueMode: "date", dueDate: "", dueText: "", sale: "cash", institution: "", dp: "", fee: "", feePct: "", monthly: "", years: "", hasTi: false, ti: { year: "", unit: "", plate: "", mileage: "", value: "" }, hasLieu: false, lieuAmount: "", lieuUntil: "", hasRem: false, remarks: "", notes: DEFAULT_NOTES }, o);


  // ---------- everything the Admin can change (Settings page); the form reads all its lists from here ----------
  const W = "#f5f5f4", PW = "#ece9e2", K = "#18181b", SV = "#c0c4c8", G = "#78716c", R = "#dc2626", B = "#2563eb", BR = "#78350f", GR = "#15803d";
  function defaultConfig() {
    return {
      colors: {
        common: [["White", W], ["Pearl White", PW], ["Black", K], ["Silver", SV], ["Gray", G], ["Red", R], ["Blue", B], ["Brown", BR], ["Beige", "#d6c7a1"]],
        brands: {
          Toyota: [["Super White II", W], ["Platinum White Pearl Mica", PW], ["Attitude Black Mica", K], ["Silver Metallic", SV], ["Gray Metallic", G], ["Super Red", R], ["Red Mica Metallic", R], ["Grayish Blue Mica Metallic", B], ["Bronze Mica Metallic", BR], ["Alumina Jade Metallic", GR]],
          Mitsubishi: [["Quartz White Pearl", PW], ["White Diamond", PW], ["Jet Black Mica", K], ["Sterling Silver Metallic", SV], ["Cool Silver", SV], ["Titanium Gray", G], ["Red Metallic", R]],
          Honda: [["Platinum White Pearl", PW], ["Crystal Black Pearl", K], ["Modern Steel Metallic", G], ["Lunar Silver Metallic", SV], ["Ignite Red Metallic", R], ["Cosmic Blue Metallic", B]],
          Suzuki: [["Arctic White Pearl", PW], ["Pearl Snow White", PW], ["Prime Cool Black", K], ["Metallic Silky Silver", SV], ["Metallic Magma Gray", G], ["Pearl Radiant Red", R], ["Oxford Blue Pearl Metallic", B], ["Sherwood Brown Pearl Metallic", BR]],
          Nissan: [["Aspen Pearl White", PW], ["Alpine White", W], ["Galaxy Black", K], ["Brilliant Silver", SV], ["Lunar Metallic Gray", G], ["Fiery Red", R], ["Sapphire Blue Metallic", B], ["Earth Brown", BR]],
          Ford: [["Arctic White", W], ["Absolute Black", K], ["Meteor Grey", G], ["Blue Lightning", B], ["Sedona Orange", "#f97316"]],
          Isuzu: [["Splash White", W], ["Silky Pearl White", PW], ["Cosmic Black", K], ["Titanium Silver", SV], ["Eiger Gray", G], ["Garnet Red", R], ["Norwegian Blue", B], ["Outback Brown", BR]],
          Hyundai: [["Polar White", W], ["Phantom Black", K], ["Sleek Silver", SV], ["Star Dust", G], ["Fiery Red", R]],
        },
      },
      wallets: ["GCash", "Maya", "GoTyme", "ShopeePay", "Bank transfer", "Remittance"],
      banks: ["BDO", "BPI", "Metrobank", "Security Bank", "UnionBank", "RCBC", "PNB", "China Bank", "Maybank"],
      institutions: ["BDO", "BPI", "Metrobank", "Security Bank", "UnionBank", "RCBC", "PNB", "China Bank", "Maybank", "GDFI", "Toyota Financial Services", "In-house financing"],
      notes: [{ text: "Unit is sold AS IS, WHERE IS.", on: true }, { text: "Earnest money and partial payments are NON-REFUNDABLE.", on: true }, { text: "The balance must be settled on or before the date stated above.", on: true }, { text: "Official receipt and documents are released only after full payment.", on: false }],
      phrases: ["Unit to be released after full payment.", "OR/CR to follow.", "Subject to bank approval.", "Buyer inspected the unit and accepts its condition.", "Includes one spare key."],
      duePhrases: ["Upon release of OR/CR", "Upon loan approval", "Upon delivery of the unit"],
      years: ["1", "2", "3", "4", "5"],
      feeStd: "7", minDownPct: "20",
      copyNames: ["Customer's copy", "Office copy", "Accounting copy", "File copy", "Extra copy"],
      company: { name: "Manila Auto Display", tagline: "Acknowledgement of Payment", address: "Doing business under the name and style of MAD Parking and Management Solutions Inc., #29 A San Rafael cor. San Clemente St., Brgy. Kapitolyo, Pasig City" },
      required: { contact: true, address: true, motor: true, chassis: true, color: true, proofs: true },
      sections: { trade: true, lieu: true, remarks: true },
      people: { sales: "David", admin: "Aaron", approver: "Karl" },
    };
  }

  function seed() {
    const deals = [], receipts = [];
    const deal = (id, by, ago, o, extra) => deals.push(Object.assign({ id, by, created: addDays(-ago), loanStatus: "none", loanSince: null, loanReleasedOn: null, cancelled: null, s: base(o) }, extra || {}));
    let rn = 2520;
    const rec = (dealId, ago, amount, methods, status, by, extra) => receipts.push(Object.assign({ id: "R" + (receipts.length + 1), dealId, no: String(rn++), date: addDays(-ago), kind: "partial", amount: amount * 100, methods: methods.map(([name, amt, proofs]) => ({ name, amt: amt * 100, proofs: proofs == null ? 1 : proofs })), status, by, approvedBy: status === "approved" ? "Karl" : null, approvedOn: status === "approved" ? addDays(-ago) : null, submitted: addDays(-ago) }, extra || {}));
    const D = (n) => addDays(n);
    deal("D1001", "David", 20, { receivedFrom: "Maria Teresa Santos", contact: "0917 123 4567", address: "27 Maginhawa St., Quezon City", units: [unitOf("NDA 1190")], price: "720000", sale: "financing", institution: "BDO", dp: "150000", fee: "39900", feePct: "7", monthly: "14250", years: "5", hasTi: true, ti: { year: "2008", unit: "Toyota Vios 1.3 J M/T", plate: "ABX 1190", mileage: "142,000", value: "60000" }, dueMode: "date", dueDate: D(3) }, { loanStatus: "waiting", loanSince: D(-20) });
    rec("D1001", 20, 10000, [["Cash", 10000]], "approved", "David", { kind: "earnest" });
    rec("D1001", 6, 40000, [["Cash", 20000], ["Check", 15000], ["GCash", 5000]], "approved", "David");
    deal("D1002", "Sweet", 30, { receivedFrom: "Juan dela Cruz", contact: "0918 555 0101", address: "Pasig City", units: [unitOf("NFB 6204")], price: "985000", sale: "cash", dueMode: "date", dueDate: D(-5) });
    rec("D1002", 30, 50000, [["Cash", 50000]], "approved", "Sweet", { kind: "earnest" });
    deal("D1003", "David", 40, { receivedFrom: "Bernadine F. Belir", contact: "0977 497 4969", address: "7700 FC Santos, San Isidro, Pasig", units: [unitOf("NFB 6205")], price: "720000", sale: "financing", institution: "GDFI", dp: "590000", fee: "9100", feePct: "7", monthly: "9800", years: "5", dueMode: "text", dueText: "Upon approval of financing" }, { loanStatus: "waiting", loanSince: D(-18) });
    rec("D1003", 35, 20000, [["Cash", 20000]], "approved", "David", { kind: "earnest" });
    rec("D1003", 22, 570000, [["Bank transfer", 570000]], "approved", "David", { kind: "full" });
    deal("D1004", "Sweet", 25, { receivedFrom: "Ana Reyes", contact: "0920 111 2222", address: "Marikina City", units: [unitOf("NHD 2417")], price: "640000", sale: "cash", dueMode: "date", dueDate: D(-10) });
    rec("D1004", 25, 100000, [["Cash", 100000]], "approved", "Sweet", { kind: "earnest" });
    rec("D1004", 12, 540000, [["Bank transfer", 540000]], "approved", "Sweet", { kind: "full" });
    deal("D1005", "David", 50, { receivedFrom: "Pedro Lim", contact: "0933 777 8888", address: "Mandaluyong City", units: [unitOf("NCX 7710")], price: "1580000", sale: "financing", institution: "BPI", dp: "400000", fee: "82600", feePct: "7", monthly: "26500", years: "5", dueMode: "text", dueText: "Upon loan approval" }, { loanStatus: "released", loanSince: D(-40), loanReleasedOn: D(-9) });
    rec("D1005", 45, 400000, [["Check", 400000]], "approved", "David", { kind: "full" });
    deal("D1006", "Sweet", 8, { receivedFrom: "Carla Go", contact: "0922 333 4444", address: "San Juan City", units: [unitOf("NKF 4771")], price: "1040000", sale: "cash", dueMode: "text", dueText: "Upon release of OR/CR" });
    rec("D1006", 8, 30000, [["GCash", 30000]], "approved", "Sweet", { kind: "earnest" });
    rec("D1006", 0, 20000, [["Cash", 12000], ["GCash", 8000]], "approved", "Sweet", { kind: "partial" });
    deal("D1007", "David", 35, { receivedFrom: "Mark Tan", contact: "0915 000 9999", address: "Taguig City", units: [unitOf("NLG 8120")], price: "760000", sale: "cash", dueMode: "date", dueDate: D(-20) }, { cancelled: { reason: "Buyer changed his mind. Earnest money is non-refundable.", on: D(-14), refund: 0, by: "Aaron" } });
    rec("D1007", 35, 20000, [["Cash", 20000]], "approved", "David", { kind: "earnest" });
    deal("D1008", "Sweet", 2, { receivedFrom: "Liza Cruz", contact: "0916 222 3333", address: "Quezon City", units: [unitOf("NEA 3052")], price: "1010000", sale: "cash", dueMode: "date", dueDate: D(10) });
    rec("D1002", 0, 30000, [["Check", 30000]], "pending", "Sweet", { kind: "partial" });
    rec("D1008", 2, 100000, [["Cash", 60000], ["Check", 40000]], "pending", "Sweet", { kind: "earnest" });
    deal("D1009", "David", 12, { receivedFrom: "Rico Uy", contact: "0917 909 0909", address: "Makati City", units: [unitOf("NGC 9033")], price: "1490000", sale: "financing", institution: "Security Bank", dp: "300000", fee: "83300", feePct: "7", monthly: "24000", years: "5", hasLieu: true, lieuAmount: "50000", lieuUntil: D(2), dueMode: "date", dueDate: D(12) }, { loanStatus: "waiting", loanSince: D(-4) });
    rec("D1009", 12, 100000, [["Check", 100000]], "approved", "David", { kind: "earnest" });
    rec("D1009", 1, 50000, [["Cash", 50000]], "pending", "David", { kind: "partial", submitted: D(-2) });
    receipts.push({ id: "R" + (receipts.length + 1), dealId: "D1002", no: "2539", date: addDays(-1), kind: "partial", amount: 200000 * 100, methods: [{ name: "Cash", amt: 200000 * 100, proofs: 0 }], status: "rejected", by: "Sweet", rejectReason: "No photo of the cash attached.", submitted: addDays(-1) });
    const log = [
      { id: "L1", ts: addDays(-14), user: "Aaron", role: "admin", type: "cancel", text: "Cancelled the deal of Mark Tan (NLG 8120). Refunded ₱0, earnest money is non-refundable.", dealId: "D1007" },
      { id: "L2", ts: addDays(-9), user: "Aaron", role: "admin", type: "loan", text: "Marked the BPI loan as released for Pedro Lim (NCX 7710).", dealId: "D1005" },
      { id: "L3", ts: addDays(-1), user: "Karl", role: "approver", type: "reject", text: "Rejected receipt 2539 of Juan dela Cruz: no photo of the cash attached.", dealId: "D1002" },
    ];
    return { v: 4, role: "sales", config: defaultConfig(), deals, receipts, log, sent: {}, settings: { before7: true, before3: true, dueDay: true, overdueDaily: true, lenderDays: 14, approvalHours: 24, telegram: true, inApp: true } };
  }

  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
  if (!db || db.v !== 4) db = seed();
  db.config = Object.assign(defaultConfig(), db.config || {});
  const applyConfig = () => {
    ROLES.sales.user = db.config.people.sales || ROLES.sales.user; ROLES.admin.user = db.config.people.admin || ROLES.admin.user; ROLES.approver.user = db.config.people.approver || ROLES.approver.user;
    if (window.MAD && db.config.copyNames.length) MAD.COPY_NAMES = db.config.copyNames;
  };
  applyConfig();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
  const reset = () => { db = seed(); db.config = defaultConfig(); applyConfig(); save(); };
  const resetConfig = () => { db.config = defaultConfig(); applyConfig(); save(); };

  // ---------- derived numbers ----------
  const sum = (list) => list.reduce((n, r) => n + r.amount, 0);
  const receiptsOf = (id) => db.receipts.filter((r) => r.dealId === id);
  function calc(d) {
    const t = MAD.totals(d.s), recs = receiptsOf(d.id);
    const approved = sum(recs.filter((r) => r.status === "approved")), pending = sum(recs.filter((r) => r.status === "pending"));
    return { t, recs, approved, pending, committed: approved + pending, balance: t.due - approved };
  }
  const dueISO = (d) => (d.s.dueMode === "date" && d.s.dueDate ? d.s.dueDate : "");
  function status(d, c) {
    c = c || calc(d);
    if (d.cancelled) return "cancelled";
    if (c.balance > 0) { const due = dueISO(d); if (due) { const n = diffDays(due, TODAY); if (n < 0) return "overdue"; if (n <= 7) return "soon"; } return "open"; }
    if (d.s.sale === "financing" && d.loanStatus !== "released") return "lender";
    return "settled";
  }
  function invStatus(plate) {
    const ds = db.deals.filter((d) => !d.cancelled && d.s.units.some((u) => u.plate === plate));
    if (ds.length) return ds.every((d) => status(d) === "settled") ? "Sold" : "Reserved";
    const inv = (window.INVENTORY || []).find((x) => x.plate === plate);
    return inv ? inv.status : "Available";
  }
  const openDealForPlate = (plate) => db.deals.find((d) => plate && !d.cancelled && d.s.units.some((u) => u.plate === plate) && !["settled"].includes(status(d)));

  function notifications() {
    const out = [], st = db.settings, add = (n) => out.push(n);
    for (const d of db.deals) {
      if (d.cancelled) continue;
      const c = calc(d), s = status(d, c), who = d.by, name = `${d.s.receivedFrom} · ${d.s.units[0].makeType || d.s.units[0].plate}`;
      const due = dueISO(d), n = due ? diffDays(due, TODAY) : null;
      if (s === "overdue") add({ key: `od-${d.id}`, level: "red", icon: "warn", title: `Overdue: ${name}`, detail: `${MAD.fmt(c.balance)} was due ${MAD.prettyDate(due)}, ${-n} ${-n === 1 ? "day" : "days"} late.`, dealId: d.id, who, rank: 0 - -n / 1000 });
      else if (c.balance > 0 && n !== null && n >= 0 && ((n === 0 && st.dueDay) || (n > 0 && n <= 3 && st.before3) || (n > 3 && n <= 7 && st.before7))) add({ key: `due-${d.id}`, level: "amber", icon: "clock", title: `${n === 0 ? "Due today" : `Due in ${n} ${n === 1 ? "day" : "days"}`}: ${name}`, detail: `${MAD.fmt(c.balance)} is still to be paid by ${MAD.prettyDate(due)}.`, dealId: d.id, who, rank: 10 + n });
      if (s === "lender" && d.loanSince) { const w = diffDays(TODAY, d.loanSince); if (w >= st.lenderDays) add({ key: `ln-${d.id}`, level: "blue", icon: "bank", title: `Waiting for ${d.s.institution}: ${name}`, detail: `The buyer's part is paid. ${MAD.fmt(c.t.loan)} loan has been pending for ${w} days.`, dealId: d.id, who, rank: 30 - w / 100 }); }
      if (d.s.hasLieu && MAD.toC(d.s.lieuAmount) && c.balance > 0 && d.s.lieuUntil) { const k = diffDays(d.s.lieuUntil, TODAY); if (k <= 7) add({ key: `li-${d.id}`, level: k < 0 ? "red" : "amber", icon: "file", title: `${k < 0 ? "Collateral date passed" : "Collateral date coming"}: ${name}`, detail: `We hold the buyer's documents for ${MAD.fmt(MAD.toC(d.s.lieuAmount))} until ${MAD.prettyDate(d.s.lieuUntil)} (${k < 0 ? -k + " days ago" : k === 0 ? "today" : "in " + k + " days"}).`, dealId: d.id, who, rank: 20 + k }); }
    }
    for (const r of db.receipts) {
      const d = db.deals.find((x) => x.id === r.dealId); if (!d) continue;
      const name = `${d.s.receivedFrom} · ${d.s.units[0].makeType || d.s.units[0].plate}`;
      if (r.status === "pending") { const hours = diffDays(TODAY, r.submitted) * 24; if (hours >= st.approvalHours) add({ key: `ap-${r.id}`, level: "purple", icon: "shield", title: `Waiting for approval: receipt ${r.no}`, detail: `${name}: ${MAD.fmt(r.amount)} has waited ${diffDays(TODAY, r.submitted)} ${diffDays(TODAY, r.submitted) === 1 ? "day" : "days"}.`, dealId: d.id, who: "Approver", rank: 25 }); }
      if (r.status === "rejected" && !r.resubmitted) add({ key: `rj-${r.id}`, level: "red", icon: "x", title: `Rejected: receipt ${r.no}`, detail: `${name}: ${r.rejectReason || "No reason given."} Fill in a new receipt.`, dealId: d.id, who: r.by, rank: 5 });
    }
    return out.sort((a, b) => a.rank - b.rank);
  }
  const forMe = (list) => (db.role === "admin" ? list : db.role === "approver" ? list.filter((n) => n.who === "Approver" || n.level === "red") : list.filter((n) => n.who === ROLES.sales.user || n.level === "red" && n.who === ROLES.sales.user));

  const log = (type, text, dealId) => { db.log.unshift({ id: "L" + Date.now() + Math.random().toString(36).slice(2, 5), ts: TODAY, user: ROLES[db.role].user, role: db.role, type, text, dealId }); };

  // ---------- from the form ----------
  function addFromForm(S, dealId) {
    const t = MAD.totals(S), user = ROLES[db.role].user;
    const methods = [{ name: "Cash", amt: MAD.toC(S.cash), proofs: S.cashProofs || 0 }].concat(S.methods.map((m) => ({ name: m.type === "check" ? "Check" : m.name || "Other", amt: MAD.toC(m.amount), proofs: m.proofs || 0 }))).filter((m) => m.amt > 0);
    let d = dealId && db.deals.find((x) => x.id === dealId);
    if (!d) {
      const id = "D" + (1000 + db.deals.length + 1), b = JSON.parse(JSON.stringify(S));
      Object.assign(b, { earlier: "", cash: "", cashProofs: 0, payout: "", payoutProofs: 0, methods: [], receiptNo: "", unapproved: false });
      d = { id, by: user, created: TODAY, loanStatus: "none", loanSince: null, loanReleasedOn: null, cancelled: null, s: b };
      if (b.sale === "financing") { d.loanStatus = "waiting"; d.loanSince = TODAY; }
      db.deals.push(d);
    }
    const r = { id: "R" + (db.receipts.length + 1 + Math.floor(Math.random() * 1000)), dealId: d.id, no: S.receiptNo, date: S.date || TODAY, kind: S.kind, amount: t.today, methods, status: "pending", by: user, submitted: TODAY, state: JSON.parse(JSON.stringify(S)) };
    db.receipts.push(r);
    log("receipt", `${user} filled in receipt ${r.no} for ${S.receivedFrom}: ${MAD.fmt(t.today)} received. Sent to the Approver.`, d.id);
    save();
    return { deal: d, receipt: r };
  }

  window.MADS = { get db() { return db; }, get config() { return db.config; }, save, reset, resetConfig, applyConfig, defaultConfig, TODAY, addDays, diffDays, ROLES, STATUS, calc, status, dueISO, invStatus, openDealForPlate, notifications, forMe, log, receiptsOf, addFromForm,
    setRole(r) { db.role = r; save(); }, user: () => ROLES[db.role].user };
})();

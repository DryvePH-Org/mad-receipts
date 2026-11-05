/* Front-end behaviour for the prototype. Nothing is sent anywhere; the data lives only on this page. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const { toC, fmt, words, totals, esc } = MAD;
  const ico = (n) => `<svg class="i"><use href="#i-${n}"/></svg>`;
  const num = (c) => (c / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const cfg = () => MADS.config;
  const BANKS = () => cfg().banks, COMMON = () => cfg().colors.common, BRANDS = () => cfg().colors.brands;
  const FEE_STD = () => String(cfg().feeStd || "7"), minDown = () => parseFloat(cfg().minDownPct) || 20;
  const brandOf = (makeType) => Object.keys(BRANDS()).find((b) => (makeType || "").toLowerCase().includes(b.toLowerCase()));
  const emptyUnit = () => ({ mode: "inv", makeType: "", plate: "", plateTyped: false, motor: "", chassis: "", color: "" });

  const proofBox = (label, hint, src) => `<div class="proof-box" data-proof ${src ? `data-src="${src}"` : ""} style="grid-column:2/4"><div class="pb-top"><label class="btn sm"><input type="file" accept="image/*,application/pdf" multiple hidden data-file>${ico("plus")}${label}</label><span class="hint">${hint}</span><span class="pb-status"></span></div><div class="thumbs"></div></div>`;
  const proofRow = (label, hint) => `<div class="method sub-row proof-row"><span></span>${proofBox(label, hint)}<span></span></div>`;
  function renderThumbs(box) {
    box.querySelector(".thumbs").innerHTML = filesOf(box).map((f, i) => `<div class="thumb">${f.url ? `<img src="${f.url}" alt="">` : `<span class="ph">${ico("file")}</span>`}<small title="${esc(f.name)}">${esc(f.name)}</small><button type="button" data-rmfile="${i}" aria-label="Remove ${esc(f.name)}">${ico("x")}</button></div>`).join("");
  }
  function fakeProofs(box, n, name) { FILES.set(box, Array.from({ length: n }, (_, i) => ({ name: `${name}-${i + 1}.jpg`, url: null }))); renderThumbs(box); }
  function boxAmount(box) {
    if (box.dataset.src === "cash") return toC(fieldVal("cash"));
    if (box.dataset.src === "payout") return toC(fieldVal("payout"));
    const row = box.closest(".mrow"), e = row && row.querySelector("[data-m=amount]");
    return e ? toC(e.value) : 0;
  }

  let feeTouched = false;
  let linkedDeal = null, lastDealId = null;
  let dpLock = null, feeLock = null; // after switching how a value is typed, keep the exact pesos until the staff types something new
  let S = {}, copies = 3, names = [], saved = false, priceManual = false, pickFor = 0;
  const visited = new Set(["1"]);
  const FILES = new WeakMap(); // proof box -> [{name, url}]
  const filesOf = (box) => (box && FILES.get(box)) || [];
  const heard = new Map(); // key -> label

  const radio = (name) => ($(`input[name="${name}"]:checked`) || {}).value;
  const setRadio = (name, val) => { const r = $(`input[name="${name}"][value="${val}"]`); if (r) r.checked = true; };
  const step = () => +$("input[name=step]:checked").id.slice(2);

  function setSelect(sel, val) {
    const other = sel.parentElement.querySelector(".other-input");
    if (!val) { sel.value = ""; if (other) other.hidden = true; return; }
    if ([...sel.options].some((o) => o.value === val || o.text === val)) { sel.value = val; if (other) other.hidden = true; }
    else { sel.value = "Other…"; if (other) { other.value = val; other.hidden = false; } }
  }
  function selectVal(sel) {
    if (sel.value === "Other…") { const o = sel.parentElement.querySelector(".other-input"); return o ? o.value.trim() : ""; }
    return sel.value;
  }
  const field = (k) => $(`[data-k="${k}"]`);
  const fieldVal = (k) => { const el = field(k); if (!el) return ""; return el.tagName === "SELECT" ? selectVal(el) : el.value; };
  const fmtPhone = (v) => { const d = v.replace(/\D/g, ""); return d.length === 11 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : v; };
  function setField(k, val) {
    const el = field(k); if (!el) return;
    if (el.tagName === "SELECT") return setSelect(el, val);
    el.value = el.hasAttribute("data-money") && toC(val) ? num(toC(val)) : el.hasAttribute("data-phone") ? fmtPhone(val) : val;
  }

  // ================= units =================
  const invFor = (makeType) => INVENTORY.filter((x) => x.makeType === makeType);
  const makeOf = (makeType) => makeType.split(" ")[1] || "";

  function colorGroup(i, title, list, off, current, other) {
    return `<div class="lbl" style="margin:.5rem 0 .35rem;font-weight:400;font-size:12px;color:var(--muted-fg)">${esc(title)}</div><div class="chips">${list.map(([c, h], k) => `<input class="rc" type="radio" name="color-${i}" id="c${i}-${off + k}" value="${esc(c)}" ${current === c ? "checked" : ""}><label for="c${i}-${off + k}"><i class="dot" style="background:${h}"></i>${esc(c)}</label>`).join("")}${other ? `<input class="rc" type="radio" name="color-${i}" id="c${i}-x" value="__other" ${other.checked ? "checked" : ""}><label for="c${i}-x">${ico("pencil")}Other, type your own</label>` : ""}</div>`;
  }
  function colorFieldHtml(i, u) {
    const brand = brandOf(u.makeType), brandList = brand ? BRANDS()[brand] : [];
    const knownColor = brandList.concat(COMMON()).some((c) => c[0] === u.color);
    return `<div class="field s6 color-field"><label>Color</label>
${brand ? colorGroup(i, `${brand} factory colors`, brandList, 0, u.color) : ""}
${colorGroup(i, brand ? "Other common colors" : "Common colors", COMMON(), brandList.length, u.color, { checked: !!u.color && !knownColor })}
<input class="other-input" data-u="colorOther" type="text" placeholder="Type the color name" value="${u.color && !knownColor ? esc(u.color) : ""}" ${u.color && !knownColor ? "" : "hidden"} style="max-width:22rem;margin-top:.5rem">
<p class="hint">${brand ? `Names are the ones ${brand} uses. If the car papers say something else, choose Other and type it.` : "Pick the make and type to see that brand's factory color names."}</p></div>`;
  }
  // when the make is typed by hand, offer that brand's colors as soon as the brand is recognised
  function refreshColors(card) {
    const i = +card.dataset.i, u = collectUnits()[i], brand = brandOf(u.makeType) || "";
    if ((card.dataset.brand || "") === brand) return;
    card.dataset.brand = brand;
    card.querySelector(".color-field").outerHTML = colorFieldHtml(i, u);
  }
  function unitHtml(i, n, u, used) {
    const manual = u.mode === "manual", opts = !manual && u.makeType ? invFor(u.makeType) : [];
    const brand = brandOf(u.makeType), brandList = brand ? BRANDS()[brand] : [];
    const knownColor = brandList.concat(COMMON()).some((c) => c[0] === u.color);
    const plateOpts = `<option value="">${u.makeType ? "Choose the plate…" : "Pick the make / type first"}</option>` +
      opts.map((x) => `<option value="${esc(x.plate)}" ${x.plate === u.plate && !u.plateTyped ? "selected" : ""} ${(x.status !== "Available" || used.has(x.plate)) && x.plate !== u.plate ? "disabled" : ""}>${esc(x.plate)} · ${esc(x.color)}${x.status !== "Available" ? " · " + x.status : used.has(x.plate) ? " · on this receipt" : ""}</option>`).join("") +
      (u.makeType ? `<option value="__type" ${u.plateTyped ? "selected" : ""}>Not listed, type it…</option>` : "");
    const inStock = !manual && u.makeType ? opts.filter((x) => x.status === "Available").length : 0;
    return `<section class="card unit-card" data-i="${i}" data-mode="${u.mode}" data-brand="${brandOf(u.makeType) || ""}">
<header><span class="tile">${ico("car")}</span><div><h2>${n > 1 ? `Unit ${i + 1} of ${n}` : "Vehicle"}</h2><p>Description of the car</p></div><button type="button" class="btn sm" data-pick="${i}" style="margin-left:auto">${ico("search")}Search inventory</button></header>
<div class="grid">
<div class="field s4"><label>Make / type</label>
<div class="pickbox"><input data-u="makeType" type="text" value="${esc(u.makeType)}" ${manual ? "" : "readonly"} placeholder="${manual ? "Type the make and model" : "Tap to search the inventory"}" ${manual ? "" : `data-pickfield="${i}"`}></div>
<p class="hint">${manual ? `<a data-pick="${i}">Pick from the inventory instead</a>` : u.makeType ? `${inStock} in stock · <a data-manual="${i}">Not the right car? Type it yourself</a>` : `<a data-manual="${i}">Not in the inventory? Type it yourself</a>`}</p></div>
<div class="field s2 plate-field"><label>Plate number</label>
<select data-u="plateSel" class="plate-sel" ${u.makeType ? "" : "disabled"}>${plateOpts}</select>
<input data-u="plate" data-upper class="mono plate-inp" type="text" value="${esc(u.plate)}" placeholder="ABC 1234" ${manual || u.plateTyped ? "" : "hidden"}>
<p class="hint" data-uhint="plate">${manual ? "Letters and numbers" : "Only plates of this make and type"}</p></div>
<div class="field s2"><label>Motor number</label><input data-u="motor" data-upper class="mono" type="text" value="${esc(u.motor)}"><p class="hint" data-uhint="motor"></p></div>
<div class="field s2"><label>Chassis number</label><input data-u="chassis" data-upper class="mono" type="text" value="${esc(u.chassis)}"><p class="hint" data-uhint="chassis"></p></div>
${colorFieldHtml(i, u)}
</div></section>`;
  }
  function collectUnits() {
    return $$(".unit-card").map((card) => {
      const g = (k) => { const e = card.querySelector(`[data-u="${k}"]`); return e ? e.value : ""; };
      const sel = card.querySelector("[data-u=plateSel]"), mode = card.dataset.mode, i = card.dataset.i;
      const typed = mode === "manual" || sel.value === "__type";
      const c = (card.querySelector(`input[name="color-${i}"]:checked`) || {}).value;
      return { mode, makeType: g("makeType").trim(), plateTyped: mode === "inv" && sel.value === "__type", plate: (typed ? g("plate") : sel.value).trim(), motor: g("motor").trim(), chassis: g("chassis").trim(), color: c === "__other" ? g("colorOther").trim() : c || "" };
    });
  }
  function renderUnits(list) {
    const used = new Set(list.map((u) => u.plate).filter(Boolean));
    $("#units-box").innerHTML = list.map((u, i) => unitHtml(i, list.length, u, new Set([...used].filter((p) => p !== u.plate)))).join("");
    $("#units").textContent = list.length;
    heard.forEach((l, k) => markHeard(k, l));
    autoPrice();
  }
  function chooseUnit(i, item) {
    const L = collectUnits(); Object.assign(L[i], { mode: "inv", makeType: item.makeType, plate: item.plate, plateTyped: false, motor: item.motor || "", chassis: item.chassis || "", color: item.color });
    renderUnits(L);
  }
  function chooseGroup(i, makeType) {
    const L = collectUnits();
    if (L[i].makeType !== makeType) Object.assign(L[i], { mode: "inv", makeType, plate: "", plateTyped: false, motor: "", chassis: "", color: "" });
    renderUnits(L);
  }
  function setUnitCount(n) {
    const L = collectUnits(); n = Math.max(1, Math.min(10, n));
    while (L.length < n) L.push(emptyUnit());
    renderUnits(L.slice(0, n));
  }
  // asking prices from the inventory fill the agreed price until the staff types their own
  function autoPrice() {
    const L = collectUnits();
    const sum = L.reduce((n, u) => n + ((INVENTORY.find((x) => x.plate === u.plate && x.makeType === u.makeType) || {}).price || 0), 0) * 100;
    const hint = $("#price-hint");
    if (!priceManual && sum > 0) { setField("price", String(sum / 100)); hint.textContent = `Asking price from the inventory${L.length > 1 ? " for all units" : ""}. Change it to the price you agreed on.`; }
    else if (!priceManual) hint.textContent = hint.dataset.def;
  }

  // ---- inventory picker ----
  const makes = [...new Set(INVENTORY.map((x) => makeOf(x.makeType)))].sort();
  $("#pk-make").innerHTML += makes.map((m) => `<option>${m}</option>`).join("");
  function pickerMatches() {
    const q = $("#pk-q").value.toLowerCase().trim(), make = $("#pk-make").value, availOnly = radio("pk-status") === "avail";
    const groups = new Map();
    INVENTORY.forEach((x) => {
      if (availOnly && x.status !== "Available") return;
      if (make && makeOf(x.makeType) !== make) return;
      const hay = `${x.makeType} ${x.plate} ${x.color} ${x.chassis}`.toLowerCase();
      if (q && !q.split(/\s+/).every((w) => hay.includes(w))) return;
      if (!groups.has(x.makeType)) groups.set(x.makeType, []);
      groups.get(x.makeType).push(x);
    });
    return groups;
  }
  function renderPicker() {
    const groups = pickerMatches(), box = $("#pk-list");
    box.innerHTML = groups.size ? [...groups].map(([name, units]) => {
      const avail = units.filter((x) => x.status === "Available").length;
      return `<button type="button" class="pk-row" data-group="${esc(name)}"><span><b>${esc(name)}</b><small>${units.slice(0, 4).map((x) => `${esc(x.plate)} ${esc(x.color)}`).join(" · ")}${units.length > 4 ? ` · +${units.length - 4} more` : ""}</small></span><span class="n"><strong>${avail}</strong>in stock</span></button>`;
    }).join("") : `<div class="pk-empty">Nothing matches. Try another word, or type the car yourself.</div>`;
    $("#pk-count").textContent = `${groups.size} ${groups.size === 1 ? "make / type" : "makes / types"} · ${[...groups.values()].reduce((n, g) => n + g.length, 0)} cars`;
  }
  function openPicker(i) { pickFor = i; $("#pk-q").value = ""; $("#pk-make").value = ""; setRadio("pk-status", "avail"); renderPicker(); $("#picker").showModal(); $("#pk-q").focus(); }
  function pickGroup(name) {
    const units = pickerMatches().get(name) || [], one = units.filter((x) => x.status === "Available");
    $("#picker").close();
    if (units.length === 1 && one.length === 1 && $("#pk-q").value.trim()) chooseUnit(pickFor, one[0]);
    else { chooseGroup(pickFor, name); if (invFor(name).filter((x) => x.status === "Available").length === 1) chooseUnit(pickFor, invFor(name).find((x) => x.status === "Available")); }
    update();
  }

  // ================= payment rows =================
  const bankOptions = () => `<option value="">Bank…</option>${BANKS().map((b) => `<option>${esc(b)}</option>`).join("")}<option>Other…</option>`;
  const moneyCell = `<div class="affix money"><span>₱</span><input type="text" data-m="amount" data-money inputmode="decimal" placeholder="0"></div>`;
  function addMethod(kind, name) {
    const row = document.createElement("div");
    row.className = "mrow";
    if (kind === "check") {
      row.dataset.type = "check";
      row.innerHTML = `<div class="method"><div class="name"><span class="tile">${ico("file")}</span>Check</div>${moneyCell}<input type="text" class="mono" data-m="checkNo" placeholder="Check no."><button type="button" class="btn ghost icon danger" data-remove title="Remove">${ico("trash")}</button></div>
<div class="method sub-row"><span></span><div><select data-m="bank">${bankOptions()}</select><input class="other-input" data-m="bankOther" type="text" placeholder="Type the bank" hidden></div><input type="text" data-m="branch" placeholder="Branch (Br.)"><span></span></div>${proofRow("Attach photo of the check", "Front of the check")}`;
    } else {
      row.dataset.type = "wallet";
      row.innerHTML = `<div class="method"><div class="edit-name"><input type="text" data-m="name" value="${esc(name)}" placeholder="Name of the method" aria-label="Method name"></div>${moneyCell}<input type="text" class="mono" data-m="ref" placeholder="Reference no."><button type="button" class="btn ghost icon danger" data-remove title="Remove">${ico("trash")}</button></div>${proofRow("Attach screenshot or receipt", "Bank receipt or e-wallet screenshot")}`;
    }
    $("#pm-rows").appendChild(row);
    row.querySelector(kind === "check" || name ? "[data-m=amount]" : "[data-m=name]").focus();
    update();
    return row;
  }
  const selectVal2 = (sel, row) => (sel.value === "Other…" ? row.querySelector("[data-m=bankOther]").value.trim() : sel.value);
  function readMethods() {
    return $$("#pm-rows .mrow").map((r) => {
      const g = (k) => { const e = r.querySelector(`[data-m="${k}"]`); return e ? e.value.trim() : ""; };
      if (r.dataset.type === "check") return { type: "check", name: "Check", amount: g("amount"), checkNo: g("checkNo"), bank: selectVal2(r.querySelector("[data-m=bank]"), r), branch: g("branch"), proofs: filesOf(r.querySelector("[data-proof]")).length };
      return { type: "wallet", name: g("name"), amount: g("amount"), ref: g("ref"), proofs: filesOf(r.querySelector("[data-proof]")).length };
    });
  }

  // ================= notes =================
  function noteRow(n) {
    const d = document.createElement("div");
    d.className = "note";
    d.innerHTML = `<input type="checkbox" ${n.on ? "checked" : ""}><input type="text" value="${esc(n.text)}" placeholder="Write the note"><button type="button" class="btn ghost icon sm" data-edit title="Edit">${ico("pencil")}</button><button type="button" class="btn ghost icon sm danger" data-del title="Remove">${ico("trash")}</button>`;
    return d;
  }
  const readNotes = () => $$("#notes .note").map((r) => ({ on: r.querySelector("input[type=checkbox]").checked, text: r.querySelector("input[type=text]").value.trim() }));
  const setNotes = (list) => { const box = $("#notes"); box.innerHTML = ""; list.forEach((n) => box.appendChild(noteRow(n))); };

  // ================= read everything =================
  function finance(g) {
    const price = toC(g("price")), dpMode = radio("dpMode"), dpRaw = g("dpIn").trim(), feeMode = radio("feeMode"), feeRaw = g("feeIn").trim();
    const pct = (v) => parseFloat(String(v).replace(/,/g, "")) || 0;
    let dpC = 0;
    if (dpRaw) {
      if (dpLock && dpLock.mode === dpMode && dpLock.raw === dpRaw && dpLock.price === price) dpC = dpLock.cents;
      else dpC = dpMode === "percent" ? Math.round((price * pct(dpRaw)) / 100) : dpMode === "loan" ? Math.max(0, price - toC(dpRaw)) : toC(dpRaw);
    }
    let feeC = 0;
    const base = Math.max(0, price - dpC);
    if (feeRaw) {
      if (feeLock && feeLock.mode === feeMode && feeLock.raw === feeRaw && feeLock.base === base) feeC = feeLock.cents;
      else feeC = feeMode === "percent" ? Math.round((base * pct(feeRaw)) / 100) : toC(feeRaw);
    }
    const c2 = (c) => (c > 0 ? (c / 100).toFixed(2) : "");
    return { dp: c2(dpC), fee: c2(feeC), dpMode, dpRaw, feeMode, feeRaw };
  }
  function read() {
    const g = fieldVal, years = radio("years") === "__other" ? g("yearsOther") : radio("years") || "";
    return {
      receiptNo: g("receiptNo").trim(), date: g("date"), receivedFrom: g("receivedFrom").trim(), contact: g("contact").trim(), address: g("address").trim(),
      kind: radio("kind"), units: collectUnits(),
      price: g("price"), earlier: g("earlier"), cash: g("cash"), cashProofs: filesOf($("#proof-cash")).length, payout: g("payout"), payoutProofs: filesOf($("#proof-payout")).length, methods: readMethods(),
      dueMode: radio("due"), dueDate: g("dueDate"), dueText: g("dueText"),
      sale: radio("sale"), institution: g("institution"), ...finance(g), monthly: g("monthly"), years,
      hasTi: cfg().sections.trade && radio("ti") === "yes",
      ti: { year: g("tiYear"), unit: g("tiUnit").trim(), plate: g("tiPlate").trim(), mileage: g("tiMileage").trim(), value: g("tiValue") },
      hasLieu: cfg().sections.lieu && $("#lieu-on").checked, lieuAmount: g("lieuAmount"), lieuUntil: g("lieuUntil"),
      hasRem: cfg().sections.remarks && $("#rem-on").checked, remarks: g("remarks"), notes: readNotes(), company: cfg().company,
    };
  }

  // ================= checks =================
  const U = (i, k) => `.unit-card[data-i="${i}"] [data-u=${k}]`;
  function missing(s, t) {
    const m = [], add = (st, label, sel) => m.push({ step: st, label, sel }), req = cfg().required;
    if (!s.receiptNo) add(1, "Receipt number", "[data-k=receiptNo]");
    if (!s.receivedFrom) add(1, "Received from", "[data-k=receivedFrom]");
    const digits0 = s.contact.replace(/\D/g, ""), phoneOk = /^09\d{9}$/.test(digits0);
    if (req.contact ? !phoneOk : digits0 && !phoneOk) add(1, "Contact number (11 digits)", "[data-k=contact]");
    if (req.address && !s.address) add(1, "Postal address", "[data-k=address]");
    const n = s.units.length;
    s.units.forEach((u, i) => {
      const p = n > 1 ? `Unit ${i + 1}: ` : "";
      if (!u.makeType) add(2, p + "Make / type", U(i, "makeType"));
      if (!u.plate) add(2, p + "Plate number", u.mode === "manual" ? U(i, "plate") : U(i, "plateSel"));
      if (req.motor && !u.motor) add(2, p + "Motor number", U(i, "motor"));
      if (req.chassis && !u.chassis) add(2, p + "Chassis number", U(i, "chassis"));
      if (req.color && !u.color) add(2, p + "Color", `#c${i}-0`);
    });
    const dup = !linkedDeal && s.units[0] && MADS.openDealForPlate(s.units[0].plate);
    if (dup) add(2, `This car already has an open deal (${dup.id}). Use “Continue this deal” at the top`, "#deal-banner");
    if (!t.price) add(3, "Agreed price", "[data-k=price]");
    if (s.sale === "financing") {
      if (!s.institution) add(3, "Financing institution", "[data-k=institution]");
      if (!t.dpSet) add(3, s.dpMode === "loan" && s.dpRaw && toC(s.dpRaw) >= t.price ? "Loan amount must be less than the agreed price" : "Down payment or loan amount", "[data-k=dpIn]");
      if (t.price && t.dp > t.price) add(3, "Down payment is more than the agreed price", "[data-k=dpIn]");
      else if (t.dpSet && t.tv > t.share) add(3, `The trade-in (${fmt(t.tv)}) is worth more than the down payment. Raise the down payment to at least ${fmt(t.tv)}`, "[data-k=dpIn]");
    }
    if (s.hasTi) { if (!s.ti.unit) add(3, "Trade-in unit", "[data-k=tiUnit]"); if (!toC(s.ti.value)) add(3, "Trade-in value", "[data-k=tiValue]"); }
    if (s.hasLieu) { if (!toC(s.lieuAmount)) add(3, "In-lieu amount", "[data-k=lieuAmount]"); if (!s.lieuUntil) add(3, "In-lieu until date", "[data-k=lieuUntil]"); }
    if (!t.today && t.due > 0) add(4, "Amount paid today", "[data-k=cash]");
    if (t.balance > 0 && !MAD.dueText(s)) add(4, "When the balance will be given", s.dueMode === "date" ? "[data-k=dueDate]" : "[data-k=dueText]");
    s.methods.forEach((x, i) => {
      if (x.type === "wallet" && toC(x.amount) && !x.name) add(4, "Name of a payment method", "[data-m=name]");
      if (req.proofs && toC(x.amount) && !x.proofs) add(4, `Proof for ${x.type === "check" ? "the check" : x.name || "the payment"}`, `#pm-rows .mrow:nth-child(${i + 1}) [data-proof]`);
    });
    if (req.proofs && toC(s.cash) && !s.cashProofs) add(4, "Photo of the cash", "#proof-cash");
    if (req.proofs && t.payout && !s.payoutProofs) add(4, "Proof of the payout to the buyer", "#proof-payout");
    if (t.due >= 0 && t.balance < 0) add(4, `Received is more than is due (overpaid by ${fmt(-t.balance)})`, "[data-k=cash]");
    return m;
  }
  function warnings(s, t) {
    const w = [], add = (step, text) => w.push({ step, text });
    if (s.sale === "financing" && t.dpSet && t.price && (t.share / t.price) * 100 < minDown()) add(3, `The down payment is only ${Math.round((t.share / t.price) * 1000) / 10}% of the price. Most lenders ask for at least ${minDown()}%, so the loan may not be approved.`);
    if (s.sale === "financing" && t.loan && t.fee && (t.fee / t.loan) * 100 > 15) add(3, `The processing fee is ${Math.round((t.fee / t.loan) * 10000) / 100}% of the loan, much more than the usual ${FEE_STD()}%.`);
    if (s.sale === "financing" && t.dpSet && t.loan && (!t.monthly || !t.years)) add(3, "Monthly payment or years to pay are not filled in.");
    if (s.sale === "financing" && t.loan && t.repay && t.repay < t.loan) add(3, `${fmt(t.monthly)} × ${t.months} months is ${fmt(t.repay)}, which does not even cover the ${fmt(t.loan)} loan.`);
    if (s.hasTi && s.sale !== "financing" && t.due < 0) add(3, `The trade-in is worth more than the price, so we pay the buyer ${fmt(-t.due)}.`);
    if (s.hasLieu && t.lieu && t.balance > 0 && t.lieu > t.balance) add(4, `The documents are held for ${fmt(t.lieu)}, but the buyer only owes ${fmt(t.balance)}.`);
    if (s.hasLieu && t.lieu && t.balance <= 0) add(4, "Nothing is left to pay, so the documents do not need to be held.");
    if (s.hasLieu && s.lieuUntil && s.date && s.lieuUntil < s.date) add(3, "The in-lieu date is before the receipt date.");
    if (t.due < 0 && t.today > 0) add(4, "Nothing is due from the buyer, but a payment is recorded.");
    if (t.due < 0 && t.balance < 0) add(4, `We still owe the buyer ${fmt(-t.balance)}. Record the payout above once it is paid.`);
    if (s.methods.some((x) => x.type === "check" && toC(x.amount) && !x.checkNo)) add(4, "A check has no check number.");
    if (s.methods.some((x) => !toC(x.amount) && (x.name || x.checkNo || x.ref) && x.type !== "check")) add(4, "A payment row has no amount.");
    if (s.dueMode === "date" && s.dueDate && s.date && t.balance > 0 && s.dueDate < s.date) add(4, "The balance date is before the receipt date.");
    if (s.kind === "full" && t.balance > 0) add(4, `Marked full payment, but ${fmt(t.balance)} is still left.`);
    if (s.kind !== "full" && t.price && t.due > 0 && t.balance === 0) add(4, `The buyer's part is fully paid. ${s.sale === "financing" ? "Full payment is right here: the loan is between the buyer and " + (s.institution || "the lender") + "." : "Should this be full payment?"}`);
    return w;
  }
  function hint(root, k, text, cls) { const h = root.querySelector(`[data-uhint="${k}"], [data-hint="${k}"]`); if (!h) return; if (h.dataset.def === undefined) h.dataset.def = h.textContent; h.textContent = text || h.dataset.def; h.className = "hint" + (cls ? " " + cls : ""); }

  // ================= drawing the money =================
  function rowHtml(r) {
    const amt = r.k === "less" ? "− " + fmt(Math.abs(r.amt)) : fmt(Math.abs(r.amt));
    return `<div class="lr r-${r.k} ${r.tone || ""}"><div class="ll"><b>${esc(r.label)}</b>${r.detail ? `<small>${esc(r.detail)}</small>` : ""}${r.note ? `<small>${esc(r.note)}</small>` : ""}</div><div class="la">${amt}</div></div>`;
  }
  const ledgerBlock = (rows, extra) => `<div class="ledger">${rows.map(rowHtml).join("")}${extra || ""}</div>`;
  const warnHtml = (list) => list.map((x) => `<div class="alert warn">${ico("warn")}<span>${esc(x)}</span></div>`).join("");

  function update() {
    S = read();
    const t = totals(S), L = MAD.ledger(S), b = MAD.balanceInfo(t);
    // step 3
    $("#price-units").textContent = S.units.length > 1 ? ` for all ${S.units.length} units` : "";
    const pc = (c, of) => (of ? Math.round((c / of) * 1000) / 10 : 0);
    $("#dp-pre").textContent = S.dpMode === "percent" ? "%" : "₱"; $("#fee-pre").textContent = S.feeMode === "percent" ? "%" : "₱";
    const feePct = S.feeMode === "percent" ? parseFloat(String(S.feeRaw).replace(/,/g, "")) || 0 : t.loan ? Math.round((t.fee / t.loan) * 10000) / 100 : 0;
    $("#fin-out").innerHTML = t.dpSet && t.price
      ? `<div><small>Down payment</small><b>${fmt(t.share)}</b><span>${pc(t.share, t.price)}% of the price</span></div><div><small>Loan${S.institution ? " from " + esc(S.institution) : ""}</small><b>${fmt(t.loan)}</b><span>${pc(t.loan, t.price)}% of the price</span></div><div><small>Processing fee, to the lender</small><b>${fmt(t.fee)}</b><span>${t.fee && t.loan ? (S.feeMode === "percent" ? feePct : pc(t.fee, t.loan)) + "% of the loan" + (S.feeMode === "percent" && String(feePct) !== FEE_STD() ? " · custom" : "") : "none"}</span></div>`
      : `<div style="grid-column:1/-1"><span>Enter the agreed price and the down payment (or the loan) to see the split.</span></div>`;
    $("#fee-hint").textContent = S.feeMode === "percent" && S.feeRaw && String(feePct) !== FEE_STD() ? `Custom rate: ${feePct}% of the loan (the standard is ${FEE_STD()}%). Type any percent, decimals too.` : `Owed by the buyer to the lender, not to us. The standard is ${FEE_STD()}% of the loan; type any other percent for special cases.`;
    $("#term-total").textContent = t.years > 0 && t.monthly ? `= ${t.months} monthly payments · ${fmt(t.repay)} paid to the lender in total` : "";
    $$("[data-other-radio]").forEach((i) => (i.hidden = radio(i.dataset.otherRadio) !== "__other"));
    const tiOn = S.hasTi && t.tv > 0;
    $("#ti-title").textContent = !tiOn ? "Additional amount" : t.due < 0 ? "We pay the buyer" : "Buyer adds cash";
    $("#ti-extra").textContent = tiOn ? fmt(Math.abs(t.due)) : "₱0";
    $("#ti-formula").textContent = !tiOn ? "Worked out for you from the price and the trade-in value"
      : S.sale === "financing" && t.dpSet ? `Down payment ${fmt(t.share)} − trade-in ${fmt(t.tv)} = ${fmt(t.due)}` : `Agreed price ${fmt(t.price)} − trade-in ${fmt(t.tv)} = ${fmt(t.due)}`;
    const dealRows = L.rows.filter((r) => r.stage === "deal");
    $("#deal-sum").innerHTML = t.price ? ledgerBlock(dealRows, L.info.filter((x) => /Down|repayment|Loan from|Processing fee/.test(x.label)).map((x) => `<div class="linfo"><b>${esc(x.label)}:</b> <span>${esc(x.text)}</span></div>`).join("")) : `<div class="ledger"><div class="empty-note">Enter the agreed price to see what the buyer pays.</div></div>`;
    $("#warn3").innerHTML = warnHtml(warnings(S, t).filter((x) => x.step === 3).map((x) => x.text));
    // step 4
    $("#payout-box").hidden = !(t.due < 0);
    $("#payout-hint").textContent = t.due < 0 ? `The old car is worth ${fmt(-t.due)} more than the buyer's share of the price, so we pay the buyer ${fmt(-t.due)}. Record the cash we hand over.` : "";
    $$("[data-proof]").forEach((box) => { const n = filesOf(box).length, amt = boxAmount(box), need = amt > 0 && n === 0; box.classList.toggle("need", need); box.querySelector(".pb-status").textContent = n ? `✓ ${n} attached` : need ? "Required" : ""; });
    $("#paid-total").textContent = fmt(t.today);
    $("#words-paid").textContent = words(t.today) || "Fill in an amount above";
    const dueRow = L.rows.find((r) => r.stage === "deal" && r.k === "sub"), payRows = L.rows.filter((r) => r.stage === "pay");
    $("#pay-sum").innerHTML = t.price ? ledgerBlock([dueRow, ...payRows], `<div class="proof ${L.proves ? "ok" : "bad"}">${L.proves ? "✓ Adds up" : "✕ Does not add up"}: ${esc(L.proof)}</div>`) : `<div class="ledger"><div class="empty-note">Enter the agreed price first (step 3).</div></div>`;
    $("#bal-words").textContent = t.balance > 0 ? words(t.balance) : t.price ? (t.balance === 0 ? (t.due < 0 ? "Nil, settled with the buyer" : "Nil, paid in full") : "No balance: " + b.label.toLowerCase() + " " + fmt(b.amt)) : "Fill in the agreed price";
    $("#due-field").style.display = t.balance > 0 || !t.price ? "" : "none";
    $("#warn4").innerHTML = warnHtml(warnings(S, t).filter((x) => x.step === 4).map((x) => x.text));
    // bars
    const set = (k, v) => $$(`[data-live=${k}]`).forEach((e) => (e.textContent = v));
    set("price", fmt(t.price)); set("due", fmt(Math.abs(t.due))); set("today", fmt(t.today)); set("balance", t.balance < 0 ? "− " + fmt(-t.balance) : fmt(t.balance));
    $("#due-small").textContent = t.due < 0 ? "We pay the buyer" : "Buyer pays us";
    // misc counters
    $("#rem-count").textContent = `${S.remarks.length} characters`;
    const on = S.notes.filter((n) => n.on && n.text).length;
    $("#notes-count").textContent = `${on} standard ${on === 1 ? "note" : "notes"} will print`;
    $("#copies-label").textContent = `${copies} ${copies === 1 ? "copy" : "copies"}`;
    $("#done-n").textContent = copies;

    // contact + unit hints
    const digits = S.contact.replace(/\D/g, "");
    if (!digits) hint(document, "contact"); else if (digits.length !== 11) hint(document, "contact", `${digits.length} of 11 digits`, "bad"); else if (!digits.startsWith("09")) hint(document, "contact", "Mobile numbers start with 09", "bad"); else hint(document, "contact", "11 digits ✓", "ok");
    $$(".unit-card").forEach((card, i) => {
      const u = S.units[i], p = u.plate.toUpperCase();
      if (u.mode === "manual") { if (!p) hint(card, "plate"); else if (/^[A-Z]{3}\s?\d{3,4}$/.test(p)) hint(card, "plate", "Looks right ✓", "ok"); else hint(card, "plate", "Check the format, e.g. ABC 1234"); }
      hint(card, "motor", u.motor ? `${u.motor.replace(/\s/g, "").length} characters` : "");
      const ch = u.chassis.replace(/\s/g, "").length;
      if (!ch) hint(card, "chassis"); else if (ch === 17) hint(card, "chassis", "17 of 17 characters ✓", "ok"); else hint(card, "chassis", `${ch} characters · most chassis numbers have 17`);
      const other = card.querySelector("[data-u=colorOther]"); if (other) other.hidden = (card.querySelector(`input[name="color-${i}"]:checked`) || {}).value !== "__other";
    });

    // is this car already in an open deal? show how many receipts it has
    const plate0 = (S.units[0] || {}).plate, dl = (linkedDeal && MADS.db.deals.find((x) => x.id === linkedDeal)) || MADS.openDealForPlate(plate0);
    if (dl && dl.s.units.some((u) => u.plate === plate0) || linkedDeal) {
      const c = MADS.calc(dl), n = c.recs.filter((r) => r.status !== "rejected" && r.status !== "void").length;
      $("#deal-banner").innerHTML = `<div class="banner">${ico("receipt")}<span>${linkedDeal ? `<b>Continuing deal ${dl.id}</b> · ${esc(dl.s.receivedFrom)}.` : `<b>This car already has an open deal</b> · ${esc(dl.s.receivedFrom)}.`} It has <b>${n} ${n === 1 ? "receipt" : "receipts"}</b> so far, ${fmt(c.committed)} in receipts${c.pending ? ` (${fmt(c.pending)} still waiting for approval)` : ""}, balance ${fmt(Math.max(0, c.t.due - c.committed))}. This will be <b>receipt ${n + 1}</b>.${linkedDeal ? " The buyer, car and terms are copied from the deal." : ""}</span>${linkedDeal ? "" : `<button class="btn" type="button" data-continue="${dl.id}">Continue this deal</button>`}</div>`;
    } else $("#deal-banner").innerHTML = "";

    // preview
    const layout = radio("pv"), box = $("#pv-box"), wrap = $("#sheet-wrap");
    box.innerHTML = MAD.render(S, layout, MAD.copyName(0, names));
    const nat = { form: 794, half: 559, slip: 302 }[layout], scale = Math.min(1, (wrap.clientWidth - 32) / nat);
    box.style.transform = `scale(${scale})`;
    box.style.left = `${(wrap.clientWidth - nat * scale) / 2}px`;

    // finish: payment details and the check card
    const info = L.info.map((x) => `<div class="linfo"><b>${esc(x.label)}:</b> <span>${esc(x.text)}</span></div>`).join("");
    $("#ledger-box").innerHTML = t.price ? ledgerBlock(L.rows, `<div class="proof ${L.proves ? "ok" : "bad"}">${L.proves ? "✓ Adds up" : "✕ Does not add up"}: ${esc(L.proof)}</div>${info}`) : `<div class="ledger"><div class="empty-note">Nothing to show yet. Fill in the agreed price and the payment.</div></div>`;

    const so = MAD.sources(S);
    $("#sources-box").innerHTML = t.price ? ledgerBlock([...so.rows.map((r) => (r.amt < 0 ? { k: "less", label: "We pay the buyer", note: "The trade-in is worth more than the buyer's share", amt: r.amt } : { k: "plus", label: r.label, note: r.note, amt: r.amt })), { k: "sub", label: "Agreed price", note: "", amt: so.total }], `<div class="proof ${so.proves ? "ok" : "bad"}">${so.proves ? "✓ Adds up to the agreed price" : "✕ Does not add up to the agreed price"}</div>`) : `<div class="ledger"><div class="empty-note">Fill in the agreed price first.</div></div>`;

    const miss = missing(S, t), warn = warnings(S, t);
    let html = "";
    if (heard.size) html += `<div class="alert warn">${ico("warn")}<span><b>Heard by voice:</b> ${[...heard.values()].map(esc).join(", ")}. Read each one again; the mark goes away when you touch the field.</span></div>`;
    if (miss.length) html += `<div class="alert bad">${ico("warn")}<span><b>Still to fill in:</b> ${miss.map((x) => `<a data-goto="${x.step}" data-sel="${esc(x.sel)}">${esc(x.label)}</a>`).join(", ")}.</span></div>`;
    warn.forEach((x) => (html += `<div class="alert warn">${ico("warn")}<span>${esc(x.text)}</span></div>`));
    if (!miss.length && !warn.length) html += `<div class="alert ok">${ico("check")}<span>Everything is filled in, and the price, trade-in, loan and payments add up.</span></div>`;
    $("#alerts").innerHTML = html;
    const cell = (k, v, cls) => `<div class="${cls || ""}"><small>${k}</small><b class="${cls === "big" ? "num" : ""}">${v || "—"}</b></div>`;
    const methodsText = [toC(S.cash) && "cash", ...S.methods.filter((m) => toC(m.amount)).map((m) => (m.type === "check" ? "check" : m.name || "other").toLowerCase())].filter(Boolean).join(", ");
    $("#review").innerHTML =
      cell("Receipt no.", esc(S.receiptNo)) + cell("Received from", esc(S.receivedFrom)) + cell("Contact", esc(S.contact)) +
      S.units.map((u, i) => cell(S.units.length > 1 ? `Unit ${i + 1}` : "Unit", esc([u.makeType, u.color].filter(Boolean).join(" · ")) + `<br><span class="mono" style="font-weight:400;font-size:13px">${esc([u.plate, u.motor, u.chassis].filter(Boolean).join(" · "))}</span>`)).join("") +
      cell("Agreed price", t.price ? fmt(t.price) : "", "big") + cell(b.label === "Balance" ? `Balance${MAD.dueText(S) && t.balance > 0 ? " · due " + esc(MAD.dueText(S)) : ""}` : b.label, t.price ? fmt(b.amt) : "", "big") +
      cell(`Paid today${methodsText ? " · " + esc(methodsText) : ""}`, t.today ? fmt(t.today) : "", "big");

    const cur = step();
    $$(".steps label").forEach((l, i) => {
      const n = i + 1, ok = visited.has(String(n)) && n !== cur && n < 5 && !miss.some((x) => x.step === n);
      l.classList.toggle("done", ok);
      l.querySelector("b").textContent = ok ? "✓" : n;
    });
    const s = $("#save");
    s.disabled = saved || miss.length > 0 || !$("#confirm").checked;
    s.title = miss.length ? "Fill in the missing fields first" : !$("#confirm").checked ? "Tick the box to confirm you checked everything" : "";
  }

  // ================= events =================
  document.addEventListener("input", (e) => {
    const el = e.target;
    // Switching how the down payment or fee is typed keeps the same peso value: convert the box before anything recalculates.
    if (el.name === "dpMode" || el.name === "feeMode") {
      const t0 = totals(S), r = (c) => (c ? String(c / 100) : ""), p = (x, of) => (of ? String(Math.round((x / of) * 10000) / 100) : "");
      if (el.name === "dpMode") {
        setField("dpIn", !t0.dpSet ? "" : el.value === "percent" ? p(t0.share, t0.price) : el.value === "loan" ? r(t0.loan) : r(t0.share));
        dpLock = t0.dpSet ? { mode: el.value, raw: field("dpIn").value.trim(), cents: t0.share, price: t0.price } : null;
        if (feeLock) feeLock.base = -1; // the loan base may have changed; recompute from the typed fee
      } else {
        setField("feeIn", !t0.fee ? "" : el.value === "percent" ? p(t0.fee, t0.loan) : r(t0.fee));
        feeLock = t0.fee ? { mode: el.value, raw: field("feeIn").value.trim(), cents: t0.fee, base: t0.loan } : null;
      }
      return update();
    }
    if (el.hasAttribute && el.hasAttribute("data-money")) el.value = el.value.replace(/[^\d.,]/g, "");
    if (el.hasAttribute && el.hasAttribute("data-upper")) { const p = el.selectionStart; el.value = el.value.toUpperCase(); try { el.setSelectionRange(p, p); } catch (x) {} }
    if (el.hasAttribute && el.hasAttribute("data-phone")) el.value = el.value.replace(/[^\d\s]/g, "");
    if (el.dataset && el.dataset.k === "feeIn" && e.isTrusted) feeTouched = true;
    if (el.dataset && el.dataset.k === "price" && e.isTrusted) { priceManual = el.value.trim() !== ""; if (!priceManual) autoPrice(); }
    if (el.dataset && el.dataset.copy !== undefined) names[+el.dataset.copy] = el.value;
    if (el.id === "pk-q") return renderPicker();
    if (el.dataset && el.dataset.u === "makeType" && !el.readOnly) refreshColors(el.closest(".unit-card"));
    clearHeard(e);
    update();
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.matches && el.matches("input[data-file]")) {
      const box = el.closest("[data-proof]"), list = filesOf(box).slice();
      [...el.files].forEach((f) => list.push({ name: f.name, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null }));
      FILES.set(box, list); el.value = ""; renderThumbs(box); return update();
    }
    if (el.id === "pk-make" || el.name === "pk-status") return renderPicker();
    if (el.dataset && el.dataset.u === "plateSel") {
      const i = +el.closest(".unit-card").dataset.i;
      const item = INVENTORY.find((x) => x.plate === el.value && x.makeType === collectUnits()[i].makeType);
      clearHeard(e);
      if (item) chooseUnit(i, item);
      else { const L = collectUnits(); L[i].plateTyped = el.value === "__type"; if (el.value === "__type") L[i].plate = ""; renderUnits(L); if (el.value === "__type") $(U(i, "plate")).focus(); }
      return update();
    }
    if (el.tagName === "SELECT" && el.parentElement.querySelector(".other-input")) { const o = el.parentElement.querySelector(".other-input"); o.hidden = el.value !== "Other…"; if (!o.hidden) o.focus(); }
    if (el.name === "sale" && el.value === "financing" && !feeTouched && !fieldVal("feeIn").trim()) { setRadio("feeMode", "percent"); setField("feeIn", FEE_STD()); feeLock = null; }
    if (el.name === "step") { for (let i = 1; i <= +el.id.slice(2); i++) visited.add(String(i)); window.scrollTo({ top: 0 }); $("#voice-hint").textContent = HINT; $("#mic-on").checked = false; }
    if (el.name === "years" && el.value === "__other") setTimeout(() => field("yearsOther").focus(), 0);
    if (/^color-/.test(el.name || "") && el.value === "__other") setTimeout(() => el.closest(".color-field").querySelector("[data-u=colorOther]").focus(), 0);
    clearHeard(e);
    update();
  });
  document.addEventListener("focusout", (e) => {
    const el = e.target;
    if (el.hasAttribute && el.hasAttribute("data-money") && el.value.trim() && toC(el.value)) el.value = num(toC(el.value));
    if (el.hasAttribute && el.hasAttribute("data-phone")) el.value = fmtPhone(el.value);
  });
  function heardKey(el) {
    const card = el.closest && el.closest(".unit-card");
    if (card && el.dataset && el.dataset.u) return `u${card.dataset.i}.${({ plateSel: "plate", colorOther: "color" })[el.dataset.u] || el.dataset.u}`;
    if (/^color-(\d+)$/.test(el.name || "")) return `u${el.name.slice(6)}.color`;
    return el.dataset && el.dataset.k;
  }
  function clearHeard(e) {
    if (!e.isTrusted) return;
    const k = heardKey(e.target);
    if (k && heard.has(k)) { heard.delete(k); $$(`[data-heard="${k}"]`).forEach((b) => b.remove()); }
  }
  window.addEventListener("resize", update);

  document.addEventListener("click", (e) => {
    const f = e.target.closest("[data-pickfield]");
    if (f) return openPicker(+f.dataset.pickfield);
    const t = e.target.closest("button, a[data-goto], a[data-pick], a[data-manual], [data-stepper]");
    if (e.target.closest("label.btn") && e.target.closest("[data-proof]")) return;
    if (!t) { if (!e.target.closest(".copies-panel, #copy-names-btn")) $("#copy-panel").classList.remove("open"); return; }
    if (t.dataset.rmfile !== undefined) { const box = t.closest("[data-proof]"), list = filesOf(box).slice(), [gone] = list.splice(+t.dataset.rmfile, 1); if (gone && gone.url) URL.revokeObjectURL(gone.url); FILES.set(box, list); renderThumbs(box); return update(); }
    if (t.dataset.continue) return continueDeal(t.dataset.continue);
    if (t.hasAttribute("data-stdfee")) { setRadio("feeMode", "percent"); setField("feeIn", FEE_STD()); feeLock = null; feeTouched = false; return update(); }
    if (t.dataset.pick !== undefined) return openPicker(+t.dataset.pick);
    if (t.dataset.manual !== undefined) { const L = collectUnits(), i = +t.dataset.manual; L[i].mode = "manual"; L[i].plateTyped = false; renderUnits(L); $(U(i, "makeType")).focus(); return update(); }
    if (t.dataset.group) return pickGroup(t.dataset.group);
    if (t.hasAttribute("data-close")) return $("#picker").close();
    if (t.id === "pk-manual") { $("#picker").close(); const L = collectUnits(); L[pickFor].mode = "manual"; renderUnits(L); $(U(pickFor, "makeType")).focus(); return update(); }
    if (t.dataset.add !== undefined) return addMethod(t.dataset.add === "check" ? "check" : "wallet", t.dataset.add === "check" ? "" : t.dataset.add);
    if (t.hasAttribute("data-remove")) { t.closest(".mrow").remove(); return update(); }
    if (t.dataset.due) { field("dueText").value = t.dataset.due; return update(); }
    if (t.dataset.stepper === "units") { setUnitCount(+$("#units").textContent + +t.dataset.d); return update(); }
    if (t.dataset.stepper === "copies") { copies = Math.max(1, Math.min(10, copies + +t.dataset.d)); renderCopyNames(); return update(); }
    if (t.dataset.phrase) { const ta = $("#remarks"); ta.value += (ta.value && !ta.value.endsWith("\n") ? "\n" : "") + t.dataset.phrase; return update(); }
    if (t.dataset.fmt) return formatRemarks(t.dataset.fmt);
    if (t.hasAttribute("data-edit")) return t.closest(".note").querySelector("input[type=text]").focus();
    if (t.hasAttribute("data-del")) { t.closest(".note").remove(); return update(); }
    if (t.dataset.goto) { $(`#st${t.dataset.goto}`).click(); const sel = t.dataset.sel; setTimeout(() => { const el = $(sel); if (el) { el.focus(); el.scrollIntoView({ block: "center" }); } }, 0); return; }
    if (t.id === "add-note") { const r = noteRow({ on: true, text: "" }); $("#notes").appendChild(r); r.querySelector("input[type=text]").focus(); return update(); }
    if (t.id === "copy-names-btn") { renderCopyNames(); return $("#copy-panel").classList.toggle("open"); }
    if (t.id === "dictate") return dictate(t);
    if (t.id === "print" || t.id === "done-print") return printNow();
    if (t.id === "save") return save();
    if (t.id === "done-new") return location.reload();
    if (t.id === "sample") return applyState(MAD.SAMPLE);
  });
  document.addEventListener("keydown", (e) => { const f = e.target.closest && e.target.closest("[data-pickfield]"); if (f && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openPicker(+f.dataset.pickfield); } });

  function formatRemarks(kind) {
    const ta = $("#remarks"); let a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
    if (kind === "bold") {
      if (a === b) { ta.value = v.slice(0, a) + "**text**" + v.slice(b); ta.focus(); ta.setSelectionRange(a + 2, a + 6); }
      else { ta.value = v.slice(0, a) + "**" + v.slice(a, b) + "**" + v.slice(b); ta.focus(); ta.setSelectionRange(a, b + 4); }
    } else {
      const start = v.lastIndexOf("\n", a - 1) + 1, endIdx = v.indexOf("\n", b), end = endIdx < 0 ? v.length : endIdx;
      const lines = v.slice(start, end).split("\n"), all = lines.every((l) => /^\s*-\s/.test(l));
      const out = lines.map((l) => (all ? l.replace(/^\s*-\s/, "") : /^\s*-\s/.test(l) ? l : "- " + l)).join("\n");
      ta.value = v.slice(0, start) + out + v.slice(end); ta.focus(); ta.setSelectionRange(start, start + out.length);
    }
    update();
  }
  function dictate(btn) {
    btn.innerHTML = `${ico("mic")}Listening…`; btn.disabled = true;
    setTimeout(() => {
      const ta = $("#remarks"); ta.value += (ta.value && !ta.value.endsWith("\n") ? "\n" : "") + "Buyer will pick up the unit on Saturday.";
      markHeard("remarks", "Remarks"); btn.innerHTML = `${ico("mic")}Dictate`; btn.disabled = false; update();
    }, 1800);
  }
  function renderCopyNames() {
    $("#copy-names").innerHTML = Array.from({ length: copies }, (_, i) => `<div class="affix"><span>${i + 1}</span><input type="text" data-copy="${i}" value="${esc(names[i] || "")}" placeholder="${esc(MAD.copyName(i, []))}"></div>`).join("");
  }
  function printNow() {
    update();
    const layout = radio("pv");
    const payload = { s: Object.assign({}, S, { unapproved: true }), layout, copies, names: Array.from({ length: copies }, (_, i) => MAD.copyName(i, names)) };
    window.open(`print-${layout}.html#${btoa(unescape(encodeURIComponent(JSON.stringify(payload))))}`, "_blank");
  }
  function save() {
    if ($("#save").disabled) return;
    const { deal, receipt } = MADS.addFromForm(S, linkedDeal), t = totals(S);
    lastDealId = deal.id; saved = true; update();
    $("#done-sub").textContent = `Receipt ${receipt.no} · ${fmt(t.today)} from ${S.receivedFrom} · deal ${deal.id}. ${MADS.ROLES.approver.user} (Approver) will check it next.`;
    $("#done-deal").href = `deal.html?id=${deal.id}`;
    const items = $$("#prog li"); items.forEach((i) => i.classList.remove("ok"));
    $("#done").showModal();
    items.slice(0, 2).forEach((li, i) => setTimeout(() => li.classList.add("ok"), 400 + i * 600));
  }
  // copy the buyer, car and terms of an existing deal; the staff only adds the new payment
  function continueDeal(id) {
    const dl = MADS.db.deals.find((x) => x.id === id), c = MADS.calc(dl), b = JSON.parse(JSON.stringify(dl.s));
    Object.assign(b, { earlier: String(c.committed / 100), cash: "", cashProofs: 0, methods: [], payout: "", payoutProofs: 0, receiptNo: "", date: MADS.TODAY, kind: "partial" });
    applyState(b); linkedDeal = id;
    for (let i = 1; i <= 3; i++) visited.add(String(i));
    $("#st4").click(); update();
  }

  // ================= voice (a pretend microphone) =================
  const VOICE = {
    1: { say: "Received from Maria Teresa Santos, contact zero nine one seven one two three four five six seven, address twenty-seven Maginhawa Street, Sikatuna Village, Quezon City.", set: { receivedFrom: "Maria Teresa Santos", contact: "09171234567", address: "27 Maginhawa St., Sikatuna Village, Quezon City" } },
    2: { say: "Toyota Vios one point three XLE automatic, plate NBC 4821.", unit: "NBC 4821" },
    3: { say: "Agreed price seven hundred twenty thousand. Financing with BDO, down payment one hundred thirty thousand, processing fee seven percent, fourteen thousand two hundred fifty a month for five years.", set: { price: "720000", institution: "BDO", dpIn: "130000", feeIn: "7", monthly: "14250" }, radios: { sale: "financing", years: "5", dpMode: "amount", feeMode: "percent" } },
    4: { say: "Partial payment, forty thousand pesos in cash. Earlier payments ten thousand.", set: { cash: "40000", earlier: "10000" }, radios: { kind: "partial" } },
    5: { say: "Remarks: free one year registration.", remarks: "**Free:** one year registration." },
  };
  const HINT = "Tap the microphone and say the details of this step. Spoken fields are marked “Heard” until you check them.";
  function elFor(key) {
    const m = key.match(/^u(\d+)\.(\w+)$/);
    if (m) { const card = $(`.unit-card[data-i="${m[1]}"]`); if (!card) return null; return m[2] === "color" ? card.querySelector(".color-field") : m[2] === "plate" ? card.querySelector(".plate-field") : (card.querySelector(`[data-u=${m[2]}]`) || {}).closest && card.querySelector(`[data-u=${m[2]}]`).closest(".field"); }
    const el = field(key); return el && (el.closest(".field") || el.closest(".card"));
  }
  function markHeard(key, label) {
    heard.set(key, label);
    const f = elFor(key), lab = f && f.querySelector("label");
    if (lab && !lab.querySelector(`[data-heard="${key}"]`)) lab.insertAdjacentHTML("beforeend", ` <span class="badge" data-heard="${key}">${ico("sound")}Heard</span>`);
  }
  const labelOf = (k) => { const f = elFor(k); return f ? f.querySelector("label").childNodes[0].textContent.trim() : k; };
  $("#mic-on").addEventListener("change", (e) => {
    const v = VOICE[step()];
    if (e.target.checked) { $("#voice-heard").innerHTML = `“${esc(v.say)}” <b style="font-style:normal">Tap the mic again to stop.</b>`; return; }
    let n = 0;
    if (v.unit) { const item = INVENTORY.find((x) => x.plate === v.unit); chooseUnit(0, item); ["makeType", "plate", "color"].forEach((k) => markHeard(`u0.${k}`, k === "makeType" ? "Make / type" : k === "plate" ? "Plate number" : "Color")); n = 3; }
    Object.entries(v.set || {}).forEach(([k, val]) => { setField(k, val); if (k !== "price") markHeard(k, labelOf(k)); n++; if (k === "price") priceManual = true; });
    Object.entries(v.radios || {}).forEach(([k, val]) => { setRadio(k, val); n++; });
    if (v.remarks) { $("#rem-on").checked = true; const ta = $("#remarks"); ta.value += (ta.value ? "\n" : "") + v.remarks; markHeard("remarks", "Remarks"); n++; }
    $("#voice-hint").textContent = `Filled in ${n} ${n === 1 ? "field" : "fields"} from what you said. Fields marked “Heard” still need your check.`;
    update();
  });

  // ================= load a full example =================
  function applyState(s) {
    ["receiptNo", "date", "receivedFrom", "contact", "address", "price", "earlier", "cash", "payout", "dueDate", "dueText", "institution", "dpIn", "feeIn", "monthly", "remarks", "lieuAmount", "lieuUntil"].forEach((k) => setField(k, ({ dpIn: s.dp, feeIn: s.fee })[k] || s[k] || ""));
    setRadio("dpMode", "amount"); setRadio("feeMode", s.feePct ? "percent" : "amount"); if (s.feePct) { setField("feeIn", s.feePct); feeTouched = true; } dpLock = feeLock = null;
    fakeProofs($("#proof-cash"), s.cashProofs || 0, "cash"); fakeProofs($("#proof-payout"), s.payoutProofs || 0, "payout");
    priceManual = true;
    renderUnits(s.units.map((u) => ({ mode: "inv", plateTyped: false, ...u })));
    setRadio("kind", s.kind); setRadio("due", s.dueMode); setRadio("sale", s.sale);
    if (["1", "2", "3", "4", "5"].includes(s.years)) setRadio("years", s.years); else { setRadio("years", "__other"); setField("yearsOther", s.years); }
    setRadio("ti", s.hasTi ? "yes" : "no");
    setField("tiYear", s.ti.year); setField("tiUnit", s.ti.unit); setField("tiPlate", s.ti.plate); setField("tiMileage", s.ti.mileage); setField("tiValue", s.ti.value);
    $("#lieu-on").checked = s.hasLieu; $("#rem-on").checked = s.hasRem;
    $("#pm-rows").innerHTML = "";
    s.methods.forEach((m) => { const r = addMethod(m.type, m.name); const set = (k, v) => { const e = r.querySelector(`[data-m="${k}"]`); if (e) e.value = v; };
      set("amount", num(toC(m.amount))); set("checkNo", m.checkNo || ""); set("branch", m.branch || ""); set("ref", m.ref || ""); set("name", m.name);
      if (m.type === "check") { const sel = r.querySelector("[data-m=bank]"); sel.value = BANKS().includes(m.bank) ? m.bank : "Other…"; }
      fakeProofs(r.querySelector("[data-proof]"), m.proofs || 0, m.type === "check" ? "check" : "receipt"); });
    setNotes(cfg().notes.map((n) => ({ text: n.text, on: !!(s.notes || []).find((x) => x.text === n.text && x.on) })).concat((s.notes || []).filter((x) => !cfg().notes.some((n) => n.text === x.text))));
    heard.clear(); $$("[data-heard]").forEach((b) => b.remove());
    $("#confirm").checked = false;
    update();
  }

  // ================= lists the Admin controls (Settings page) =================
  function renderLists() {
    const c = cfg(), chip = (attrs, label, icon) => `<button type="button" class="chip" ${attrs}>${ico(icon || "plus")}${esc(label)}</button>`;
    $("#wallet-chips").innerHTML = c.wallets.map((w) => chip(`data-add="${esc(w)}"`, w)).join("");
    const inst = $("[data-k=institution]"); inst.innerHTML = `<option value="">Choose…</option>${c.institutions.map((x) => `<option>${esc(x)}</option>`).join("")}<option>Other…</option>`;
    $("#years-chips").innerHTML = c.years.map((y, i) => `<input class="rc" type="radio" name="years" id="y${i}" value="${esc(y)}"><label for="y${i}">${esc(y)}</label>`).join("") + `<input class="rc" type="radio" name="years" id="y-x" value="__other"><label for="y-x">Other</label>`;
    $("#due-chips").innerHTML = c.duePhrases.map((p) => chip(`data-due="${esc(p)}"`, p, "pencil")).join("");
    $("#phrase-chips").innerHTML = c.phrases.map((p) => chip(`data-phrase="${esc(p)}"`, p)).join("");
    $("#card-trade").hidden = !c.sections.trade; $("#card-lieu").hidden = !c.sections.lieu; $("#card-remarks").hidden = !c.sections.remarks;
    $("#fee-hint") && ($("#fee-hint").dataset.std = FEE_STD());
  }

  // ================= start =================
  field("date").value = new Date().toLocaleDateString("en-CA");
  renderLists();
  renderUnits([emptyUnit()]);
  setNotes(cfg().notes.map((n) => ({ text: n.text, on: n.on })));
  update();
  const wanted = new URLSearchParams(location.search).get("deal");
  if (wanted && MADS.db.deals.find((x) => x.id === wanted)) continueDeal(wanted);
})();

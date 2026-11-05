import type { AppSettings } from "@/lib/deal/settings";
import type { FormState, MethodRow, UnitInput } from "@/lib/deal/types";
import type { VoiceExtraction } from "@/lib/voice/schema";
import { emptyMethod, emptyUnit, prettyMoney, type FinUi } from "./form-state";
import type { InvUnit } from "./inventory-picker";

export interface VoiceApplied { form: FormState; fin: FinUi; filled: string[]; kept: string[]; /** Things that do not agree and need a person's eyes. */ notes: string[] }

const norm = (t: string) => t.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const moneyText = (n: number) => prettyMoney(String(n));

/**
 * Puts what was heard into the form. What staff already typed wins: a box that has something in it is
 * left alone and listed in `kept`, unless `overwrite` is on ("use what I heard"). Money fields get the
 * heard number as typed text; everything else the form works out (down payment, fee, balance) by itself.
 */
export function applyVoice(form: FormState, fin: FinUi, v: VoiceExtraction, o: { settings: AppSettings; inventory: InvUnit[]; linked: boolean; today: string; overwrite?: boolean }): VoiceApplied {
  const f: FormState = structuredClone(form);
  let ui: FinUi = { ...fin };
  const filled: string[] = [], kept: string[] = [], notes: string[] = [];
  const mark = (label: string) => { if (!filled.includes(label)) filled.push(label); };
  const hold = (label: string) => { if (!kept.includes(label)) kept.push(label); };

  /** Fills a text box when it is empty (or on overwrite). Returns whether it was filled. */
  const text = (current: string, heard: string | null, label: string, same: (a: string, b: string) => boolean = (a, b) => key(a) === key(b)): string | null => {
    if (!heard) return null;
    if (!current.trim() || o.overwrite) { if (current.trim() !== heard.trim()) mark(label); return heard.trim(); }
    if (!same(current, heard)) hold(label);
    return null;
  };
  const money = (current: string, heard: number | null, label: string): string | null => text(current, heard === null ? null : moneyText(heard), label, (a, b) => a.replace(/[^\d.]/g, "") === b.replace(/[^\d.]/g, ""));

  // ---- the receipt itself ----
  f.receiptNo = text(form.receiptNo, v.receipt_no?.replace(/\D/g, "") ?? null, "the receipt number") ?? f.receiptNo;
  if (v.kind && (o.overwrite || form.kind === "partial")) { if (f.kind !== v.kind) mark("the payment type"); f.kind = v.kind; }
  if (v.date && (o.overwrite || form.date === o.today) && v.date !== form.date) { f.date = v.date; mark("the date"); }

  if (!o.linked) {
    // ---- buyer ----
    f.receivedFrom = text(form.receivedFrom, v.buyer_name, "the buyer's name") ?? f.receivedFrom;
    f.address = text(form.address, v.buyer_address, "the address") ?? f.address;
    const phone = v.buyer_contact?.replace(/\D/g, "") ?? null;
    f.contact = text(form.contact, phone, "the contact number", (a, b) => a.replace(/\D/g, "") === b) ?? f.contact;

    // ---- vehicles ----
    v.units.forEach((hu, i) => {
      while (f.units.length <= i) f.units.push(emptyUnit());
      const cur: UnitInput = f.units[i], label = (x: string) => (v.units.length > 1 ? `unit ${i + 1}: ${x}` : x);
      const colors = [...o.settings.colors.common, ...Object.values(o.settings.colors.brands).flat()].map(([c]) => c);
      const color = hu.color ? colors.find((c) => key(c) === key(hu.color!)) ?? hu.color : null;
      // The plate decides: a plate in the inventory brings its make, type and color with it.
      let inv = hu.plate ? o.inventory.find((x) => norm(x.plate) === norm(hu.plate!)) : undefined;
      // If the plate is in the inventory as a different car than the one said, do not quietly swap it: keep what was said and point it out.
      if (inv?.makeType && hu.make_type) {
        const said = key(hu.make_type).split(" ").filter((w) => w.length > 2 && !/^\d+$/.test(w));
        if (said.length && !said.some((w) => key(inv!.makeType!).includes(w))) {
          notes.push(`${inv.plate} is listed in the inventory as ${inv.makeType}, but you said ${hu.make_type}. Check which one is right.`);
          inv = undefined;
        }
      }
      let makeType = hu.make_type;
      if (inv?.makeType) makeType = inv.makeType;
      else if (hu.make_type) {
        const words = key(hu.make_type).split(" ").filter(Boolean);
        const groups = [...new Set(o.inventory.filter((x) => x.makeType && words.every((w) => key(x.makeType!).includes(w))).map((x) => x.makeType!))];
        if (groups.length === 1) makeType = groups[0];
      }
      const next: UnitInput = {
        makeType: text(cur.makeType, makeType, label("the make and model")) ?? cur.makeType,
        plate: text(cur.plate, inv?.plate ?? hu.plate?.toUpperCase() ?? null, label("the plate number"), (a, b) => norm(a) === norm(b)) ?? cur.plate,
        motor: text(cur.motor, hu.motor?.toUpperCase() ?? null, label("the motor number"), (a, b) => norm(a) === norm(b)) ?? cur.motor,
        chassis: text(cur.chassis, hu.chassis?.toUpperCase() ?? null, label("the chassis number"), (a, b) => norm(a) === norm(b)) ?? cur.chassis,
        color: text(cur.color, color ?? inv?.color ?? null, label("the color")) ?? cur.color,
      };
      f.units[i] = next;
    });

    // ---- the deal ----
    f.price = money(form.price, v.price, "the agreed price") ?? f.price;
    const hasFinancingData = !!(form.institution.trim() || fin.dpIn.trim());
    if (v.sale === "financing" && form.sale !== "financing") { f.sale = "financing"; mark("financing"); }
    else if (v.sale === "cash" && form.sale === "financing") { if (o.overwrite || !hasFinancingData) { f.sale = "cash"; mark("cash"); } else hold("how it is paid"); }
    else if (v.sale === "cash" && form.sale === "cash") mark("cash");

    if (f.sale === "financing") {
      const inst = v.institution ? o.settings.institutions.find((x) => key(x) === key(v.institution!)) ?? v.institution : null;
      f.institution = text(form.institution, inst, "the financing company") ?? f.institution;
      const dpHeard = v.down_payment !== null ? { mode: "amount" as const, raw: String(v.down_payment), label: "the down payment" }
        : v.down_payment_percent !== null ? { mode: "percent" as const, raw: String(v.down_payment_percent), label: "the down payment %" }
        : v.loan_amount !== null ? { mode: "loan" as const, raw: String(v.loan_amount), label: "the loan amount" } : null;
      if (dpHeard) {
        const heardIn = dpHeard.mode === "percent" ? dpHeard.raw : moneyText(Number(dpHeard.raw));
        const sameDp = fin.dpMode === dpHeard.mode && fin.dpIn.replace(/[^\d.]/g, "") === heardIn.replace(/[^\d.]/g, "");
        if (!fin.dpIn.trim() || o.overwrite) { ui = { ...ui, dpMode: dpHeard.mode, dpIn: heardIn, dpLock: null }; if (!sameDp) mark(dpHeard.label); }
        else if (!sameDp) hold(dpHeard.label);
      }
      f.monthly = money(form.monthly, v.monthly, "the monthly payment") ?? f.monthly;
      const years = v.years !== null ? String(v.years) : null;
      f.years = text(form.years, years, "the years to pay") ?? f.years;
      // the processing fee
      const feeFree = !fin.feeTouched || o.overwrite;
      const before = `${ui.feeMode}|${ui.feeIn}|${ui.feeOther}`;
      if (v.fee_mode && feeFree) {
        const std = o.settings.feeStd;
        if (v.fee_mode === "standard") ui = { ...ui, feeMode: "percent", feeIn: std, feeLock: null, feeTouched: true, feeOther: false };
        else if (v.fee_mode === "none") ui = { ...ui, feeMode: "percent", feeIn: "0", feeLock: null, feeTouched: true, feeOther: false };
        else if (v.fee_value !== null) ui = { ...ui, feeMode: v.fee_mode, feeIn: v.fee_mode === "amount" ? moneyText(v.fee_value) : String(v.fee_value), feeLock: null, feeTouched: true, feeOther: true };
        if (before !== `${ui.feeMode}|${ui.feeIn}|${ui.feeOther}`) mark("the processing fee");
      } else if (v.fee_mode) {
        const heardFee = v.fee_mode === "standard" ? `percent|${o.settings.feeStd}|false` : v.fee_mode === "none" ? "percent|0|false" : `${v.fee_mode}|${v.fee_mode === "amount" ? moneyText(v.fee_value ?? 0) : String(v.fee_value)}|true`;
        if (heardFee !== before) hold("the processing fee");
      }
      else if (!ui.feeTouched && !ui.feeIn.trim()) ui = { ...ui, feeMode: "percent", feeIn: o.settings.feeStd, feeLock: null }; // the usual default
    }

    if (v.trade_in) {
      const t = v.trade_in;
      if (!form.hasTi || o.overwrite) { f.hasTi = true; mark("a trade-in"); }
      f.ti = {
        year: text(form.ti.year, t.year, "the trade-in year") ?? f.ti.year, unit: text(form.ti.unit, t.unit, "the traded car") ?? f.ti.unit,
        plate: text(form.ti.plate, t.plate?.toUpperCase() ?? null, "the trade-in plate", (a, b) => norm(a) === norm(b)) ?? f.ti.plate,
        mileage: text(form.ti.mileage, t.mileage, "the trade-in mileage") ?? f.ti.mileage, value: money(form.ti.value, t.value, "the trade-in value") ?? f.ti.value,
      };
    }
    if (v.lieu) {
      if (!form.hasLieu || o.overwrite) { f.hasLieu = true; mark("in lieu of documents"); }
      f.lieuAmount = money(form.lieuAmount, v.lieu.amount, "the in-lieu amount") ?? f.lieuAmount;
      f.lieuUntil = text(form.lieuUntil, v.lieu.until, "the in-lieu date") ?? f.lieuUntil;
    }
    if (v.earlier_paid !== null) f.earlier = money(form.earlier, v.earlier_paid, "the amount paid before") ?? f.earlier;
    if (v.due_date) { f.dueMode = "date"; f.dueDate = text(form.dueDate, v.due_date, "the due date") ?? f.dueDate; }
    else if (v.due_text) { f.dueMode = "text"; f.dueText = text(form.dueText, v.due_text, "the due date wording") ?? f.dueText; }
  }

  // ---- the payment on this receipt ----
  f.cash = money(form.cash, v.cash_today, "the cash paid today") ?? f.cash;
  const methods: MethodRow[] = f.methods.map((m) => ({ ...m }));
  for (const w of v.wallets) {
    const name = w.name ? o.settings.wallets.find((x) => key(x) === key(w.name!)) ?? w.name : null;
    const existing = methods.find((m) => m.type === "wallet" && name && key(m.name) === key(name));
    if (existing) {
      existing.amount = money(existing.amount, w.amount, `${name}: amount`) ?? existing.amount;
      existing.ref = text(existing.ref, w.ref, `${name}: reference`) ?? existing.ref;
    } else if (name || w.amount !== null) {
      methods.push({ ...emptyMethod("wallet", name ?? ""), amount: w.amount === null ? "" : moneyText(w.amount), ref: w.ref ?? "" });
      mark(name ? `${name} payment` : "a wallet payment");
    }
  }
  if (v.check) {
    const c = v.check, existing = methods.find((m) => m.type === "check");
    const bank = c.bank ? o.settings.banks.find((x) => key(x) === key(c.bank!)) ?? c.bank : null;
    if (existing) {
      existing.amount = money(existing.amount, c.amount, "the check amount") ?? existing.amount;
      existing.checkNo = text(existing.checkNo, c.no, "the check number") ?? existing.checkNo;
      existing.bank = text(existing.bank, bank, "the check's bank") ?? existing.bank;
    } else {
      methods.push({ ...emptyMethod("check"), amount: c.amount === null ? "" : moneyText(c.amount), checkNo: c.no ?? "", bank: bank ?? "", branch: c.branch ?? "" });
      mark("a check payment");
    }
  }
  f.methods = methods;

  if (v.remarks) {
    if (!form.hasRem || !form.remarks.trim() || o.overwrite) { f.hasRem = true; f.remarks = v.remarks; mark("the remarks"); }
    else hold("the remarks");
  }
  return { form: f, fin: ui, filled, kept, notes };
}

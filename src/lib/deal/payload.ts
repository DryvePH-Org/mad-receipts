import { fromCentavos, toCentavos } from "@/lib/rules/money";
import type { FormState, ProofFile } from "./types";

const money = (text: string) => {
  const c = toCentavos(text);
  return c === null || c === 0 ? undefined : fromCentavos(c);
};
const proofs = (list: ProofFile[]) => list.map((p) => ({ path: p.path, filename: p.filename, mime: p.mime, size: p.size }));

/** The form without the files' browser-only parts: what is stored with the receipt to print it again. */
export function snapshotOf(s: FormState): FormState {
  const clean = (list: ProofFile[]) => list.map((p) => ({ path: p.path, filename: p.filename, mime: p.mime, size: p.size }));
  return { ...s, cashProofs: clean(s.cashProofs), payoutProofs: clean(s.payoutProofs), methods: s.methods.map((m) => ({ ...m, proofs: clean(m.proofs) })) };
}

/** What the database function receives. Amounts are exact peso strings; the database does the math again. */
export function buildSubmitPayload(s: FormState, dealId: string | null) {
  const snap = snapshotOf(s);
  const payments = [
    ...(money(s.cash) ? [{ method: "cash", label: "Cash", amount: money(s.cash), attachments: proofs(s.cashProofs) }] : []),
    ...s.methods.filter((m) => money(m.amount)).map((m) => ({
      method: m.type, label: m.type === "check" ? "Check" : m.name, amount: money(m.amount), reference: m.ref, check_no: m.checkNo, bank: m.bank, branch: m.branch, attachments: proofs(m.proofs),
    })),
  ];
  const { cashProofs: _c, payoutProofs: _p, methods: _m, cash: _cash, payout: _pay, earlier: _e, ...terms } = snap;
  void [_c, _p, _m, _cash, _pay, _e];
  const base = {
    deal_id: dealId, receipt_no: s.receiptNo.trim(), receipt_date: s.date, kind: s.kind, payments,
    payout: money(s.payout) ? { amount: money(s.payout), attachments: proofs(s.payoutProofs) } : null,
    remarks: s.hasRem ? s.remarks : null, notes: s.notes.filter((n) => n.on && n.text.trim()), snapshot: snap,
  };
  if (dealId) return base;
  return {
    ...base,
    buyer: { name: s.receivedFrom, address: s.address, contact: s.contact },
    units: s.units.map((u) => ({ make_type: u.makeType, plate: u.plate, motor: u.motor, chassis: u.chassis, color: u.color })),
    price: money(s.price), sale_type: s.sale, institution: s.sale === "financing" ? s.institution : null,
    down_payment: s.sale === "financing" ? money(s.dp) : null, processing_fee: s.sale === "financing" ? (money(s.fee) ?? "0") : "0",
    monthly: money(s.monthly), years: s.years || null,
    trade_in: s.hasTi ? { value: money(s.ti.value), year: s.ti.year, unit: s.ti.unit, plate: s.ti.plate, mileage: s.ti.mileage } : null,
    lieu: s.hasLieu ? { amount: money(s.lieuAmount), until: s.lieuUntil || null } : null,
    earlier: money(s.earlier),
    due: { mode: s.dueMode, date: s.dueDate, text: s.dueText },
    terms,
  };
}

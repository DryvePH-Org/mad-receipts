import { buildLedger, totalsFromForm } from "@/lib/deal/math";
import type { AppSettings } from "@/lib/deal/settings";
import { KIND_LABELS, type FormState } from "@/lib/deal/types";
import { formatDate } from "@/lib/dates";
import { formatPeso, toCentavos } from "@/lib/rules/money";
import { words } from "@/lib/deal/math";

const esc = (t: unknown) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const peso = (v: string) => toCentavos(v) ?? 0;

/**
 * A plain, printable record of one receipt, filed in Drive next to its proof files. It lists what
 * the receipt says and the money line by line; the layout copies on paper come from the print page.
 */
export function receiptRecordHtml(s: FormState, company: AppSettings["company"]): string {
  const t = totalsFromForm(s);
  const payRows = [
    ...(peso(s.cash) ? [{ label: "Cash", detail: "", amount: peso(s.cash), proofs: s.cashProofs.length }] : []),
    ...s.methods.filter((m) => peso(m.amount)).map((m) => ({ label: m.type === "check" ? "Check" : m.name || "Other", detail: m.type === "check" ? [m.checkNo && `No. ${m.checkNo}`, m.bank, m.branch && `Br. ${m.branch}`].filter(Boolean).join(" · ") : m.ref, amount: peso(m.amount), proofs: m.proofs.length })),
  ];
  const ledger = buildLedger(t, { units: s.units.length, institution: s.institution, tradeInText: [[s.ti.year, s.ti.unit].filter(Boolean).join(" "), s.ti.plate].filter(Boolean).join(" · "), payRows, payoutProofs: s.payoutProofs.length, lieuUntilText: s.lieuUntil ? formatDate(s.lieuUntil) : "" });
  const kv = (k: string, v: string) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`;
  const dueText = s.dueMode === "date" ? (s.dueDate ? formatDate(s.dueDate) : "") : s.dueText;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Receipt ${esc(s.receiptNo)}</title><style>
body{font:14px/1.45 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#111}h1{margin:0;font-size:22px}h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#555;margin:22px 0 6px}
table{width:100%;border-collapse:collapse}th{text-align:left;font-weight:500;color:#555;width:34%;padding:4px 0;vertical-align:top}td{padding:4px 0}.r{text-align:right;font-variant-numeric:tabular-nums}
.row{display:flex;justify-content:space-between;border-top:1px solid #ddd;padding:6px 0}.total{font-weight:700;border-top:2px solid #111}small{color:#666;display:block}</style></head><body>
<h1>${esc(company.name)}</h1><p>${esc(company.tagline)} · No. <b>${esc(s.receiptNo)}</b> · ${esc(s.date ? formatDate(s.date) : "")} · ${esc(KIND_LABELS[s.kind])}</p>
<h2>Received from</h2><table>${kv("Buyer", s.receivedFrom)}${kv("Contact", s.contact)}${kv("Address", s.address)}${kv("Amount received", `${formatPeso(t.today)} (${words(t.today)})`)}</table>
<h2>Vehicle${s.units.length > 1 ? "s" : ""}</h2>${s.units.map((u, i) => `<table>${s.units.length > 1 ? kv("Unit", `${i + 1} of ${s.units.length}`) : ""}${kv("Make / type", u.makeType)}${kv("Plate", u.plate)}${kv("Motor", u.motor)}${kv("Chassis", u.chassis)}${kv("Color", u.color)}</table>`).join("<br>")}
<h2>The money</h2>${ledger.rows.map((r) => `<div class="row${r.kind === "total" ? " total" : ""}"><span>${esc(r.label)}${r.detail ? `<small>${esc(r.detail)}</small>` : ""}</span><span class="r">${r.kind === "less" ? "− " : ""}${esc(formatPeso(r.amount))}</span></div>`).join("")}
<p><small>${ledger.proves ? "Adds up" : "Does not add up"}: ${esc(ledger.proof)}</small></p>
${ledger.info.map((i) => `<p><b>${esc(i.label)}:</b> ${esc(i.text)}</p>`).join("")}
${t.balance > 0 ? `<table>${kv("Balance to be given on or before", dueText)}${kv("Balance in words", words(t.balance))}</table>` : ""}
${s.hasRem && s.remarks.trim() ? `<h2>Remarks</h2><p style="white-space:pre-wrap">${esc(s.remarks)}</p>` : ""}
${s.notes.some((n) => n.on && n.text.trim()) ? `<h2>Notes</h2><ul>${s.notes.filter((n) => n.on && n.text.trim()).map((n) => `<li>${esc(n.text)}</li>`).join("")}</ul>` : ""}
</body></html>`;
}

import { daysBetween } from "@/lib/dates";
import { dealStatusKey, type DealStatusKey, type NotifyDeal } from "@/lib/deal/status";

// A sale of the sheet (car_sales and its car_sale_payments) told as what Transactions and Reminders show: the price, what came in, the balance,
// when the balance is due, and whether a lender still owes us. The sheet has no due date, so it is the first payment plus the allowed days. Pure.

export interface SalePay { stage: string; amount: number; paidOn: string | null; bank: string | null; arNo: string | null }
export interface SaleInput { id: string; plate: string; carText: string | null; buyer: string | null; sales: string | null; financing: string | null; agreedPrice: number | null; soldOn: string | null; stage: string | null; payments: SalePay[] }

const cents = (n: number) => Math.round(n * 100);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export interface SaleMoney {
  id: string; plate: string; buyer: string; carName: string; sales: string; financed: boolean; lender: string | null;
  /** all in centavos */
  price: number; received: number; balance: number; loan: number;
  firstPaid: string | null; dueDate: string | null; loanReleased: boolean; cancelled: boolean; arNos: string[]; paymentCount: number;
}

export function saleMoney(s: SaleInput, balanceDays: number): SaleMoney {
  const dates = s.payments.map((p) => p.paidOn).filter((d): d is string => !!d).sort();
  const firstPaid = dates[0] ?? s.soldOn ?? null;
  const payout = s.payments.filter((p) => p.stage === "financing");
  const financed = !!s.financing || payout.length > 0;
  const received = cents(s.payments.reduce((n, p) => n + p.amount, 0));
  const price = s.agreedPrice !== null ? cents(s.agreedPrice) : 0;
  const balance = price > 0 ? Math.max(0, price - received) : 0; // a sale without a price on the sheet has no balance to chase
  return {
    id: s.id, plate: s.plate, buyer: s.buyer ?? "", carName: s.carText ?? s.plate, sales: s.sales ?? "", financed, lender: s.financing, price, received, balance,
    loan: cents(payout.reduce((n, p) => n + p.amount, 0)), firstPaid, dueDate: balance > 0 && firstPaid ? addDays(firstPaid, balanceDays) : null,
    loanReleased: payout.length > 0, cancelled: s.stage === "cancelled",
    arNos: [...new Set(s.payments.map((p) => p.arNo).filter((a): a is string => !!a))], paymentCount: s.payments.length,
  };
}

export const saleStatus = (m: SaleMoney, today: string): DealStatusKey =>
  dealStatusKey({ status: m.cancelled ? "cancelled" : "open", balance: m.balance, due_date: m.dueDate, sale_type: m.financed ? "financing" : "cash", loan_status: m.loanReleased ? "released" : m.financed ? "waiting" : "none" }, today);

/** The shape the reminder rules (status.ts) read. The id is the plate, so a reminder opens the car. */
export function notifyDealOf(m: SaleMoney): NotifyDeal {
  return {
    id: m.plate, status: m.cancelled ? "cancelled" : "open", balance: m.balance, due_date: m.dueDate, sale_type: m.financed ? "financing" : "cash",
    loan_status: m.loanReleased ? "released" : m.financed ? "waiting" : "none", buyer_name: m.buyer || "No buyer", institution: m.lender, loan_amount: m.loan / 100, lieu_amount: 0, lieu_until: null,
    loan_since: m.firstPaid, created_by: "", unit_name: m.carName,
  };
}

export const daysLate = (m: SaleMoney, today: string): number => (m.dueDate ? Math.max(0, daysBetween(m.dueDate, today)) : 0);

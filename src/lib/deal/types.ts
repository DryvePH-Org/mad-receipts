// The shapes shared by the form, the deal pages and the server.

export type SaleType = "cash" | "financing";
export type PaymentKind = "earnest" | "partial" | "full";
export type LoanStatus = "none" | "waiting" | "released";

export const KIND_LABELS: Record<PaymentKind, string> = {
  earnest: "Earnest money",
  partial: "Partial payment",
  full: "Full payment",
};

/** A proof file already uploaded to storage (a photo of the cash, a bank receipt, a screenshot). */
export interface ProofFile {
  path: string;
  filename: string;
  mime: string;
  size: number;
  /** Only in the browser, to show a thumbnail. */
  previewUrl?: string;
}

export interface UnitInput {
  makeType: string;
  plate: string;
  motor: string;
  chassis: string;
  color: string;
}

export interface MethodRow {
  type: "check" | "wallet";
  name: string;
  amount: string;
  ref: string;
  checkNo: string;
  bank: string;
  branch: string;
  proofs: ProofFile[];
}

export interface TradeInInput {
  year: string;
  unit: string;
  plate: string;
  mileage: string;
  value: string;
}

export interface NoteRow {
  text: string;
  on: boolean;
}

/** Everything staff type into the form. Money fields are peso strings exactly as typed ("720,000"). */
export interface FormState {
  receiptNo: string;
  date: string;
  receivedFrom: string;
  contact: string;
  address: string;
  kind: PaymentKind;
  units: UnitInput[];
  price: string;
  sale: SaleType;
  institution: string;
  /** Down payment and processing fee in pesos, worked out from how the staff typed them. */
  dp: string;
  fee: string;
  monthly: string;
  years: string;
  hasTi: boolean;
  ti: TradeInInput;
  hasLieu: boolean;
  lieuAmount: string;
  lieuUntil: string;
  dueMode: "date" | "text";
  dueDate: string;
  dueText: string;
  /** Pesos received on this deal before this receipt (filled in from the deal). */
  earlier: string;
  cash: string;
  cashProofs: ProofFile[];
  methods: MethodRow[];
  payout: string;
  payoutProofs: ProofFile[];
  hasRem: boolean;
  remarks: string;
  notes: NoteRow[];
}

/** Whole centavos, all of it: what the money rules work on. */
export interface MathInput {
  price: number;
  sale: SaleType;
  dp: number;
  fee: number;
  tradeIn: number;
  earlier: number;
  today: number;
  payout: number;
  lieu: number;
  monthly: number;
  years: number;
}

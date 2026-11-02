"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPeso, toCentavos } from "@/lib/rules/money";
import {
  computePayment,
  dealStatusForBalance,
  unitStatusForDeal,
  type PaymentType,
} from "@/lib/rules/payment";
import {
  normalizePlate,
  validateExtraction,
  type ReceiptFields,
  type ValidationIssue,
} from "@/lib/rules/validate";
import { cn } from "@/lib/utils";
import { lookupPlate, type OpenDeal, type PlateLookup } from "./actions";

export type FieldKey = keyof ReceiptFields;
export type FormValues = Record<FieldKey, string>;

const MONEY_FIELDS: FieldKey[] = ["amount", "agreed_price", "less_payment", "balance", "balance_amount"];
const SAVED_MONEY: FieldKey[] = ["amount", "agreed_price"]; // the others are paper-only cross-checks
// When the plate already has an open deal, these come from the deal and can't be edited here.
const DEAL_FIELDS = [
  "buyer_name",
  "buyer_address",
  "buyer_contact",
  "make_type",
  "color",
  "motor_no",
  "chassis_no",
  "agreed_price",
] as const satisfies FieldKey[];

const TYPE_LABEL: Record<PaymentType, string> = {
  earnest: "Earnest money",
  partial: "Partial payment",
  full: "Full payment",
};

interface Success {
  receiptNo: string;
  paymentType: PaymentType;
  balanceAfter: number;
  dealId: string;
  unitStatus: string;
}

function dealValues(deal: OpenDeal): Partial<FormValues> {
  const pesos = (deal.agreedPrice / 100).toFixed(2).replace(/\.00$/, "");
  return {
    buyer_name: deal.buyer_name,
    buyer_address: deal.buyer_address ?? "",
    buyer_contact: deal.buyer_contact ?? "",
    make_type: deal.make_type ?? "",
    color: deal.color ?? "",
    motor_no: deal.motor_no ?? "",
    chassis_no: deal.chassis_no ?? "",
    agreed_price: pesos,
  };
}

function toFields(values: FormValues): ReceiptFields {
  const t = (k: FieldKey) => values[k].trim() || null;
  const m = (k: FieldKey) => (values[k].trim() ? toCentavos(values[k]) : null);
  return {
    receipt_no: t("receipt_no"),
    receipt_date: t("receipt_date"),
    buyer_name: t("buyer_name"),
    buyer_address: t("buyer_address"),
    buyer_contact: t("buyer_contact"),
    amount_words: t("amount_words"),
    amount: m("amount"),
    paper_payment_type: (t("paper_payment_type") as PaymentType | null) ?? null,
    make_type: t("make_type"),
    plate_no: t("plate_no"),
    motor_no: t("motor_no"),
    chassis_no: t("chassis_no"),
    color: t("color"),
    agreed_price: m("agreed_price"),
    less_payment: m("less_payment"),
    balance: m("balance"),
    payment_method: (t("payment_method") as "cash" | "check" | null) ?? null,
    check_no: t("check_no"),
    bank_branch: t("bank_branch"),
    balance_words: t("balance_words"),
    balance_amount: m("balance_amount"),
    balance_due_date: t("balance_due_date"),
  };
}

export function ReviewForm({
  draftId,
  initialValues,
  initialReservation,
}: {
  draftId: string;
  initialValues: FormValues;
  initialReservation: boolean;
}) {
  const [values, setValues] = useState(initialValues);
  const [reservation, setReservation] = useState(initialReservation);
  const [checkedWarnings, setCheckedWarnings] = useState(false);
  const [lookup, setLookup] = useState<PlateLookup | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);

  const set = (key: FieldKey) => (value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setCheckedWarnings(false);
  };

  // Look up the plate in inventory and open deals, 500 ms after typing stops.
  const plate = normalizePlate(values.plate_no);
  useEffect(() => {
    if (!plate) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await lookupPlate(plate).catch(
        (): PlateLookup => ({ ok: false, plate, error: "Couldn't check the plate. Check your connection." }),
      );
      if (!cancelled) setLookup(result);
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [plate]);

  const current = lookup && lookup.plate === plate ? lookup : null;
  const lookupPending = !!plate && !current;
  const deal = current?.ok ? current.deal : null;
  const unit = current?.ok ? current.unit : null;

  const effective = useMemo(() => (deal ? { ...values, ...dealValues(deal) } : values), [values, deal]);
  const fields = useMemo(() => toFields(effective), [effective]);

  const agreedPrice = deal ? deal.agreedPrice : fields.agreed_price;
  const paidBefore = deal?.totalPaid ?? 0;
  const payment =
    agreedPrice !== null && agreedPrice > 0 && fields.amount !== null
      ? computePayment({
          agreedPrice,
          totalPaidBefore: paidBefore,
          amount: fields.amount,
          isFirstReceipt: deal ? deal.confirmedReceipts === 0 : true,
          markedReservation: reservation,
        })
      : undefined;

  const issues: ValidationIssue[] = useMemo(() => {
    const list = validateExtraction(fields, { payment });
    const add = (field: FieldKey, level: ValidationIssue["level"], message: string) =>
      list.push({ field, level, message });

    for (const key of MONEY_FIELDS) {
      if (effective[key].trim() && toCentavos(effective[key]) === null) {
        add(key, SAVED_MONEY.includes(key) ? "error" : "warning", "Not a valid amount. Use numbers only, e.g. 50000.");
      }
    }
    if (fields.receipt_no && !/^[A-Za-z0-9-]{1,20}$/.test(fields.receipt_no)) {
      add("receipt_no", "error", "Use letters and numbers only, e.g. 2556.");
    }
    if (!deal) {
      if (!fields.buyer_name) add("buyer_name", "error", "Buyer's name is missing.");
      if (fields.agreed_price === null && !effective.agreed_price.trim()) {
        add("agreed_price", "error", "Agreed price is missing.");
      }
    }
    if (current && !current.ok) add("plate_no", "error", current.error);
    if (current?.ok && plate && !unit) {
      add(
        "plate_no",
        "error",
        "Plate not found in the inventory sheet. Check the plate, or add the unit to the sheet first.",
      );
    }
    if (unit && !deal && unit.status.toLowerCase() === "sold") {
      add("plate_no", "warning", "Unit is already marked Sold in inventory.");
    }
    return list;
  }, [fields, effective, payment, deal, unit, current, plate]);

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const byField = (key: FieldKey) => issues.filter((i) => i.field === key);
  const canConfirm =
    errors.length === 0 && !lookupPending && (warnings.length === 0 || checkedWarnings) && !submitting;

  async function confirm() {
    setSubmitting(true);
    setSubmitError(null);
    const f = fields;
    const res = await fetch("/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftId,
        markedReservation: reservation,
        fields: {
          receipt_no: f.receipt_no,
          receipt_date: f.receipt_date,
          buyer_name: f.buyer_name,
          buyer_address: f.buyer_address,
          buyer_contact: f.buyer_contact,
          amount_words: f.amount_words,
          amount: f.amount,
          paper_payment_type: f.paper_payment_type,
          make_type: f.make_type,
          plate_no: f.plate_no,
          motor_no: f.motor_no,
          chassis_no: f.chassis_no,
          color: f.color,
          agreed_price: agreedPrice,
          payment_method: f.payment_method,
          check_no: f.payment_method === "check" ? f.check_no : null,
          bank_branch: f.payment_method === "check" ? f.bank_branch : null,
          balance_words: f.balance_words,
          balance_due_date: f.balance_due_date,
        },
      }),
    }).catch(() => null);

    const body = res ? await res.json().catch(() => null) : null;
    if (!res || !res.ok) {
      setSubmitError(body?.error ?? "Couldn't reach the server. Check your connection and try again.");
      setSubmitting(false);
      return;
    }
    setSuccess(body);
    window.scrollTo({ top: 0 });
  }

  if (success) return <SuccessCard success={success} />;

  const field = (key: FieldKey, label: string, opts: FieldOptions = {}) => (
    <Field
      key={key}
      id={key}
      label={label}
      value={effective[key]}
      onChange={set(key)}
      issues={byField(key)}
      locked={!!deal && (DEAL_FIELDS as readonly FieldKey[]).includes(key)}
      {...opts}
    />
  );

  return (
    <div className="space-y-4">
      <Section title="Receipt">
        {field("receipt_no", "Receipt No.", { required: true, inputMode: "numeric" })}
        {field("receipt_date", "Date", { type: "date" })}
      </Section>

      <Section title="Vehicle">
        {field("plate_no", "Plate No.", { required: true, autoCapitalize: "characters" })}
        <PlateStatus pending={lookupPending} deal={deal} unit={unit} plate={plate} />
        {field("make_type", "Make / Type")}
        {field("color", "Color")}
        {field("motor_no", "Motor No. (optional)")}
        {field("chassis_no", "Chassis No. (optional)")}
      </Section>

      <Section title="Buyer">
        {field("buyer_name", "Received from", { required: !deal })}
        {field("buyer_address", "Postal address")}
        {field("buyer_contact", "Contact No.", { type: "tel", inputMode: "tel" })}
      </Section>

      <Section title="Payment">
        {field("amount", "Amount (₱)", { required: true, inputMode: "decimal" })}
        {field("amount_words", "Amount in words")}
        <SelectField
          id="paper_payment_type"
          label="Marked on paper"
          value={values.paper_payment_type}
          onChange={set("paper_payment_type")}
          options={[
            ["", "Not marked"],
            ["earnest", "Earnest money"],
            ["partial", "Partial payment"],
            ["full", "Full payment"],
          ]}
          issues={byField("paper_payment_type")}
        />
        <label className="flex min-h-12 items-center gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            checked={reservation}
            onChange={(e) => {
              setReservation(e.target.checked);
              setCheckedWarnings(false);
            }}
            className="size-5 accent-primary"
          />
          <span className="text-sm font-medium">This is a reservation (earnest money)</span>
        </label>
        <SelectField
          id="payment_method"
          label="Paid by"
          value={values.payment_method}
          onChange={set("payment_method")}
          options={[
            ["", "Not marked"],
            ["cash", "Cash"],
            ["check", "Check"],
          ]}
          issues={byField("payment_method")}
        />
        {values.payment_method === "check" && (
          <>
            {field("check_no", "Check No.")}
            {field("bank_branch", "Bank / Branch")}
          </>
        )}
      </Section>

      <Section title="Balance">
        {field("agreed_price", "Agreed price (₱)", { required: !deal, inputMode: "decimal" })}
        {field("less_payment", "Less payment on paper (₱)", { inputMode: "decimal" })}
        {field("balance", "Balance on paper (₱)", { inputMode: "decimal" })}
        {field("balance_words", "Balance in words")}
        {field("balance_amount", "Balance amount in (P ____) (₱)", { inputMode: "decimal" })}
        {field("balance_due_date", "Balance due on or before", { type: "date" })}
      </Section>

      <SummaryCard
        agreedPrice={agreedPrice}
        paidBefore={paidBefore}
        amount={fields.amount}
        balanceAfter={payment && !payment.error ? payment.balanceAfter : null}
        paymentType={payment?.paymentType ?? null}
      />

      <div className="space-y-3 pb-4">
        {errors.length > 0 && (
          <p className="text-sm text-destructive">
            Fix {errors.length === 1 ? "1 problem" : `${errors.length} problems`} marked in red to confirm.
          </p>
        )}
        {errors.length === 0 && warnings.length > 0 && (
          <label className="flex min-h-12 items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
            <input
              type="checkbox"
              checked={checkedWarnings}
              onChange={(e) => setCheckedWarnings(e.target.checked)}
              className="mt-0.5 size-5 accent-primary"
            />
            <span className="text-sm">
              I checked the {warnings.length === 1 ? "warning" : `${warnings.length} warnings`} marked in yellow
              against the paper.
            </span>
          </label>
        )}
        {submitError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {submitError}
          </p>
        )}
        <Button onClick={confirm} disabled={!canConfirm} className="h-14 w-full text-base">
          {submitting ? (
            <>
              <Loader2 className="size-5 animate-spin" /> Saving…
            </>
          ) : lookupPending ? (
            "Checking plate…"
          ) : (
            "Confirm receipt"
          )}
        </Button>
      </div>
    </div>
  );
}

// ---- Pieces ----

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

interface FieldOptions {
  required?: boolean;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoCapitalize?: string;
}

function Field({
  id,
  label,
  value,
  onChange,
  issues,
  locked,
  required,
  type = "text",
  inputMode,
  autoCapitalize,
}: FieldOptions & {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  issues: ValidationIssue[];
  locked: boolean;
}) {
  const hasError = issues.some((i) => i.level === "error") || (required && !value.trim());
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
        {locked && <span className="text-xs font-normal text-muted-foreground"> · from the existing deal</span>}
      </Label>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={locked}
        aria-invalid={hasError || undefined}
        className={cn(
          "h-12 text-base",
          locked && "bg-muted text-muted-foreground",
          !hasError && issues.some((i) => i.level === "warning") && "border-amber-400",
        )}
      />
      <IssueList issues={issues} />
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  issues,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  issues: ValidationIssue[];
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-12 w-full rounded-lg border border-input bg-transparent px-3 text-base",
          issues.some((i) => i.level === "warning") && "border-amber-400",
        )}
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
      <IssueList issues={issues} />
    </div>
  );
}

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-1">
      {issues.map((issue, i) => (
        <li
          key={i}
          className={cn(
            "text-sm",
            issue.level === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400",
          )}
        >
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

function PlateStatus({
  pending,
  deal,
  unit,
  plate,
}: {
  pending: boolean;
  deal: OpenDeal | null;
  unit: { makeType?: string; color?: string; status: string } | null;
  plate: string;
}) {
  if (!plate) return null;
  if (pending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Checking {plate}…
      </p>
    );
  }
  return (
    <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
      {unit && (
        <p>
          Unit found: {[unit.makeType, unit.color].filter(Boolean).join(", ") || plate}, status{" "}
          <strong>{unit.status}</strong>
        </p>
      )}
      {deal ? (
        <p>
          <Badge className="mr-1">Adding to existing deal</Badge> {deal.buyer_name} · paid {formatPeso(deal.totalPaid)}{" "}
          of {formatPeso(deal.agreedPrice)}
        </p>
      ) : (
        unit && <Badge variant="secondary">New deal</Badge>
      )}
    </div>
  );
}

function SummaryCard({
  agreedPrice,
  paidBefore,
  amount,
  balanceAfter,
  paymentType,
}: {
  agreedPrice: number | null;
  paidBefore: number;
  amount: number | null;
  balanceAfter: number | null;
  paymentType: PaymentType | null;
}) {
  const peso = (v: number | null) => (v === null ? "—" : formatPeso(v));
  const rows: [string, string][] = [
    ["Agreed price", peso(agreedPrice)],
    ["Paid so far", peso(paidBefore)],
    ["This payment", peso(amount)],
    ["New balance", peso(balanceAfter)],
    ["Computed type", paymentType ? TYPE_LABEL[paymentType] : "—"],
    ["Unit will be", balanceAfter === null ? "—" : unitStatusForDeal(dealStatusForBalance(balanceAfter))],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function SuccessCard({ success }: { success: Success }) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6 text-center">
        <CheckCircle2 className="mx-auto size-12 text-green-600" />
        <div>
          <p className="text-lg font-semibold">Receipt No. {success.receiptNo} saved</p>
          <p className="text-sm text-muted-foreground">Drive, Sheets and Telegram will update in the background.</p>
        </div>
        <dl className="grid grid-cols-2 gap-y-2 text-left text-sm">
          <dt className="text-muted-foreground">Type</dt>
          <dd className="text-right font-medium">{TYPE_LABEL[success.paymentType]}</dd>
          <dt className="text-muted-foreground">New balance</dt>
          <dd className="text-right font-medium">{formatPeso(success.balanceAfter)}</dd>
          <dt className="text-muted-foreground">Unit status</dt>
          <dd className="text-right font-medium">{success.unitStatus}</dd>
        </dl>
        <div className="grid grid-cols-2 gap-3">
          <Button render={<Link href="/upload" />} nativeButton={false} className="h-14 text-base">
            Upload another
          </Button>
          <Button
            render={<Link href={`/deals/${success.dealId}`} />}
            nativeButton={false}
            variant="outline"
            className="h-14 text-base"
          >
            View deal
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

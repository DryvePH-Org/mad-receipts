"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { SalespeopleSection, type SalespersonOption } from "@/components/salespeople-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import {
  FIELD_KEYS,
  mergeVoice,
  toFormValues,
  type Conflict,
  type FormValues,
  type Sources,
} from "@/lib/extraction/merge";
import type { VoiceResult } from "@/lib/extraction/voice-schema";
import { manilaToday } from "@/lib/dates";
import { formatPeso, fromCentavos, toCentavos } from "@/lib/rules/money";
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
import {
  filledRows,
  rowsFromDeal,
  rowsFromVoice,
  toPayload,
  validateRows,
  type SalesRow,
} from "@/lib/salespeople/rows";
import {
  amountDue,
  describeTerms,
  EMPTY_TERMS,
  parseTerms,
  termsPayload,
  validateTerms,
  type Terms,
  type TermsValues,
} from "@/lib/rules/terms";
import type { Uncertain } from "@/lib/extraction/crosscheck";
import type { TermsSuggestion } from "@/lib/extraction/terms-schema";
import { cn } from "@/lib/utils";
import { SaleTypeSection } from "@/components/sale-type-section";
import { lookupPlate, type OpenDeal, type PlateLookup } from "./actions";
import { VoicePanel } from "./voice-panel";

export type FieldKey = keyof ReceiptFields;
export type { FormValues };

/** Names shown when the photo and the voice disagree. */
const FIELD_LABELS: Record<FieldKey, string> = {
  receipt_no: "Receipt No.",
  receipt_date: "Date",
  buyer_name: "Received from",
  buyer_address: "Postal address",
  buyer_contact: "Contact No.",
  amount_words: "Amount in words",
  amount: "Amount",
  paper_payment_type: "Marked on paper",
  make_type: "Make / Type",
  plate_no: "Plate No.",
  motor_no: "Motor No.",
  chassis_no: "Chassis No.",
  color: "Color",
  agreed_price: "Agreed price",
  less_payment: "Less payment",
  balance: "Balance",
  payment_method: "Paid by",
  check_no: "Check No.",
  bank_branch: "Bank / Branch",
  balance_words: "Balance in words",
  balance_amount: "Balance amount",
  balance_due_date: "Balance due on or before",
};

const SOURCE_LABEL = { photo: "Photo", voice: "Voice", typed: "You" } as const;

/** The form's starting point: the photo's values, with a saved voice note applied on top. */
function startState(photo: FormValues, voice: VoiceResult | null) {
  const sources: Sources = {};
  for (const key of FIELD_KEYS) if (photo[key].trim()) sources[key] = "photo";
  if (!voice) return { values: photo, sources, conflicts: [] as Conflict[], rows: null as SalesRow[] | null };

  const merge = mergeVoice(photo, sources, voice.fields);
  return {
    values: { ...photo, ...merge.values },
    sources: { ...sources, ...merge.sources },
    conflicts: merge.conflicts,
    rows: voice.salespeople.length > 0 ? rowsFromVoice(voice.salespeople) : null,
  };
}

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

type TermsTags = Partial<Record<keyof TermsValues, string>>;

const pesosText = (n: number | null) => (n === null || n === 0 ? "" : String(n));

/** Starting terms: the photo's suggestion first, then anything said in a voice note on top of it. */
function termsFromSuggestions(photo: TermsSuggestion | null, voice: TermsSuggestion | null): { values: TermsValues; tags: TermsTags } {
  const values: TermsValues = { ...EMPTY_TERMS };
  const tags: TermsTags = {};
  const apply = (s: TermsSuggestion | null, from: string) => {
    if (!s) return;
    const set = (key: keyof TermsValues, value: string | null) => {
      if (value) {
        values[key] = value as never;
        tags[key] = from;
      }
    };
    set("type", s.transaction_type);
    set("loan", pesosText(s.loan_amount));
    set("fee", pesosText(s.processing_fee));
    set("financier", s.financier);
    set("tradeIn", pesosText(s.trade_in_value));
    set("tradeInDetails", s.trade_in_details);
    set("paidBefore", pesosText(s.paid_before));
  };
  apply(photo, "from the photo");
  apply(voice, "from your voice note");
  return { values, tags };
}

/** The terms of a saved deal, as form text. */
function termsFromDeal(deal: OpenDeal): TermsValues {
  const t = deal.terms;
  const pesos = (c: number) => (c === 0 ? "" : String(c / 100));
  return { type: t.type, loan: pesos(t.loan), fee: pesos(t.fee), financier: t.financier, tradeIn: pesos(t.tradeIn), tradeInDetails: t.tradeInDetails, paidBefore: "" };
}

const sameTerms = (a: Terms, deal: OpenDeal) =>
  a.type === deal.terms.type &&
  a.loan === deal.terms.loan &&
  a.fee === deal.terms.fee &&
  a.tradeIn === deal.terms.tradeIn &&
  (a.financier ?? "") === deal.terms.financier &&
  (a.tradeInDetails ?? "") === deal.terms.tradeInDetails;

export function ReviewForm({
  draftId,
  initialValues,
  initialReservation,
  initialTerms,
  uncertain,
  salespeople,
  initialVoice,
}: {
  draftId: string;
  initialValues: FormValues;
  initialReservation: boolean;
  /** How the photo suggests the sale is paid (financing, trade-in, money paid earlier). */
  initialTerms: TermsSuggestion | null;
  /** Fields the two photo readings disagreed on: blank, with both readings to choose from. */
  uncertain: Uncertain;
  salespeople: SalespersonOption[];
  initialVoice: VoiceResult | null;
}) {
  const [start] = useState(() => startState(initialValues, initialVoice));
  const [values, setValues] = useState(start.values);
  const [sources, setSources] = useState<Sources>(start.sources);
  const [conflicts, setConflicts] = useState<Conflict[]>(start.conflicts);
  const [rows, setRows] = useState<SalesRow[] | null>(start.rows); // null: nobody has changed them
  const [heard, setHeard] = useState<VoiceResult | null>(initialVoice);
  const [reservation, setReservation] = useState(initialReservation);
  const [checkedWarnings, setCheckedWarnings] = useState(false);
  const [lookup, setLookup] = useState<PlateLookup | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);

  // How the sale is paid. Starts from the photo and the voice note; a saved deal's terms take over when found.
  const [startTerms] = useState(() => termsFromSuggestions(initialTerms, initialVoice?.terms ?? null));
  const [terms, setTerms] = useState<TermsValues>(startTerms.values);
  const [termsTags, setTermsTags] = useState<TermsTags>(startTerms.tags);
  const [termsTyped, setTermsTyped] = useState<Set<keyof TermsValues>>(new Set());
  const changeTerms = (patch: Partial<TermsValues>) => {
    setTerms((t) => ({ ...t, ...patch }));
    setTermsTags((tags) => Object.fromEntries(Object.entries(tags).filter(([k]) => !(k in patch))));
    setTermsTyped((typed) => new Set([...typed, ...(Object.keys(patch) as (keyof TermsValues)[])]));
    setCheckedWarnings(false);
  };

  // Typing always wins over the photo and the voice, and settles any disagreement about the field.
  const set = (key: FieldKey) => (value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setSources((src) => ({ ...src, [key]: "typed" }));
    setConflicts((list) => list.filter((c) => c.field !== key));
    setCheckedWarnings(false);
  };

  function applyVoice(result: VoiceResult) {
    const merge = mergeVoice(values, sources, result.fields);
    const mentioned = new Set(FIELD_KEYS.filter((k) => toFormValues(result.fields)[k].trim()));
    setValues((v) => ({ ...v, ...merge.values }));
    setSources((src) => ({ ...src, ...merge.sources }));
    // A new note replaces earlier disagreements about the fields it mentions; the rest stay.
    setConflicts((list) => [...list.filter((c) => !mentioned.has(c.field)), ...merge.conflicts]);
    if (result.salespeople.length > 0) setRows(rowsFromVoice(result.salespeople));
    if (result.terms) {
      // What was said fills the terms, except anything staff already typed.
      const said = termsFromSuggestions(null, result.terms);
      const free = (Object.keys(said.values) as (keyof TermsValues)[]).filter((k) => said.tags[k] && !termsTyped.has(k));
      setTerms((t) => ({ ...t, ...Object.fromEntries(free.map((k) => [k, said.values[k]])) }));
      setTermsTags((tags) => ({ ...tags, ...Object.fromEntries(free.map((k) => [k, said.tags[k]])) }));
    }
    setHeard(result);
    setCheckedWarnings(false);
  }

  function resolveConflict(field: FieldKey, useVoice: boolean) {
    const conflict = conflicts.find((c) => c.field === field);
    if (!conflict) return;
    if (useVoice) setValues((v) => ({ ...v, [field]: conflict.voice }));
    setSources((src) => ({ ...src, [field]: "typed" })); // staff decided
    setConflicts((list) => list.filter((c) => c.field !== field));
    setCheckedWarnings(false);
  }

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

  // A saved deal knows how it is paid: show that, unless staff already changed the terms here.
  // (Set while rendering, once per deal found, instead of in an effect.)
  const [shownDealId, setShownDealId] = useState<string | null>(null);
  if (deal && deal.id !== shownDealId && termsTyped.size === 0) {
    setShownDealId(deal.id);
    setTerms(termsFromDeal(deal));
    setTermsTags({});
  }
  const termsType = terms.type;

  const effective = useMemo(() => (deal ? { ...values, ...dealValues(deal) } : values), [values, deal]);
  const fields = useMemo(() => toFields(effective), [effective]);

  const agreedPrice = deal ? deal.agreedPrice : fields.agreed_price;
  const { terms: parsedTerms, unreadable } = parseTerms(terms, agreedPrice ?? 0);
  const due = agreedPrice !== null && agreedPrice > 0 ? amountDue(parsedTerms) : null;
  const paidBefore = deal ? deal.totalPaid : parsedTerms.paidBefore;
  const payment =
    due !== null && due > 0 && fields.amount !== null
      ? computePayment({
          amountDue: due,
          totalPaidBefore: paidBefore,
          amount: fields.amount,
          isFirstReceipt: deal ? deal.confirmedReceipts === 0 : true,
          markedReservation: reservation,
        })
      : undefined;

  // (Recomputed each render: it is cheap, and the React Compiler memoizes it.)
  const issues: ValidationIssue[] = (() => {
    const list = validateExtraction(fields, { payment, today: manilaToday(), termsType });
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
  })();

  // Fields that come from the existing deal can't disagree: the deal's values are used.
  const openConflicts = conflicts.filter((c) => !(deal && (DEAL_FIELDS as readonly FieldKey[]).includes(c.field)));

  // Who sold the car: the deal's saved salespeople until staff or the voice note change them.
  const salesRows = rows ?? (deal ? rowsFromDeal(deal.salespeople) : []);
  const completingSale = !!payment && !payment.error && payment.balanceAfter === 0;
  const names = useMemo(() => {
    const map = new Map(salespeople.map((p) => [p.id, p.name]));
    for (const p of deal?.salespeople ?? []) if (!map.has(p.salespersonId)) map.set(p.salespersonId, p.name);
    return map;
  }, [salespeople, deal]);
  const salesErrors = validateRows(salesRows, { active: salespeople, names }, completingSale);

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const byField = (key: FieldKey) => issues.filter((i) => i.field === key);
  const termIssues = validateTerms(parsedTerms, unreadable);
  const termErrors = termIssues.filter((i) => i.level === "error");
  const warningCount = warnings.length + termIssues.filter((i) => i.level === "warning").length;
  const problemCount = errors.length + openConflicts.length + salesErrors.length + termErrors.length;
  const canConfirm =
    problemCount === 0 && !lookupPending && (warningCount === 0 || checkedWarnings) && !submitting;

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
        // How the sale is paid. paid_before only matters for a new deal.
        terms: { ...termsPayload(parsedTerms), ...(deal ? {} : { paid_before: fromCentavos(parsedTerms.paidBefore) }) },
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
        // Only when someone changed them: otherwise the deal keeps its salespeople as saved.
        ...(rows !== null && filledRows(rows).length > 0 ? { salespeople: toPayload(rows) } : {}),
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
      tag={sources[key] === "voice" ? "from voice note" : undefined}
      choices={!effective[key].trim() ? uncertain[key] : undefined}
      onPick={set(key)}
      {...opts}
    />
  );

  return (
    <div className="space-y-6">
      <VoicePanel draftId={draftId} last={heard} onResult={applyVoice} />

      {openConflicts.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>The photo and the voice disagree</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Check the paper, then tap the right one for each.</p>
            {openConflicts.map((c) => (
              <div key={c.field} className="space-y-2">
                <p className="text-sm font-medium">{FIELD_LABELS[c.field]}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={() => resolveConflict(c.field, false)} className="h-auto min-h-14 flex-col gap-0.5 py-2 whitespace-normal md:h-auto">
                    <span className="text-xs font-normal text-muted-foreground">{SOURCE_LABEL[c.currentSource]}</span>
                    <span className="break-all">{c.current}</span>
                  </Button>
                  <Button type="button" variant="outline" onClick={() => resolveConflict(c.field, true)} className="h-auto min-h-14 flex-col gap-0.5 py-2 whitespace-normal md:h-auto">
                    <span className="text-xs font-normal text-muted-foreground">Voice</span>
                    <span className="break-all">{c.voice}</span>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
        {field("buyer_name", "Received from", { required: !deal, wide: true })}
        {field("buyer_address", "Postal address", { wide: true })}
        {field("buyer_contact", "Contact No.", { type: "tel", inputMode: "tel" })}
      </Section>

      <SaleTypeSection
        terms={terms}
        onChange={changeTerms}
        price={agreedPrice ?? 0}
        priceField={field("agreed_price", "Agreed price (₱)", { required: !deal, inputMode: "decimal" })}
        issues={termIssues}
        isNewDeal={!deal}
        tags={termsTags}
        changingDeal={!!deal && !sameTerms(parsedTerms, deal)}
      />

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
        <label className="flex min-h-12 items-center gap-3 rounded-lg border p-3 sm:col-span-2">
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

      <SalespeopleSection
        rows={salesRows}
        options={salespeople}
        names={names}
        required={completingSale}
        errors={salesErrors}
        onChange={(next) => {
          setRows(next);
          setCheckedWarnings(false);
        }}
      />

      <Section title="Balance on the paper (for checking)">
        {field("less_payment", "Less payment on paper (₱)", { inputMode: "decimal" })}
        {field("balance", "Balance on paper (₱)", { inputMode: "decimal" })}
        {field("balance_words", "Balance in words", { wide: true })}
        {field("balance_amount", "Balance amount in (P ____) (₱)", { inputMode: "decimal" })}
        {field("balance_due_date", "Balance due on or before", { type: "date" })}
      </Section>

      <SummaryCard
        agreedPrice={agreedPrice}
        terms={parsedTerms}
        due={due}
        isNewDeal={!deal}
        paidBefore={paidBefore}
        amount={fields.amount}
        balanceAfter={payment && !payment.error ? payment.balanceAfter : null}
        paymentType={payment?.paymentType ?? null}
      />

      <div className="space-y-3 pb-4">
        {problemCount > 0 && (
          <p className="text-sm text-destructive">
            Fix {problemCount === 1 ? "1 problem" : `${problemCount} problems`} marked in red to confirm.
          </p>
        )}
        {problemCount === 0 && warningCount > 0 && (
          <label className="flex min-h-12 items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
            <input
              type="checkbox"
              checked={checkedWarnings}
              onChange={(e) => setCheckedWarnings(e.target.checked)}
              className="mt-0.5 size-5 accent-primary"
            />
            <span className="text-sm">
              I checked the {warningCount === 1 ? "warning" : `${warningCount} warnings`} marked in yellow
              against the paper.
            </span>
          </label>
        )}
        {submitError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {submitError}
          </p>
        )}
        <div className="sm:flex sm:justify-end">
        <Button onClick={confirm} disabled={!canConfirm} size="lg" className="w-full sm:w-auto sm:min-w-56">
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
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

interface FieldOptions {
  /** Spans both columns from sm up. */
  wide?: boolean;
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
  tag,
  wide,
  required,
  type = "text",
  inputMode,
  autoCapitalize,
  choices,
  onPick,
}: FieldOptions & {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  issues: ValidationIssue[];
  locked: boolean;
  tag?: string;
  /** The AI read this two different ways: both are offered, and the field stays blank until one is picked or typed. */
  choices?: string[];
  onPick?: (v: string) => void;
}) {
  const hasError = issues.some((i) => i.level === "error") || (required && !value.trim());
  return (
    <div className={cn("space-y-1.5", wide && "sm:col-span-2")}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
        {locked && <span className="text-xs font-normal text-muted-foreground"> · from the existing deal</span>}
        {tag && !locked && <span className="text-xs font-normal text-primary"> · {tag}</span>}
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
          locked && "bg-muted text-muted-foreground",
          !hasError && issues.some((i) => i.level === "warning") && "border-amber-400",
        )}
      />
      {choices && choices.length > 0 && !locked && (
        <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2 dark:border-amber-500/40 dark:bg-amber-950/30">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            The AI wasn&apos;t sure how to read this. Check the paper, then tap the right one or type it.
          </p>
          <div className="flex flex-wrap gap-2">
            {choices.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => onPick?.(choice)}
                className="min-h-10 rounded-lg border bg-background px-3 text-sm font-medium break-all hover:bg-muted"
              >
                {choice}
              </button>
            ))}
          </div>
        </div>
      )}
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
      <NativeSelect
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(issues.some((i) => i.level === "warning") && "border-amber-400")}
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </NativeSelect>
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
  unit: { makeType?: string; color?: string; status: string; remarks?: string } | null;
  plate: string;
}) {
  if (!plate) return null;
  if (pending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
        <Loader2 className="size-4 animate-spin" /> Checking {plate}…
      </p>
    );
  }
  return (
    <div className="space-y-2 rounded-lg bg-muted p-3 text-sm sm:col-span-2">
      {unit && (
        <p>
          Unit found: {[unit.makeType, unit.color].filter(Boolean).join(", ") || plate}, status{" "}
          <strong>{unit.status}</strong>
          {unit.remarks && <span className="block text-muted-foreground">Sheet note: {unit.remarks}</span>}
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
  terms,
  due,
  isNewDeal,
  paidBefore,
  amount,
  balanceAfter,
  paymentType,
}: {
  agreedPrice: number | null;
  terms: Terms;
  due: number | null;
  isNewDeal: boolean;
  paidBefore: number;
  amount: number | null;
  balanceAfter: number | null;
  paymentType: PaymentType | null;
}) {
  const peso = (v: number | null) => (v === null ? "—" : formatPeso(v));
  const rows: [string, string][] = [["Agreed price", peso(agreedPrice)]];
  if (terms.type === "trade_in") rows.push(["Trade-in credit", `− ${peso(terms.tradeIn)}`]);
  if (terms.type === "financing") {
    rows.push([`Paid by ${terms.financier ?? "the financing company"}`, `− ${peso(terms.loan)}`]);
    if (terms.fee > 0) rows.push(["Processing fee", `+ ${peso(terms.fee)}`]);
  }
  rows.push(
    ["Buyer owes MAD", peso(due)],
    [isNewDeal ? "Paid before this receipt" : "Paid so far", peso(paidBefore)],
    ["This payment", peso(amount)],
    ["New balance", peso(balanceAfter)],
    ["Computed type", paymentType ? TYPE_LABEL[paymentType] : "—"],
    ["Unit will be", balanceAfter === null ? "—" : unitStatusForDeal(dealStatusForBalance(balanceAfter))],
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
        <p className="text-sm text-muted-foreground">{describeTerms(terms)}</p>
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
          <Button render={<Link href="/upload" />} nativeButton={false} size="lg">
            Upload another
          </Button>
          <Button
            render={<Link href={`/deals/${success.dealId}`} />}
            nativeButton={false}
            variant="outline"
            size="lg"
          >
            View deal
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

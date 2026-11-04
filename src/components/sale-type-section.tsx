"use client";

import { Banknote, Landmark, Repeat } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toCentavos } from "@/lib/rules/money";
import { TYPE_LABELS, type TermsIssue, type TermsValues, type TransactionType } from "@/lib/rules/terms";
import { cn } from "@/lib/utils";

const ICONS = { cash: Banknote, financing: Landmark, trade_in: Repeat } as const;
const HINTS: Record<TransactionType, string> = {
  cash: "The buyer pays the whole price.",
  financing: "A bank or financing company pays the loan. The buyer pays the down payment and the processing fee.",
  trade_in: "The buyer hands in a car and pays the rest.",
};

interface Props {
  terms: TermsValues;
  onChange: (patch: Partial<TermsValues>) => void;
  /** The agreed price in centavos (0 when not known yet). */
  price: number;
  /** The agreed price field, so price and sale type sit together. */
  priceField: React.ReactNode;
  issues: TermsIssue[];
  /** A new deal can have money received before this receipt; an existing deal already knows its total. */
  isNewDeal: boolean;
  /** Where a value came from, e.g. { loan: "from the photo" }. */
  tags: Partial<Record<keyof TermsValues, string>>;
  /** Shown when the saved deal's terms are being changed. */
  changingDeal: boolean;
}

/** Cash, financing or trade-in: pick one and only its fields appear. */
export function SaleTypeSection({ terms, onChange, price, priceField, issues, isNewDeal, tags, changingDeal }: Props) {
  const issuesFor = (field: keyof TermsValues) => issues.filter((i) => i.field === field);

  // Down payment and loan always add up to the price: typing one fills the other.
  const loanC = terms.loan.trim() ? toCentavos(terms.loan) : null;
  const down = price > 0 && loanC !== null && loanC <= price ? String((price - loanC) / 100) : "";
  const setDown = (text: string) => {
    const downC = toCentavos(text);
    if (price > 0 && downC !== null && downC <= price) onChange({ loan: String((price - downC) / 100) });
    else if (!text.trim()) onChange({ loan: "" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Price and how it is paid</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {priceField}

        <div className="space-y-2 sm:col-span-2">
          <Label id="sale-type-label">How is it paid?</Label>
          <div role="radiogroup" aria-labelledby="sale-type-label" className="grid grid-cols-3 gap-2">
            {(Object.keys(TYPE_LABELS) as TransactionType[]).map((type) => {
              const Icon = ICONS[type];
              const selected = terms.type === type;
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onChange({ type })}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    selected ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {TYPE_LABELS[type]}
                </button>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">{HINTS[terms.type]}</p>
          {changingDeal && (
            <p className="text-sm text-amber-700 dark:text-amber-400">This changes how the saved deal is paid when you confirm.</p>
          )}
        </div>

        {terms.type === "financing" && (
          <>
            <Money id="terms-loan" label="Loan amount (₱)" value={terms.loan} onChange={(loan) => onChange({ loan })} issues={issuesFor("loan")} tag={tags.loan} required />
            <Money id="terms-down" label="Down payment (₱)" value={down} onChange={setDown} issues={[]} hint={price > 0 ? "Price minus the loan." : "Enter the agreed price first."} />
            <Money id="terms-fee" label="Processing fee (₱)" value={terms.fee} onChange={(fee) => onChange({ fee })} issues={issuesFor("fee")} tag={tags.fee} />
            <Text id="terms-financier" label="Financing company" value={terms.financier} onChange={(financier) => onChange({ financier })} issues={issuesFor("financier")} tag={tags.financier} placeholder="BPI, GDFI…" />
          </>
        )}

        {terms.type === "trade_in" && (
          <>
            <Money id="terms-trade" label="Value of the traded car (₱)" value={terms.tradeIn} onChange={(tradeIn) => onChange({ tradeIn })} issues={issuesFor("tradeIn")} tag={tags.tradeIn} required />
            <Text id="terms-trade-details" label="Traded car" value={terms.tradeInDetails} onChange={(tradeInDetails) => onChange({ tradeInDetails })} issues={issuesFor("tradeInDetails")} tag={tags.tradeInDetails} placeholder="2015 Toyota Vios, silver" wide />
          </>
        )}

        {isNewDeal && (
          <Money
            id="terms-paid-before"
            label="Paid before this receipt (₱)"
            value={terms.paidBefore}
            onChange={(paidBefore) => onChange({ paidBefore })}
            issues={issuesFor("paidBefore")}
            tag={tags.paidBefore}
            hint="Money the buyer already paid, for example a reservation from before this app. Leave empty if none."
            wide
          />
        )}
      </CardContent>
    </Card>
  );
}

function Money({ id, label, value, onChange, issues, tag, hint, required, wide }: {
  id: string; label: string; value: string; onChange: (v: string) => void; issues: TermsIssue[]; tag?: string; hint?: string; required?: boolean; wide?: boolean;
}) {
  return (
    <FieldShell id={id} label={label} issues={issues} tag={tag} hint={hint} required={required} wide={wide}>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" autoComplete="off" aria-invalid={issues.some((i) => i.level === "error") || undefined} className={cn(issues.some((i) => i.level === "warning") && "border-amber-400")} />
    </FieldShell>
  );
}

function Text({ id, label, value, onChange, issues, tag, placeholder, wide }: {
  id: string; label: string; value: string; onChange: (v: string) => void; issues: TermsIssue[]; tag?: string; placeholder?: string; wide?: boolean;
}) {
  return (
    <FieldShell id={id} label={label} issues={issues} tag={tag} wide={wide}>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" maxLength={200} className={cn(issues.some((i) => i.level === "warning") && "border-amber-400")} />
    </FieldShell>
  );
}

function FieldShell({ id, label, issues, tag, hint, required, wide, children }: {
  id: string; label: string; issues: TermsIssue[]; tag?: string; hint?: string; required?: boolean; wide?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", wide && "sm:col-span-2")}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
        {tag && <span className="text-xs font-normal text-primary"> · {tag}</span>}
      </Label>
      {children}
      {hint && issues.length === 0 && <p className="text-xs text-muted-foreground">{hint}</p>}
      <ul className="space-y-1">
        {issues.map((issue, i) => (
          <li key={i} className={cn("text-sm", issue.level === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400")}>
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

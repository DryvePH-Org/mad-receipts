"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Save } from "lucide-react";
import { toast } from "sonner";

import { recordCashCount } from "@/lib/pcf/actions/cash-count";
import { MoneyText } from "@/components/pcf/shared/money-text";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { parseMoney } from "@/lib/pcf/money";
import { cn } from "@/lib/utils";
import {
  cashCountSchema,
  type CashCountValues,
} from "@/lib/pcf/validators/cash-count";

export type CashCountFund = {
  id: string;
  name: string;
  expected_cash: number;
};

export function CashCountForm({ funds }: { funds: CashCountFund[] }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<CashCountValues>({
    resolver: zodResolver(cashCountSchema),
    defaultValues: {
      fund_id: funds[0]?.id ?? "",
      counted: "",
      note: "",
    },
  });

  const errors = form.formState.errors;
  const fundId = useWatch({ control: form.control, name: "fund_id" });
  const counted = useWatch({ control: form.control, name: "counted" });

  const selectedFund = funds.find((fund) => fund.id === fundId);
  const expectedCents = Math.round((selectedFund?.expected_cash ?? 0) * 100);
  const countedCents = parseMoney(counted ?? "");
  const varianceCents =
    countedCents === null ? null : countedCents - expectedCents;
  const hasVariance = varianceCents !== null && varianceCents !== 0;
  const fundItems = funds.map((fund) => ({
    value: fund.id,
    label: fund.name,
  }));

  async function submit(values: CashCountValues) {
    setServerError(null);

    const centavos = parseMoney(values.counted);
    if (centavos !== null && centavos !== expectedCents && !values.note.trim()) {
      form.setError("note", {
        message: "A note is required when the variance is not zero.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const result = await recordCashCount(values);
      if (!result.ok) {
        setServerError(result.error);
        if (result.fieldErrors) {
          for (const [key, messages] of Object.entries(result.fieldErrors)) {
            form.setError(key as keyof CashCountValues, {
              message: messages[0],
            });
          }
        }
        return;
      }

      toast.success("Cash count recorded");
      form.reset({
        fund_id: values.fund_id,
        counted: "",
        note: "",
      });
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record a count</CardTitle>
        <CardDescription>
          Enter the cash you physically counted. The expected cash comes from
          the live fund balance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={form.handleSubmit(submit)} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cash-count-fund">Fund</Label>
              <Controller
                control={form.control}
                name="fund_id"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange(value ?? "")}
                    items={fundItems}
                    disabled={funds.length <= 1}
                  >
                    <SelectTrigger id="cash-count-fund" className="w-full">
                      <SelectValue placeholder="Select a fund" />
                    </SelectTrigger>
                    <SelectContent>
                      {fundItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.fund_id ? (
                <p className="text-xs text-destructive">
                  {errors.fund_id.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cash-count-counted">Cash counted</Label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                  ₱
                </span>
                <Input
                  id="cash-count-counted"
 maxLength={13}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="pl-7 text-right tabular-nums"
                  {...form.register("counted")}
                  aria-invalid={Boolean(errors.counted)}
                />
              </div>
              {errors.counted ? (
                <p className="text-xs text-destructive">
                  {errors.counted.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Expected cash</p>
                <p className="font-heading text-xl font-semibold">
                  <MoneyText value={selectedFund?.expected_cash ?? 0} />
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Variance</p>
                <p
                  className={cn(
                    "font-heading text-xl font-semibold",
                    varianceCents === null
                      ? "text-muted-foreground"
                      : varianceCents === 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-destructive",
                  )}
                >
                  {varianceCents === null ? (
                    "—"
                  ) : (
                    <MoneyText value={varianceCents / 100} />
                  )}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {varianceCents === null
                ? "Enter the counted cash to see the variance."
                : varianceCents === 0
                  ? "Counted cash matches the expected cash."
                  : "The count differs from expected cash, so a note is required."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cash-count-note">
              Note{" "}
              <span
                className={cn(
                  "font-normal",
                  hasVariance ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {hasVariance ? "(required)" : "(optional)"}
              </span>
            </Label>
            <Textarea
              id="cash-count-note"
 maxLength={300}
              placeholder={
                hasVariance
                  ? "Explain the difference between counted and expected cash."
                  : "Anything worth noting about this count."
              }
              rows={3}
              {...form.register("note")}
              aria-invalid={Boolean(errors.note)}
            />
            {errors.note ? (
              <p className="text-xs text-destructive">{errors.note.message}</p>
            ) : null}
          </div>

          {serverError ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex justify-end border-t border-border pt-4">
            <Button type="submit" disabled={submitting}>
              <Save />
              {submitting ? "Saving..." : "Record cash count"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

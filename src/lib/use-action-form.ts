"use client";

import { useState, useTransition } from "react";
import { useForm, type DefaultValues, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

type Values = Record<string, string>;
type Result = { ok: boolean; message: string } | null;

interface Options<S extends z.ZodType<Values, Values>> {
  schema: S;
  defaultValues: DefaultValues<z.input<S>>;
  /** Extra values the form needs but the person does not type, like an id. */
  extra?: Values;
  /** The server action, called with the checked values as FormData. */
  run: (form: FormData) => Promise<Result>;
  onSuccess?: (message: string) => void;
}

/** react-hook-form + a zod schema in front of a server action; server messages show as `serverError`. */
export function useActionForm<S extends z.ZodType<Values, Values>>({ schema, defaultValues, extra, run, onSuccess }: Options<S>) {
  const form: UseFormReturn<Values> = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as DefaultValues<Values>,
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const body = new FormData();
      for (const [key, value] of Object.entries({ ...extra, ...values })) body.set(key, value);
      const result = await run(body);
      if (result?.ok) onSuccess?.(result.message);
      else if (result) setServerError(result.message);
    });
  });

  return { form, onSubmit, serverError, pending };
}

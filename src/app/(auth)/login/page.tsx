"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Camera, FileText, Wrench } from "lucide-react";
import { FormField } from "@/components/shared/form-field";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginSchema } from "@/lib/forms";
import { createClient } from "@/lib/supabase/client";

function friendlyError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Wrong email or password.";
  if (/email not confirmed/i.test(message)) return "This account is not activated yet. Ask an admin.";
  if (/fetch|network/i.test(message)) return "Can't reach the server. Check your internet connection.";
  return "Could not log in. Please try again.";
}

const HIGHLIGHTS = [
  { icon: Camera, text: "Photograph the paper receipt and the form fills itself in." },
  { icon: FileText, text: "Every car's papers in one place, from the first photo to the handoff." },
  { icon: Wrench, text: "Repairs, approvals and reminders reach the right people on Telegram." },
];

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ email: string; password: string }>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null);
    setPending(true);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(friendlyError(error.message));
      setPending(false);
      return;
    }
    router.replace("/");
    router.refresh();
  });

  return (
    <main className="min-h-svh lg:grid lg:grid-cols-2">
      {/* Brand panel: desktop only. */}
      <section className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-[28rem] rounded-full bg-primary-foreground/10 blur-3xl" />
        <div className="relative">
          {/* this panel is the page's "primary" colour, which is dark in the light theme and light in the dark one: the logo is drawn the other way round */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mad-logo-light.png" alt="MAD App, Manila Auto Display" className="h-24 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mad-logo-dark.png" alt="" aria-hidden className="hidden h-24 w-auto dark:block" />
        </div>

        <div className="relative max-w-md space-y-8">
          <h2 className="text-4xl font-semibold tracking-tight text-balance">Receipts, cars and papers, all in one app.</h2>
          <ul className="space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-primary-foreground/80">
                <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
                <span className="text-sm">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-primary-foreground/60">Manila Auto Display</p>
      </section>

      <section className="flex min-h-svh items-center justify-center px-4 py-10 sm:px-8 lg:min-h-0">
        <div className="w-full max-w-sm space-y-8">
          <Brand />
          <div className="space-y-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">Log in</h1>
            <p className="text-sm text-muted-foreground">Use the account your admin gave you.</p>
          </div>

          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <FormField id="email" label="Email" error={errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} {...register("email")} />
            </FormField>
            <FormField id="password" label="Password" error={errors.password?.message}>
              <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register("password")} />
            </FormField>
            {error && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={pending} className="w-full">
              {pending ? "Logging in…" : "Log in"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}

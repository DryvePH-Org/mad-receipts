"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Mic, Receipt, RefreshCw } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

function friendlyError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Wrong email or password.";
  if (/email not confirmed/i.test(message)) return "This account is not activated yet. Ask an admin.";
  if (/fetch|network/i.test(message)) return "Can't reach the server. Check your internet connection.";
  return "Could not log in. Please try again.";
}

const HIGHLIGHTS = [
  { icon: Camera, text: "Photograph the paper receipt and the form fills itself in." },
  { icon: Mic, text: "Say who sold the car and each person's commission." },
  { icon: RefreshCw, text: "Drive, Sheets, Telegram and the inventory update on their own." },
];

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const { error } = await createClient().auth.signInWithPassword({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
    });

    if (error) {
      setError(friendlyError(error.message));
      setPending(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="min-h-svh lg:grid lg:grid-cols-2">
      {/* Brand panel: desktop only. */}
      <section className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-[28rem] rounded-full bg-primary-foreground/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-foreground text-primary">
            <Receipt className="size-5" aria-hidden />
          </span>
          <span className="text-sm font-semibold">MAD Receipts</span>
        </div>

        <div className="relative max-w-md space-y-8">
          <h2 className="text-4xl font-semibold tracking-tight text-balance">Every receipt accounted for.</h2>
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

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
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

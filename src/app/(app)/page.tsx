import { Suspense } from "react";
import { connection } from "next/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Phase 1 connectivity check: pings Supabase's auth health endpoint with the anon key.
// Replaced by the real dashboard in Phase 10.
async function checkSupabase(): Promise<{ ok: boolean; message: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, message: "Supabase env vars are not set." };

  try {
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } });
    return res.ok
      ? { ok: true, message: "Connected to Supabase." }
      : { ok: false, message: `Supabase responded with ${res.status}.` };
  } catch {
    return { ok: false, message: "Could not reach Supabase." };
  }
}

async function SupabaseStatus() {
  await connection(); // check on every request, not at build time
  const status = await checkSupabase();
  return (
    <p className={status.ok ? "text-green-600" : "text-destructive"}>
      {status.message}
    </p>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Supabase</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-muted-foreground">Checking…</p>}>
            <SupabaseStatus />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

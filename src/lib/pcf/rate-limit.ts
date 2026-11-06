import { createAdminClient } from "@/lib/supabase/admin";

// True while `key` is within `limit` hits per `windowSeconds`. If the limiter
// itself is unavailable we let the request through rather than lock everyone
// out, and log it.
export async function withinLimit(key: string, limit: number, windowSeconds: number) {
  const { data, error } = await createAdminClient().rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate limiter unavailable", error.message);
    return true;
  }
  return data === true;
}

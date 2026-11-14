"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireModule } from "@/lib/auth";
import { CARS_TAG } from "@/lib/cars/read";

// A guard so that pressing Refresh over and over cannot hammer Google (this server process only).
const COOLDOWN_MS = 5_000;
let lastRefresh = 0;

/** "Refresh now": forget the inventory read a moment ago, so the next look is straight from the sheet. */
export async function refreshCarsAction(): Promise<{ at: string }> {
  await requireModule("cars");
  const now = Date.now();
  if (now - lastRefresh >= COOLDOWN_MS) {
    lastRefresh = now;
    updateTag(CARS_TAG);
    revalidatePath("/cars");
  }
  return { at: new Date().toISOString() };
}

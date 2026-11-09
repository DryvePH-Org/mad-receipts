import "server-only";
import { manilaToday } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { normalizePlate } from "@/lib/rules/plate";
import { detectionsOf } from "./car";
import { loadCar } from "./service";
import { getSettings } from "@/lib/data";
import { cleanTransmittal, prefillTransmittal, type TransmittalData } from "./transmittal";

/** The car's transmittal: what was saved (if anything), and what its documents workflow suggests. Callers check the Car documents module first. */
export async function loadTransmittal(plate: string, userName: string): Promise<{ plateDisplay: string; saved: TransmittalData | null; prefill: TransmittalData } | null> {
  const car = await loadCar(plate);
  if (!car) return null;
  const key = normalizePlate(plate);
  const types = car.analysis.files.flatMap((f) => f.types);
  const detections = car.files.flatMap((f) => detectionsOf(f.details) ?? []);
  const receiver = (await getSettings()).print.transmittalReceiver;
  const prefill = { ...prefillTransmittal({ plateDisplay: car.folder.plate_display, folderName: car.folder.folder_name, types, caseType: car.caseType, detections, userName, today: manilaToday() }), receivedBy: receiver };
  // If the table is not there yet (the latest database update), nothing is saved and the suggestion is used.
  const { data } = await createAdminClient().from("transmittals").select("data").eq("plate_no", key).maybeSingle();
  return { plateDisplay: car.folder.plate_display, saved: data ? cleanTransmittal(data.data) : null, prefill };
}

export async function saveTransmittal(plate: string, data: unknown, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = cleanTransmittal(data);
  const { error } = await createAdminClient().from("transmittals").upsert({ plate_no: normalizePlate(plate), data: clean as unknown as Json, updated_by: userId }, { onConflict: "plate_no" });
  if (error) return { ok: false, error: /transmittals/.test(error.message) ? "Saving needs the latest database update (migration 22). You can still print this one." : "Could not save. Try again." };
  return { ok: true };
}

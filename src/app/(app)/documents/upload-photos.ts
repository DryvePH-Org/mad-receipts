"use client";

import imageCompression from "browser-image-compression";
import { finishAddAction } from "./actions";

export interface PhotoState { id: number; name: string; state: "sending" | "done" | "error"; types: string[]; flags: string[]; message?: string }

let counter = 0;
export const newPhotoStates = (files: File[]): { id: number; file: File; state: PhotoState }[] => files.map((file) => { const id = ++counter; return { id, file, state: { id, name: file.name, state: "sending", types: [], flags: [] } }; });

/**
 * Sends document photos into the car's Drive folder (made if it does not exist), one by one: each is made smaller in the browser, filed in
 * Drive and, when the whole batch is in, the scan starts. `onUpdate` is told how each photo is doing. Returns how many were saved.
 */
export async function uploadPhotos(plate: string, batch: { id: number; file: File }[], onUpdate: (id: number, patch: Partial<PhotoState>) => void): Promise<number> {
  let saved = 0;
  for (const { id, file: original } of batch) {
    try {
      if (!original.type.startsWith("image/")) throw new Error("Send a photo (JPEG or PNG).");
      const file = await imageCompression(original, { maxWidthOrHeight: 2400, initialQuality: 0.85, maxSizeMB: 3, fileType: "image/jpeg", useWebWorker: true });
      const body = new FormData();
      body.set("plate", plate);
      body.set("file", file, "photo.jpg");
      body.set("label", `doc${id}`);
      const res = await fetch("/api/docs/add", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { result?: { types: string[]; flags: string[]; readStatus: string }; error?: string };
      if (!res.ok || !json.result) throw new Error(json.error ?? `The upload failed (error ${res.status}). Try again.`);
      saved++;
      onUpdate(id, { state: "done", types: json.result.types, flags: json.result.flags, message: json.result.readStatus === "failed" ? "Saved in the folder. It could not be read yet; it will be read again." : undefined });
    } catch (e) {
      onUpdate(id, { state: "error", message: e instanceof Error ? e.message : "The upload failed." });
    }
  }
  if (saved > 0) await finishAddAction(plate).catch(() => undefined); // the scan of the batch starts
  return saved;
}

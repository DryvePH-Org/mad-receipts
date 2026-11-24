"use client";

import imageCompression from "browser-image-compression";

/**
 * What the "choose files" box accepts. These are named types on purpose: with the general "image/*" a phone (Android) opens the camera straight away,
 * with the named ones it opens the gallery and the files, where many photos can be picked at once. The camera has its own button.
 */
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";

export const isHeic = (f: File) => /^image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

export async function toJpeg(photo: File): Promise<File> {
  try {
    const { default: heic2any } = await import("heic2any");
    const out = await heic2any({ blob: photo, toType: "image/jpeg", quality: 0.85 });
    const blob = Array.isArray(out) ? out[0] : out;
    return new File([blob], photo.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    throw new Error("This photo could not be converted. Send it as JPEG or PNG.");
  }
}
/** A photo ready to send: an iPhone photo (HEIC) becomes JPEG first, then it is made smaller in the browser. A PDF is sent as it is. */
export async function prepareImage(original: File): Promise<File> {
  if (original.type === "application/pdf") return original;
  const heic = isHeic(original);
  if (!heic && !original.type.startsWith("image/")) throw new Error("Send a photo (JPEG or PNG).");
  return imageCompression(heic ? await toJpeg(original) : original, { maxWidthOrHeight: 2400, initialQuality: 0.85, maxSizeMB: 3, fileType: "image/jpeg", useWebWorker: true });
}

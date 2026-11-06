import imageCompression from "browser-image-compression";

import { createClient } from "@/lib/supabase/client";

export async function compressReceipt(file: File) {
  return imageCompression(file, {
    maxSizeMB: 0.2,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: "image/jpeg",
  });
}

export async function uploadReceipt(
  file: File,
  fundId: string,
  voucherId: string,
) {
  const supabase = createClient();
  const compressed = await compressReceipt(file);
  const path = `${fundId}/${voucherId}/${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from("receipts")
    .upload(path, compressed, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (error) throw new Error(error.message);
  return path;
}

const SCAN_MAX_SIDE = 1600;

// A copy tuned for reading, not for storage: grayscale with the contrast
// stretched so faint pen strokes stand out. Falls back to the plain compressed
// photo if the browser can't do it.
export async function prepareScanImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, SCAN_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("no canvas");
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const image = context.getImageData(0, 0, width, height);
    const { data } = image;
    const histogram = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      data[i] = gray;
      histogram[gray] += 1;
    }
    // Stretch between the 2nd and 98th percentile of brightness.
    const total = width * height;
    let low = 0;
    let high = 255;
    for (let seen = 0; low < 255 && (seen += histogram[low]) < total * 0.02; low++);
    for (let seen = 0; high > 0 && (seen += histogram[high]) < total * 0.02; high--);
    const range = Math.max(1, high - low);
    for (let i = 0; i < data.length; i += 4) {
      const value = Math.max(0, Math.min(255, ((data[i] - low) * 255) / range));
      data[i] = data[i + 1] = data[i + 2] = value;
    }
    context.putImageData(image, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) throw new Error("no blob");
    return blob;
  } catch {
    return compressReceipt(file);
  }
}

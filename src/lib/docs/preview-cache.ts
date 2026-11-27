import "server-only";

// A document photo shown on a car's page comes from Google Drive through the Apps Script (one to three seconds for each picture). The picture does not change,
// so the server keeps the ones it has fetched (in its memory, the least recently used go first) and answers the next person at once. Two people asking for
// the same picture at the same moment share one trip to Google.

const MAX_BYTES = 120 * 1024 * 1024; // the app's container has 1 GB; this is a small part of it
export interface Preview { bytes: Buffer; mime: string }

const g = globalThis as unknown as { __madPreviews?: { map: Map<string, Preview>; bytes: number; flying: Map<string, Promise<Preview>> } };
const state = () => (g.__madPreviews ??= { map: new Map(), bytes: 0, flying: new Map() });

export async function cachedPreview(key: string, load: () => Promise<Preview>): Promise<Preview> {
  const s = state();
  const hit = s.map.get(key);
  if (hit) { s.map.delete(key); s.map.set(key, hit); return hit; } // most recently used goes to the back
  const flying = s.flying.get(key);
  if (flying) return flying;
  const p = load().then((v) => {
    if (v.bytes.length <= MAX_BYTES / 4) {
      s.map.set(key, v); s.bytes += v.bytes.length;
      for (const [k, old] of s.map) { if (s.bytes <= MAX_BYTES) break; s.map.delete(k); s.bytes -= old.bytes.length; }
    }
    return v;
  }).finally(() => { s.flying.delete(key); });
  s.flying.set(key, p);
  return p;
}

// The papers that go to the NEW OWNER when the transfer is done (Sir Jep gives the originals back, MAD gives them to the buyer). Each one is kept as a digital
// copy in the car's Drive folder and listed here. They are not the IN papers (the old owner's OR and CR the car came with): they are tagged as an archive
// ("transfer") so they never count towards the IN checklist. The scanner does not read them: the staff say what each is, with a default worked out for them. Pure.

export const TRANSFER_PAPERS = [
  { key: "OR", label: "OR", long: "Official Receipt (new owner)" },
  { key: "CR", label: "CR", long: "Certificate of Registration (new owner)" },
  { key: "PNP clearance", label: "PNP clearance", long: "PNP (HPG) clearance" },
  { key: "Macro-etching", label: "Macro-etching", long: "Macro-etching" },
] as const;
export type TransferPaperKey = (typeof TRANSFER_PAPERS)[number]["key"];
export const TRANSFER_TAGS: string[] = [...TRANSFER_PAPERS.map((p) => p.key), "Other"];
export const isTransferTag = (v: unknown): v is string => typeof v === "string" && TRANSFER_TAGS.includes(v);

/** The paper the transfer scanner saw (its document type) as one of the four, or null when it is none of them. */
export function paperOfType(type: string | null | undefined): TransferPaperKey | null {
  return type === "official_receipt" ? "OR" : type === "certificate_of_registration" ? "CR" : type === "pnp_clearance" ? "PNP clearance" : type === "macro_etching" ? "Macro-etching" : null;
}

/** What a file name says about the paper (a phone photo called IMG_2041 says nothing): null when it says nothing. */
export function guessPaper(filename: string): TransferPaperKey | null {
  const n = filename.toLowerCase();
  if (/macro|etch/.test(n)) return "Macro-etching";
  if (/pnp|clearance|hpg/.test(n)) return "PNP clearance";
  if (/certificate|(^|[^a-z])cr([^a-z]|$)/.test(n)) return "CR";
  if (/receipt|(^|[^a-z])or([^a-z]|$)/.test(n)) return "OR";
  return null;
}

/**
 * The tag each file of a batch starts with, so the staff only change the wrong ones: the name when it says what the paper is; otherwise the next paper
 * of the list that has nothing yet (OR, CR, PNP clearance, Macro-etching, in that order); and "Other" when every paper is covered.
 */
export function placeFiles(names: string[], covered: ReadonlySet<string>): string[] {
  const taken = new Set(covered);
  const out: (string | null)[] = names.map((n) => { const g = guessPaper(n); if (g) taken.add(g); return g; });
  return out.map((g) => {
    if (g) return g;
    const next = TRANSFER_PAPERS.find((p) => !taken.has(p.key));
    if (!next) return "Other";
    taken.add(next.key);
    return next.key;
  });
}

/** How many of the four papers have a copy, and which are still missing. */
export function transferProgress(tags: Iterable<string | null | undefined>): { have: number; total: number; missing: string[] } {
  const got = new Set<string>(); for (const t of tags) if (t) got.add(t);
  const missing = TRANSFER_PAPERS.filter((p) => !got.has(p.key)).map((p) => p.label);
  return { have: TRANSFER_PAPERS.length - missing.length, total: TRANSFER_PAPERS.length, missing };
}

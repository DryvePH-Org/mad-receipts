"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ReceiptPaper } from "@/components/receipt/receipt-paper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/deal/settings";
import { emptyForm } from "../new/form-state";

type Company = AppSettings["company"];
type Print = AppSettings["print"];

const area = "min-h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";

/** A picture chosen by the Admin, made small (at most 360 px wide, under about 150 KB) so every print loads at once. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 360 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL("image/png");
  return png.length < 200_000 ? png : canvas.toDataURL("image/jpeg", 0.85);
}

/** The Admin's print layout editor: the wording, logo and defaults of the printed receipt, with a live preview of the real paper. */
export function PrintEditor({ company, print, onSave, today }: { company: Company; print: Print; onSave: (patch: { company?: Company; print?: Print }) => void; today: string }) {
  const [co, setCo] = useState(company);
  const [pr, setPr] = useState(print);
  const file = useRef<HTMLInputElement>(null);

  // a sample receipt, so the preview shows every part of the paper
  const sample = useMemo(() => ({
    ...emptyForm(DEFAULT_SETTINGS as never, today), receiptNo: "2556", date: today, receivedFrom: "Jose Rizal", address: "16 San Fernando, Kapitolyo, Pasig City", contact: "09173216078",
    kind: "earnest" as const, cash: "50,000", price: "500000", units: [{ makeType: "2021 Honda Civic", plate: "NKF 4771", color: "Black" }], dueMode: "text" as const, dueText: "Upon release of OR/CR",
  }), [today]);

  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const natural = 794, naturalHeight = 560; // the half page, 210 × 148 mm
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const measure = () => setScale(Math.min(1, (el.clientWidth - 16) / natural));
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [natural]);

  const saveCo = (next: Company) => { setCo(next); onSave({ company: next }); };
  const savePr = (next: Print) => { setPr(next); onSave({ print: next }); };
  const text = (k: keyof Pick<Print, "footerNote" | "buyerLabel" | "receiverLabel">, label: string, max: number) => (
    <div className="space-y-1.5"><Label htmlFor={`pr-${k}`}>{label}</Label><Input id={`pr-${k}`} value={pr[k]} maxLength={max} onChange={(e) => setPr({ ...pr, [k]: e.target.value })} onBlur={() => savePr({ ...pr, [k]: pr[k].trim() || print[k] })} /></div>
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:items-start">
      <div className="space-y-5">
        <Card><CardHeader><CardTitle>Business details</CardTitle><p className="text-sm text-muted-foreground">Shown at the top of every printed copy</p></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="co-name">Business name</Label><Input id="co-name" value={co.name} maxLength={120} onChange={(e) => setCo({ ...co, name: e.target.value })} onBlur={() => co.name.trim() ? saveCo({ ...co, name: co.name.trim() }) : setCo(company)} /></div>
            <div className="space-y-1.5"><Label htmlFor="co-address">Lines under the name</Label><textarea id="co-address" className={area} value={co.address} maxLength={400} onChange={(e) => setCo({ ...co, address: e.target.value })} onBlur={() => saveCo(co)} /><p className="text-xs text-muted-foreground">One line per row, like the booklet: the style the business trades under, then the address.</p></div>
            <div className="space-y-1.5"><Label htmlFor="co-tagline">Title of the form</Label><Input id="co-tagline" value={co.tagline} maxLength={120} onChange={(e) => setCo({ ...co, tagline: e.target.value })} onBlur={() => co.tagline.trim() ? saveCo({ ...co, tagline: co.tagline.trim() }) : setCo(company)} /></div>
            <div className="space-y-2"><Label>Logo</Label>
              <div className="flex flex-wrap items-center gap-2">
                {pr.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pr.logo} alt="Your logo" className="h-12 max-w-32 rounded border bg-white object-contain p-1" />
                ) : <span className="text-sm text-muted-foreground">No logo yet</span>}
                <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose a logo" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { savePr({ ...pr, logo: await shrink(f), showLogo: true }); } catch { toast.error("That picture could not be read. Try a PNG or JPEG."); } }} />
                <Button type="button" variant="outline" size="sm" onClick={() => file.current?.click()}><ImagePlus /> {pr.logo ? "Change" : "Add a logo"}</Button>
                {pr.logo && <Button type="button" variant="ghost" size="sm" onClick={() => savePr({ ...pr, logo: "", showLogo: false })}><Trash2 /> Remove</Button>}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={pr.showLogo && !!pr.logo} disabled={!pr.logo} onChange={(e) => savePr({ ...pr, showLogo: e.target.checked })} /> Show the logo on the receipt</label>
            </div>
          </CardContent></Card>

        <Card><CardHeader><CardTitle>Wording and signatures</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="pr-terms">Remarks under the amounts</Label><textarea id="pr-terms" className={area} value={pr.terms} maxLength={600} onChange={(e) => setPr({ ...pr, terms: e.target.value })} onBlur={() => savePr(pr)} /></div>
            {text("footerNote", "Note at the bottom", 200)}
            <div className="grid gap-3 sm:grid-cols-2">{text("buyerLabel", "Left signature line", 40)}{text("receiverLabel", "Right signature line", 40)}</div>
            <div className="space-y-1.5"><Label htmlFor="pr-color">Color of the receipt number</Label><div className="flex items-center gap-2"><input id="pr-color" type="color" value={pr.numberColor} onChange={(e) => setPr({ ...pr, numberColor: e.target.value })} onBlur={() => savePr(pr)} className="h-9 w-14 cursor-pointer rounded border bg-transparent" /><code className="text-xs text-muted-foreground">{pr.numberColor}</code></div></div>
          </CardContent></Card>

        <Card><CardHeader><CardTitle>When printing</CardTitle><p className="text-sm text-muted-foreground">What the Print page starts with. Staff can still change it there.</p></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="pr-sheet">Half pages</Label><NativeSelect id="pr-sheet" value={pr.perSheet} onChange={(e) => savePr({ ...pr, perSheet: e.target.value as Print["perSheet"] })}><option value="two">Two on an A4 sheet</option><option value="one">One per half sheet</option></NativeSelect></div>
            <div className="space-y-1.5"><Label htmlFor="pr-copies">Copies</Label><Input id="pr-copies" inputMode="numeric" defaultValue={pr.defaultCopies} className="text-right" onBlur={(e) => { const n = parseInt(e.target.value, 10); if (n >= 1 && n <= 10) savePr({ ...pr, defaultCopies: n }); else e.target.value = String(pr.defaultCopies); }} /></div>
          </CardContent></Card>
      </div>

      <div className="space-y-2 xl:sticky xl:top-6">
        <div className="flex items-center justify-between gap-2"><b className="text-sm font-medium">Live preview</b>
        </div>
        <div ref={wrap} className="relative overflow-hidden rounded-xl bg-neutral-200 ring-1 ring-foreground/10 dark:bg-neutral-800" style={{ height: `${Math.round(naturalHeight * scale + 24)}px` }}>
          <div className="absolute top-3 origin-top-left" style={{ transform: `scale(${scale})`, left: `calc(50% - ${(natural * scale) / 2}px)` }}>
            <ReceiptPaper state={sample as never} company={co} print={pr} copy={"Customer's copy"} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">This is the real paper with a sample receipt. Changes save when you leave a box.</p>
      </div>
    </div>
  );
}

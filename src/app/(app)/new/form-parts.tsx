"use client";

import { cn } from "@/lib/utils";

/** Two or three buttons, one chosen (like a radio group). */
export function Seg<T extends string>({ value, options, onChange, label, className }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-lg bg-muted p-0.5", className)}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cn("rounded-md px-3 py-1 text-sm font-medium transition-colors", value === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{text}</button>
      ))}
    </div>
  );
}

/** Big choice cards with an icon, a title and a hint. */
export function PickCards<T extends string>({ value, options, onChange, label, cols = 3 }: { value: T; options: { value: T; title: string; hint: string; icon: React.ReactNode }[]; onChange: (v: T) => void; label: string; cols?: 2 | 3 }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2", cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn("flex items-center gap-3 rounded-lg border p-3 text-left transition-colors", value === o.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-md", value === o.value ? "bg-primary-foreground/15" : "bg-muted")}>{o.icon}</span>
          <span className="text-sm font-medium">{o.title}<span className={cn("block text-xs font-normal", value === o.value ? "text-primary-foreground/70" : "text-muted-foreground")}>{o.hint}</span></span>
        </button>
      ))}
    </div>
  );
}

export function Chip({ selected, onClick, children, dot, dashed }: { selected?: boolean; onClick: () => void; children: React.ReactNode; dot?: string; dashed?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors", selected ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted", dashed && !selected && "border-dashed text-muted-foreground hover:text-foreground")}>
      {dot && <i className="size-3.5 rounded-full ring-1 ring-black/25" style={{ background: dot }} />}{children}
    </button>
  );
}

export function Switch({ checked, onChange, label, hint, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; id?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
      <span className="text-sm font-medium">{label}{hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}</span>
    </label>
  );
}

import type { ReactNode } from "react";

// Charts for the Payments tab, drawn as plain SVG on the server (no chart library, no client code). Thin marks, rounded data-ends, a 2px gap between stacked segments, one axis,
// a legend for more than one series, a hover title on every mark and a table behind each chart (the "table view"). Colors are the data-viz palette's categorical slots in order.

export const VIZ_STYLE = `
.viz-root{--surface:#fcfcfb;--ink:#0b0b0b;--ink-2:#52514e;--grid:#e6e5e1;--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--s6:#008300;--s7:#6250d6;--s8:#e34948}
.dark .viz-root{--surface:#1a1a19;--ink:#f0efec;--ink-2:#c3c2b7;--grid:#34332f;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;--s7:#9085e9;--s8:#e66767}
`;
export const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)", "var(--s8)"];
export const seriesColor = (i: number) => SERIES[i % SERIES.length];

export const peso = (n: number) => `${n < 0 ? "−" : ""}₱${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
const compact = (n: number) => { const a = Math.abs(n); const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M` : a >= 1_000 ? `${Math.round(a / 1_000)}K` : String(Math.round(a)); return `${n < 0 ? "−" : ""}₱${s}`; };

/** Four-ish round gridline values from 0 up to a little above the biggest value. */
function ticks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  if (items.length < 2) return null;
  return <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-2)]" aria-label="Legend">{items.map((i) => <li key={i.name} className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />{i.name}</li>)}</ul>;
}

/** The chart's data again as a table, for anyone who cannot read the picture. */
export function TableView({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-[var(--ink-2)]">View as a table</summary>
      <div className="mt-2 overflow-x-auto"><table className="w-full text-left tabular-nums"><thead><tr>{head.map((h, i) => <th key={h} scope="col" className={`py-1 pr-4 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className={`py-1 pr-4 ${j ? "text-right" : ""}`}>{c}</td>)}</tr>)}</tbody></table></div>
    </details>
  );
}

const W = 640, PAD = { l: 52, r: 12, t: 22, b: 30 };

/** Bars side by side, each stacked by series (money in by bank for each month; sale payments by stage and bank). */
export function StackedBars({ categories, series, label }: { categories: { label: string; parts: number[] }[]; series: { name: string }[]; label: string }) {
  const H = 240, iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const totals = categories.map((c) => c.parts.reduce((n, v) => n + v, 0));
  const ts = ticks(Math.max(...totals, 0)), top = ts[ts.length - 1] || 1;
  const slot = iw / Math.max(categories.length, 1), bw = Math.min(54, slot * 0.62);
  const y = (v: number) => PAD.t + ih - (v / top) * ih;
  return (
    <div className="space-y-2">
      <Legend items={series.map((s, i) => ({ name: s.name, color: seriesColor(i) }))} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
        {ts.map((t) => <g key={t}><line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} /><text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--ink-2)">{compact(t)}</text></g>)}
        {categories.map((c, ci) => {
          const x = PAD.l + slot * ci + (slot - bw) / 2;
          let acc = 0;
          const live = c.parts.map((v, si) => ({ v, si })).filter((p) => p.v > 0);
          return (
            <g key={c.label}>
              {live.map(({ v, si }, k) => {
                const y0 = y(acc), y1 = y(acc + v); acc += v;
                const isTop = k === live.length - 1, h = Math.max(y0 - y1, 1);
                const d = isTop ? `M${x},${y0}V${y1 + Math.min(4, h)}Q${x},${y1} ${x + Math.min(4, bw / 2)},${y1}H${x + bw - Math.min(4, bw / 2)}Q${x + bw},${y1} ${x + bw},${y1 + Math.min(4, h)}V${y0}Z` : `M${x},${y0}V${y1}H${x + bw}V${y0}Z`;
                return <path key={si} d={d} fill={seriesColor(si)} stroke="var(--surface)" strokeWidth={2}><title>{`${c.label}: ${series[si].name} ${peso(v)}`}</title></path>;
              })}
              {totals[ci] > 0 && categories.length <= 12 && <text x={x + bw / 2} y={y(totals[ci]) - 6} textAnchor="middle" fontSize={11} fill="var(--ink)">{compact(totals[ci])}</text>}
              <text x={x + bw / 2} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--ink-2)">{c.label}</text>
            </g>
          );
        })}
      </svg>
      <TableView head={["", ...series.map((s) => s.name), "Total"]} rows={categories.map((c, i) => [c.label, ...c.parts.map(peso), peso(totals[i])])} />
    </div>
  );
}

/** One row for each item, money in and money out as two thin bars. */
export function HBars({ items, label, showOut = true }: { items: { label: string; in: number; out: number }[]; label: string; showOut?: boolean }) {
  const max = Math.max(...items.flatMap((i) => [i.in, showOut ? i.out : 0]), 1);
  const LW = 150, RW = 88, row = showOut ? 32 : 24, H = items.length * row + 8, iw = W - LW - RW;
  const bar = (v: number, y: number, color: string, name: string, l: string) => v > 0 ? <rect x={LW} y={y} width={Math.max((v / max) * iw, 2)} height={8} rx={4} fill={color}><title>{`${l}: ${name} ${peso(v)}`}</title></rect> : null;
  return (
    <div className="space-y-2">
      {showOut && <Legend items={[{ name: "Money in", color: seriesColor(0) }, { name: "Money out", color: seriesColor(1) }]} />}
      <svg viewBox={`0 0 ${W} ${Math.max(H, 40)}`} role="img" aria-label={label} className="h-auto w-full">
        {items.map((it, i) => {
          const y = 4 + i * row;
          return (
            <g key={it.label}>
              <text x={LW - 8} y={y + (showOut ? 12 : 9)} textAnchor="end" fontSize={12} fill="var(--ink)">{it.label.length > 22 ? `${it.label.slice(0, 21)}…` : it.label}</text>
              {bar(it.in, y + 2, seriesColor(0), "money in", it.label)}
              {showOut && bar(it.out, y + 14, seriesColor(1), "money out", it.label)}
              <text x={W - RW + 8} y={y + (showOut ? 12 : 9)} fontSize={11} fill="var(--ink-2)">{it.in > 0 ? peso(it.in) : ""}</text>
              {showOut && it.out > 0 && <text x={W - RW + 8} y={y + 24} fontSize={11} fill="var(--ink-2)">−{peso(it.out)}</text>}
            </g>
          );
        })}
      </svg>
      <TableView head={["", "Money in", "Money out"]} rows={items.map((i) => [i.label, peso(i.in), peso(i.out)])} />
    </div>
  );
}

/** The running net of the month, day by day: a 2px line with a marker on each day. */
export function LineChart({ points, label }: { points: { label: string; value: number }[]; label: string }) {
  const H = 220, iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const lo = Math.min(0, ...points.map((p) => p.value)), hi = Math.max(0, ...points.map((p) => p.value));
  const ts = ticks(hi - lo), step = ts.length > 1 ? ts[1] - ts[0] : 1;
  const floor = lo < 0 ? Math.floor(lo / step) * step : 0, top = Math.max(hi, floor + step * (ts.length - 1) || 1);
  const y = (v: number) => PAD.t + ih - ((v - floor) / (top - floor || 1)) * ih;
  const x = (i: number) => PAD.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const grid = Array.from({ length: Math.round((top - floor) / step) + 1 }, (_, i) => floor + i * step);
  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
        {grid.map((t) => <g key={t}><line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--ink-2)" : "var(--grid)"} strokeWidth={t === 0 ? 1.25 : 1} /><text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--ink-2)">{compact(t)}</text></g>)}
        <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke={seriesColor(0)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => <circle key={p.label} cx={x(i)} cy={y(p.value)} r={4} fill={seriesColor(0)} stroke="var(--surface)" strokeWidth={2}><title>{`${p.label}: ${peso(p.value)}`}</title></circle>)}
        {points.map((p, i) => (i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2)) && <text key={`l${p.label}`} x={x(i)} y={H - 10} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize={11} fill="var(--ink-2)">{p.label}</text>)}
        {points.length > 0 && <text x={x(points.length - 1)} y={y(points[points.length - 1].value) - 10} textAnchor="end" fontSize={11} fill="var(--ink)">{peso(points[points.length - 1].value)}</text>}
      </svg>
      <TableView head={["Day", "Running net"]} rows={points.map((p) => [p.label, peso(p.value)])} />
    </div>
  );
}

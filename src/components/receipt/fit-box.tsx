"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/** The smallest the writing may get before the receipt is better printed on a full page. */
export const MIN_FIT = 0.62;

/**
 * A box of fixed size (the half page) that shrinks what is inside to fit, so a receipt with a lot on it never runs off the paper.
 * It measures again when the content changes, when the window changes, and just before printing. `onFit` hears the final scale.
 */
export function FitBox({ children, onFit }: { children: React.ReactNode; onFit?: (scale: number) => void }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const last = useRef(1);
  const report = useRef(onFit);
  useEffect(() => { report.current = onFit; });

  const fit = useCallback(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i || o.clientHeight === 0) return;
    // Try a scale; the inner box gets wider by the same factor so the text wraps as it would at that size.
    const apply = (s: number) => { i.style.width = `${100 / s}%`; i.style.transform = s === 1 ? "none" : `scale(${s})`; return i.scrollHeight * s; };
    let s = 1;
    while (s > 0.45 && apply(s) > o.clientHeight + 0.5) s = Math.round((s - 0.02) * 100) / 100;
    apply(s);
    if (s !== last.current) { last.current = s; report.current?.(s); }
  }, []);

  useLayoutEffect(() => { fit(); });
  useEffect(() => {
    const o = outer.current;
    const ro = o ? new ResizeObserver(fit) : null;
    if (o && ro) ro.observe(o);
    window.addEventListener("beforeprint", fit);
    document.fonts?.ready.then(fit).catch(() => undefined);
    return () => { ro?.disconnect(); window.removeEventListener("beforeprint", fit); };
  }, [fit]);

  return <div ref={outer} className="fit-outer"><div ref={inner} className="fit-inner">{children}</div></div>;
}

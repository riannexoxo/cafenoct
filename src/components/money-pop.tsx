"use client";

import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/format";
import type { MoneyEvent } from "@/lib/celebrate";

// A small notification when money lands: a coin drops into a wallet while the amount counts up.
export default function MoneyPop() {
  const [pop, setPop] = useState<(MoneyEvent & { key: number }) | null>(null);
  const [shown, setShown] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<MoneyEvent>).detail;
      if (timer.current) clearTimeout(timer.current);
      setPop({ ...d, key: Date.now() });
      timer.current = setTimeout(() => setPop(null), 4200);
    };
    window.addEventListener("cafenoct:money", on);
    return () => { window.removeEventListener("cafenoct:money", on); if (timer.current) clearTimeout(timer.current); };
  }, []);

  // Count the amount up from zero.
  useEffect(() => {
    if (!pop) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const t0 = performance.now() + (still ? 0 : 450), dur = still ? 1 : 900;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      setShown(pop.amount * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [pop]);

  if (!pop) return null;
  return (
    <div className="mpop" key={pop.key} role="status" aria-live="polite" onClick={() => setPop(null)}>
      <div className="mpop-art" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="56" height="56">
          <g className="mpop-coin"><circle cx="32" cy="20" r="9" /><text x="32" y="24" textAnchor="middle">$</text></g>
          <rect className="mpop-wallet" x="12" y="30" width="40" height="26" rx="7" />
          <rect className="mpop-flap" x="12" y="30" width="40" height="8" rx="4" />
          <circle className="mpop-clasp" cx="45" cy="44" r="2.6" />
        </svg>
        {[0, 1, 2, 3, 4].map((i) => <i key={i} className="mpop-spark" style={{ ["--i" as string]: i }} />)}
      </div>
      <div className="mpop-t">
        <b className="num">+{money(shown, pop.currency)}</b>
        <span>{pop.title}</span>
        {pop.detail && <small>{pop.detail}</small>}
      </div>
    </div>
  );
}

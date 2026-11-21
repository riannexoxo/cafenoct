"use client";

import { useEffect, useRef, useState } from "react";

// A number that counts to its new value (700ms, ease-out), like the motion library's stat cards.
// Reduced motion shows the value straight away. The last frame is always the exact value.
export default function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value || !Number.isFinite(value) || matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 700), k = 1 - Math.pow(1 - p, 3);
      setShown(p < 1 ? start + (value - start) * k : value);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}

"use client";

import { useLayoutEffect, useRef, useState } from "react";

// A pill switch (Day / Week). The light background slides to the chosen option.
export default function Seg<T extends string>({ options, value, onChange, label }: { options: [T, string][]; value: T; onChange: (v: T) => void; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<React.CSSProperties>({ opacity: 0 });
  useLayoutEffect(() => {
    const b = box.current?.querySelector<HTMLButtonElement>("button.on");
    if (!b) return;
    const place = () => setThumb({ width: b.offsetWidth, height: b.offsetHeight, transform: `translate(${b.offsetLeft}px, ${b.offsetTop}px)` });
    place();
    const ro = new ResizeObserver(place);
    ro.observe(b);
    return () => ro.disconnect();
  }, [value]);
  return (
    <div className="seg" ref={box} role="group" aria-label={label}>
      <i className="thumb" style={thumb} aria-hidden="true" />
      {options.map(([v, l]) => <button key={v} type="button" className={v === value ? "on" : ""} aria-pressed={v === value} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A centered dialog on computers, a sheet that slides up on phones. Escape or a tap outside closes it.
export default function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  const close = useRef(onClose);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    document.body.classList.add("sheet-open");
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    document.addEventListener("keydown", key);
    box.current?.querySelector<HTMLElement>("input, select, textarea")?.focus({ preventScroll: true });
    return () => { cancelAnimationFrame(r); document.body.classList.remove("sheet-open"); document.removeEventListener("keydown", key); };
  }, []);
  return createPortal(
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close.current(); }}>
      <div ref={box} className={`modal${shown ? " in" : ""}`} role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </div>,
    document.body,
  );
}

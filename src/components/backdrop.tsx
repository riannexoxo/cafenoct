"use client";

// The soft room behind the app: faint berry, honey and lavender glows over the cream, plus paper grain.
// On a computer the glows drift slowly and lean a few px toward the pointer. Phones and reduced motion: still.
import { useEffect, useRef } from "react";
import gsap from "gsap";
import "@/styles/backdrop.css";

export default function Backdrop() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current!;
    const vis = () => el.classList.toggle("paused", document.hidden);
    document.addEventListener("visibilitychange", vis);
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)", () => {
      const layers = Array.from(el.querySelectorAll<HTMLElement>(".bd-par")).map((l) => ({
        x: gsap.quickTo(l, "x", { duration: 1.8, ease: "power3.out" }),
        y: gsap.quickTo(l, "y", { duration: 1.8, ease: "power3.out" }),
        d: Number(l.dataset.depth) || 0,
      }));
      const move = (e: PointerEvent) => {
        const nx = e.clientX / innerWidth - 0.5, ny = e.clientY / innerHeight - 0.5;
        for (const l of layers) { l.x(nx * l.d); l.y(ny * l.d); }
      };
      window.addEventListener("pointermove", move, { passive: true });
      return () => window.removeEventListener("pointermove", move);
    });
    return () => { mm.revert(); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return (
    <div ref={root} className="backdrop" aria-hidden="true">
      <div className="bd-par" data-depth="16"><i className="bd-blob bd-berry" /></div>
      <div className="bd-par" data-depth="-12"><i className="bd-blob bd-honey" /></div>
      <div className="bd-par" data-depth="9"><i className="bd-blob bd-lav" /></div>
      <div className="bd-grain" />
    </div>
  );
}

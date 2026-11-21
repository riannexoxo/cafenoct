"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(Flip);

// Reorders that glide (GSAP Flip): call capture() right before changing the list; after the next render
// every [data-flip-id] inside the root moves from where it was to where it is now. Reduced motion: no glide.
export function useFlip<T extends HTMLElement>(sel = "[data-flip-id]") {
  const root = useRef<T>(null);
  const state = useRef<Flip.FlipState | null>(null);
  const tween = useRef<gsap.core.Timeline | null>(null);
  useLayoutEffect(() => {
    const s = state.current;
    if (!s || !root.current) return;
    state.current = null;
    tween.current?.progress(1);
    tween.current = Flip.from(s, { targets: root.current.querySelectorAll(sel), duration: 0.42, ease: "power3.inOut", zIndex: 5, prune: true, nested: true, simple: true });
  });
  useEffect(() => () => { tween.current?.progress(1).kill(); }, []);
  const capture = () => {
    if (!root.current || !matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    state.current = Flip.getState(root.current.querySelectorAll(sel));
  };
  return [root, capture] as const;
}

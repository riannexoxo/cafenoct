"use client";

// Nocti, the CafeNoct mascot: a sleepy little coffee cup with a crescent-moon charm.
// Sleepy is the brand face (sign-in, loading, empty states). Awake is the guide (tour, tips).
// She breathes, blinks, steams, glances toward your pointer and reacts to what's happening:
//   idle · watch (leans in while you type) · privacy (eyes shut while you type a password)
//   happy (hop and sparkles) · oops (a little wobble) · thinking (slow sway, busy steam)
// Reduced motion: no movement at all, only the face changes.
import { useEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";

export type Mood = "sleepy" | "awake";
export type NoctiState = "idle" | "watch" | "privacy" | "happy" | "oops" | "thinking";

type Props = { mood?: Mood; state?: NoctiState; size?: number; follow?: boolean; className?: string; label?: string };

export default function Nocti({ mood = "sleepy", state = "idle", size = 96, follow = false, className = "", label }: Props) {
  const rig = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLSpanElement>(null);
  const awake = useRef<HTMLSpanElement>(null);
  const spark = useRef<HTMLSpanElement>(null);
  // Eyes shut for privacy, otherwise the chosen face.
  const face: Mood = state === "privacy" ? "sleepy" : state === "happy" || state === "watch" || state === "oops" ? "awake" : mood;

  // Breathing, floating and blinking: always on (unless reduced motion).
  useEffect(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const b = body.current!;
      gsap.to(b, { scaleY: 1.025, scaleX: 0.985, duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: -1, transformOrigin: "50% 92%" });
      gsap.to(rig.current!.querySelector(".nocti-float"), { y: -size * 0.03, duration: 2.2, ease: "sine.inOut", yoyo: true, repeat: -1 });
      // Blink: a quick close-open of the awake face.
      let t: ReturnType<typeof setTimeout>;
      const blink = () => {
        if (awake.current && Number(getComputedStyle(awake.current).opacity) > 0.5) {
          gsap.timeline().to(awake.current, { opacity: 0, duration: 0.06 }).to(awake.current, { opacity: 1, duration: 0.08, delay: 0.09 });
        }
        t = setTimeout(blink, 2800 + Math.random() * 3200);
      };
      t = setTimeout(blink, 1800);
      return () => clearTimeout(t);
    });
    return () => mm.revert();
  }, [size]);

  // Glance toward the pointer.
  useEffect(() => {
    if (!follow) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference) and (hover: hover)", () => {
      const el = rig.current!.querySelector(".nocti-look") as HTMLElement;
      const rot = gsap.quickTo(el, "rotation", { duration: 0.6, ease: "power3.out" });
      const x = gsap.quickTo(el, "x", { duration: 0.6, ease: "power3.out" });
      const move = (e: PointerEvent) => {
        const r = rig.current!.getBoundingClientRect();
        const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 600));
        rot(dx * 7); x(dx * size * 0.04);
      };
      window.addEventListener("pointermove", move, { passive: true });
      return () => window.removeEventListener("pointermove", move);
    });
    return () => mm.revert();
  }, [follow, size]);

  // Reactions.
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.to(awake.current, { opacity: face === "awake" ? 1 : 0, duration: reduce ? 0 : 0.25, ease: "power2.out", overwrite: "auto" });
    if (reduce) return;
    const el = rig.current!.querySelector(".nocti-react") as HTMLElement;
    gsap.killTweensOf(el);
    if (state === "happy") {
      gsap.timeline()
        .to(el, { y: -size * 0.16, scaleY: 1.06, duration: 0.22, ease: "power2.out" })
        .to(el, { y: 0, scaleY: 0.94, duration: 0.2, ease: "power2.in" })
        .to(el, { scaleY: 1, duration: 0.5, ease: "elastic.out(1, 0.4)" });
      const marks = spark.current!.children;
      gsap.fromTo(marks, { opacity: 0, scale: 0.2, x: 0, y: 0 }, {
        opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)", stagger: 0.05,
        x: (i) => [-1, 1, -0.6, 0.7][i % 4] * size * 0.45, y: (i) => [-0.5, -0.6, -0.9, -0.85][i % 4] * size * 0.5,
        onComplete: () => { gsap.to(marks, { opacity: 0, duration: 0.5, delay: 0.5 }); },
      });
    } else if (state === "oops") {
      gsap.fromTo(el, { rotation: 0 }, { keyframes: { rotation: [-8, 7, -5, 3, 0] }, duration: 0.55, ease: "power1.inOut" });
    } else if (state === "watch") {
      gsap.to(el, { rotation: -4, y: size * 0.015, duration: 0.4, ease: "power3.out" });
    } else if (state === "thinking") {
      gsap.to(el, { rotation: 4, duration: 1.4, ease: "sine.inOut", yoyo: true, repeat: -1 });
    } else {
      gsap.to(el, { rotation: 0, y: 0, scaleY: 1, duration: 0.5, ease: "power3.out" });
    }
  }, [state, face, size]);

  const name = label ?? (face === "sleepy" ? "Nocti, dozing" : "Nocti, wide awake");
  return (
    <span ref={rig} className={`nocti-rig nocti-${state} ${className}`} style={{ width: size, height: size }} role="img" aria-label={name}>
      <span className="nocti-shadow" aria-hidden="true" />
      <span className="nocti-float"><span className="nocti-look"><span className="nocti-react">
        <span ref={body} className="nocti-body">
          <Image src="/nocti/sleepy.png" alt="" width={size} height={size} priority={size >= 120} draggable={false} />
          <span ref={awake} className="nocti-awake" style={{ opacity: face === "awake" ? 1 : 0 }}>
            <Image src="/nocti/awake.png" alt="" width={size} height={size} priority={size >= 120} draggable={false} />
          </span>
        </span>
      </span></span></span>
      <span ref={spark} className="nocti-spark" aria-hidden="true"><i>✦</i><i>♡</i><i>✦</i><i>★</i></span>
    </span>
  );
}

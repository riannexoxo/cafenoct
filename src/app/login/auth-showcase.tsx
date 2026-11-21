"use client";

// The left side of the sign-in pages: a short pitch, a "Built for…" line that changes with a rotating
// demo panel, a rolling strip of features, and Nocti trailing the pointer around the panel.
// Reduced motion: nothing rotates or rolls on its own; the dots still switch panels.
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import Nocti, { type NoctiState } from "@/components/nocti";
import { brand } from "@/brand";

const SCENES = [
  { id: "day", label: "My Day", line: "the 9pm to-do list" },
  { id: "approve", label: "Approvals", line: "client sign-offs without the chasing" },
  { id: "time", label: "Time", line: "hours you can actually bill" },
  { id: "money", label: "Wallet", line: "invoices that get paid" },
  { id: "portal", label: "Portal", line: "clients who like checking in" },
] as const;

const FEATURES = ["My Day", "Boards & timelines", "Social planner", "No-login approval links", "Client portal", "Time tracker",
  "Invoices", "Wallet", "Pipeline", "Automations", "Booking page", "Intake forms", "Monthly reports", "Ask Nocti"];

const STEP_MS = 5000;

export default function AuthShowcase({ state }: { state: NoctiState }) {
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const art = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const buddy = useRef<HTMLDivElement>(null);

  // Advance the panels (not under reduced motion, not while hovered or focused).
  useEffect(() => {
    if (paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setAt((i) => (i + 1) % SCENES.length), STEP_MS);
    return () => clearTimeout(t);
  }, [at, paused]);

  // Nocti rests beside the demo panel and trails the pointer while it's over this side.
  useEffect(() => {
    const root = art.current!, me = buddy.current!;
    const home = () => {
      const r = root.getBoundingClientRect(), s = stage.current!.getBoundingClientRect();
      return { x: s.right - r.left - 46, y: s.bottom - r.top - 52 };
    };
    const place = () => { const h = home(); gsap.set(me, { x: h.x, y: h.y }); };
    place();
    window.addEventListener("resize", place);
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference) and (hover: hover)", () => {
      const x = gsap.quickTo(me, "x", { duration: 0.9, ease: "power3.out" });
      const y = gsap.quickTo(me, "y", { duration: 0.9, ease: "power3.out" });
      const tilt = gsap.quickTo(me, "rotation", { duration: 0.5, ease: "power2.out" });
      let lastX = 0;
      const move = (e: PointerEvent) => {
        const r = root.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        // Sit just below-right of the pointer so she never covers what you're pointing at.
        x(Math.min(px + 26, r.width - 70)); y(Math.min(py + 22, r.height - 80));
        tilt(Math.max(-10, Math.min(10, (e.clientX - lastX) * 0.6))); lastX = e.clientX;
      };
      const leave = () => { const h = home(); x(h.x); y(h.y); tilt(0); };
      root.addEventListener("pointermove", move);
      root.addEventListener("pointerleave", leave);
      return () => { root.removeEventListener("pointermove", move); root.removeEventListener("pointerleave", leave); };
    });
    return () => { window.removeEventListener("resize", place); mm.revert(); };
  }, []);

  const scene = SCENES[at];
  return (
    <section ref={art} className="auth-art" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <span className="auth-moon" aria-hidden="true" />
      <span className="auth-star s1" aria-hidden="true">✦</span><span className="auth-star s2" aria-hidden="true">✦</span>
      <span className="auth-star s3" aria-hidden="true">♡</span>

      <div className="show">
        <span className="show-eyebrow">For virtual assistants · invite-only</span>
        <h2 className="show-title">Every client, every task, one cozy desk.</h2>
        <p className="show-desc">{brand.description}</p>
        <p className="show-line" aria-live="polite">
          Built for <span key={scene.id} className="show-word">{scene.line}</span>
        </p>

        <div ref={stage} className="show-stage" aria-hidden="true">
          {SCENES.map((s, i) => <div key={s.id} className="demo" data-on={i === at ? "1" : undefined}><Demo id={s.id} on={i === at} /></div>)}
        </div>

        <div className="show-dots">
          {SCENES.map((s, i) => (
            <button key={s.id} type="button" className="show-dot" aria-label={`Show ${s.label}`} aria-pressed={i === at}
              onClick={() => setAt(i)}><span>{s.label}</span></button>
          ))}
        </div>
      </div>

      <div className="show-roll">
        <ul className="show-track">
          {FEATURES.map((f) => <li key={f}>{f}</li>)}
          {FEATURES.map((f) => <li key={`${f}-2`} aria-hidden="true">{f}</li>)}
        </ul>
      </div>

      <div ref={buddy} className="show-buddy" aria-hidden="true"><Nocti mood="sleepy" state={state} size={72} follow /></div>
    </section>
  );
}

// Small fake screens. Sample names only; nothing here is real data.
function Demo({ id, on }: { id: (typeof SCENES)[number]["id"]; on: boolean }) {
  if (id === "day") return (
    <>
      <header className="demo-head"><b>Tonight</b><span className="demo-pill">3 left</span></header>
      <ul className="demo-tasks">
        <li><i className="tick" />Send Bloom Studio&apos;s carousel for approval<em className="tag lav">Content</em></li>
        <li><i className="tick" />Log 2h on the Maple &amp; Co. launch<em className="tag mint">Time</em></li>
        <li><i className="tick" />Nudge invoice INV-1042<em className="tag butter">Money</em></li>
        <li><i className="tick" />Reply to Juno&apos;s brief<em className="tag blush">Inbox</em></li>
      </ul>
    </>
  );
  if (id === "approve") return (
    <>
      <header className="demo-head"><b>Bloom Studio · Fri 7:00 pm</b><span className="demo-pill">Instagram</span></header>
      <div className="demo-post">
        <div className="demo-cover"><span>New in: the autumn edit ✦</span></div>
        <div className="demo-post-side">
          <p>Swipe for the five pieces we can&apos;t stop wearing…</p>
          <span className="demo-btn">Approve</span>
          <span className="demo-stamp">Approved by client ✓</span>
        </div>
      </div>
    </>
  );
  if (id === "time") return <TimeDemo on={on} />;
  if (id === "money") return (
    <>
      <header className="demo-head"><b>Wallet · this month</b><span className="demo-pill up">▲ vs last month</span></header>
      <div className="demo-bars">{[38, 52, 44, 61, 57, 72, 86].map((h, i) => <i key={i} style={{ "--h": `${h}%`, "--d": `${i * 70}ms` } as React.CSSProperties} />)}</div>
      <div className="demo-row"><span>INV-1042 · Maple &amp; Co.</span><span className="demo-paid">Paid ✓</span></div>
    </>
  );
  return (
    <>
      <header className="demo-head"><b>Juno Wellness · client portal</b><span className="demo-pill">3 items</span></header>
      <ul className="demo-portal">
        <li><span>October content calendar</span><em className="st done">Approved</em></li>
        <li><span>Newsletter draft #12</span><em className="st wait">With client</em></li>
        <li><span>Monthly report · PDF</span><em className="st new">New</em></li>
      </ul>
    </>
  );
}

function TimeDemo({ on }: { on: boolean }) {
  const [s, setS] = useState(5077);
  useEffect(() => {
    if (!on || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setS((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [on]);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <>
      <header className="demo-head"><b>Timer</b><span className="demo-pill live">● Running</span></header>
      <div className="demo-clock">{pad(Math.floor(s / 3600))}:{pad(Math.floor(s / 60) % 60)}:{pad(s % 60)}</div>
      <p className="demo-sub">Maple &amp; Co. · Launch emails</p>
      <div className="demo-row"><span>6h 40m unbilled this week</span><span className="demo-btn sm">Invoice it</span></div>
    </>
  );
}

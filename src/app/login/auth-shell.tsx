"use client";

// The cozy frame around every sign-in page: Nocti on one side, the form on the other (stacked on phones).
import { useEffect, useRef } from "react";
import gsap from "gsap";
import Nocti, { type NoctiState } from "@/components/nocti";
import { brand } from "@/brand";
import "@/styles/auth.css";

export default function AuthShell({ state = "idle", title, lede, children, foot }: {
  state?: NoctiState; title: string; lede: string; children: React.ReactNode; foot?: React.ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(card.current!.children, { y: 14, opacity: 0, duration: 0.5, ease: "power3.out", stagger: 0.05, clearProps: "all" });
      gsap.from(".auth-art .auth-moon, .auth-art .auth-star", { opacity: 0, scale: 0.6, duration: 0.8, ease: "back.out(1.7)", stagger: 0.08 });
    });
    return () => mm.revert();
  }, []);
  return (
    <main className="auth">
      <section className="auth-art" aria-hidden="true">
        <span className="auth-moon" />
        <span className="auth-star s1">✦</span><span className="auth-star s2">✦</span><span className="auth-star s3">♡</span>
        <div className="auth-nocti"><Nocti mood="sleepy" state={state} size={240} follow /></div>
        <p className="auth-art-line">{brand.tagline}</p>
      </section>
      <section className="auth-panel">
        <div className="auth-card2" ref={card}>
          <div className="auth-brand">
            <span className="auth-mini"><Nocti mood="sleepy" state={state} size={44} /></span>
            <span>{brand.name}</span>
          </div>
          <h1>{title}</h1>
          <p className="auth-lede">{lede}</p>
          {children}
          {foot && <div className="auth-foot">{foot}</div>}
        </div>
      </section>
    </main>
  );
}

// A password box with a show/hide eye and a caps-lock heads-up.
export function PasswordField({ id, label, value, onChange, autoComplete, onFocus, onBlur, describedBy }: {
  id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: "current-password" | "new-password";
  onFocus?: () => void; onBlur?: () => void; describedBy?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const caps = useRef<HTMLSpanElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const flip = () => {
    const el = input.current!, show = el.type === "password";
    el.type = show ? "text" : "password";
    toggle.current!.setAttribute("aria-pressed", String(show));
    toggle.current!.setAttribute("aria-label", show ? "Hide password" : "Show password");
    toggle.current!.dataset.on = show ? "1" : "";
    el.focus();
  };
  const key = (e: React.KeyboardEvent) => { if (caps.current) caps.current.hidden = !e.getModifierState("CapsLock"); };
  return (
    <div className="field full">
      <label htmlFor={id}>{label}</label>
      <div className="pw">
        <input ref={input} id={id} type="password" autoComplete={autoComplete} required value={value} maxLength={72}
          spellCheck={false} autoCapitalize="none" autoCorrect="off" aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)} onKeyUp={key} onKeyDown={key}
          onFocus={onFocus} onBlur={(e) => { if (caps.current) caps.current.hidden = true; if (e.target.type === "text") flip(); onBlur?.(); }} />
        <button ref={toggle} type="button" className="pw-eye" aria-label="Show password" aria-pressed="false" aria-controls={id}
          onMouseDown={(e) => e.preventDefault()} onClick={flip}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" /><path className="pw-slash" d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </div>
      <span ref={caps} className="pw-caps" hidden>Caps Lock is on</span>
    </div>
  );
}

export function StrengthMeter({ score, label, hint, id }: { score: number; label: string; hint: string; id: string }) {
  return (
    <div className="pw-meter" id={id} aria-live="polite">
      <span className="pw-bars" data-score={score}><i /><i /><i /><i /></span>
      <span className="small muted">{label ? <b>{label}. </b> : null}{hint}</span>
    </div>
  );
}

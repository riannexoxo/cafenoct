"use client";

// Cloudflare Turnstile, the bot check on sign-in, sign-up and password reset.
// Only shows when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; without it, auth works exactly as before.
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TS = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void };
declare global { interface Window { turnstile?: TS } }

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

// `resetKey`: bump it after a failed attempt (tokens are single-use).
export default function Turnstile({ onToken, resetKey = 0 }: { onToken: (t: string) => void; resetKey?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef("");
  const cb = useRef(onToken);
  useEffect(() => { cb.current = onToken; });
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!window.turnstile);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !ready || !box.current || !window.turnstile) return;
    id.current = window.turnstile.render(box.current, {
      sitekey: TURNSTILE_SITE_KEY, theme: "auto", size: "flexible",
      callback: (t: string) => cb.current(t), "expired-callback": () => cb.current(""), "error-callback": () => cb.current(""),
    });
    return () => { if (id.current) window.turnstile?.remove(id.current); id.current = ""; };
  }, [ready]);

  useEffect(() => {
    if (resetKey && id.current) { window.turnstile?.reset(id.current); cb.current(""); }
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setReady(true)} />
      <div ref={box} className="turnstile" />
    </>
  );
}

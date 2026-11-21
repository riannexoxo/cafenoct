"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError, newPasswordProblem, passwordStrength } from "@/lib/auth-ui";
import type { NoctiState } from "@/components/nocti";
import Turnstile, { TURNSTILE_SITE_KEY } from "@/components/turnstile";
import AuthShell, { PasswordField, StrengthMeter } from "./auth-shell";

// Sign in, or create an account with an invite code (CafeNoct is invite-only for now).
export default function LoginForm({ invite = "", notice = "" }: { invite?: string; notice?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">(invite ? "up" : "in");
  const [code, setCode] = useState(invite);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(notice);
  const [busy, setBusy] = useState(false);
  const [nocti, setNocti] = useState<NoctiState>("idle");
  const [captcha, setCaptcha] = useState("");
  const [resetCaptcha, setResetCaptcha] = useState(0);
  const up = mode === "up";
  const strength = passwordStrength(password, email);

  function fail(text: string) {
    setBusy(false); setMessage(text); setNocti("oops"); setResetCaptcha((n) => n + 1);
    setTimeout(() => setNocti("idle"), 900);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const mail = email.trim().toLowerCase();
    if (!mail || !password) return fail("Enter your email and password.");
    if (up) { const p = newPasswordProblem(password, mail); if (p) return fail(p); }
    if (TURNSTILE_SITE_KEY && !captcha) return fail("Please finish the quick check first.");
    setBusy(true); setNocti("thinking");
    if (up) {
      setMessage("Brewing your account…");
      const r = await fetch("/api/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invite: code, name, email: mail, password, captcha }) })
        .then((x) => x.json()).catch(() => ({ error: "Check your connection and try again." }));
      if (r.error) return fail(r.error);
      setResetCaptcha((n) => n + 1); // the sign-up used the token; sign in below gets a fresh one if needed
    } else setMessage("Signing you in…");
    const { error } = await createClient().auth.signInWithPassword({ email: mail, password, options: TURNSTILE_SITE_KEY && !up ? { captchaToken: captcha } : undefined });
    if (error) return fail(up ? "Your account is ready. Please sign in." : friendlyAuthError(error));
    setPassword(""); setNocti("happy"); setMessage("Welcome back ♡");
    router.replace("/");
    router.refresh();
  }

  const switchMode = () => { setMode(up ? "in" : "up"); setMessage(""); setNocti("idle"); };

  return (
    <AuthShell
      state={nocti}
      title={up ? "Join CafeNoct" : "Welcome back"}
      lede={up ? "You'll need the invite code you were sent." : "Sign in to your late-night workspace."}
      foot={
        <>
          <button type="button" className="linkish" disabled={busy} onClick={switchMode}>{up ? "I already have an account" : "I have an invite code"}</button>
          {!up && <Link className="linkish" href="/forgot-password">Forgot password?</Link>}
        </>
      }
    >
      <form className="form auth-form" onSubmit={submit} noValidate>
        {up && (
          <>
            <div className="field full">
              <label htmlFor="invite">Invite code</label>
              <input id="invite" required autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={40} value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="From the person who invited you" />
            </div>
            <div className="field full">
              <label htmlFor="name">Your name</label>
              <input id="name" autoComplete="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </>
        )}
        <div className="field full">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254}
            value={email} onChange={(e) => { setEmail(e.target.value); setNocti("watch"); }} onBlur={() => setNocti("idle")} />
        </div>
        <PasswordField id="password" label={up ? "Choose a password" : "Password"} value={password} onChange={setPassword}
          autoComplete={up ? "new-password" : "current-password"} describedBy={up ? "pw-meter" : undefined}
          onFocus={() => setNocti("privacy")} onBlur={() => setNocti("idle")} />
        {up && <StrengthMeter id="pw-meter" {...strength} />}
        <Turnstile onToken={setCaptcha} resetKey={resetCaptcha} />
        <p className="auth-msg" role="status" aria-live="polite">{message}</p>
        <button type="submit" className="btn solid auth-go" disabled={busy}>{busy ? "One moment…" : up ? "Create my account" : "Sign in"}</button>
      </form>
    </AuthShell>
  );
}

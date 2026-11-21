"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth-ui";
import type { NoctiState } from "@/components/nocti";
import Turnstile, { TURNSTILE_SITE_KEY } from "@/components/turnstile";
import AuthShell from "../login/auth-shell";

// Ask for a reset link. The answer is the same whether or not the email has an account, so nobody can use
// this page to find out who has one.
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [nocti, setNocti] = useState<NoctiState>("idle");
  const [captcha, setCaptcha] = useState("");
  const [resetCaptcha, setResetCaptcha] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const mail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { setNocti("oops"); return setMessage("Enter the email you sign in with."); }
    if (TURNSTILE_SITE_KEY && !captcha) return setMessage("Please finish the quick check first.");
    setBusy(true); setNocti("thinking"); setMessage("");
    const { error } = await createClient().auth.resetPasswordForEmail(mail, {
      redirectTo: `${location.origin}/auth/confirm?next=/account/password`,
      captchaToken: TURNSTILE_SITE_KEY ? captcha : undefined,
    });
    setBusy(false); setResetCaptcha((n) => n + 1);
    // Rate limits and captcha problems are worth telling; "no such user" never is.
    if (error && (error.status === 429 || /rate|captcha|fetch|network/i.test(error.message))) {
      setNocti("oops"); return setMessage(friendlyAuthError(error, "email"));
    }
    setSent(true); setNocti("happy");
  }

  return (
    <AuthShell state={nocti} title={sent ? "Check your inbox" : "Forgot your password?"}
      lede={sent ? `If ${email.trim()} has a CafeNoct account, a reset link is on its way. It works once and expires in an hour.` : "No worries. We'll email you a link to choose a new one."}
      foot={<Link className="linkish" href="/login">Back to sign in</Link>}>
      {sent ? (
        <div className="auth-sent">
          <p className="small muted">Nothing after a few minutes? Check spam, or try again in a little while. We can send 2 emails an hour.</p>
          <button type="button" className="btn" onClick={() => { setSent(false); setNocti("idle"); }}>Use a different email</button>
        </div>
      ) : (
        <form className="form auth-form" onSubmit={submit} noValidate>
          <div className="field full">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254}
              value={email} onChange={(e) => { setEmail(e.target.value); setNocti("watch"); }} onBlur={() => setNocti("idle")} />
          </div>
          <Turnstile onToken={setCaptcha} resetKey={resetCaptcha} />
          <p className="auth-msg" role="status" aria-live="polite">{message}</p>
          <button type="submit" className="btn solid auth-go" disabled={busy}>{busy ? "Sending…" : "Email me a reset link"}</button>
        </form>
      )}
    </AuthShell>
  );
}

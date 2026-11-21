"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError, newPasswordProblem, passwordStrength } from "@/lib/auth-ui";
import type { NoctiState } from "@/components/nocti";
import AuthShell, { PasswordField, StrengthMeter } from "../../login/auth-shell";

// Choose a new password. Reached from a reset email (the link signs you in first) or from Settings.
export default function ChangePassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const [nocti, setNocti] = useState<NoctiState>("idle");
  const strength = passwordStrength(pw, email);

  useEffect(() => { createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? "")); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = newPasswordProblem(pw, email) || (pw !== again ? "The two passwords don't match." : "");
    if (problem) { setNocti("oops"); return setMessage(problem); }
    setBusy(true); setNocti("thinking"); setMessage("");
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setNocti("oops"); return setMessage(friendlyAuthError(error, "password")); }
    setPw(""); setAgain(""); setDone(true); setNocti("happy");
  }

  return (
    <AuthShell state={nocti} title={done ? "All set" : "Choose a new password"}
      lede={done ? "Your password is updated. Other devices stay signed in until they sign out." : email ? `For ${email}.` : "Make it long and easy for you to remember."}
      foot={<Link className="linkish" href="/">Back to CafeNoct</Link>}>
      {done ? (
        <button type="button" className="btn solid auth-go" onClick={() => { router.replace("/"); router.refresh(); }}>Open my workspace</button>
      ) : (
        <form className="form auth-form" onSubmit={submit} noValidate>
          {/* Helps password managers save the new password under the right account. */}
          <input type="email" autoComplete="username" value={email} readOnly hidden />
          <PasswordField id="new" label="New password" value={pw} onChange={setPw} autoComplete="new-password" describedBy="pw-meter"
            onFocus={() => setNocti("privacy")} onBlur={() => setNocti("idle")} />
          <StrengthMeter id="pw-meter" {...strength} />
          <PasswordField id="again" label="Type it again" value={again} onChange={setAgain} autoComplete="new-password"
            onFocus={() => setNocti("privacy")} onBlur={() => setNocti("idle")} />
          <p className="auth-msg" role="status" aria-live="polite">{message}</p>
          <button type="submit" className="btn solid auth-go" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
        </form>
      )}
    </AuthShell>
  );
}

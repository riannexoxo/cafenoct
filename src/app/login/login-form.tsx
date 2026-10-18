"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(kind: "in" | "up") {
    if (!email || password.length < 8) {
      setMessage("Enter your email and a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    setMessage(kind === "up" ? "Creating your account…" : "Signing in…");
    const supabase = createClient();
    const { data, error } =
      kind === "up"
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } })
        : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setMessage(error.message.includes("Invalid login") ? "That email and password don't match." : error.message);
      return;
    }
    if (!data.session) {
      setMessage("Check your email for a confirmation link. It brings you right back here, signed in.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form
      className="form auth-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit("in");
      }}
    >
      <div className="field full">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field full">
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <p className="small auth-msg" role="status">{message}</p>
      <div className="row full" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn" disabled={busy} onClick={() => submit("up")}>Create account</button>
        <button type="submit" className="btn solid" disabled={busy}>Sign in</button>
      </div>
    </form>
  );
}

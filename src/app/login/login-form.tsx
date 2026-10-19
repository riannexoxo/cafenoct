"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Sign in, or create an account with an invite code (CafeNoct is invite-only for now).
export default function LoginForm({ invite = "" }: { invite?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">(invite ? "up" : "in");
  const [code, setCode] = useState(invite);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || password.length < 8) return setMessage("Enter your email and a password of at least 8 characters.");
    setBusy(true);
    if (mode === "up") {
      setMessage("Creating your account…");
      const r = await fetch("/api/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invite: code, name, email, password }) }).then((x) => x.json()).catch(() => ({ error: "Check your connection and try again." }));
      if (r.error) { setBusy(false); return setMessage(r.error); }
    } else setMessage("Signing in…");
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setMessage(error.message.includes("Invalid login") ? "That email and password don't match." : error.message);
    router.replace("/");
    router.refresh();
  }

  const up = mode === "up";
  return (
    <form className="form auth-form" onSubmit={submit}>
      {up && (
        <>
          <div className="field full">
            <label htmlFor="invite">Invite code</label>
            <input id="invite" required autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="From the person who invited you" />
          </div>
          <div className="field full">
            <label htmlFor="name">Your name</label>
            <input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </>
      )}
      <div className="field full">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field full">
        <label htmlFor="password">{up ? "Choose a password" : "Password"}</label>
        <input id="password" type="password" autoComplete={up ? "new-password" : "current-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <p className="small auth-msg" role="status">{message}</p>
      <div className="row full" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn" disabled={busy} onClick={() => { setMode(up ? "in" : "up"); setMessage(""); }}>{up ? "I have an account" : "I have an invite"}</button>
        <button type="submit" className="btn solid" disabled={busy}>{up ? "Create account" : "Sign in"}</button>
      </div>
    </form>
  );
}

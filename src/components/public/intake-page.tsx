"use client";

import { useState } from "react";
import { supabase } from "@/lib/use-rows";
import Nocti from "@/components/nocti";

// Name, email, what you need. intake_submit turns it into a task for the owner.
export default function IntakePage({ slug, title, intro, owner }: { slug: string; title: string; intro: string; owner: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) || !msg.trim()) return setErr("Please fill in your name, a working email and your request.");
    setBusy(true); setErr("");
    const { error } = await supabase().rpc("intake_submit", { p_slug: slug, p_name: name.trim(), p_email: email.trim(), p_message: msg.trim() });
    setBusy(false);
    if (!error) { setDone(true); setMsg(""); return; }
    setErr(
      error.code === "22023" ? "Please fill in your name, a working email and your request."
        : error.code === "54000" ? "Lots of requests right now. Please try again in a little while."
        : error.code === "P0002" ? "This form was just closed. Ask for a fresh link."
        : "Could not send that. Check your connection and try again.",
    );
  }

  if (done) return (
    <div className="pt-calm pb-done" role="status">
      <Nocti mood="awake" state="happy" size={112} />
      <h1>Got it, thank you!</h1>
      <p className="muted">{owner ? `${owner} has your request` : "Your request is in"} and will be in touch soon.</p>
      <button type="button" className="btn big" onClick={() => setDone(false)}>Send another</button>
    </div>
  );

  return (
    <>
      <div className="pt-ask">
        {owner && <div className="eyebrow">{owner}</div>}
        <h1>{title}</h1>
        {intro && <p className="pb-intro">{intro}</p>}
      </div>
      {err && <div className="pb-err" role="alert">{err}</div>}
      <section className="card pb-step">
        <form className="form pb-form" onSubmit={send}>
          <div className="field full"><label htmlFor="in-name">Your name</label><input id="in-name" autoComplete="name" maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field full"><label htmlFor="in-email">Email</label><input id="in-email" type="email" inputMode="email" autoComplete="email" maxLength={254} required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field full">
            <label htmlFor="in-msg">What do you need?</label>
            <textarea id="in-msg" maxLength={4000} required value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="The task, any links, and when you need it by" style={{ minHeight: 160 }} aria-describedby="in-count" />
            <span id="in-count" className="small muted pb-count">{msg.length}/4000</span>
          </div>
          <button type="submit" className="btn solid big full" disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
        </form>
      </section>
      <p className="small muted pt-fine">No account needed. Your details go only to {owner || "the person who shared this link"}.</p>
    </>
  );
}

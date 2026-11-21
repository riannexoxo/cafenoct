"use client";

import "@/styles/social.css";
import "@/styles/portal.css";
import { useState } from "react";
import { useRows } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import Icon from "./icon";
import Nocti from "./nocti";

type Access = { id: string; email: string; status: "invited" | "active" | "revoked"; invite_code: string | null; created_at: string };
const TONE = { invited: "warn", active: "good", revoked: "" } as const;
const WORD = { invited: "Invited", active: "Has access", revoked: "Revoked" } as const;

// Give a client their own calm view of the work: projects, deliverables, posts and invoices.
export default function PortalInvite({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [rows, reload] = useRows<Access>(`portal-access:${clientId}`, (s) => s.from("portal_access").select("id,email,status,invite_code,created_at")
    .eq("client_id", clientId).order("created_at", { ascending: false }).limit(30), ["portal_access"]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [sure, setSure] = useState("");

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return toast("Enter their email first.");
    setBusy(true);
    const r = await fetch("/api/portal/invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId, email }) }).catch(() => null);
    const j = await r?.json().catch(() => ({})) ?? {};
    setBusy(false);
    if (!r?.ok || !j.link) return toast(j.error || "Couldn't make the invite. Try again.");
    setLink(j.link);
    setEmail("");
    reload();
    copy(j.link);
  }
  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); toast("Sign-up link copied. Send it to your client."); }
    catch { toast("Copy was blocked here. Select the link and copy it."); }
  }
  async function revoke(id: string) {
    if (sure !== id) return setSure(id);
    setSure("");
    const r = await fetch("/api/portal/invite", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
    toast(r?.ok ? "Access removed." : "Couldn't revoke. Try again.");
    reload();
  }

  const list = rows ?? [];
  return (
    <section className="card pin-card" aria-labelledby="pin-h">
      <h3 id="pin-h"><span>Client portal</span>{list.some((r) => r.status === "active") && <span className="pill good">Live</span>}</h3>
      <p className="small muted" style={{ marginTop: 0 }}>
        {clientName} signs in and sees projects, deliverables, posts and invoices, and can approve or ask for changes.
      </p>
      <form className="pin-form" onSubmit={invite}>
        <div className="field grow">
          <label htmlFor={`pin-${clientId}`}>Their email</label>
          <input id={`pin-${clientId}`} type="email" inputMode="email" autoComplete="off" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@business.com" />
        </div>
        <button type="submit" className="btn solid" disabled={busy}><Icon name="link" />{busy ? "Making link…" : "Make invite link"}</button>
      </form>
      {link && (
        <div className="share-url pin-link">
          <input readOnly value={link} aria-label="Sign-up link" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn small" onClick={() => copy(link)}><Icon name="copy" />Copy</button>
        </div>
      )}
      <p className="small muted pin-hint"><Icon name="spark" size={13} /> CafeNoct doesn&apos;t email this for you yet. Copy the link and send it in your usual chat or email.</p>

      {rows === null ? <div className="skel" style={{ height: 48, borderRadius: 14 }} /> : list.length === 0 ? (
        <div className="empty pin-empty"><Nocti size={56} /><span>No one invited yet.</span></div>
      ) : (
        <ul className="pin-list">
          {list.map((r) => (
            <li key={r.id}>
              <span className="grow pin-email">{r.email || "No email"}</span>
              <span className={`pill ${TONE[r.status]}`}>{WORD[r.status]}</span>
              {r.status === "invited" && r.invite_code && (
                <button type="button" className="btn small" onClick={() => copy(`${location.origin}/login?invite=${r.invite_code}`)}><Icon name="copy" />Copy link</button>
              )}
              {r.status !== "revoked" && (
                <button type="button" className={`btn small ghost danger${sure === r.id ? " sure" : ""}`} onClick={() => revoke(r.id)} onBlur={() => setSure("")}>
                  {sure === r.id ? "Tap again" : "Revoke"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

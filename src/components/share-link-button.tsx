"use client";

import "@/styles/social.css";
import { useState } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import Icon from "./icon";

type Link = { id: string; token: string; expires_at: string; revoked: boolean; decision: "" | "approved" | "changes"; decided_at: string | null; created_at: string };
const fmt = (s: string) => new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// "Send for approval": a private link your client opens without signing in. Reuses a link that is still open.
export default function ShareLinkButton({ entity, entityId, clientId }: { entity: "post" | "deliverable"; entityId: string; clientId: string | null }) {
  const [links] = useRows<Link>(`share:${entity}:${entityId}`, (s) => s.from("share_links").select("id,token,expires_at,revoked,decision,decided_at,created_at")
    .eq("entity", entity).eq("entity_id", entityId).order("created_at", { ascending: false }).limit(10), ["share_links"]);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const open = (links ?? []).find((l) => !l.revoked && Date.parse(l.expires_at) > now);
  const decided = (links ?? []).find((l) => l.decision);
  const url = open ? `${location.origin}/approve/${open.token}` : "";

  async function create() {
    setBusy(true);
    const { error } = await supabase().from("share_links").insert({ entity, entity_id: entityId, client_id: clientId });
    setBusy(false);
    if (error) return toast("Could not make the link. Try again.");
    toast("Approval link ready");
  }
  async function revoke() {
    if (!open) return;
    const { error } = await supabase().from("share_links").update({ revoked: true }).eq("id", open.id);
    toast(error ? "Could not turn the link off. Try again." : "Link turned off. Anyone who has it can't open it now.");
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); toast("Link copied. Send it to your client."); }
    catch { toast("Copy was blocked here."); }
  }

  return (
    <div className="share-link">
      {decided && (
        <span className={`share-decision ${decided.decision}`}>
          <Icon name={decided.decision === "approved" ? "check" : "chat"} size={13} />
          {decided.decision === "approved" ? "Approved" : "Changes asked"}{decided.decided_at ? ` · ${fmt(decided.decided_at)}` : ""}
        </span>
      )}
      {open ? (
        <>
          <div className="share-url">
            <input readOnly value={url} aria-label="Approval link" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn small" onClick={copy}><Icon name="copy" />Copy</button>
          </div>
          <span className="small muted">Open until {fmt(open.expires_at)}.</span>
          <button type="button" className="btn small ghost danger" onClick={revoke}>Turn off link</button>
        </>
      ) : (
        <button type="button" className="btn small" onClick={create} disabled={busy || links === null}><Icon name="link" />{busy ? "Making link…" : "Send for approval"}</button>
      )}
    </div>
  );
}

"use client";

import "@/styles/portal.css";
import { useState } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import Icon from "./icon";

type Entity = "deliverable" | "post" | "project" | "invoice";
type Row = { id: string; author: "me" | "client"; author_name: string; body: string; shared: boolean; created_at: string };
const when = (s: string) => new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// The conversation on one item. Your notes stay private unless you share them; your client's comments arrive here from the portal or an approval link.
export default function CommentThread({ entity, entityId, clientId }: { entity: Entity; entityId: string; clientId: string | null }) {
  const [rows, reload] = useRows<Row>(`comments:${entity}:${entityId}`, (s) => s.from("comments").select("id,author,author_name,body,shared,created_at")
    .eq("entity", entity).eq("entity_id", entityId).order("created_at").limit(200), ["comments"]);
  const [body, setBody] = useState("");
  const [shared, setShared] = useState(!!clientId);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState("");

  async function send() {
    const text = body.trim();
    if (!text) return toast("Write something first.");
    setBusy(true);
    const { error } = await supabase().from("comments").insert({ entity, entity_id: entityId, client_id: clientId, body: text.slice(0, 4000), shared: !!clientId && shared });
    setBusy(false);
    if (error) return toast("Could not post that. Try again.");
    setBody("");
    reload();
  }
  async function remove(id: string) {
    if (sure !== id) return setSure(id);
    setSure("");
    const { error } = await supabase().from("comments").delete().eq("id", id).eq("author", "me");
    if (error) toast("Could not delete it. Try again.");
    reload();
  }

  const list = rows ?? [];
  return (
    <div className="ct full" aria-label="Comments">
      <div className="ct-h"><b>Comments</b><span className="small muted">{list.length || ""}</span></div>
      {rows === null ? <div className="skel" style={{ height: 44, borderRadius: 14 }} /> : list.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>No comments yet.{clientId ? " Your client's replies land here too." : ""}</p>
      ) : (
        <ol className="ct-list">
          {list.map((c) => (
            <li key={c.id} className={c.author === "client" ? "client" : ""}>
              <div className="ct-who">
                <b>{c.author === "client" ? c.author_name || "Client" : "You"}</b>
                {c.author === "client" ? <span className="pill acc">Client</span> : c.shared ? <span className="pill">Client can see</span> : <span className="pill">Private</span>}
                <span className="small muted">{when(c.created_at)}</span>
                {c.author === "me" && (
                  <button type="button" className="btn small ghost danger ct-del" onClick={() => remove(c.id)} onBlur={() => setSure("")} aria-label={sure === c.id ? "Tap again to delete" : "Delete comment"}>
                    {sure === c.id ? "Tap again" : <Icon name="x" size={14} />}
                  </button>
                )}
              </div>
              <p>{c.body}</p>
            </li>
          ))}
        </ol>
      )}
      <div className="ct-reply">
        <label htmlFor={`ct-${entityId}`} className="sr-only">Write a comment</label>
        <textarea id={`ct-${entityId}`} rows={2} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={shared && clientId ? "Reply to your client…" : "Add a private note…"}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
        <div className="row ct-foot">
          {clientId && (
            <label className="ct-share">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
              Visible to client
            </label>
          )}
          <button type="button" className="btn small solid" disabled={busy || !body.trim()} onClick={send}><Icon name="chat" />{busy ? "Posting…" : "Post"}</button>
        </div>
      </div>
    </div>
  );
}

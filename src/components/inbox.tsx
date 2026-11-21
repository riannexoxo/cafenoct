"use client";

// One inbox for everything that needs you: client approvals and comments, failed posts, invoice events,
// automation results, bookings and new requests. Live, filterable, mark read, save for later.
import { useMemo, useState } from "react";
import Link from "next/link";
import { supabase, useRows } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import Seg from "./seg";
import Nocti from "./nocti";
import "@/styles/inbox.css";

export type Note = {
  id: string; kind: string; title: string; body: string; href: string; entity: string | null; entity_id: string | null;
  client_id: string | null; read_at: string | null; saved: boolean; created_at: string;
};
const COLS = "id,kind,title,body,href,entity,entity_id,client_id,read_at,saved,created_at";

const FILTERS: [string, string][] = [["all", "All"], ["unread", "Unread"], ["clients", "Clients"], ["posts", "Posts"], ["money", "Money"], ["saved", "Saved"]];
const GROUP: Record<string, string> = { approval: "clients", changes: "clients", comment: "clients", booking: "clients", intake: "clients", post_failed: "posts", invoice: "money", automation: "all", system: "all" };
const LOOK: Record<string, { mark: string; tone: string; label: string }> = {
  approval: { mark: "✓", tone: "mint", label: "Approved" }, changes: { mark: "↺", tone: "blush", label: "Changes" },
  comment: { mark: "“", tone: "lav", label: "Comment" }, post_failed: { mark: "!", tone: "plum", label: "Post failed" },
  invoice: { mark: "$", tone: "butter", label: "Money" }, automation: { mark: "✦", tone: "cream", label: "Automation" },
  booking: { mark: "◷", tone: "lav", label: "Booking" }, intake: { mark: "✉", tone: "mint", label: "Request" }, system: { mark: "•", tone: "cream", label: "CafeNoct" },
};

function ago(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function Inbox({ clients }: { clients: Client[] }) {
  const [rows, reload, setRows] = useRows<Note>("inbox", (s) => s.from("notifications").select(COLS).order("created_at", { ascending: false }).limit(200), ["notifications"]);
  const [filter, setFilter] = useState("all");
  const name = (id: string | null) => { const c = clients.find((x) => x.id === id); return c ? clientLabel(c) : ""; };
  const list = useMemo(() => (rows ?? []).filter((n) =>
    filter === "all" ? true : filter === "unread" ? !n.read_at : filter === "saved" ? n.saved : GROUP[n.kind] === filter), [rows, filter]);
  const unread = (rows ?? []).filter((n) => !n.read_at).length;

  async function patch(n: Note, change: Partial<Note>) {
    setRows((r) => (r ?? []).map((x) => (x.id === n.id ? { ...x, ...change } : x)));
    const { error } = await supabase().from("notifications").update(change).eq("id", n.id);
    if (error) { reload(); toast("Couldn't update that. Try again."); }
  }
  async function readAll() {
    const ids = (rows ?? []).filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    const at = new Date().toISOString();
    setRows((r) => (r ?? []).map((x) => (x.read_at ? x : { ...x, read_at: at })));
    const { error } = await supabase().from("notifications").update({ read_at: at }).in("id", ids);
    if (error) { reload(); toast("Couldn't mark everything read."); }
  }
  async function remove(n: Note) {
    setRows((r) => (r ?? []).filter((x) => x.id !== n.id));
    const { error } = await supabase().from("notifications").delete().eq("id", n.id);
    if (error) { reload(); toast("Couldn't clear that."); }
  }

  return (
    <div className="inbox">
      <div className="inbox-bar">
        <Seg label="Filter the inbox" value={filter} onChange={setFilter} options={FILTERS} />
        <button type="button" className="btn small ghost" onClick={readAll} disabled={!unread}>Mark all read</button>
      </div>
      {rows === null ? <p className="muted">Loading…</p> : list.length === 0 ? (
        <div className="inbox-empty">
          <Nocti mood="sleepy" size={96} />
          <b>{filter === "all" ? "All quiet." : "Nothing here."}</b>
          <span className="muted">Approvals, comments, failed posts and payments land here as they happen.</span>
        </div>
      ) : (
        <ul className="inbox-list">
          {list.map((n) => {
            const look = LOOK[n.kind] ?? LOOK.system;
            return (
              <li key={n.id} className={`inbox-i${n.read_at ? "" : " unread"}`}>
                <span className={`inbox-mark t-${look.tone}`} aria-hidden="true">{look.mark}</span>
                <div className="inbox-main">
                  <div className="inbox-top">
                    <span className="inbox-kind">{look.label}{n.client_id && name(n.client_id) ? ` · ${name(n.client_id)}` : ""}</span>
                    <time dateTime={n.created_at}>{ago(n.created_at)}</time>
                  </div>
                  {n.href ? <Link href={n.href} className="inbox-title" onClick={() => !n.read_at && patch(n, { read_at: new Date().toISOString() })}>{n.title}</Link>
                    : <b className="inbox-title">{n.title}</b>}
                  {n.body && <p className="inbox-body">{n.body}</p>}
                </div>
                <div className="inbox-acts">
                  <button type="button" className="ib" aria-pressed={n.saved} aria-label={n.saved ? "Unsave" : "Save for later"} title={n.saved ? "Saved" : "Save for later"}
                    onClick={() => patch(n, { saved: !n.saved })}>{n.saved ? "★" : "☆"}</button>
                  <button type="button" className="ib" aria-label={n.read_at ? "Mark unread" : "Mark read"} title={n.read_at ? "Mark unread" : "Mark read"}
                    onClick={() => patch(n, { read_at: n.read_at ? null : new Date().toISOString() })}>{n.read_at ? "○" : "●"}</button>
                  <button type="button" className="ib" aria-label="Clear" title="Clear" onClick={() => remove(n)}>×</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Unread count for the sidebar badge, live.
export function useUnread() {
  const [rows] = useRows<{ id: string }>("inbox-unread", (s) => s.from("notifications").select("id").is("read_at", null).limit(100), ["notifications"]);
  return rows?.length ?? 0;
}

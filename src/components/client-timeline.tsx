"use client";

import "@/styles/client-record.css";
import { useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRows } from "@/lib/use-rows";
import { money } from "@/lib/format";
import { total, type Item as Line } from "@/lib/invoices";
import { parseYmd, ymd } from "@/lib/dates";
import Seg from "./seg";
import Icon, { type IconName } from "./icon";
import Nocti from "./nocti";

type Kind = "work" | "money" | "content" | "messages";
type Tone = "mint" | "butter" | "blush" | "lav" | "caramel";
type Ev = { key: string; at: number; kind: Kind; icon: IconName; tone: Tone; title: string; meta?: string; href?: string; allDay?: boolean };
type Filter = "all" | Kind;
const FILTERS: [Filter, string][] = [["all", "All"], ["work", "Work"], ["money", "Money"], ["content", "Content"], ["messages", "Messages"]];
const PAGE = 25;
const noon = (d: string) => parseYmd(d).getTime() + 12 * 36e5; // date-only rows sort in the middle of their day
const clip = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const ENTITY: Record<string, string> = { deliverable: "a design", post: "a post", project: "a project", invoice: "an invoice" };

// Everything that happened with one client, newest first, from the real records.
async function load(s: SupabaseClient, id: string): Promise<{ data: Ev[] }> {
  const base = `/clients/${id}`;
  const [made, done, time, inv, del, posts, com, notes] = await Promise.all([
    s.from("tasks").select("id,title,created_at").eq("client_id", id).order("created_at", { ascending: false }).limit(150),
    s.from("tasks").select("id,title,done_at").eq("client_id", id).not("done_at", "is", null).order("done_at", { ascending: false }).limit(150),
    s.from("time_entries").select("started_at,minutes").eq("client_id", id).order("started_at", { ascending: false }).limit(600),
    s.from("invoices").select("id,number,issue_date,paid_date,status,currency,items").eq("client_id", id).order("issue_date", { ascending: false }).limit(150),
    // shortcut: delivered dates come from the 150 newest deliverables; add a delivered_at query if clients outgrow it.
    s.from("deliverables").select("id,title,kind,created_at,delivered_at").eq("client_id", id).order("created_at", { ascending: false }).limit(150),
    s.from("posts").select("id,title,publish_on,published_at").eq("client_id", id).eq("status", "Posted").order("publish_on", { ascending: false }).limit(150),
    s.from("comments").select("id,entity,author,author_name,body,created_at").eq("client_id", id).order("created_at", { ascending: false }).limit(150),
    s.from("notifications").select("id,kind,title,body,href,created_at").eq("client_id", id).in("kind", ["approval", "changes", "booking", "intake"]).order("created_at", { ascending: false }).limit(150),
  ]);
  const out: Ev[] = [];
  for (const t of made.data ?? []) out.push({ key: `tc${t.id}`, at: Date.parse(t.created_at), kind: "work", icon: "plus", tone: "lav", title: `Task added: ${clip(t.title)}`, href: `${base}/work` });
  for (const t of done.data ?? []) out.push({ key: `td${t.id}`, at: Date.parse(t.done_at), kind: "work", icon: "check", tone: "mint", title: `Done: ${clip(t.title)}`, href: `${base}/work` });
  const days = new Map<string, { at: number; min: number }>();
  for (const e of time.data ?? []) {
    const at = Date.parse(e.started_at), d = ymd(new Date(at)), cur = days.get(d);
    days.set(d, { at: Math.max(cur?.at ?? 0, at), min: (cur?.min ?? 0) + e.minutes });
  }
  for (const [d, v] of days) out.push({ key: `tm${d}`, at: v.at, kind: "work", icon: "schedule", tone: "butter", title: `${Math.round((v.min / 60) * 10) / 10}h logged` });
  for (const i of inv.data ?? []) {
    const amt = money(total({ items: (i.items ?? []) as Line[] }), i.currency);
    const pay = String(i.number).startsWith("PAY");
    if (i.status !== "draft" && !pay && i.issue_date) out.push({ key: `ii${i.id}`, at: noon(i.issue_date), kind: "money", icon: "file", tone: "caramel", title: `Invoice ${i.number} sent`, meta: amt, href: `${base}/invoices`, allDay: true });
    if (i.status === "paid" && i.paid_date) out.push({ key: `ip${i.id}`, at: noon(i.paid_date), kind: "money", icon: "coin", tone: "mint", title: pay ? "Payment received" : `Invoice ${i.number} paid`, meta: amt, href: `${base}/invoices`, allDay: true });
  }
  for (const d of del.data ?? []) {
    const href = `${base}/${d.kind === "video" ? "edits" : "designs"}`, name = clip(d.title || (d.kind === "video" ? "Video" : "Design"));
    out.push({ key: `dc${d.id}`, at: Date.parse(d.created_at), kind: "content", icon: "content", tone: "lav", title: `Started: ${name}`, href });
    if (d.delivered_at) out.push({ key: `dd${d.id}`, at: Date.parse(d.delivered_at), kind: "content", icon: "check", tone: "mint", title: `Delivered: ${name}`, href });
  }
  for (const p of posts.data ?? []) {
    const at = p.published_at ? Date.parse(p.published_at) : p.publish_on ? noon(p.publish_on) : 0;
    if (at) out.push({ key: `pp${p.id}`, at, kind: "content", icon: "spark", tone: "blush", title: `Posted: ${clip(p.title || "Untitled post")}`, href: `${base}/content`, allDay: !p.published_at });
  }
  for (const c of com.data ?? []) out.push({
    key: `cm${c.id}`, at: Date.parse(c.created_at), kind: "messages", icon: "chat", tone: c.author === "client" ? "blush" : "lav",
    title: `${c.author === "client" ? c.author_name || "Client" : "You"} commented on ${ENTITY[c.entity] ?? "an item"}`, meta: clip(c.body, 140),
  });
  for (const n of notes.data ?? []) {
    const content = n.kind === "approval" || n.kind === "changes";
    out.push({
      key: `nt${n.id}`, at: Date.parse(n.created_at), kind: content ? "content" : "work", icon: n.kind === "approval" ? "check" : n.kind === "changes" ? "repeat" : n.kind === "booking" ? "today" : "bell",
      tone: n.kind === "approval" ? "mint" : n.kind === "changes" ? "butter" : "lav", title: clip(n.title), meta: n.body ? clip(n.body, 140) : undefined, href: n.href?.startsWith("/") ? n.href : undefined,
    });
  }
  return { data: out.filter((e) => Number.isFinite(e.at)).sort((a, b) => b.at - a.at) };
}

function dayLabel(d: string) {
  const t = ymd(new Date()), y = ymd(new Date(Date.now() - 864e5));
  if (d === t) return "Today";
  if (d === y) return "Yesterday";
  const x = parseYmd(d);
  return x.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(x.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}

export default function ClientTimeline({ clientId }: { clientId: string }) {
  const [rows] = useRows<Ev>(`timeline:${clientId}`, (s) => load(s, clientId),
    ["tasks", "time_entries", "invoices", "deliverables", "posts", "comments", "notifications"]);
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE);
  const list = (rows ?? []).filter((e) => filter === "all" || e.kind === filter);
  const groups: [string, Ev[]][] = [];
  for (const e of list.slice(0, shown)) {
    const d = ymd(new Date(e.at)), last = groups[groups.length - 1];
    if (last?.[0] === d) last[1].push(e); else groups.push([d, [e]]);
  }

  return (
    <section className="card cr-timeline" aria-label="Timeline">
      <h3><span>Timeline</span>{rows && <span className="muted">{list.length} {list.length === 1 ? "moment" : "moments"}</span>}</h3>
      <Seg label="Show" options={FILTERS} value={filter} onChange={(v) => { setFilter(v); setShown(PAGE); }} />
      {rows === null ? (
        <div className="cr-skel" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 44, borderRadius: 14 }} />)}</div>
      ) : list.length === 0 ? (
        <div className="empty"><Nocti mood="sleepy" size={64} /><b>{filter === "all" ? "Nothing here yet." : "Nothing in this view yet."}</b></div>
      ) : (
        <>
          {groups.map(([d, evs]) => (
            <div key={d} className="cr-day">
              <div className="cr-date">{dayLabel(d)}</div>
              <ol className="cr-events">
                {evs.map((e) => {
                  const body = (
                    <>
                      <span className={`cr-ic t-${e.tone}`}><Icon name={e.icon} size={15} /></span>
                      <span className="cr-text">
                        <span className="cr-title">{e.title}</span>
                        {e.meta && <span className="cr-meta">{e.meta}</span>}
                      </span>
                      {!e.allDay && <time className="cr-time" dateTime={new Date(e.at).toISOString()}>{new Date(e.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</time>}
                    </>
                  );
                  return <li key={e.key}>{e.href ? <Link href={e.href} className="cr-ev">{body}</Link> : <div className="cr-ev">{body}</div>}</li>;
                })}
              </ol>
            </div>
          ))}
          {list.length > shown && <button type="button" className="btn cr-more" onClick={() => setShown(shown + PAGE)}>Show more</button>}
        </>
      )}
    </section>
  );
}

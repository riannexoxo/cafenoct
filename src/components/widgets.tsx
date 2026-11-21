"use client";

// Small live notes for the home board (Monday-style widgets). Each reads its own data and links to the full page.
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useRows } from "@/lib/use-rows";
import { addDays, parseYmd, today } from "@/lib/dates";
import { fmtClock, toMin } from "@/lib/cal";
import { hrs, money } from "@/lib/format";
import { received, type Invoice, INVOICE_COLS } from "@/lib/invoices";
import { CARD_COLS, STAGES, type Card } from "@/lib/pipeline";
import { clientLabel, type Client } from "@/lib/types";
import { useWeekEntries } from "./week-stats";
import ClientAvatar from "./client-avatar";
import Nocti from "./nocti";
import Icon from "./icon";

const noop = () => () => {};
const useToday = () => useSyncExternalStore(noop, today, () => "");
const Wait = () => <div className="w-skel" aria-busy="true" aria-label="Loading"><i /><i /></div>;
const Calm = ({ text }: { text: string }) => <div className="note-empty"><Nocti mood="sleepy" size={48} /><span>{text}</span></div>;
const More = ({ href, children }: { href: string; children: React.ReactNode }) => <Link className="note-more" href={href}>{children}<Icon name="right" size={14} /></Link>;

export function WeekNote({ clients, goal }: { clients: Client[]; goal: number }) {
  const [rows] = useWeekEntries();
  const t = useToday();
  const all = rows ?? [];
  const t0 = t ? parseYmd(t).getTime() : 0;
  const todayMin = all.filter((e) => new Date(e.started_at).getTime() >= t0).reduce((a, e) => a + e.minutes, 0);
  const weekMin = all.reduce((a, e) => a + e.minutes, 0);
  const pct = goal ? Math.min(100, Math.round((weekMin / 60 / goal) * 100)) : 0;
  const top = clients.map((c) => ({ c, m: all.filter((e) => e.client_id === c.id).reduce((a, e) => a + e.minutes, 0) })).filter((x) => x.m).sort((a, b) => b.m - a.m).slice(0, 3);
  return (
    <section className="note note-cream" aria-labelledby="w-week">
      <header><h3 id="w-week">This week</h3><More href="/time">Time</More></header>
      {rows === null || !t ? <Wait /> : (
        <>
          <p className="w-big"><b>{hrs(weekMin)}h</b><span>of {goal}h goal · {hrs(todayMin)}h today</span></p>
          <div className="w-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Weekly goal"><i style={{ width: `${pct}%` }} /></div>
          {top.length > 0 && <ul className="w-rows">{top.map(({ c, m }) => <li key={c.id}><span className="md-who"><i style={{ background: c.color }} />{clientLabel(c)}</span><b>{hrs(m)}h</b></li>)}</ul>}
        </>
      )}
    </section>
  );
}

export function IncomeNote({ currency = "USD" }: { currency?: string }) {
  const t = useToday();
  const [list] = useRows<Invoice>("w-income", (s) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    return s.from("invoices").select(INVOICE_COLS).eq("status", "paid").gte("paid_date", d.toISOString().slice(0, 10)).limit(500);
  }, ["invoices"]);
  const month = t.slice(0, 7), last = t ? addDays(`${month}-01`, -1).slice(0, 7) : "";
  const sum = (m: string, cur: string) => (list ?? []).filter((i) => i.paid_date?.startsWith(m) && i.currency === cur).reduce((a, i) => a + received(i), 0);
  const others = [...new Set((list ?? []).filter((i) => i.paid_date?.startsWith(month) && i.currency !== currency).map((i) => i.currency))];
  const now = sum(month, currency), before = sum(last, currency);
  const diff = before && now ? Math.round(((now - before) / before) * 100) : null;
  return (
    <section className="note note-mint" aria-labelledby="w-inc">
      <header><h3 id="w-inc">Paid this month</h3><More href="/wallet">Wallet</More></header>
      {list === null || !t ? <Wait /> : (
        <>
          <p className="w-big"><b>{money(now, currency)}</b><span>{before ? `${money(before, currency)} last month` : "Nothing paid last month"}</span></p>
          {diff !== null && <p className={`w-delta ${diff >= 0 ? "up" : "down"}`}>{diff >= 0 ? "Up" : "Down"} {Math.abs(diff)}% on last month</p>}
          {others.length > 0 && <p className="small muted">Plus {others.map((c) => money(sum(month, c), c)).join(", ")}</p>}
        </>
      )}
    </section>
  );
}

type Post = { id: string; title: string; caption: string; publish_on: string; publish_at: string | null; status: string; client_id: string | null };
export function PostsNote({ clients }: { clients: Client[] }) {
  const t = useToday();
  const [list] = useRows<Post>("w-posts", (s) => s.from("posts").select("id,title,caption,publish_on,publish_at,status,client_id")
    .gte("publish_on", today()).lte("publish_on", addDays(today(), 6)).neq("status", "Posted").order("publish_on").order("publish_at").limit(100), ["posts"]);
  const count = (s: string) => (list ?? []).filter((p) => p.status === s).length;
  const day = (s: string) => (s === t ? "Today" : s === addDays(t, 1) ? "Tomorrow" : parseYmd(s).toLocaleDateString("en-US", { weekday: "short" }));
  return (
    <section className="note note-blush" aria-labelledby="w-posts">
      <header><h3 id="w-posts">Posts this week</h3><More href="/content">Content</More></header>
      {list === null || !t ? <Wait /> : list.length ? (
        <>
          <div className="w-chips">
            {["For approval", "Scheduled", "Drafting", "Idea"].filter(count).map((s) => <span key={s} className={`w-chip s-${s.split(" ")[0].toLowerCase()}`}>{count(s)} {s.toLowerCase()}</span>)}
          </div>
          <ul className="note-list">
            {list.slice(0, 4).map((p) => (
              <li key={p.id}><b>{p.title || p.caption.slice(0, 50) || "Untitled post"}</b><span>{day(p.publish_on)}{p.publish_at ? ` · ${fmtClock(toMin(p.publish_at))}` : ""}{p.client_id ? ` · ${clientLabel(clients.find((c) => c.id === p.client_id) ?? { name: "", company: "" } as Client)}` : ""}</span></li>
            ))}
          </ul>
        </>
      ) : <Calm text="No posts planned for the next 7 days." />}
    </section>
  );
}

export function PipelineNote({ currency = "USD" }: { currency?: string }) {
  const [cards] = useRows<Card>("w-pipe", (s) => s.from("pipeline_cards").select(CARD_COLS).not("stage", "in", "(done,paused,active)").limit(300), ["pipeline_cards"]);
  const open = cards ?? [];
  const value = open.filter((c) => c.currency === currency).reduce((a, c) => a + (Number(c.value) || 0), 0);
  const next = open.filter((c) => c.next_date).sort((a, b) => a.next_date!.localeCompare(b.next_date!)).slice(0, 3);
  return (
    <section className="note note-lav" aria-labelledby="w-pipe">
      <header><h3 id="w-pipe">Pipeline</h3><More href="/pipeline">Pipeline</More></header>
      {cards === null ? <Wait /> : open.length ? (
        <>
          <p className="w-big"><b>{money(value, currency)}</b><span>in {open.length} open {open.length === 1 ? "lead" : "leads"}</span></p>
          <div className="w-chips">{STAGES.filter((s) => open.some((c) => c.stage === s.key)).map((s) => <span key={s.key} className="w-chip"><i style={{ background: s.tone }} />{open.filter((c) => c.stage === s.key).length} {s.label.toLowerCase()}</span>)}</div>
          {next.length > 0 && <ul className="note-list">{next.map((c) => <li key={c.id}><b>{c.title}</b><span>{c.next_step || "Next step"} · {c.next_date}</span></li>)}</ul>}
        </>
      ) : <Calm text="No open leads. Add one on the Pipeline page." />}
    </section>
  );
}

type Pending = { id: string; title: string; client_id: string | null; kind: string; due: string | null };
export function WaitingNote({ clients }: { clients: Client[] }) {
  const [d] = useRows<Pending>("w-wait-d", (s) => s.from("deliverables").select("id,title,client_id,kind,due:due_date").eq("status", "review").limit(50), ["deliverables"]);
  const [p] = useRows<Pending>("w-wait-p", (s) => s.from("posts").select("id,title,client_id,kind:format,due:publish_on").eq("status", "For approval").limit(50), ["posts"]);
  const list = [...(d ?? []).map((x) => ({ ...x, what: x.kind === "video" ? "Edit" : "Design", href: x.kind === "video" ? "/edits" : "/designs" })), ...(p ?? []).map((x) => ({ ...x, what: "Post", href: "/content" }))];
  return (
    <section className="note note-butter" aria-labelledby="w-wait">
      <header><h3 id="w-wait">Waiting on clients</h3></header>
      {d === null || p === null ? <Wait /> : list.length ? (
        <ul className="note-list">
          {list.slice(0, 5).map((x) => (
            <li key={x.id}><Link href={x.href}><b>{x.title || "Untitled"}</b></Link><span>{x.what}{x.client_id ? ` · ${clientLabel(clients.find((c) => c.id === x.client_id) ?? { name: "", company: "" } as Client)}` : ""}{x.due ? ` · due ${x.due}` : ""}</span></li>
          ))}
        </ul>
      ) : <Calm text="Nothing waiting on a client's yes." />}
    </section>
  );
}

export function ClientsNote({ clients }: { clients: Client[] }) {
  const active = clients.filter((c) => c.status === "Active");
  return (
    <section className="note note-cream" aria-labelledby="w-cl">
      <header><h3 id="w-cl">Client portals</h3><More href="/clients">All clients</More></header>
      {active.length ? (
        <ul className="w-doors">
          {active.slice(0, 8).map((c) => (
            <li key={c.id}><Link href={`/clients/${c.id}`}><ClientAvatar c={c} size={30} /><span><b>{clientLabel(c)}</b><small>{c.weekly_hours ? `${c.weekly_hours}h a week` : c.services || "Open portal"}</small></span><Icon name="right" size={14} /></Link></li>
          ))}
        </ul>
      ) : <div className="note-empty"><Nocti mood="awake" size={48} /><span>Add your first client to get a portal. <Link href="/clients/new">New client</Link></span></div>}
    </section>
  );
}

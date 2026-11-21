"use client";

// My Day (Asana-style): everything that needs you today in one ranked list. Overdue first, then what's
// in progress, then timed things (meetings, posts) by time, then the rest by priority.
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { supabase, useRows } from "@/lib/use-rows";
import { TASK_COLS, setStatus, type Task } from "@/lib/work";
import { EVENT_COLS, expandEvents, fmtClock, toMin, type CalEvent } from "@/lib/cal";
import { INVOICE_COLS, total, type Invoice } from "@/lib/invoices";
import { addDays, parseYmd, rel, today } from "@/lib/dates";
import { money } from "@/lib/format";
import { toast } from "@/lib/toast";
import { celebrate } from "@/lib/celebrate";
import { clientLabel, type Client } from "@/lib/types";
import { parse } from "./todo-list";
import TimerButton from "./timer-button";
import Nocti from "./nocti";
import Icon, { type IconName } from "./icon";

type Post = { id: string; client_id: string | null; title: string; caption: string; publish_on: string; publish_at: string | null; status: string; platforms: string[] | null };
type Deliv = { id: string; client_id: string | null; kind: string; title: string; status: string; due_date: string };
type Row = {
  key: string; kind: "task" | "meeting" | "block" | "post" | "invoice" | "deliverable";
  title: string; client: string | null; meta: string; when: string; at: number | null; rank: number; late?: boolean; href?: string; task?: Task;
};

const ICON: Record<Exclude<Row["kind"], "task">, IconName> = { meeting: "chat", block: "schedule", post: "content", invoice: "money", deliverable: "spark" };
const PRI: Record<string, number> = { high: 0, med: 1, low: 2 };
const noop = () => () => {};

export default function MyDay({ clients }: { clients: Client[] }) {
  // Dates come from the device clock, so the list only renders in the browser.
  const t = useSyncExternalStore(noop, today, () => "");
  const start = t ? parseYmd(t) : null;
  const soon = t ? addDays(t, 3) : "";
  const [text, setText] = useState("");

  const [tasks, reload, setTasks] = useRows<Task>("myday-tasks", (s) => s.from("tasks").select(TASK_COLS)
    .or(`status.neq.done,done_at.gte.${(start ?? new Date()).toISOString()}`).order("position").limit(400), ["tasks"]);
  const [events] = useRows<CalEvent>("myday-events", (s) => {
    const a = start ?? new Date(), b = new Date(a.getTime() + 864e5);
    return s.from("events").select(EVENT_COLS).lte("starts_at", b.toISOString()).or(`ends_at.gte.${a.toISOString()},repeat.neq.none`).limit(200);
  }, ["events"]);
  const [posts] = useRows<Post>("myday-posts", (s) => s.from("posts").select("id,client_id,title,caption,publish_on,publish_at,status,platforms")
    .gte("publish_on", today()).lte("publish_on", addDays(today(), 1)).neq("status", "Posted").limit(50), ["posts"]);
  const [invoices] = useRows<Invoice>("myday-invoices", (s) => s.from("invoices").select(INVOICE_COLS).eq("status", "sent").lte("due_date", today()).limit(50), ["invoices"]);
  const [delivs] = useRows<Deliv>("myday-delivs", (s) => s.from("deliverables").select("id,client_id,kind,title,status,due_date")
    .in("status", ["brief", "making", "revisions"]).lte("due_date", today()).limit(50), ["deliverables"]);

  const ready = !!t && tasks && events && posts && invoices && delivs;
  const who = (id: string | null) => { const c = clients.find((x) => x.id === id); return c ? clientLabel(c) : null; };
  const color = (id: string | null) => clients.find((x) => x.id === id)?.color ?? "var(--line-strong)";

  const overdue: Row[] = [], now: Row[] = [], next: Row[] = [], done: Task[] = [];
  if (ready) {
    for (const x of tasks!) {
      if (x.status === "done") { done.push(x); continue; }
      const base = { key: `t${x.id}`, kind: "task" as const, title: x.title, client: x.client_id, task: x, at: null, href: undefined };
      if (x.due_date && x.due_date < t) overdue.push({ ...base, meta: "", when: rel(x.due_date), late: true, rank: PRI[x.priority] ?? 1 });
      else if (x.status === "doing" || x.due_date === t) now.push({ ...base, meta: x.status === "doing" ? "In progress" : "", when: "", rank: x.status === "doing" ? -10 : 10 + (PRI[x.priority] ?? 1) });
      else if (x.due_date && x.due_date <= soon) next.push({ ...base, meta: "", when: rel(x.due_date), rank: Number(x.due_date.replaceAll("-", "")) * 10 + (PRI[x.priority] ?? 1) });
    }
    const a = start!.getTime();
    for (const o of expandEvents(events!, a, a + 864e5)) {
      const m = new Date(o.start).getHours() * 60 + new Date(o.start).getMinutes();
      now.push({ key: `e${o.key}`, kind: o.ev.kind === "meeting" ? "meeting" : "block", title: o.ev.title || "Untitled", client: o.ev.client_id, meta: o.ev.kind === "meeting" ? "Meeting" : "Time block", when: fmtClock(m), at: m, rank: m, href: o.ev.link || "/calendar" });
    }
    for (const p of posts!) {
      const m = p.publish_at ? toMin(p.publish_at) : null;
      const row: Row = { key: `p${p.id}`, kind: "post", title: p.title || p.caption.slice(0, 60) || "Untitled post", client: p.client_id, meta: `Post · ${p.status}`, when: m != null ? fmtClock(m) : "", at: m, rank: m ?? 20, href: "/content" };
      (p.publish_on === t ? now : next).push(p.publish_on === t ? row : { ...row, when: "Tomorrow", rank: Number(addDays(t, 1).replaceAll("-", "")) * 10 });
    }
    for (const i of invoices!) {
      const late = !!i.due_date && i.due_date < t;
      (late ? overdue : now).push({ key: `i${i.id}`, kind: "invoice", title: `${i.number} · ${money(total(i), i.currency)}`, client: i.client_id, meta: late ? "Unpaid, follow up" : "Payment due today", when: late ? rel(i.due_date!) : "", late, at: null, rank: 5, href: "/invoices" });
    }
    for (const d of delivs!) {
      const late = d.due_date < t;
      (late ? overdue : now).push({ key: `d${d.id}`, kind: "deliverable", title: d.title, client: d.client_id, meta: d.kind === "video" ? "Edit due" : "Design due", when: late ? rel(d.due_date) : "", late, at: null, rank: 8, href: d.kind === "video" ? "/edits" : "/designs" });
    }
    // Timed items sit between "in progress" and the untimed tasks, ordered by the clock.
    now.sort((x, y) => (x.at != null && y.at != null ? x.at - y.at : x.at != null ? (y.rank < 0 ? 1 : -1) : y.at != null ? (x.rank < 0 ? -1 : 1) : x.rank - y.rank));
    overdue.sort((x, y) => x.rank - y.rank);
    next.sort((x, y) => x.rank - y.rank);
  }
  const doneToday = done.length, open = overdue.length + now.length;

  async function toggle(x: Task) {
    const status = x.status === "done" ? "todo" : "done";
    setTasks((r) => (r ?? []).map((y) => (y.id === x.id ? { ...y, status, done_at: status === "done" ? new Date().toISOString() : null } : y)));
    const { error, next: again } = await setStatus(x, status, clients.find((c) => c.id === x.client_id));
    if (error) { toast("Could not save. Check your connection."); return; }
    if (status === "done") celebrate();
    if (again) { reload(); toast(`Done. It comes back ${rel(again).toLowerCase()}.`); }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const p = parse(text, clients);
    if (!p.title) return;
    setText("");
    const { data, error } = await supabase().from("tasks").insert({ ...p, repeat: p.repeat ?? "none" }).select(TASK_COLS).single<Task>();
    if (error || !data) { setText(text); toast("Could not add that. Check your connection."); return; }
    setTasks((r) => [...(r ?? []).filter((y) => y.id !== data.id), data]);
  }

  const row = (r: Row) => {
    const c = who(r.client);
    const isTask = r.kind === "task";
    const label = <>{r.title}</>;
    return (
      <li key={r.key} className={`md-row${r.late ? " late" : ""}${r.task?.status === "doing" ? " doing" : ""}`}>
        {isTask
          ? <button type="button" className="md-check" role="checkbox" aria-checked={false} aria-label={`Mark "${r.title}" done`} onClick={() => toggle(r.task!)}><Check /></button>
          : <span className={`md-ico k-${r.kind}`} aria-hidden><Icon name={ICON[r.kind as Exclude<Row["kind"], "task">]} size={15} /></span>}
        <span className="md-main">
          {r.href && !isTask ? (r.href.startsWith("/") ? <Link href={r.href} className="md-title">{label}</Link> : <a href={r.href} className="md-title" target="_blank" rel="noreferrer noopener">{label}</a>) : <span className="md-title">{label}</span>}
          <span className="md-meta">
            {c && <span className="md-who"><i style={{ background: color(r.client) }} />{c}</span>}
            {r.meta && <span>{r.meta}</span>}
            {r.task?.priority === "high" && <span className="md-high">High</span>}
          </span>
        </span>
        {r.when && <span className={`md-when${r.at != null ? " clock" : ""}`}>{r.when}</span>}
        {isTask && <span className="md-timer"><TimerButton small clientId={r.task!.client_id} taskId={r.task!.id} note={r.title} label={c ?? "this task"} /></span>}
      </li>
    );
  };

  return (
    <section className="note note-cream myday" aria-labelledby="md-h">
      <header className="md-head">
        <h2 id="md-h">My day</h2>
        {ready && <span className="md-count">{open ? `${open} to do${doneToday ? ` · ${doneToday} done` : ""}` : doneToday ? `All ${doneToday} done` : ""}</span>}
      </header>
      <form className="md-add" onSubmit={add}>
        <Icon name="plus" size={16} />
        <label className="sr-only" htmlFor="md-new">Add to my day</label>
        <input id="md-new" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} autoComplete="off"
          placeholder="Add something for today" title="Tip: @client tags a client, “tomorrow” moves it, ! makes it high priority" />
        {text.trim() && <button className="btn small solid" type="submit">Add</button>}
      </form>
      {!ready ? <div className="md-skel" aria-busy="true" aria-label="Loading your day"><i /><i /><i /></div> : (
        <>
          {overdue.length > 0 && <Group title="Overdue" tone="late" count={overdue.length}>{overdue.map(row)}</Group>}
          {now.length > 0 ? <Group title="Today" count={now.length}>{now.map(row)}</Group> : (
            <div className="md-clear"><Nocti mood={doneToday ? "awake" : "sleepy"} size={64} /><p><b>{doneToday ? "Today's list is done." : "Nothing due today."}</b><span>{doneToday ? "Lovely work. Rest, or pull something forward from Next up." : "Add something above, or enjoy the quiet."}</span></p></div>
          )}
          {next.length > 0 && <Group title="Next up" count={next.length}>{next.slice(0, 6).map(row)}</Group>}
          {doneToday > 0 && (
            <details className="md-done">
              <summary>Done today ({doneToday})</summary>
              <ul className="md-list">
                {done.map((x) => (
                  <li key={x.id} className="md-row is-done">
                    <button type="button" className="md-check on" role="checkbox" aria-checked aria-label={`Mark "${x.title}" not done`} onClick={() => toggle(x)}><Check /></button>
                    <span className="md-main"><span className="md-title">{x.title}</span></span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function Group({ title, count, tone, children }: { title: string; count: number; tone?: "late"; children: React.ReactNode }) {
  return (
    <div className={`md-group${tone ? ` ${tone}` : ""}`}>
      <h3>{title}<span>{count}</span></h3>
      <ul className="md-list">{children}</ul>
    </div>
  );
}

const Check = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

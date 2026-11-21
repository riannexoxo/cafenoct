"use client";

import "@/styles/workload.css";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRows } from "@/lib/use-rows";
import { addDays, parseYmd, today, weekStartYmd, ymd } from "@/lib/dates";
import { EVENT_COLS, expandEvents, type CalEvent } from "@/lib/cal";
import { clientLabel, type Client } from "@/lib/types";
import Icon from "./icon";
import { Empty } from "./views/shared";

const noop = () => () => {};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Tasks have no time estimate, so a task due that day counts by priority.
const TASK_HOURS: Record<string, number> = { low: 0.5, med: 1, high: 2 };
const h1 = (n: number) => (Math.round(n * 10) / 10).toString();
const short = (d: string) => parseYmd(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

type T = { client_id: string | null; due_date: string; priority: string };
type E = { client_id: string | null; minutes: number; started_at: string };
type Cell = { plan: number; done: number };

export default function Workload({ clients, goal }: { clients: Client[]; goal: number }) {
  // "This week" depends on your device's date, so the grid is drawn only in the browser.
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="card skel" style={{ height: 320 }} aria-busy="true" />;
  return <Grid clients={clients} goal={goal} />;
}

function Grid({ clients, goal }: { clients: Client[]; goal: number }) {
  const [ws, setWs] = useState(() => weekStartYmd());
  const days = DAYS.map((_, i) => addDays(ws, i));
  const from = parseYmd(ws).getTime(), to = parseYmd(addDays(ws, 7)).getTime();
  const [events] = useRows<CalEvent>(`wl-events:${ws}`, (s) => s.from("events").select(EVENT_COLS).eq("kind", "block")
    .lt("starts_at", new Date(to).toISOString()).order("starts_at", { ascending: false }).limit(2000), ["events"]);
  const [tasks] = useRows<T>(`wl-tasks:${ws}`, (s) => s.from("tasks").select("client_id,due_date,priority")
    .gte("due_date", ws).lt("due_date", addDays(ws, 7)).limit(2000), ["tasks"]);
  const [entries] = useRows<E>(`wl-time:${ws}`, (s) => s.from("time_entries").select("client_id,minutes,started_at")
    .gte("started_at", new Date(from).toISOString()).lt("started_at", new Date(to).toISOString()).limit(5000), ["time_entries"]);

  const cells = new Map<string, Cell>(); // key: client id (or "") + "|" + day
  const add = (cid: string | null, day: string, k: keyof Cell, v: number) => {
    const key = `${cid ?? ""}|${day}`, c = cells.get(key) ?? { plan: 0, done: 0 };
    c[k] += v; cells.set(key, c);
  };
  for (const o of expandEvents(events ?? [], from, to)) add(o.ev.client_id, ymd(new Date(o.start)), "plan", (o.end - o.start) / 36e5);
  for (const t of tasks ?? []) add(t.client_id, t.due_date, "plan", TASK_HOURS[t.priority] ?? 1);
  for (const e of entries ?? []) add(e.client_id, ymd(new Date(e.started_at)), "done", e.minutes / 60);

  const cell = (cid: string | null, d: string) => cells.get(`${cid ?? ""}|${d}`) ?? { plan: 0, done: 0 };
  const dayTotal = (d: string) => [...cells].filter(([k]) => k.endsWith(`|${d}`)).reduce((a, [, c]) => ({ plan: a.plan + c.plan, done: a.done + c.done }), { plan: 0, done: 0 });
  const cap = goal > 0 ? goal / 5 : 0;
  const hasOther = days.some((d) => { const c = cell(null, d); return c.plan || c.done; });
  const rows: { id: string | null; name: string; color?: string }[] = [...clients.map((c) => ({ id: c.id, name: clientLabel(c), color: c.color })), ...(hasOther ? [{ id: null, name: "No client" }] : [])];
  const loading = events === null || tasks === null || entries === null;
  const t = today();
  const heat = (c: Cell) => { const v = Math.max(c.plan, c.done); return v ? Math.min(1, v / (cap || 8)) : 0; };

  return (
    <>
      <div className="row cal-bar">
        <div className="grow"><b className="cal-title">{short(ws)} – {short(addDays(ws, 6))}</b><span className="small muted">{cap ? `Daily goal ${h1(cap)}h (your ${goal}h week ÷ 5)` : "Set a weekly goal in your profile to see busy days"}</span></div>
        <div className="row" role="group" aria-label="Week" style={{ gap: 6 }}>
          <button type="button" className="btn small ghost" onClick={() => setWs(addDays(ws, -7))} aria-label="Previous week"><Icon name="left" /></button>
          <button type="button" className="btn small" onClick={() => setWs(weekStartYmd())} disabled={ws === weekStartYmd()}>This week</button>
          <button type="button" className="btn small ghost" onClick={() => setWs(addDays(ws, 7))} aria-label="Next week"><Icon name="right" /></button>
        </div>
      </div>
      {!rows.length ? <div className="card"><Empty line="No active clients yet. Their week shows up here once you add one." /></div> : (
        <div className="card wl-wrap" aria-busy={loading}>
          <table className="wl">
            <caption className="sr-only">Planned and logged hours by client and day</caption>
            <thead>
              <tr><th scope="col">Client</th>{days.map((d, i) => <th scope="col" key={d} className={d === t ? "today" : ""}>{DAYS[i]}<small>{parseYmd(d).getDate()}</small></th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id ?? "none"}>
                  <th scope="row">{r.id ? <Link href={`/clients/${r.id}`} style={{ ["--c" as string]: r.color || "var(--accent)" }}><i aria-hidden="true" />{r.name}</Link> : <span className="muted">{r.name}</span>}</th>
                  {days.map((d, i) => {
                    const c = cell(r.id, d);
                    return (
                      <td key={d} style={{ ["--heat" as string]: `${Math.round(heat(c) * 35)}%` }}>
                        <span aria-hidden="true">{c.plan || c.done ? <><b className="num">{h1(c.plan)}</b><small className="num">{h1(c.done)}</small></> : <span className="muted">·</span>}</span>
                        <span className="sr-only">{DAYS[i]}: {h1(c.plan)} hours planned, {h1(c.done)} logged</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Day total</th>
                {days.map((d, i) => {
                  const c = dayTotal(d), over = cap > 0 && Math.max(c.plan, c.done) > cap;
                  return (
                    <td key={d} className={over ? "over" : ""}>
                      <span aria-hidden="true"><b className="num">{h1(c.plan)}</b><small className="num">{h1(c.done)}</small>{over && <span className="wl-flag">Over</span>}</span>
                      <span className="sr-only">{DAYS[i]} total: {h1(c.plan)} hours planned, {h1(c.done)} logged{over ? ", over your daily goal" : ""}</span>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
          <p className="small muted wl-key"><b>Bold</b> is planned (time blocks, plus tasks due: 0.5h low, 1h normal, 2h high). <span className="num">Small</span> is logged.</p>
        </div>
      )}
    </>
  );
}

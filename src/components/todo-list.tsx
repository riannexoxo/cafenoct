"use client";

import { useState } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { addDays, rel, today } from "@/lib/dates";
import { clientLabel, type Client } from "@/lib/types";
import Icon from "./icon";

type Task = { id: string; title: string; client_id: string | null; status: string; priority: string; due_date: string | null; done_at: string | null };

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

// "@deb tomorrow !" → tagged to the matching client, due tomorrow, high priority.
function parse(text: string, clients: Client[]) {
  let t = ` ${text} `, client_id: string | null = null, due_date = today(), priority = "med";
  const at = t.match(/\s@([\w.&'-]+)/);
  if (at) {
    const q = at[1].toLowerCase();
    const c = clients.find((c) => [c.name, c.company].filter(Boolean).some((n) => n.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || n.toLowerCase().replace(/\s+/g, "").startsWith(q)));
    if (c) { client_id = c.id; t = t.replace(at[0], " "); }
  }
  if (/\stomorrow\s/i.test(t)) { due_date = addDays(today(), 1); t = t.replace(/\stomorrow\s/i, " "); }
  if (/(^|\s)!/.test(t)) { priority = "high"; t = t.replace(/(^|\s)!/g, " "); }
  return { title: t.replace(/\s+/g, " ").trim(), client_id, due_date, priority };
}

const ck = <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path pathLength={1} d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

export default function TodoList({ clients, clientId }: { clients: Client[]; clientId?: string }) {
  const [rows, , setRows] = useRows<Task>(`tasks:${clientId ?? "all"}`, (s) => {
    let q = s.from("tasks").select("id,title,client_id,status,priority,due_date,done_at").or(`status.neq.done,done_at.gte.${startOfToday()}`).order("due_date", { nullsFirst: false }).limit(300);
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  }, ["tasks"]);
  const [text, setText] = useState("");
  const [tag, setTag] = useState<string>("");
  const [just, setJust] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const t = today();
  const byId = (id: string | null) => clients.find((c) => c.id === id);
  const open = (rows ?? []).filter((x) => x.status !== "done");
  const now = open.filter((x) => !x.due_date || x.due_date <= t).sort((a, b) => (a.priority === "high" ? -1 : 0) - (b.priority === "high" ? -1 : 0));
  const soon = open.filter((x) => x.due_date && x.due_date > t && x.due_date <= addDays(t, 7));
  const done = (rows ?? []).filter((x) => x.status === "done");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const p = parse(text, clients);
    if (!p.title) return;
    const row = { ...p, client_id: clientId ?? p.client_id ?? (tag || null) };
    setText("");
    const { data } = await supabase().from("tasks").insert(row).select("id,title,client_id,status,priority,due_date,done_at").single();
    if (data) setRows((r) => [...(r ?? []).filter((x) => x.id !== data.id), data]);
  }
  async function toggle(x: Task) {
    const doneNow = x.status !== "done";
    if (doneNow) { setJust(x.id); setTimeout(() => setJust(null), 1200); }
    const patch = { status: doneNow ? "done" : "todo", done_at: doneNow ? new Date().toISOString() : null };
    setRows((r) => (r ?? []).map((y) => (y.id === x.id ? { ...y, ...patch } : y)));
    await supabase().from("tasks").update(patch).eq("id", x.id);
  }

  const row = (x: Task) => {
    const c = byId(x.client_id);
    return (
      <div className="li" key={x.id}>
        <button className={`check ${x.status === "done" ? "on" : ""} ${just === x.id ? "just" : ""}`} onClick={() => toggle(x)} aria-label={x.status === "done" ? "Mark not done" : "Mark done"}>{ck}</button>
        <span className="t" style={x.status === "done" ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>
          {x.title}
          {!clientId && <small><span className="cdot" style={{ background: c?.color ?? "var(--line-strong)", width: 7, height: 7 }} /> {c ? clientLabel(c) : "Personal"}</small>}
        </span>
        {x.priority === "high" && <span className="pill bad">High</span>}
        {x.due_date && x.status !== "done" && <span className={`pill ${x.due_date < t ? "bad" : x.due_date === t ? "warn" : ""}`}>{rel(x.due_date)}</span>}
      </div>
    );
  };
  const client = clientId ? byId(clientId) : undefined;

  return (
    <div className="card todo">
      <h3><span>{clientId ? "To-do list" : "My to-do list"}</span><span className="muted">{done.length ? `${done.length} done today` : `${now.length} for today`}</span></h3>
      <form className="todo-add" onSubmit={add}>
        <span className="todo-plus"><Icon name="plus" size={16} /></span>
        <input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" aria-label="New task" placeholder={client ? `Add a task for ${clientLabel(client)}` : "Add a task, tag a client below or type @name"} />
        <button className="btn small solid" type="submit">Add</button>
      </form>
      {!clientId && (
        <div className="todo-tags" role="group" aria-label="Tag a client">
          {[{ id: "", label: "Personal", color: "var(--line-strong)" }, ...clients.filter((c) => c.status === "Active").map((c) => ({ id: c.id, label: clientLabel(c), color: c.color }))].map((o) => (
            <button key={o.id || "me"} type="button" className={`ttag ${tag === o.id ? "on" : ""}`} aria-pressed={tag === o.id} style={{ ["--c" as string]: o.color }} onClick={() => setTag(o.id)}><i />{o.label}</button>
          ))}
        </div>
      )}
      {rows === null ? <div className="small muted" style={{ padding: "10px 0" }}>Loading…</div> : (
        <>
          <div className="list">{now.length ? now.map(row) : <div className="small muted" style={{ padding: "10px 0" }}>Nothing left for today.</div>}</div>
          {soon.length > 0 && <><div className="small muted" style={{ margin: "12px 0 2px" }}>Coming up</div><div className="list">{soon.slice(0, 6).map(row)}</div></>}
          {done.length > 0 && (
            <>
              <button className="grp" style={{ marginTop: 12, fontSize: 12.5, color: "var(--muted)" }} aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
                <span className="chev" style={{ transform: `rotate(${showDone ? 90 : 0}deg)` }}><Icon name="right" size={13} /></span>Done today ({done.length}) · goes into {clientId ? "the" : "your"} EOD report
              </button>
              {showDone && <div className="list">{done.map(row)}</div>}
            </>
          )}
        </>
      )}
    </div>
  );
}

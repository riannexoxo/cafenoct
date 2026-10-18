"use client";

import { useState, useSyncExternalStore } from "react";
import { useRows } from "@/lib/use-rows";
import { addDays, rel, today } from "@/lib/dates";
import { COLUMNS, PROJECT_COLS, TASK_COLS, colOf, setStatus, type Project, type Task } from "@/lib/work";
import { supabase } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import TaskForm, { type TaskDraft } from "./task-form";
import Seg from "./seg";
import Icon from "./icon";

const noop = () => () => {};

// All your work as a board (To do, Doing, Waiting on client, Done) or a list by due date.
export default function WorkBoard({ clients, clientId, projectId }: { clients: Client[]; clientId?: string; projectId?: string }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="card skel" style={{ height: 420 }} aria-busy="true" />;
  return <Board clients={clients} clientId={clientId} projectId={projectId} />;
}

function Board({ clients, clientId, projectId }: { clients: Client[]; clientId?: string; projectId?: string }) {
  const [view, setView] = useState<"board" | "list">(() => (window.innerWidth < 760 ? "list" : "board"));
  const [who, setWho] = useState(clientId ?? "");
  const [proj, setProj] = useState(projectId ?? "");
  const [q, setQ] = useState("");
  const [quick, setQuick] = useState("");
  const [form, setForm] = useState<TaskDraft | null>(null);
  const [over, setOver] = useState("");
  const [showDone, setShowDone] = useState(false);
  const since = addDays(today(), -14);
  const [tasks, reload, setTasks] = useRows<Task>(`work:${clientId ?? "all"}`, (s) => {
    let x = s.from("tasks").select(TASK_COLS).or(`status.neq.done,done_at.gte.${since}`).order("position").order("due_date", { nullsFirst: false }).limit(800);
    if (clientId) x = x.eq("client_id", clientId);
    return x;
  }, ["tasks"]);
  const [projects] = useRows<Project>(`work-projects:${clientId ?? "all"}`, (s) => {
    let x = s.from("projects").select(PROJECT_COLS).order("created_at", { ascending: false });
    if (clientId) x = x.eq("client_id", clientId);
    return x;
  }, ["projects"]);

  const t = today();
  const client = (id: string | null) => clients.find((c) => c.id === id);
  const project = (id: string | null) => (projects ?? []).find((p) => p.id === id);
  const shown = (tasks ?? []).filter((x) => (!who || x.client_id === who) && (!proj || x.project_id === proj) && (!q || `${x.title} ${x.notes}`.toLowerCase().includes(q.toLowerCase())));
  const open = shown.filter((x) => x.status !== "done");

  async function move(id: string, status: string) {
    const task = (tasks ?? []).find((x) => x.id === id);
    if (!task || colOf(task.status) === status) return;
    setTasks((r) => (r ?? []).map((x) => (x.id === id ? { ...x, status, done_at: status === "done" ? new Date().toISOString() : null } : x)));
    const r = await setStatus(task, status, client(task.client_id));
    if (r.error) { reload(); return toast("Could not move it. Try again."); }
    if (r.next) toast(`Done. The next one is set for ${rel(r.next).toLowerCase()}.`);
    else if (status === "done") toast("Nice. Marked done.");
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const title = quick.trim();
    if (!title) return;
    setQuick("");
    const { error } = await supabase().from("tasks").insert({ title, client_id: who || null, project_id: proj || null, status: "todo", due_date: t });
    if (error) return toast("Could not add it. Try again.");
    reload();
  }

  const card = (x: Task) => {
    const c = client(x.client_id), p = project(x.project_id), subs = x.subtasks ?? [], done = subs.filter((s) => s.done).length;
    return (
      <div key={x.id} className={`wcardt${x.status === "done" ? " done" : ""}`} draggable onDragStart={(e) => e.dataTransfer.setData("text/task", x.id)} onClick={() => setForm(x)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setForm(x); }}
        style={{ ["--c" as string]: c?.color ?? "var(--line-strong)" }}>
        <b>{x.title}</b>
        <div className="wt-meta">
          {!clientId && <span className="wt-client"><i />{c ? clientLabel(c) : "Personal"}</span>}
          {p && <span className="wt-proj"><Icon name="projects" size={11} />{p.name}</span>}
        </div>
        <div className="wt-foot">
          {x.due_date && x.status !== "done" && <span className={`pill ${x.due_date < t ? "bad" : x.due_date === t ? "warn" : ""}`}>{rel(x.due_date)}</span>}
          {x.priority === "high" && <span className="pill bad">High</span>}
          {subs.length > 0 && <span className="small muted"><Icon name="sub" size={12} /> {done}/{subs.length}</span>}
          {(x.links ?? []).length > 0 && <span className="small muted"><Icon name="link" size={12} /> {x.links.length}</span>}
          {x.repeat && x.repeat !== "none" && <span className="small muted"><Icon name="repeat" size={12} /></span>}
        </div>
      </div>
    );
  };

  const groups: [string, Task[]][] = [
    ["Late", open.filter((x) => x.due_date && x.due_date < t)],
    ["Today", open.filter((x) => x.due_date === t)],
    ["This week", open.filter((x) => x.due_date && x.due_date > t && x.due_date <= addDays(t, 7))],
    ["Later", open.filter((x) => x.due_date && x.due_date > addDays(t, 7))],
    ["No due date", open.filter((x) => !x.due_date)],
  ];
  const doneList = shown.filter((x) => x.status === "done");

  return (
    <>
      <div className="row cal-bar">
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="cal-title">{proj ? project(proj)?.name ?? "Project" : clientId ? "Work" : "All work"}</b>
          <span className="small muted">{open.length} open · {open.filter((x) => x.due_date && x.due_date < t).length} late · {doneList.length} done in the last 2 weeks</span>
        </div>
        <Seg label="View" options={[["board", "Board"], ["list", "List"]]} value={view} onChange={setView} />
        <button className="btn solid" onClick={() => setForm({ client_id: who || null, project_id: proj || null, status: "todo", due_date: t })}><Icon name="plus" />New task</button>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <form className="todo-add grow" onSubmit={add} style={{ margin: 0, minWidth: 220 }}>
          <span className="todo-plus"><Icon name="plus" size={16} /></span>
          <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Quick add a task for today" aria-label="Quick add" />
        </form>
        <input className="search" style={{ width: 160 }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" />
        {!clientId && <select className="search" style={{ width: "auto" }} value={who} onChange={(e) => { setWho(e.target.value); setProj(""); }} aria-label="Client"><option value="">All clients</option>{clients.filter((c) => c.status !== "Past").map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}</select>}
        {(projects ?? []).length > 0 && <select className="search" style={{ width: "auto" }} value={proj} onChange={(e) => setProj(e.target.value)} aria-label="Project"><option value="">All projects</option>{(projects ?? []).filter((p) => !who || p.client_id === who).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
      </div>

      {tasks === null ? <div className="card skel" style={{ height: 300 }} /> : view === "board" ? (
        <div className="kanban">
          {COLUMNS.map((col) => {
            const xs = shown.filter((x) => colOf(x.status) === col.key);
            return (
              <div key={col.key} className={`board-col${over === col.key ? " drop" : ""}`} style={{ ["--t" as string]: col.tone }}
                onDragOver={(e) => { e.preventDefault(); setOver(col.key); }} onDragLeave={() => setOver((o) => (o === col.key ? "" : o))}
                onDrop={(e) => { e.preventDefault(); setOver(""); const id = e.dataTransfer.getData("text/task"); if (id) move(id, col.key); }}>
                <div className="board-h"><span><i />{col.label}</span><span className="muted">{xs.length}</span></div>
                {xs.map(card)}
                {!xs.length && <div className="idea-empty">{col.key === "waiting" ? "Waiting on a reply or approval? Drop it here." : "Nothing here"}</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          {groups.filter(([, xs]) => xs.length).map(([name, xs]) => (
            <div key={name} style={{ marginBottom: 14 }}>
              <div className={`small ${name === "Late" ? "bad-t" : "muted"}`} style={{ margin: "4px 0 8px" }}>{name} · {xs.length}</div>
              <div className="wlist">{xs.map(card)}</div>
            </div>
          ))}
          {!open.length && <div className="empty"><b>All clear</b><span>No open tasks here. Add one above, or start a project from a template.</span></div>}
          {doneList.length > 0 && (
            <>
              <button className="grp" style={{ fontSize: 12.5, color: "var(--muted)" }} aria-expanded={showDone} onClick={() => setShowDone(!showDone)}><span className="chev" style={{ transform: `rotate(${showDone ? 90 : 0}deg)` }}><Icon name="right" size={13} /></span>Done in the last 2 weeks ({doneList.length})</button>
              {showDone && <div className="wlist" style={{ marginTop: 8 }}>{doneList.map(card)}</div>}
            </>
          )}
        </div>
      )}
      {form && <TaskForm task={form} clients={clients} projects={projects ?? []} onClose={() => setForm(null)} onSaved={reload} />}
    </>
  );
}

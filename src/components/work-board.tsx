"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { addDays, rel, today } from "@/lib/dates";
import { COLUMNS, PROJECT_COLS, colOf, nextUp, setStatus, wantsNextUp, type Project } from "@/lib/work";
import { downloadCsv } from "@/lib/csv";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import TaskForm, { type TaskDraft } from "./task-form";
import { ATTACH, firstImage } from "./task-files";
import { useSigned } from "@/lib/work-files";
import Seg from "./seg";
import Icon from "./icon";
import ReviewCard from "./review-card";
import { Empty, VTASK_COLS, isImage, type CardCtx, type GroupBy, type Lane, type VTask, type ViewConfig, type ViewKind } from "./views/shared";
import BoardView from "./views/board-view";
import TableView from "./views/table-view";
import CalendarView from "./views/calendar-view";
import TimelineView from "./views/timeline-view";
import SavedViews from "./views/saved-views";
import CsvImport, { type Field } from "./views/csv-import";
import type { Val } from "./views/sheet";
import "@/styles/views.css";

const noop = () => () => {};
type Props = { clients: Client[]; clientId?: string; projectId?: string; taskId?: string; q?: string; openNew?: boolean };

const IMPORT_FIELDS: Field[] = [
  { key: "title", label: "Title", required: true, max: 500, aliases: ["task", "name", "task name"] },
  { key: "status", label: "Status", type: "enum", options: ["todo", "doing", "waiting", "done"] },
  { key: "priority", label: "Priority", type: "enum", options: ["low", "med", "high"] },
  { key: "client", label: "Client", max: 200 },
  { key: "project", label: "Project", max: 200 },
  { key: "start_date", label: "Start date", type: "date", aliases: ["start", "starts"] },
  { key: "due_date", label: "Due date", type: "date", aliases: ["due", "deadline"] },
  { key: "labels", label: "Labels", type: "list", max: 500, aliases: ["tags"] },
  { key: "notes", label: "Notes", aliases: ["description", "details"] },
];

// All your work, one set of tasks seen as a board, a table, a calendar or a timeline.
export default function WorkBoard(props: Props) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="card skel" style={{ height: 420 }} aria-busy="true" />;
  return <Board {...props} />;
}

function Board({ clients, clientId, projectId, taskId, q: q0, openNew }: Props) {
  const t = today();
  const [view, setView] = useState<ViewKind>("board");
  const [who, setWho] = useState(clientId ?? "");
  const [proj, setProj] = useState(projectId ?? "");
  const [label, setLabel] = useState("");
  const [status, setStatusF] = useState("");
  const [q, setQ] = useState(q0 ?? "");
  const [group, setGroup] = useState<GroupBy>("status");
  const [quick, setQuick] = useState("");
  const [form, setForm] = useState<TaskDraft | null>(() => (openNew ? { client_id: clientId ?? null, project_id: projectId ?? null, status: "todo", due_date: t } : null));
  const [importing, setImporting] = useState(false);
  // Opens the task a link points at (/work?task=<id>, used by reminders).
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("task");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    supabase().from("tasks").select(VTASK_COLS).eq("id", id).maybeSingle<VTask>().then(({ data }) => { if (data) setForm(data); });
  }, []);
  const since = addDays(t, -14);
  const [tasks, reload, setTasks] = useRows<VTask>(`work:${clientId ?? "all"}`, (s) => {
    let x = s.from("tasks").select(VTASK_COLS).or(`status.neq.done,done_at.gte.${since}`).order("position").order("due_date", { nullsFirst: false }).limit(800);
    if (clientId) x = x.eq("client_id", clientId);
    return x;
  }, ["tasks"]);
  const [projects] = useRows<Project>(`work-projects:${clientId ?? "all"}`, (s) => {
    let x = s.from("projects").select(PROJECT_COLS).order("created_at", { ascending: false }).limit(300);
    if (clientId) x = x.eq("client_id", clientId);
    return x;
  }, ["projects"]);
  const [cmts] = useRows<{ task_id: string }>("work-comment-counts", (s) => s.from("task_comments").select("task_id").limit(5000), ["task_comments"]);

  // Deep link /work?task=<id>: open that task, even an old one that isn't on the board.
  useEffect(() => {
    if (!taskId) return;
    supabase().from("tasks").select(VTASK_COLS).eq("id", taskId).maybeSingle<VTask>().then(({ data }) => { if (data) setForm(data); else toast("That task isn't here any more."); });
  }, [taskId]);

  const all = tasks ?? [], plist = projects ?? [];
  const client = (id: string | null) => clients.find((c) => c.id === id);
  const project = (id: string | null) => plist.find((p) => p.id === id);
  const counts = new Map<string, number>();
  for (const c of cmts ?? []) counts.set(c.task_id, (counts.get(c.task_id) ?? 0) + 1);
  const allLabels = [...new Set(all.flatMap((x) => x.labels ?? []))].sort((a, b) => a.localeCompare(b));
  const shown = all.filter((x) => (!who || x.client_id === who) && (!proj || x.project_id === proj) && (!label || (x.labels ?? []).includes(label))
    && (!status || colOf(x.status) === status) && (!q || `${x.title} ${x.notes} ${(x.labels ?? []).join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  const open = shown.filter((x) => x.status !== "done");
  // A task with no image link gets its first attached image as the card cover.
  const covers = useSigned(shown.filter((x) => !(x.links ?? []).some((l) => isImage(l.url))).map((x) => firstImage(x.files)), ATTACH);
  const filtered = !!(who && !clientId) || !!proj || !!label || !!status || !!q;
  const config: ViewConfig = { view, who, proj, label, status, q, group };
  const apply = (c: Partial<ViewConfig>) => {
    setView(c.view ?? "board"); setProj(c.proj ?? ""); setLabel(c.label ?? ""); setStatusF(c.status ?? ""); setQ(c.q ?? ""); setGroup(c.group ?? "status");
    if (!clientId) setWho(c.who ?? "");
  };
  const clear = () => apply({ view, group });

  // Swimlanes for the board, row groups for the table.
  const lanes = (by: GroupBy | "none"): Lane[] => {
    if (by === "client") return [...clients.filter((c) => shown.some((x) => x.client_id === c.id)).map((c) => ({ key: c.id, label: clientLabel(c), color: c.color, rows: shown.filter((x) => x.client_id === c.id) })),
      { key: "personal", label: "Personal", rows: shown.filter((x) => !x.client_id || !client(x.client_id)) }].filter((l) => l.rows.length);
    if (by === "project") return [...plist.filter((p) => shown.some((x) => x.project_id === p.id)).map((p) => ({ key: p.id, label: p.name, color: client(p.client_id)?.color, rows: shown.filter((x) => x.project_id === p.id) })),
      { key: "none", label: "No project", rows: shown.filter((x) => !x.project_id || !project(x.project_id)) }].filter((l) => l.rows.length);
    if (by === "status") return COLUMNS.map((c) => ({ key: c.key, label: c.label, color: c.tone, rows: shown.filter((x) => colOf(x.status) === c.key) })).filter((l) => l.rows.length);
    return [{ key: "all", label: "All", rows: shown }];
  };
  const ctx: CardCtx = {
    find: (id) => all.find((x) => x.id === id),
    props: (x) => ({ client: client(x.client_id), project: project(x.project_id), comments: counts.get(x.id) ?? 0, showClient: !clientId, today: t, cover: covers[firstImage(x.files)] || undefined, onOpen: () => setForm(x) }),
  };

  // Moving into Done goes through setStatus, so a repeating task books its next one.
  async function move(id: string, to: string) {
    const task = all.find((x) => x.id === id);
    if (!task || colOf(task.status) === to) return;
    setTasks((r) => (r ?? []).map((x) => (x.id === id ? { ...x, status: to, done_at: to === "done" ? new Date().toISOString() : null } : x)));
    const r = await setStatus(task, to, client(task.client_id));
    if (r.error) { reload(); toast("Could not move it. Try again."); return r; }
    const after = to === "done" && (await wantsNextUp()) ? nextUp(all, id) : undefined;
    if (r.next) toast(`Done. The next one is set for ${rel(r.next).toLowerCase()}.${after ? ` Next up: ${after.title}` : ""}`);
    else if (to === "done") toast(after ? `Nice. Next up: ${after.title}` : "Nice. Marked done.");
    return r;
  }
  async function setDue(id: string, due: string | null) {
    const task = all.find((x) => x.id === id);
    if (!task || task.due_date === due) return;
    setTasks((r) => (r ?? []).map((x) => (x.id === id ? { ...x, due_date: due } : x)));
    const { error } = await supabase().from("tasks").update({ due_date: due }).eq("id", id);
    if (error) { reload(); toast("Could not move it. Try again."); }
  }
  async function saveCell(x: VTask, key: string, v: Val): Promise<{ error: unknown }> {
    if (key === "status") return (await move(x.id, String(v))) ?? { error: null };
    let patch: Record<string, unknown>;
    if (key === "title") { const s = String(v ?? "").trim().slice(0, 500); if (!s) return { error: "empty" }; patch = { title: s }; }
    else if (key === "labels") patch = { labels: [...new Set(String(v ?? "").split(",").map((s) => s.trim().slice(0, 40)).filter(Boolean))].slice(0, 20) };
    else if (key === "client_id" || key === "project_id") patch = { [key]: v || null };
    else if (key === "priority" && ["low", "med", "high"].includes(String(v))) patch = { priority: v };
    else if (key === "due_date" || key === "start_date") patch = { [key]: v || null };
    else return { error: "unknown column" };
    const { error } = await supabase().from("tasks").update(patch).eq("id", x.id);
    if (!error) reload();
    return { error };
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
  const newTask = () => setForm({ client_id: who || null, project_id: proj || null, status: "todo", due_date: t });
  function exportCsv() {
    const head = ["title", "status", "priority", "client", "project", "start_date", "due_date", "labels", "milestone", "checklist", "notes", "done_at"];
    downloadCsv(`tasks-${t}.csv`, [head, ...shown.map((x) => {
      const c = client(x.client_id), subs = x.subtasks ?? [];
      return [x.title, x.status, x.priority, c ? clientLabel(c) : "", project(x.project_id)?.name ?? "", x.start_date ?? "", x.due_date ?? "", (x.labels ?? []).join("; "), x.milestone ? "yes" : "", subs.length ? `${subs.filter((s) => s.done).length}/${subs.length}` : "", x.notes, x.done_at ?? ""];
    })]);
  }
  // A CSV row to a tasks row. Client and project are matched by name.
  const finishImport = (c: Record<string, string>) => {
    const find = <T,>(xs: T[], name: (x: T) => string[], v: string) => xs.find((x) => name(x).some((n) => n.toLowerCase() === v.toLowerCase()));
    const cl = c.client ? find(clients, (x) => [x.name, x.company, clientLabel(x)], c.client) : undefined;
    if (c.client && !cl) return `No client named “${c.client}”`;
    const pr = c.project ? find(plist, (x) => [x.name], c.project) : undefined;
    if (c.project && !pr) return `No project named “${c.project}”`;
    if (c.start_date && c.due_date && c.start_date > c.due_date) return "Start date is after the due date";
    const st = c.status || "todo";
    return {
      title: c.title, status: st, done_at: st === "done" ? new Date().toISOString() : null, priority: c.priority || "med",
      client_id: cl?.id ?? pr?.client_id ?? null, project_id: pr?.id ?? null, start_date: c.start_date || null, due_date: c.due_date || null, notes: c.notes ?? "",
      labels: c.labels ? [...new Set(c.labels.split(/[;,]/).map((s) => s.trim().slice(0, 40)).filter(Boolean))].slice(0, 20) : [],
    };
  };

  const sel = "search vsel";
  const body = () => {
    if (tasks === null) return <div className="card skel" style={{ height: 300 }} />;
    if (!all.length) return <div className="card"><Empty line="No tasks yet. Add the first one and it lands here." action="New task" onAction={newTask} /></div>;
    if (!shown.length) return <div className="card"><Empty line="Nothing matches these filters." action="Clear filters" onAction={clear} /></div>;
    if (view === "table") return <div className="card"><TableView lanes={lanes(group)} clients={clients} projects={plist} today={t} save={saveCell} open={(x) => setForm(x)} /></div>;
    if (view === "calendar") return <CalendarView rows={shown} clients={clients} today={t} setDue={setDue} open={(x) => setForm(x)} />;
    if (view === "timeline") return <TimelineView rows={shown} projects={plist} clients={clients} today={t} open={(x) => setForm(x)} />;
    return <BoardView lanes={lanes(group === "status" ? "none" : group)} ctx={ctx} onMove={move} />;
  };

  return (
    <>
      <div className="row cal-bar">
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="cal-title">{proj ? project(proj)?.name ?? "Project" : clientId ? "Work" : "All work"}</b>
          <span className="small muted">{open.length} open · {open.filter((x) => x.due_date && x.due_date < t).length} late · {shown.length - open.length} done in the last 2 weeks</span>
        </div>
        <Seg label="View" options={[["board", "Board"], ["table", "Table"], ["calendar", "Calendar"], ["timeline", "Timeline"]]} value={view} onChange={setView} />
        <button className="btn solid" onClick={newTask}><Icon name="plus" />New task</button>
      </div>
      <div className="row vfilters">
        <form className="todo-add grow" onSubmit={add} style={{ margin: 0, minWidth: 200 }}>
          <span className="todo-plus"><Icon name="plus" size={16} /></span>
          <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Quick add a task for today" aria-label="Quick add" />
        </form>
        <input className="search" style={{ width: 150 }} type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" />
        <button className="btn small ghost" onClick={exportCsv} disabled={!shown.length}><Icon name="file" size={15} />Export</button>
        <button className="btn small ghost" onClick={() => setImporting(true)}><Icon name="updown" size={15} />Import</button>
      </div>
      <div className="row vsels" role="group" aria-label="Filter and group">
        {!clientId && <select className={sel} value={who} onChange={(e) => { setWho(e.target.value); setProj(""); }} aria-label="Client"><option value="">All clients</option>{clients.filter((c) => c.status !== "Past").map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}</select>}
        {plist.length > 0 && <select className={sel} value={proj} onChange={(e) => setProj(e.target.value)} aria-label="Project"><option value="">All projects</option>{plist.filter((p) => !who || p.client_id === who).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        {allLabels.length > 0 && <select className={sel} value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Label"><option value="">All labels</option>{allLabels.map((l) => <option key={l} value={l}>{l}</option>)}</select>}
        <select className={sel} value={status} onChange={(e) => setStatusF(e.target.value)} aria-label="Status"><option value="">Any status</option>{COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
        {(view === "board" || view === "table") && <select className={sel} value={group} onChange={(e) => setGroup(e.target.value as GroupBy)} aria-label="Group by"><option value="status">Group: status</option><option value="client">Group: client</option><option value="project">Group: project</option></select>}
        {filtered && <button className="btn small ghost" onClick={clear}>Clear</button>}
        <span className="grow" />
        <SavedViews current={config} apply={apply} />
      </div>

      {proj && project(proj)?.status === "Done" && <ReviewCard key={proj} project={project(proj)!} client={client(project(proj)!.client_id)} />}
      {body()}

      {form && <TaskForm key={form.id ?? "new"} task={form} clients={clients} projects={plist} labelSuggestions={allLabels} onClose={() => setForm(null)} onSaved={reload} />}
      {importing && <CsvImport title="Import tasks" table="tasks" fields={IMPORT_FIELDS} finish={finishImport} onClose={() => setImporting(false)} onDone={reload} />}
    </>
  );
}

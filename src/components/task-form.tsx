"use client";

import { useState } from "react";
import { supabase } from "@/lib/use-rows";
import { COLUMNS, setStatus, uid, type Project, type Sub, type Task, type TLink } from "@/lib/work";
import { rel } from "@/lib/dates";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import Modal from "./modal";
import Icon from "./icon";

export type TaskDraft = Partial<Task>;
const safe = (u: string) => { try { const x = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`); return x.href; } catch { return ""; } };

// One task with everything about it: status, due date, checklist, links and notes.
export default function TaskForm({ task = {}, clients, projects, onClose, onSaved }: { task?: TaskDraft; clients: Client[]; projects: Project[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(task.title ?? "");
  const [clientId, setClientId] = useState(task.client_id ?? "");
  const [projectId, setProjectId] = useState(task.project_id ?? "");
  const [status, setStat] = useState(task.status ?? "todo");
  const [priority, setPriority] = useState(task.priority ?? "med");
  const [due, setDue] = useState(task.due_date ?? "");
  const [repeat, setRepeat] = useState(task.repeat ?? "none");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [subs, setSubs] = useState<Sub[]>(task.subtasks ?? []);
  const [links, setLinks] = useState<TLink[]>(task.links ?? []);
  const [newSub, setNewSub] = useState("");
  const [newLink, setNewLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const doneSubs = subs.filter((s) => s.done).length;
  const projectList = projects.filter((p) => !clientId || p.client_id === clientId || p.id === projectId);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast("Give the task a name.");
    setBusy(true);
    const row = { title: title.trim(), client_id: clientId || null, project_id: projectId || null, priority, due_date: due || null, repeat, notes, subtasks: subs, links };
    let error;
    if (task.id) {
      ({ error } = await supabase().from("tasks").update(row).eq("id", task.id));
      if (!error && status !== task.status) {
        const r = await setStatus({ ...(task as Task), ...row, status: task.status ?? "todo" }, status, clients.find((c) => c.id === clientId));
        if (r.next) toast(`Done. The next one is set for ${rel(r.next).toLowerCase()}.`);
      }
    } else ({ error } = await supabase().from("tasks").insert({ ...row, status, done_at: status === "done" ? new Date().toISOString() : null }));
    setBusy(false);
    if (error) return toast("Could not save. Check your connection.");
    if (!(task.id && status === "done" && task.status !== "done" && repeat !== "none")) toast(task.id ? "Task saved" : "Task added");
    onSaved();
    onClose();
  }
  async function remove() {
    if (!task.id) return;
    if (!sure) return setSure(true);
    const { error } = await supabase().from("tasks").delete().eq("id", task.id);
    if (error) return toast("Could not delete. Try again.");
    toast("Task deleted");
    onSaved();
    onClose();
  }
  const addSub = () => { if (!newSub.trim()) return; setSubs((s) => [...s, { id: uid(), title: newSub.trim(), done: false }]); setNewSub(""); };
  const addLink = () => { const u = safe(newLink.trim()); if (!u) return toast("Paste a full link."); let label = u; try { label = new URL(u).hostname.replace("www.", ""); } catch {} setLinks((l) => [...l, { id: uid(), url: u, label }]); setNewLink(""); };

  return (
    <Modal label={task.id ? "Edit task" : "New task"} onClose={onClose} wide>
      <form onSubmit={save} style={{ display: "contents" }}>
        <input className="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" aria-label="Task name" />
        <div className="row" style={{ gap: 6 }}>{COLUMNS.map((c) => (
          <button key={c.key} type="button" className={`fmt${status === c.key ? " on" : ""}`} style={{ ["--f" as string]: c.tone }} aria-pressed={status === c.key} onClick={() => setStat(c.key)}><i />{c.label}</button>
        ))}</div>
        <div className="form">
          <div className="field"><label htmlFor="tk-client">Client</label><select id="tk-client" value={clientId} onChange={(e) => { setClientId(e.target.value); setProjectId(""); }}><option value="">Personal</option>{clients.filter((c) => c.status !== "Past" || c.id === clientId).map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}</select></div>
          <div className="field"><label htmlFor="tk-project">Project</label><select id="tk-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">No project</option>{projectList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="field"><label htmlFor="tk-due">Due</label><input id="tk-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <div className="field"><label htmlFor="tk-pri">Priority</label><select id="tk-pri" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="low">Low</option><option value="med">Normal</option><option value="high">High</option></select></div>
          <div className="field full"><label htmlFor="tk-rep">Repeats</label><select id="tk-rep" value={repeat} onChange={(e) => setRepeat(e.target.value)}><option value="none">Once</option><option value="daily">Every work day</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></div>
          <div className="field full"><label>Checklist{subs.length ? ` (${doneSubs}/${subs.length})` : ""}</label>
            <div className="list">{subs.map((s) => (
              <div className="li" key={s.id} style={{ padding: "4px 0" }}>
                <button type="button" className={`check ${s.done ? "on" : ""}`} aria-label={s.done ? "Mark not done" : "Mark done"} onClick={() => setSubs((xs) => xs.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></button>
                <span className="t" style={s.done ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>{s.title}</span>
                <button type="button" className="btn small ghost" style={{ padding: 4 }} aria-label="Remove" onClick={() => setSubs((xs) => xs.filter((x) => x.id !== s.id))}><Icon name="x" /></button>
              </div>
            ))}</div>
            <div className="row" style={{ flexWrap: "nowrap" }}><input value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }} placeholder="Add a step and press Enter" /><button type="button" className="btn small" onClick={addSub}>Add</button></div>
          </div>
          <div className="field full"><label>Links</label>
            {links.map((l) => <div key={l.id} className="row" style={{ gap: 6 }}><Icon name="link" size={14} /><a href={l.url} target="_blank" rel="noopener noreferrer" className="grow" style={{ color: "var(--accent-ink)", overflowWrap: "anywhere" }}>{l.label}</a><button type="button" className="btn small ghost" style={{ padding: 4 }} aria-label="Remove link" onClick={() => setLinks((xs) => xs.filter((x) => x.id !== l.id))}><Icon name="x" /></button></div>)}
            <div className="row" style={{ flexWrap: "nowrap" }}><input value={newLink} onChange={(e) => setNewLink(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }} placeholder="Paste a Drive, Canva or doc link" /><button type="button" className="btn small" onClick={addLink}>Add</button></div>
          </div>
          <div className="field full"><label htmlFor="tk-notes">Notes</label><textarea id="tk-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Details and instructions from the client…" /></div>
        </div>
        <div className="modal-foot">
          {task.id && <button type="button" className="btn danger left" onClick={remove}>{sure ? "Tap again to delete" : "Delete"}</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

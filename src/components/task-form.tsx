"use client";

import { useState } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { COLUMNS, setStatus, uid, type Project, type Sub, type Task, type TLink } from "@/lib/work";
import { rel } from "@/lib/dates";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import Modal from "./modal";
import Icon from "./icon";
import { labelTone, type VTask } from "./views/shared";
import TemplatePicker, { list, str } from "./template-picker";
import RemindButton from "./remind-button";
import TaskFiles, { ATTACH, cleanFiles } from "./task-files";
import "@/styles/views.css";

export type TaskDraft = Partial<VTask>;
type Comment = { id: string; body: string; created_at: string };
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const safe = (u: string) => { try { const x = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`); return x.href; } catch { return ""; } };

// One task with everything about it: status, due date, labels, checklist, links, notes, comments and history.
export default function TaskForm({ task = {}, clients, projects, onClose, onSaved, labelSuggestions = [] }: { task?: TaskDraft; clients: Client[]; projects: Project[]; onClose: () => void; onSaved: () => void; labelSuggestions?: string[] }) {
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
  const [labels, setLabels] = useState<string[]>(task.labels ?? []);
  const [newLabel, setNewLabel] = useState("");
  const [milestone, setMilestone] = useState(task.milestone ?? false);
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
    const row = { title: title.trim(), client_id: clientId || null, project_id: projectId || null, priority, due_date: due || null, repeat, notes, subtasks: subs, links, labels, milestone };
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
    const { data: cur } = await supabase().from("tasks").select("files").eq("id", task.id).maybeSingle<{ files: unknown }>(); // includes files attached just now
    const { error } = await supabase().from("tasks").delete().eq("id", task.id);
    if (error) return toast("Could not delete. Try again.");
    const paths = cleanFiles(cur?.files).map((f) => f.path);
    if (paths.length) await supabase().storage.from(ATTACH).remove(paths); // its attachments go with it
    toast("Task deleted");
    onSaved();
    onClose();
  }
  async function duplicate() {
    const { error } = await supabase().from("tasks").insert({
      title: `${title.trim() || task.title} (copy)`, client_id: clientId || null, project_id: projectId || null, priority, due_date: due || null, start_date: task.start_date ?? null,
      repeat, notes, subtasks: subs.map((x) => ({ ...x, id: uid(), done: false })), links, labels, milestone, status: "todo",
    });
    if (error) return toast("Could not copy it. Try again.");
    toast("Copied. The copy is in To do.");
    onSaved();
    onClose();
  }
  const addLabel = () => {
    const l = newLabel.trim().slice(0, 40);
    if (l && !labels.some((x) => x.toLowerCase() === l.toLowerCase()) && labels.length < 20) setLabels((xs) => [...xs, l]);
    setNewLabel("");
  };
  // Templates keep the reusable parts only: never ids, dates, client or files.
  const tplData = () => ({ title: title.trim(), notes, priority, labels, subtasks: subs.map((x) => ({ title: x.title })), links: links.map((l) => ({ url: l.url, label: l.label })) });
  const applyTpl = (d: Record<string, unknown>) => {
    if (str(d.title)) setTitle(str(d.title, 500));
    setNotes(str(d.notes, 20000));
    setPriority(["low", "med", "high"].includes(str(d.priority)) ? str(d.priority) : "med");
    setLabels([...new Set(list(d.labels).map((l) => str(l, 40).trim()).filter(Boolean))].slice(0, 20));
    setSubs(list(d.subtasks, 200).map((x) => str((x as { title?: unknown })?.title, 300).trim()).filter(Boolean).map((t) => ({ id: uid(), title: t, done: false })));
    setLinks(list(d.links, 50).flatMap((x) => {
      const o = (x ?? {}) as { url?: unknown; label?: unknown }, u = safe(str(o.url, 2000).trim());
      return u ? [{ id: uid(), url: u, label: str(o.label, 200).trim() || new URL(u).hostname.replace("www.", "") }] : [];
    }));
  };
  const addSub = () => { if (!newSub.trim()) return; setSubs((s) => [...s, { id: uid(), title: newSub.trim(), done: false }]); setNewSub(""); };
  const addLink = () => { const u = safe(newLink.trim()); if (!u) return toast("Paste a full link."); let label = u; try { label = new URL(u).hostname.replace("www.", ""); } catch {} setLinks((l) => [...l, { id: uid(), url: u, label }]); setNewLink(""); };

  return (
    <Modal label={task.id ? "Edit task" : "New task"} onClose={onClose} wide>
      <form onSubmit={save} style={{ display: "contents" }}>
        <input className="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" aria-label="Task name" />
        <div className="row" style={{ gap: 6 }}>{COLUMNS.map((c) => (
          <button key={c.key} type="button" className={`fmt${status === c.key ? " on" : ""}`} style={{ ["--f" as string]: c.tone }} aria-pressed={status === c.key} onClick={() => setStat(c.key)}><i />{c.label}</button>
        ))}</div>
        <TemplatePicker kind="task" pick={!task.id} data={tplData} onApply={applyTpl} />
        <div className="form">
          <div className="field"><label htmlFor="tk-client">Client</label><select id="tk-client" value={clientId} onChange={(e) => { setClientId(e.target.value); setProjectId(""); }}><option value="">Personal</option>{clients.filter((c) => c.status !== "Past" || c.id === clientId).map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}</select></div>
          <div className="field"><label htmlFor="tk-project">Project</label><select id="tk-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">No project</option>{projectList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="field"><label htmlFor="tk-due">Due</label><input id="tk-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <div className="field"><label htmlFor="tk-pri">Priority</label><select id="tk-pri" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="low">Low</option><option value="med">Normal</option><option value="high">High</option></select></div>
          <div className="field full"><label htmlFor="tk-rep">Repeats</label><select id="tk-rep" value={repeat} onChange={(e) => setRepeat(e.target.value)}><option value="none">Once</option><option value="daily">Every work day</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></div>
          <div className="field full"><label htmlFor="tk-label">Labels</label>
            <div className="vlabel-edit">
              {labels.map((l) => <span key={l} className={`vlab ${labelTone(l)}`}>{l}<button type="button" aria-label={`Remove label ${l}`} onClick={() => setLabels((xs) => xs.filter((x) => x !== l))}><Icon name="x" size={11} /></button></span>)}
              <input id="tk-label" list="tk-label-list" value={newLabel} maxLength={40} onChange={(e) => setNewLabel(e.target.value)} placeholder={labels.length ? "Add another" : "Type a label and press Enter"}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addLabel(); } else if (e.key === "Backspace" && !newLabel && labels.length) setLabels((xs) => xs.slice(0, -1)); }} onBlur={addLabel} />
              <datalist id="tk-label-list">{labelSuggestions.filter((l) => !labels.includes(l)).map((l) => <option key={l} value={l} />)}</datalist>
            </div>
          </div>
          <div className="field full">
            <button type="button" className="vtoggle" role="switch" aria-checked={milestone} onClick={() => setMilestone(!milestone)}><i aria-hidden="true" /><span className="vdia" aria-hidden="true" />Milestone<span className="small muted">a key date, shown as a diamond on the timeline</span></button>
          </div>
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
          {task.id
            ? <>
              <TaskFiles taskId={task.id} initial={task.files} />
              <div className="field full"><label>Reminders</label><RemindButton title={title || task.title || ""} href={`/work?task=${task.id}`} entity="task" entityId={task.id} clientId={clientId || null} /></div>
            </>
            : <div className="field full"><label>Files and reminders</label><small className="muted">Save the task first to attach files or set a reminder.</small></div>}
        </div>
        {task.id && <Thread task={task} />}
        <div className="modal-foot">
          {task.id && <button type="button" className="btn danger left" onClick={remove}>{sure ? "Tap again to delete" : "Delete"}</button>}
          {task.id && <button type="button" className="btn ghost" onClick={duplicate}><Icon name="copy" />Duplicate</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

// Comments on a task, then everything that happened to it, oldest first.
function Thread({ task }: { task: TaskDraft }) {
  const id = task.id!;
  const [comments, reload] = useRows<Comment>(`task-comments:${id}`, (s) => s.from("task_comments").select("id,body,created_at").eq("task_id", id).order("created_at").limit(200), ["task_comments"]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  async function add() {
    const b = body.trim();
    if (!b) return;
    if (b.length > 4000) return toast("Keep comments under 4000 characters.");
    setBusy(true);
    const { error } = await supabase().from("task_comments").insert({ task_id: id, body: b });
    setBusy(false);
    if (error) return toast("Could not post the comment. Try again.");
    setBody("");
    reload();
  }
  const trail = [
    task.created_at && { at: task.created_at, text: "Created" },
    task.updated_at && task.updated_at !== task.created_at && { at: task.updated_at, text: "Last updated" },
    task.done_at && { at: task.done_at, text: "Marked done" },
    ...(comments ?? []).map((c) => ({ at: c.created_at, text: "Comment added" })),
  ].filter((x): x is { at: string; text: string } => !!x).sort((a, b) => a.at.localeCompare(b.at));
  return (
    <div className="vthread">
      <div className="field full">
        <label htmlFor="tk-cmt">Comments{comments?.length ? ` (${comments.length})` : ""}</label>
        {(comments ?? []).map((c) => <div key={c.id} className="cmt"><span className="small muted">{when(c.created_at)}</span><p>{c.body}</p></div>)}
        <textarea id="tk-cmt" value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} placeholder="Write a note for later or a reply from the client…" style={{ minHeight: 60 }}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } }} />
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className={`small ${body.length > 4000 ? "bad-t" : "muted"}`}>{body.length ? `${body.length}/4000` : ""}</span>
          <button type="button" className="btn small" disabled={busy || !body.trim()} onClick={add}>{busy ? "Posting…" : "Comment"}</button>
        </div>
      </div>
      {trail.length > 0 && (
        <ol className="vtrail" aria-label="Activity">
          {trail.map((x, i) => <li key={i}><span>{x.text}</span><time dateTime={x.at} className="small muted">{when(x.at)}</time></li>)}
        </ol>
      )}
    </div>
  );
}

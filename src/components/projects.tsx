"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { supabase, useRows } from "@/lib/use-rows";
import { parseYmd, today } from "@/lib/dates";
import { PROJECT_COLS, TEMPLATES, createFromTemplate, type Project } from "@/lib/work";
import { roleLabel } from "@/lib/roles";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import Modal from "./modal";
import Icon from "./icon";

const noop = () => () => {};
type Count = { project_id: string | null; status: string };
const short = (d: string | null) => (d ? parseYmd(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

// Projects with progress. New ones can start from a template for the role, with every step ready.
export default function Projects({ clients, clientId }: { clients: Client[]; clientId?: string }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="card skel" style={{ height: 300 }} aria-busy="true" />;
  return <List clients={clients} clientId={clientId} />;
}

function List({ clients, clientId }: { clients: Client[]; clientId?: string }) {
  const [projects, reload] = useRows<Project>(`projects:${clientId ?? "all"}`, (s) => {
    let q = s.from("projects").select(PROJECT_COLS).order("created_at", { ascending: false });
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  }, ["projects"]);
  const [counts] = useRows<Count>(`project-tasks:${clientId ?? "all"}`, (s) => {
    let q = s.from("tasks").select("project_id,status").not("project_id", "is", null).limit(5000);
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  }, ["tasks"]);
  const [form, setForm] = useState<Partial<Project> | null>(null);
  const [showDone, setShowDone] = useState(false);
  const all = projects ?? [];
  const client = (id: string | null) => clients.find((c) => c.id === id);
  const progress = (id: string) => { const xs = (counts ?? []).filter((c) => c.project_id === id); return { done: xs.filter((x) => x.status === "done").length, total: xs.length }; };
  const href = (p: Project) => `${clientId ? `/clients/${clientId}` : ""}/work?project=${p.id}`;
  const active = all.filter((p) => p.status !== "Done"), finished = all.filter((p) => p.status === "Done");

  const card = (p: Project) => {
    const c = client(p.client_id), pr = progress(p.id), pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 0;
    const late = p.due_date && p.due_date < today() && p.status !== "Done";
    return (
      <div key={p.id} className="proj" style={{ ["--c" as string]: c?.color ?? "var(--accent)" }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
          <span className={`pill ${p.status === "Done" ? "good" : p.status === "On hold" ? "" : "acc"}`}>{p.status}</span>
          <button className="btn small ghost" onClick={() => setForm(p)} aria-label="Edit project"><Icon name="settings" /></button>
        </div>
        <Link href={href(p)} className="proj-link">
          <b>{p.name}</b>
          {!clientId && <span className="small muted">{c ? clientLabel(c) : "Personal"}</span>}
          {p.description && <span className="small muted proj-desc">{p.description}</span>}
          <div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${pct}%`, background: "var(--c)" }} /></div>
          <span className="small row" style={{ justifyContent: "space-between" }}><span className="muted">{pr.done}/{pr.total} steps · {pct}%</span>{p.due_date && <span className={late ? "bad-t" : "muted"}>Due {short(p.due_date)}</span>}</span>
        </Link>
      </div>
    );
  };

  return (
    <>
      <div className="row cal-bar">
        <div className="grow"><b className="cal-title">Projects</b><span className="small muted">{active.length} active{finished.length ? ` · ${finished.length} done` : ""}</span></div>
        <button className="btn solid" onClick={() => setForm({ client_id: clientId ?? null, status: "Active", start_date: today() })}><Icon name="plus" />New project</button>
      </div>
      {projects === null ? <div className="card skel" style={{ height: 200 }} /> : active.length ? <div className="proj-grid">{active.map(card)}</div> : (
        <div className="card empty"><b>No projects yet</b><span>Start one from a template: every step is added to your Work board with a due date.</span><button className="btn small" onClick={() => setForm({ client_id: clientId ?? null, status: "Active", start_date: today() })}><Icon name="plus" />New project</button></div>
      )}
      {finished.length > 0 && (
        <>
          <button className="grp" style={{ fontSize: 12.5, color: "var(--muted)" }} aria-expanded={showDone} onClick={() => setShowDone(!showDone)}><span className="chev" style={{ transform: `rotate(${showDone ? 90 : 0}deg)` }}><Icon name="right" size={13} /></span>Done ({finished.length})</button>
          {showDone && <div className="proj-grid">{finished.map(card)}</div>}
        </>
      )}
      {form && <ProjectForm p={form} clients={clients} onClose={() => setForm(null)} onSaved={reload} />}
    </>
  );
}

function ProjectForm({ p, clients, onClose, onSaved }: { p: Partial<Project>; clients: Client[]; onClose: () => void; onSaved: () => void }) {
  const [clientId, setClientId] = useState(p.client_id ?? "");
  const [name, setName] = useState(p.name ?? "");
  const [status, setStatus] = useState(p.status ?? "Active");
  const [start, setStart] = useState(p.start_date ?? today());
  const [due, setDue] = useState(p.due_date ?? "");
  const [desc, setDesc] = useState(p.description ?? "");
  const [tpl, setTpl] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const roles = clients.find((c) => c.id === clientId)?.roles ?? [];
  const templates = [...TEMPLATES].sort((a, b) => Number(roles.includes(b.role)) - Number(roles.includes(a.role)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (!p.id && tpl) {
      const r = await createFromTemplate(tpl, clientId || null, start, name.trim() || undefined);
      setBusy(false);
      if (r.error) return toast("Could not create the project. Try again.");
      toast("Project ready. Its steps are on your Work board.");
      onSaved();
      return onClose();
    }
    if (!name.trim()) { setBusy(false); return toast("Name the project, or pick a template."); }
    const row = { client_id: clientId || null, name: name.trim(), status, start_date: start || null, due_date: due || null, description: desc.trim() };
    const { error } = p.id ? await supabase().from("projects").update(row).eq("id", p.id) : await supabase().from("projects").insert(row);
    setBusy(false);
    if (error) return toast("Could not save. Try again.");
    toast(p.id ? "Project saved" : "Project created");
    onSaved();
    onClose();
  }
  async function remove() {
    if (!p.id) return;
    if (!sure) return setSure(true);
    const { error } = await supabase().from("projects").delete().eq("id", p.id);
    if (error) return toast("Could not delete. Try again.");
    toast("Project deleted. Its tasks stay on your board.");
    onSaved();
    onClose();
  }

  return (
    <Modal label={p.id ? "Edit project" : "New project"} onClose={onClose} wide={!p.id}>
      <form onSubmit={save} style={{ display: "contents" }}>
        <h2>{p.id ? "Edit project" : "New project"}</h2>
        <div className="form">
          <div className="field"><label htmlFor="pj-client">Client</label><select id="pj-client" value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Personal</option>{clients.filter((c) => c.status !== "Past" || c.id === clientId).map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}</select></div>
          <div className="field"><label htmlFor="pj-name">Name</label><input id="pj-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={tpl ? TEMPLATES.find((t) => t.key === tpl)?.name : "November content"} /></div>
          {!p.id && (
            <div className="field full"><label>Start from</label>
              <div className="tpl-grid">
                <button type="button" className={`tpl${!tpl ? " on" : ""}`} onClick={() => setTpl("")}><b>Blank project</b><span>Add your own tasks.</span></button>
                {templates.map((t) => (
                  <button key={t.key} type="button" className={`tpl${tpl === t.key ? " on" : ""}`} onClick={() => setTpl(t.key)}>
                    <b>{t.name}</b><span>{t.blurb}</span><small>{roleLabel(t.role)} · {t.steps.length} steps · {t.days} days{roles.includes(t.role) ? " · fits this client" : ""}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="field"><label htmlFor="pj-start">Starts</label><input id="pj-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          {(p.id || !tpl) && <div className="field"><label htmlFor="pj-due">Due</label><input id="pj-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>}
          {p.id && <div className="field"><label htmlFor="pj-status">Status</label><select id="pj-status" value={status} onChange={(e) => setStatus(e.target.value as Project["status"])}><option>Active</option><option>On hold</option><option>Done</option></select></div>}
          {(p.id || !tpl) && <div className="field full"><label htmlFor="pj-desc">Description</label><textarea id="pj-desc" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ minHeight: 70 }} /></div>}
        </div>
        <div className="modal-foot">
          {p.id && <button type="button" className="btn danger left" onClick={remove}>{sure ? "Tap again to delete" : "Delete"}</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{busy ? "Saving…" : p.id ? "Save" : "Create project"}</button>
        </div>
      </form>
    </Modal>
  );
}

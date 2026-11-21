"use client";

import "@/styles/public.css";
import { useState } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import { clientLabel } from "@/lib/types";
import { SLUG, SlugField, Switch, useClients, useOrigin, type MiniClient } from "./booking-settings";
import Modal from "./modal";
import Icon from "./icon";
import CopyButton from "./copy-button";

type Form = { id: string; slug: string; title: string; intro: string; client_id: string | null; project_id: string | null; active: boolean };
type MiniProject = { id: string; name: string; client_id: string | null; status: string };
const COLS = "id,slug,title,intro,client_id,project_id,active";

// Asana-style intake forms: a public link where anyone can send a request. Each one becomes a task on your Work board.
export default function IntakeSettings() {
  const [forms, reload] = useRows<Form>("intake-forms", (s) => s.from("intake_forms").select(COLS).order("created_at").limit(50), ["intake_forms"]);
  const [projects] = useRows<MiniProject>("mini-projects", (s) => s.from("projects").select("id,name,client_id,status").order("created_at", { ascending: false }).limit(500), ["projects"]);
  const clients = useClients();
  const origin = useOrigin();
  const [form, setForm] = useState<Partial<Form> | null>(null);
  const label = (f: Form) => {
    const c = clients?.find((x) => x.id === f.client_id), p = projects?.find((x) => x.id === f.project_id);
    return [c ? clientLabel(c) : "", p?.name ?? ""].filter(Boolean).join(" · ");
  };

  async function toggle(f: Form, active: boolean) {
    const { error } = await supabase().from("intake_forms").update({ active }).eq("id", f.id);
    if (error) return toast("Could not save. Try again.");
    toast(active ? "Form is on" : "Form is paused");
    reload();
  }

  return (
    <div className="card pb-card">
      <h3><span>Request forms</span><button type="button" className="btn small" onClick={() => setForm({})}><Icon name="plus" />New form</button></h3>
      <p className="small muted" style={{ margin: 0 }}>A simple link for clients to send you work. Every request becomes a task on your Work board and pings your Inbox.</p>
      {forms === null ? <div className="skel" style={{ height: 56, borderRadius: 14 }} /> : forms.length === 0 ? (
        <button type="button" className="btn solid pb-first" onClick={() => setForm({})}><Icon name="tasks" />Make your first request form</button>
      ) : (
        <ul className="pb-list">
          {forms.map((f) => {
            const url = `${origin}/form/${f.slug}`, to = label(f);
            return (
              <li key={f.id} className={f.active ? "" : "off"}>
                <div className="pb-main">
                  <b>{f.title}</b>
                  <span className="small muted">{to ? `Tasks go to ${to}` : "Tasks go to your board"}</span>
                  <a className="small pb-url" href={url} target="_blank" rel="noopener noreferrer">{url.replace(/^https?:\/\//, "")}</a>
                </div>
                <div className="row pb-actions">
                  <Switch on={f.active} onChange={(v) => toggle(f, v)} label={f.active ? "On" : "Off"} />
                  <CopyButton text={url} label="Copy link" done="Link copied" />
                  <button type="button" className="btn small" onClick={() => setForm(f)}>Edit</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {form && <IntakeForm f={form} own={(forms ?? []).map((x) => x.slug)} clients={clients ?? []} projects={projects ?? []} onClose={() => setForm(null)} onSaved={reload} />}
    </div>
  );
}

function IntakeForm({ f, own, clients, projects, onClose, onSaved }: { f: Partial<Form>; own: string[]; clients: MiniClient[]; projects: MiniProject[]; onClose: () => void; onSaved: () => void }) {
  const [slug, setSlug] = useState(f.slug ?? "");
  const [title, setTitle] = useState(f.title ?? "Send a request");
  const [intro, setIntro] = useState(f.intro ?? "");
  const [clientId, setClientId] = useState(f.client_id ?? "");
  const [projectId, setProjectId] = useState(f.project_id ?? "");
  const [active, setActive] = useState(f.active ?? true);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const others = own.filter((s) => s !== f.slug);
  const choices = projects.filter((p) => (p.status !== "Done" || p.id === projectId) && (!clientId || p.client_id === clientId));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!SLUG.test(slug)) return toast("Check the link: 3 to 40 letters, numbers or dashes.");
    if (others.includes(slug)) return toast("You already use that link.");
    if (!title.trim() || title.trim().length > 80) return toast("Give the form a title (up to 80 characters).");
    setBusy(true);
    const row = { slug, title: title.trim(), intro: intro.trim().slice(0, 1000), client_id: clientId || null, project_id: projectId || null, active };
    const { error } = f.id ? await supabase().from("intake_forms").update(row).eq("id", f.id) : await supabase().from("intake_forms").insert(row);
    setBusy(false);
    if (error) return toast(error.code === "23505" ? "That link is taken. Try another." : "Could not save. Try again.");
    toast(f.id ? "Form saved" : "Form ready. Copy the link to share it.");
    onSaved();
    onClose();
  }
  async function remove() {
    if (!f.id) return;
    if (!sure) return setSure(true);
    const { error } = await supabase().from("intake_forms").delete().eq("id", f.id);
    if (error) return toast("Could not delete. Try again.");
    toast("Form deleted. Requests already sent stay on your board.");
    onSaved();
    onClose();
  }

  return (
    <Modal label={f.id ? "Edit request form" : "New request form"} onClose={onClose}>
      <form onSubmit={save} style={{ display: "contents" }}>
        <h2>{f.id ? "Edit request form" : "New request form"}</h2>
        <div className="form">
          <SlugField id="if-slug" value={slug} onChange={setSlug} original={f.slug ?? ""} own={others} lookup="intake_info" prefix="/form/" />
          <div className="field full"><label htmlFor="if-title">Title</label><input id="if-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="field full"><label htmlFor="if-intro">A short hello</label><textarea id="if-intro" maxLength={1000} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="Tell me what you need and when. I'll reply within a day." style={{ minHeight: 64 }} /></div>
          <div className="field"><label htmlFor="if-client">Client (optional)</label>
            <select id="if-client" value={clientId} onChange={(e) => { setClientId(e.target.value); setProjectId(""); }}><option value="">None</option>{clients.filter((c) => c.status !== "Past" || c.id === clientId).map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}</select>
          </div>
          <div className="field"><label htmlFor="if-project">Project (optional)</label>
            <select id="if-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">None</option>{choices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </div>
          <div className="field full pb-active"><Switch on={active} onChange={setActive} label={active ? "Taking requests" : "Paused"} /></div>
        </div>
        <div className="modal-foot">
          {f.id && <button type="button" className="btn danger left" onClick={remove} onBlur={() => setSure(false)}>{sure ? "Tap again to delete" : "Delete"}</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{busy ? "Saving…" : f.id ? "Save" : "Create form"}</button>
        </div>
      </form>
    </Modal>
  );
}

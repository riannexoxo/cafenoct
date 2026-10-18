"use client";

import { useState, useSyncExternalStore } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { BANK_COLS, IDEA_STAGES, type BankItem } from "@/lib/bank";
import { toast } from "@/lib/toast";
import type { Client } from "@/lib/types";
import Modal from "./modal";
import Icon from "./icon";

const noop = () => () => {};
const TONE: Record<string, string> = { Spark: "var(--rose)", Exploring: "var(--lilac)", Building: "var(--accent)", Shipped: "var(--good)", Parked: "var(--muted)" };
const HINT: Record<string, string> = { Spark: "Raw ideas. Write them down before they vanish.", Exploring: "Researching, sketching, asking around.", Building: "You're making it.", Shipped: "Live and out in the world.", Parked: "Not now, maybe later." };

// Idea bank: from a spark to something shipped. Drag cards between columns.
export default function IdeaBoard({ client }: { client: Client }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="card skel" style={{ height: 380 }} aria-busy="true" />;
  return <Board client={client} />;
}

function Board({ client }: { client: Client }) {
  const [items, reload, setItems] = useRows<BankItem>(`ideas:${client.id}`, (s) => s.from("bank_items").select(BANK_COLS).eq("client_id", client.id).eq("kind", "idea").order("starred", { ascending: false }).order("updated_at", { ascending: false }), ["bank_items"]);
  const [quick, setQuick] = useState("");
  const [edit, setEdit] = useState<Partial<BankItem> | null>(null);
  const [over, setOver] = useState("");
  const all = items ?? [];
  const stage = (i: BankItem) => (IDEA_STAGES as readonly string[]).includes(i.status) ? i.status : "Spark";

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const title = quick.trim();
    if (!title) return;
    setQuick("");
    const { error } = await supabase().from("bank_items").insert({ client_id: client.id, kind: "idea", title, status: "Spark" });
    if (error) return toast("Could not save. Try again.");
    reload();
  }
  async function move(id: string, status: string) {
    const it = all.find((x) => x.id === id);
    if (!it || stage(it) === status) return;
    setItems((r) => (r ?? []).map((x) => (x.id === id ? { ...x, status } : x)));
    const { error } = await supabase().from("bank_items").update({ status }).eq("id", id);
    if (error) { reload(); return toast("Could not move it."); }
    if (status === "Shipped") toast(`Shipped: ${it.title}. Well done!`);
  }
  async function saveEdit(x: Partial<BankItem>) {
    const row = { title: (x.title ?? "").trim(), body: (x.body ?? "").trim(), url: (x.url ?? "").trim(), tags: x.tags ?? [], status: x.status || "Spark", starred: !!x.starred };
    if (!row.title) return toast("Give the idea a name.");
    const { error } = x.id ? await supabase().from("bank_items").update(row).eq("id", x.id) : await supabase().from("bank_items").insert({ ...row, client_id: client.id, kind: "idea" });
    if (error) return toast("Could not save. Try again.");
    setEdit(null);
    reload();
  }

  return (
    <>
      <form className="todo-add" onSubmit={add} style={{ marginBottom: 0 }}>
        <span className="todo-plus"><Icon name="spark" size={16} /></span>
        <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Catch an idea: an app, a tool, a site, a tweak…" aria-label="New idea" />
        <button className="btn small solid" type="submit">Add</button>
      </form>
      <div className="board">
        {IDEA_STAGES.map((s) => {
          const xs = all.filter((i) => stage(i) === s);
          return (
            <div key={s} className={`board-col${over === s ? " drop" : ""}`} style={{ ["--t" as string]: TONE[s] }}
              onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver((o) => (o === s ? "" : o))}
              onDrop={(e) => { e.preventDefault(); setOver(""); const id = e.dataTransfer.getData("text/idea"); if (id) move(id, s); }}>
              <div className="board-h"><span><i />{s}</span><span className="muted">{xs.length}</span></div>
              <small className="muted">{HINT[s]}</small>
              {xs.map((i) => (
                <div key={i.id} className="idea" draggable onDragStart={(e) => e.dataTransfer.setData("text/idea", i.id)} onClick={() => setEdit(i)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setEdit(i); }}>
                  <b>{i.starred && "★ "}{i.title}</b>
                  {i.body && <span>{i.body}</span>}
                  {i.tags.length > 0 && <div className="row" style={{ gap: 4 }}>{i.tags.map((t) => <span key={t} className="pill" style={{ fontSize: 10.5 }}>{t}</span>)}</div>}
                </div>
              ))}
              {!xs.length && <div className="idea-empty">Drop ideas here</div>}
            </div>
          );
        })}
      </div>
      {edit && <IdeaForm item={edit} onClose={() => setEdit(null)} onSave={saveEdit} onDelete={async () => { if (edit.id) { await supabase().from("bank_items").delete().eq("id", edit.id); toast("Idea deleted"); reload(); } setEdit(null); }} />}
    </>
  );
}

function IdeaForm({ item, onClose, onSave, onDelete }: { item: Partial<BankItem>; onClose: () => void; onSave: (x: Partial<BankItem>) => void; onDelete: () => void }) {
  const [title, setTitle] = useState(item.title ?? "");
  const [body, setBody] = useState(item.body ?? "");
  const [url, setUrl] = useState(item.url ?? "");
  const [tags, setTags] = useState((item.tags ?? []).join(", "));
  const [status, setStatus] = useState(item.status || "Spark");
  const [starred, setStarred] = useState(!!item.starred);
  const [sure, setSure] = useState(false);
  return (
    <Modal label="Idea" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave({ ...item, title, body, url, status, starred, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }); }} style={{ display: "contents" }}>
        <h2>{item.id ? "Idea" : "New idea"}</h2>
        <div className="form">
          <div className="field full"><label htmlFor="id-title">Name</label><input id="id-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Client onboarding app" /></div>
          <div className="field"><label htmlFor="id-status">Stage</label><select id="id-status" value={status} onChange={(e) => setStatus(e.target.value)}>{IDEA_STAGES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="field"><label className="row" style={{ gap: 8, cursor: "pointer", marginTop: 22 }}><input type="checkbox" checked={starred} onChange={(e) => setStarred(e.target.checked)} style={{ width: "auto" }} />Favorite</label></div>
          <div className="field full"><label htmlFor="id-body">Notes</label><textarea id="id-body" value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 160 }} placeholder="What it does, who it's for, the first version, prompts to try…" /></div>
          <div className="field full"><label htmlFor="id-url">Link</label><input id="id-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Repo, live site, inspiration…" /></div>
          <div className="field full"><label htmlFor="id-tags">Tags (separated by commas)</label><input id="id-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="app, client tool, AI" /></div>
        </div>
        <div className="modal-foot">
          {item.id && <button type="button" className="btn danger left" onClick={() => (sure ? onDelete() : setSure(true))}>{sure ? "Tap again to delete" : "Delete"}</button>}
          {url && <a className="btn" href={/^https?:\/\//i.test(url) ? url : `https://${url}`} target="_blank" rel="noopener noreferrer"><Icon name="link" />Open link</a>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid">Save</button>
        </div>
      </form>
    </Modal>
  );
}

"use client";

/* eslint-disable @next/next/no-img-element -- previews are the original files; next/image would recompress them. */
import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { addDays, rel, today } from "@/lib/dates";
import { toast } from "@/lib/toast";
import { DELIVERABLE_COLS, DESIGN_SPECS, QUEUE, VIDEO_SPECS, stageOf, type Deliverable, type Kind } from "@/lib/deliverables";
import { clientLabel, type Client } from "@/lib/types";
import { BUCKET, coverOf, useSigned } from "@/lib/work-files";
import Modal from "./modal";
import Icon from "./icon";
import WorkFiles from "./work-files";
import ShareLinkButton from "./share-link-button";
import CommentThread from "./comment-thread";

const noop = () => () => {};
const href = (u?: string) => { if (!u?.trim()) return ""; try { const x = new URL(/^https?:\/\//i.test(u) ? u.trim() : `https://${u.trim()}`); return x.href; } catch { return ""; } };
type Draft = Partial<Deliverable>;

// A design or video queue: each request moves from brief to delivered, with revision rounds counted.
export default function Deliverables(props: { kind: Kind; clients: Client[]; clientId?: string; canva?: boolean }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="card skel" style={{ height: 380 }} aria-busy="true" />;
  return <Queue {...props} />;
}

function Queue({ kind, clients, clientId, canva = false }: { kind: Kind; clients: Client[]; clientId?: string; canva?: boolean }) {
  const cfg = QUEUE[kind];
  const since = addDays(today(), -30);
  const [rows, reload, setRows] = useRows<Deliverable>(`dlv:${kind}:${clientId ?? "all"}`, (s) => {
    let q = s.from("deliverables").select(DELIVERABLE_COLS).eq("kind", kind).or(`status.neq.delivered,delivered_at.gte.${since}`).order("due_date", { nullsFirst: false }).order("created_at");
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  }, ["deliverables"]);
  const [form, setForm] = useState<Draft | null>(null);
  const [over, setOver] = useState("");
  const [who, setWho] = useState(clientId ?? "");
  const [specs, setSpecs] = useState(false);
  const t = today();
  const client = (id: string | null) => clients.find((c) => c.id === id);
  const list = (rows ?? []).filter((x) => !who || x.client_id === who);
  const active = cfg.stages.filter((s) => s.key !== "delivered");
  const delivered = list.filter((x) => x.status === "delivered");
  const covers = useSigned(list.map((x) => coverOf(x.files, x.canva?.thumb)));

  // Messages from the Canva sign-in coming back.
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("canva");
    if (!q) return;
    toast({ connected: "Canva is connected. Open a request to link a design.", declined: "Canva wasn't connected.", expired: "That Canva sign-in expired. Try again.", failed: "Canva didn't connect. Try again.", notready: "Canva isn't set up yet.", reconnect: "Connect Canva again to open designs." }[q] ?? "");
    history.replaceState(null, "", location.pathname);
  }, []);

  async function move(id: string, status: string) {
    const d = (rows ?? []).find((x) => x.id === id);
    if (!d || d.status === status) return;
    // Sending it back for changes counts as a revision round.
    const revisions = status === "revisions" && d.status !== "revisions" ? d.revisions + 1 : d.revisions;
    const patch = { status, revisions, delivered_at: status === "delivered" ? new Date().toISOString() : null };
    setRows((r) => (r ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error } = await supabase().from("deliverables").update(patch).eq("id", id);
    if (error) { reload(); return toast("Could not move it. Try again."); }
    if (revisions > d.max_revisions && revisions !== d.revisions) toast(`That's round ${revisions} of ${d.max_revisions} included. Worth mentioning extra rounds to the client.`);
    else if (status === "delivered") toast("Delivered 🎉");
  }

  const card = (x: Deliverable) => {
    const c = client(x.client_id), over = x.revisions > x.max_revisions, cover = covers[coverOf(x.files, x.canva?.thumb)];
    return (
      <div key={x.id} className="wcardt" draggable onDragStart={(e) => e.dataTransfer.setData("text/dlv", x.id)} onClick={() => setForm(x)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") setForm(x); }} style={{ ["--c" as string]: c?.color ?? "var(--line-strong)" }}>
        {cover && <img src={cover} alt="" className="dlv-cover" loading="lazy" draggable={false} />}
        <b>{x.title}</b>
        <div className="wt-meta">
          {!clientId && <span className="wt-client"><i />{c ? clientLabel(c) : "Personal"}</span>}
          {x.type && <span>{x.type}</span>}
          {x.size && <span className="num">{x.size.split(" ")[0]}</span>}
        </div>
        <div className="wt-foot">
          {x.due_date && x.status !== "delivered" && <span className={`pill ${x.due_date < t ? "bad" : x.due_date === t ? "warn" : ""}`}>{rel(x.due_date)}</span>}
          {(x.revisions > 0 || x.status === "revisions") && <span className={`pill ${over ? "bad" : ""}`}>Rev {x.revisions}/{x.max_revisions}</span>}
          {href(x.links?.final) && <span className="small muted"><Icon name="check" size={12} /> Final</span>}
          {(x.files ?? []).length > 0 && <span className="small muted"><Icon name="file" size={12} /> {x.files.length}</span>}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="row cal-bar">
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="cal-title">{cfg.title}</b>
          <span className="small muted">{list.length - delivered.length} in progress · {list.filter((x) => x.status !== "delivered" && x.due_date && x.due_date < t).length} late · {delivered.length} delivered in 30 days</span>
        </div>
        {!clientId && <select className="search" style={{ width: "auto" }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Client"><option value="">All clients</option>{clients.filter((c) => c.status !== "Past").map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}</select>}
        <button className="btn" onClick={() => setSpecs(!specs)} aria-expanded={specs}><Icon name="file" />Sizes</button>
        <button className="btn solid" onClick={() => setForm({ kind, client_id: who || null, status: "brief", type: cfg.types[0], max_revisions: 2 })}><Icon name="plus" />New {cfg.one}</button>
      </div>

      {specs && <Specs kind={kind} />}

      {rows === null ? <div className="card skel" style={{ height: 300 }} /> : (
        <div className="board dlv-board">
          {active.map((col) => {
            const xs = list.filter((x) => (stageOf(kind, x.status).key) === col.key);
            return (
              <div key={col.key} className={`board-col${over === col.key ? " drop" : ""}`} style={{ ["--t" as string]: col.tone }}
                onDragOver={(e) => { e.preventDefault(); setOver(col.key); }} onDragLeave={() => setOver((o) => (o === col.key ? "" : o))}
                onDrop={(e) => { e.preventDefault(); setOver(""); const id = e.dataTransfer.getData("text/dlv"); if (id) move(id, col.key); }}>
                <div className="board-h"><span><i />{col.label}</span><span className="muted">{xs.length}</span></div>
                {xs.map(card)}
                {!xs.length && <div className="idea-empty">{col.key === "brief" ? cfg.empty : col.key === "revisions" ? "Changes requested land here. Each round is counted." : "Drag a card here"}</div>}
              </div>
            );
          })}
        </div>
      )}

      {delivered.length > 0 && (
        <div className="card">
          <h3><span>Delivered in the last 30 days</span><span className="muted">{delivered.length}</span></h3>
          <div className="wlist">{delivered.map(card)}</div>
        </div>
      )}

      {form && <DeliverableForm d={form} kind={kind} clients={clients} canva={canva} onClose={() => setForm(null)} onSaved={reload} onMove={move} />}
    </>
  );
}

function Specs({ kind }: { kind: Kind }) {
  return (
    <div className="card">
      <h3><span>{kind === "video" ? "Export sizes by platform" : "Design sizes by platform"}</span></h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Platform</th><th>Size</th>{kind === "video" && <th>Length</th>}<th>Tip</th></tr></thead>
          <tbody>
            {kind === "video"
              ? VIDEO_SPECS.map(([p, s, l, tip]) => <tr key={p}><td>{p}</td><td className="num" style={{ whiteSpace: "nowrap" }}>{s}</td><td className="small">{l}</td><td className="small muted">{tip}</td></tr>)
              : DESIGN_SPECS.map(([p, s, tip]) => <tr key={p}><td>{p}</td><td className="num" style={{ whiteSpace: "nowrap" }}>{s}</td><td className="small muted">{tip}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeliverableForm({ d, kind, clients, canva, onClose, onSaved, onMove }: { d: Draft; kind: Kind; clients: Client[]; canva: boolean; onClose: () => void; onSaved: () => void; onMove: (id: string, s: string) => void }) {
  const cfg = QUEUE[kind];
  const [f, setF] = useState<Draft>({ ...d, links: { ...(d.links ?? {}) } });
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const set = <K extends keyof Deliverable>(k: K, v: Deliverable[K]) => setF((x) => ({ ...x, [k]: v }));
  const setLink = (k: "ref" | "work" | "final", v: string) => setF((x) => ({ ...x, links: { ...x.links, [k]: v } }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title?.trim()) return toast("Give it a short name.");
    setBusy(true);
    const row = {
      kind, client_id: f.client_id || null, title: f.title.trim(), type: f.type ?? "", size: f.size ?? "", length: f.length ?? "", brief: f.brief ?? "",
      links: f.links ?? {}, revisions: Number(f.revisions) || 0, max_revisions: Number(f.max_revisions) || 0, due_date: f.due_date || null, status: f.status ?? "brief",
    };
    const { error } = d.id ? await supabase().from("deliverables").update(row).eq("id", d.id) : await supabase().from("deliverables").insert(row);
    setBusy(false);
    if (error) return toast("Could not save. Try again.");
    if (d.id && d.status !== row.status) onMove(d.id, row.status);
    toast(d.id ? "Saved" : `Added to the ${cfg.title.toLowerCase()}`);
    onSaved();
    onClose();
  }
  async function remove() {
    if (!d.id) return;
    if (!sure) return setSure(true);
    const paths = [...(f.files ?? []).map((x) => x.path), f.canva?.thumb ?? ""].filter(Boolean);
    if (paths.length) await supabase().storage.from(BUCKET).remove(paths);
    await supabase().from("deliverables").delete().eq("id", d.id);
    onSaved();
    onClose();
  }

  const linkRow = (k: "ref" | "work" | "final", label: string, ph: string) => (
    <div className="field full">
      <label htmlFor={`dl-${k}`}>{label}</label>
      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
        <input id={`dl-${k}`} className="grow" value={f.links?.[k] ?? ""} onChange={(e) => setLink(k, e.target.value)} placeholder={ph} />
        {href(f.links?.[k]) && <a className="btn small" href={href(f.links?.[k])} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label}`}><Icon name="link" /></a>}
      </div>
    </div>
  );

  return (
    <Modal label={d.id ? "Edit request" : "New request"} onClose={onClose} wide>
      <form onSubmit={save} style={{ display: "contents" }}>
        <h2>{d.id ? f.title || "Request" : `New ${cfg.one}`}</h2>
        <div className="form">
          <div className="field full"><label htmlFor="dl-title">Name</label><input id="dl-title" value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder={kind === "video" ? "e.g. Wash day routine reel" : "e.g. October promo carousel"} /></div>
          <div className="field"><label htmlFor="dl-client">Client</label><select id="dl-client" value={f.client_id ?? ""} onChange={(e) => set("client_id", e.target.value || null)}><option value="">Personal</option>{clients.filter((c) => c.status !== "Past").map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}</select></div>
          <div className="field"><label htmlFor="dl-due">Due</label><input id="dl-due" type="date" value={f.due_date ?? ""} onChange={(e) => set("due_date", e.target.value || null)} /></div>
          <div className="field"><label htmlFor="dl-type">Type</label><select id="dl-type" value={f.type ?? ""} onChange={(e) => set("type", e.target.value)}>{cfg.types.map((x) => <option key={x}>{x}</option>)}</select></div>
          <div className="field"><label htmlFor="dl-size">{kind === "video" ? "Shape" : "Size"}</label>
            <input id="dl-size" list={`dl-sizes-${kind}`} value={f.size ?? ""} onChange={(e) => set("size", e.target.value)} placeholder="Pick or type" />
            <datalist id={`dl-sizes-${kind}`}>{cfg.sizes.map((x) => <option key={x} value={x} />)}</datalist>
          </div>
          {kind === "video" && <div className="field"><label htmlFor="dl-len">Length</label><input id="dl-len" value={f.length ?? ""} onChange={(e) => set("length", e.target.value)} placeholder="e.g. 30–45s" /></div>}
          <div className="field"><label htmlFor="dl-status">Stage</label><select id="dl-status" value={f.status ?? "brief"} onChange={(e) => set("status", e.target.value)}>{cfg.stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
          <div className="field full"><label htmlFor="dl-brief">Brief</label><textarea id="dl-brief" rows={4} value={f.brief ?? ""} onChange={(e) => set("brief", e.target.value)} placeholder={kind === "video" ? "Hook, key moments, captions, music, call to action…" : "Message, text on the design, colors, references, must-haves…"} /></div>
          {linkRow("ref", kind === "video" ? "Raw footage / references" : "References / brief files", "Drive, Dropbox or Pinterest link")}
          {linkRow("work", cfg.workLabel, kind === "video" ? "CapCut, Premiere or Drive link" : "Canva or Figma link")}
          {linkRow("final", "Final files", "Where you delivered it")}
          {d.id ? (
            <WorkFiles id={d.id} kind={kind} files={f.files ?? []} canva={f.canva ?? {}} canvaReady={canva}
              onChange={(p) => { setF((x) => ({ ...x, ...p })); onSaved(); }} />
          ) : <p className="small muted full" style={{ margin: 0 }}>Save it once, then add files{kind === "design" ? " or link a Canva design" : ""}.</p>}
          {d.id && d.client_id && (
            <div className="field full"><span className="small muted">Client approval</span><ShareLinkButton entity="deliverable" entityId={d.id} clientId={d.client_id} /></div>
          )}
          {d.id && <CommentThread entity="deliverable" entityId={d.id} clientId={d.client_id ?? null} />}
          <div className="field"><label>Revision rounds</label>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn small" onClick={() => set("revisions", Math.max(0, (Number(f.revisions) || 0) - 1))} aria-label="One less round">−</button>
              <span className={`pill ${(Number(f.revisions) || 0) > (Number(f.max_revisions) || 0) ? "bad" : ""}`} style={{ minWidth: 56, justifyContent: "center" }}>{Number(f.revisions) || 0} used</span>
              <button type="button" className="btn small" onClick={() => set("revisions", (Number(f.revisions) || 0) + 1)} aria-label="One more round">+</button>
            </div>
          </div>
          <div className="field"><label htmlFor="dl-max">Included rounds</label><input id="dl-max" type="number" min={0} max={20} value={f.max_revisions ?? 2} onChange={(e) => set("max_revisions", Number(e.target.value))} /></div>
        </div>
        <div className="modal-foot">
          {d.id && <button type="button" className={`btn${sure ? " danger" : ""} left`} onClick={remove}>{sure ? "Tap again to delete" : "Delete"}</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

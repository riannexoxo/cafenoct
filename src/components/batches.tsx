"use client";

import { useState, useSyncExternalStore } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { addDays, rel, today } from "@/lib/dates";
import { hm } from "@/lib/cal";
import { toast } from "@/lib/toast";
import { BATCH_COLS, BATCH_STATUS, QA_CHECKLIST, accuracy, perHour, progress, type Batch } from "@/lib/deliverables";
import { clientLabel, type Client } from "@/lib/types";
import Modal from "./modal";
import Seg from "./seg";
import Icon from "./icon";

const noop = () => () => {};
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const href = (u: string) => { if (!u.trim()) return ""; try { return new URL(/^https?:\/\//i.test(u) ? u.trim() : `https://${u.trim()}`).href; } catch { return ""; } };

// Data entry batches: how far along each one is, how accurate, and how fast.
export default function Batches(props: { clients: Client[]; clientId?: string }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="card skel" style={{ height: 380 }} aria-busy="true" />;
  return <Inner {...props} />;
}

function Inner({ clients, clientId }: { clients: Client[]; clientId?: string }) {
  const since = addDays(today(), -60);
  const [rows, reload, setRows] = useRows<Batch>(`batches:${clientId ?? "all"}`, (s) => {
    let q = s.from("batches").select(BATCH_COLS).or(`status.neq.delivered,delivered_at.gte.${since}`).order("due_date", { nullsFirst: false }).order("created_at");
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  }, ["batches"]);
  const [show, setShow] = useState<"open" | "delivered">("open");
  const [form, setForm] = useState<Partial<Batch> | null>(null);
  const [qa, setQa] = useState(false);
  const t = today();
  const client = (id: string | null) => clients.find((c) => c.id === id);
  const all = rows ?? [];
  const open = all.filter((b) => b.status !== "delivered"), done = all.filter((b) => b.status === "delivered");
  const shown = show === "open" ? open : done;

  // Totals across the batches shown on the page.
  const sum = (k: "done" | "total" | "errors" | "checked" | "minutes") => all.reduce((a, b) => a + (b[k] || 0), 0);
  const acc = accuracy({ errors: sum("errors"), checked: sum("checked") });
  const speed = perHour({ done: sum("done"), minutes: sum("minutes") });

  async function patch(b: Batch, p: Partial<Batch>) {
    const next = { ...p, ...(p.status ? { delivered_at: p.status === "delivered" ? new Date().toISOString() : null } : {}) };
    setRows((r) => (r ?? []).map((x) => (x.id === b.id ? { ...x, ...next } : x)));
    const { error } = await supabase().from("batches").update(next).eq("id", b.id);
    if (error) { reload(); toast("Could not save. Try again."); }
  }
  // Log progress in one go: records entered and minutes spent.
  async function logProgress(b: Batch, recs: number, mins: number) {
    if (!recs && !mins) return;
    const doneNow = Math.min(b.total || Infinity, b.done + recs);
    await patch(b, { done: doneNow, minutes: b.minutes + mins, ...(b.status === "todo" ? { status: "doing" as const } : {}) });
    toast(b.total && doneNow >= b.total ? "All records entered. Time to check them." : `Logged ${recs} records`);
  }

  return (
    <>
      <div className="stats">
        <div className="stat"><span className="k">Open batches</span><span className="v">{open.length}</span><span className="s">{open.filter((b) => b.due_date && b.due_date < t).length} late</span></div>
        <div className="stat"><span className="k">Records entered</span><span className="v">{sum("done").toLocaleString()}</span><span className="s">last 60 days</span></div>
        <div className="stat"><span className="k">Accuracy</span><span className="v">{acc == null ? "—" : pct(acc)}</span><span className="s">{sum("checked") ? `${sum("errors")} mistakes in ${sum("checked").toLocaleString()} checked` : "check a sample to see it"}</span></div>
        <div className="stat"><span className="k">Speed</span><span className="v">{speed == null ? "—" : Math.round(speed)}</span><span className="s">records an hour</span></div>
      </div>

      <div className="row inv-bar">
        <Seg label="Show" value={show} onChange={setShow} options={[["open", `Open ${open.length}`], ["delivered", "Delivered"]]} />
        <span className="grow" />
        <button className="btn" onClick={() => setQa(true)}><Icon name="check" />QA checklist</button>
        <button className="btn solid" onClick={() => setForm({ client_id: clientId ?? null, status: "todo", total: 0 })}><Icon name="plus" />New batch</button>
      </div>

      {rows === null ? <div className="card skel" style={{ height: 240 }} /> : shown.length ? (
        <div className="batch-grid">
          {shown.map((b) => <BatchCard key={b.id} b={b} c={client(b.client_id)} showClient={!clientId} t={t} onOpen={() => setForm(b)} onLog={logProgress} onStatus={(s) => patch(b, { status: s })} />)}
        </div>
      ) : (
        <div className="card"><div className="empty"><b>{show === "open" ? "No open batches" : "Nothing delivered yet"}</b><span>Add a batch for each chunk of records a client sends. Log progress as you go; the numbers fill in by themselves.</span></div></div>
      )}

      {form && <BatchForm b={form} clients={clients} onClose={() => setForm(null)} onSaved={reload} />}
      {qa && (
        <Modal label="QA checklist" onClose={() => setQa(false)}>
          <h2>Before you deliver</h2>
          <p className="small muted" style={{ marginTop: 0 }}>A quick check that catches most mistakes. Record how many you checked and what you found on the batch, and your accuracy updates.</p>
          <QaList />
          <div className="modal-foot"><button className="btn solid" onClick={() => setQa(false)}>Done</button></div>
        </Modal>
      )}
    </>
  );
}

function QaList() {
  const [on, setOn] = useState<number[]>([]);
  return (
    <div className="list" style={{ marginBottom: 12 }}>
      {QA_CHECKLIST.map((x, i) => (
        <label key={x} className="li" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={on.includes(i)} onChange={() => setOn((s) => (s.includes(i) ? s.filter((y) => y !== i) : [...s, i]))} />
          <span className="t" style={on.includes(i) ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>{x}</span>
        </label>
      ))}
    </div>
  );
}

function BatchCard({ b, c, showClient, t, onOpen, onLog, onStatus }: { b: Batch; c?: Client; showClient: boolean; t: string; onOpen: () => void; onLog: (b: Batch, r: number, m: number) => void; onStatus: (s: Batch["status"]) => void }) {
  const [recs, setRecs] = useState("");
  const [mins, setMins] = useState("");
  const st = BATCH_STATUS.find((s) => s.key === b.status)!;
  const acc = accuracy(b), speed = perHour(b), p = progress(b);
  const next = BATCH_STATUS[BATCH_STATUS.findIndex((s) => s.key === b.status) + 1];
  return (
    <div className="card batch" style={{ ["--c" as string]: c?.color ?? "var(--line-strong)", ["--t" as string]: st.tone }}>
      <div className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
        <button type="button" className="batch-title grow" onClick={onOpen}>
          <b>{b.title}</b>
          <small>{[showClient && (c ? clientLabel(c) : "Personal"), b.source && `from ${b.source}`, b.target && `into ${b.target}`].filter(Boolean).join(" · ")}</small>
        </button>
        <span className="pill" style={{ background: "color-mix(in srgb, var(--t) 18%, transparent)" }}>{st.label}</span>
      </div>
      <div className="batch-prog">
        <div className="bar"><i style={{ width: `${p * 100}%`, background: "var(--c)" }} /></div>
        <span className="num small">{b.done.toLocaleString()}{b.total ? ` / ${b.total.toLocaleString()}` : ""}</span>
      </div>
      <div className="row small muted" style={{ gap: 12 }}>
        {b.due_date && b.status !== "delivered" && <span className={b.due_date < t ? "bad-t" : ""}>{rel(b.due_date)}</span>}
        {b.minutes > 0 && <span>{hm(b.minutes)}</span>}
        {speed != null && <span>{Math.round(speed)}/hr</span>}
        {acc != null && <span>{pct(acc)} accurate</span>}
        {href(b.link) && <a href={href(b.link)} target="_blank" rel="noopener noreferrer" className="linkish"><Icon name="link" size={12} /> Sheet</a>}
      </div>
      {b.status !== "delivered" && (
        <form className="batch-log" onSubmit={(e) => { e.preventDefault(); onLog(b, Math.max(0, Number(recs) || 0), Math.max(0, Number(mins) || 0)); setRecs(""); setMins(""); }}>
          <input inputMode="numeric" value={recs} onChange={(e) => setRecs(e.target.value.replace(/\D/g, ""))} placeholder="+ records" aria-label={`Records entered for ${b.title}`} />
          <input inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))} placeholder="+ minutes" aria-label={`Minutes spent on ${b.title}`} />
          <button className="btn small" type="submit">Log</button>
          {next && <button type="button" className="btn small solid" onClick={() => onStatus(next.key)}>{next.key === "qa" ? "Check it" : next.key === "delivered" ? "Deliver" : "Start"}</button>}
        </form>
      )}
    </div>
  );
}

function BatchForm({ b, clients, onClose, onSaved }: { b: Partial<Batch>; clients: Client[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Batch>>(b);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const set = <K extends keyof Batch>(k: K, v: Batch[K]) => setF((x) => ({ ...x, [k]: v }));
  const n = (v: string) => Math.max(0, Number(v.replace(/\D/g, "")) || 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title?.trim()) return toast("Give the batch a name.");
    setBusy(true);
    const status = f.status ?? "todo";
    const row = {
      client_id: f.client_id || null, title: f.title.trim(), source: f.source ?? "", target: f.target ?? "", link: f.link ?? "", total: f.total ?? 0, done: f.done ?? 0,
      errors: f.errors ?? 0, checked: f.checked ?? 0, minutes: f.minutes ?? 0, status, due_date: f.due_date || null, notes: f.notes ?? "",
      ...(b.status !== status ? { delivered_at: status === "delivered" ? new Date().toISOString() : null } : {}),
    };
    const { error } = b.id ? await supabase().from("batches").update(row).eq("id", b.id) : await supabase().from("batches").insert(row);
    setBusy(false);
    if (error) return toast("Could not save. Try again.");
    toast(b.id ? "Saved" : "Batch added");
    onSaved();
    onClose();
  }
  async function remove() {
    if (!b.id) return;
    if (!sure) return setSure(true);
    await supabase().from("batches").delete().eq("id", b.id);
    onSaved();
    onClose();
  }

  return (
    <Modal label={b.id ? "Edit batch" : "New batch"} onClose={onClose} wide>
      <form onSubmit={save} style={{ display: "contents" }}>
        <h2>{b.id ? f.title || "Batch" : "New batch"}</h2>
        <div className="form">
          <div className="field full"><label htmlFor="bt-title">Name</label><input id="bt-title" value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="e.g. October leads, batch 3" /></div>
          <div className="field"><label htmlFor="bt-client">Client</label><select id="bt-client" value={f.client_id ?? ""} onChange={(e) => set("client_id", e.target.value || null)}><option value="">Personal</option>{clients.filter((c) => c.status !== "Past").map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}</select></div>
          <div className="field"><label htmlFor="bt-due">Due</label><input id="bt-due" type="date" value={f.due_date ?? ""} onChange={(e) => set("due_date", e.target.value || null)} /></div>
          <div className="field"><label htmlFor="bt-src">From</label><input id="bt-src" value={f.source ?? ""} onChange={(e) => set("source", e.target.value)} placeholder="PDF invoices, business cards…" /></div>
          <div className="field"><label htmlFor="bt-tgt">Into</label><input id="bt-tgt" value={f.target ?? ""} onChange={(e) => set("target", e.target.value)} placeholder="Google Sheet, HubSpot…" /></div>
          <div className="field full"><label htmlFor="bt-link">Link to the sheet or files</label><input id="bt-link" value={f.link ?? ""} onChange={(e) => set("link", e.target.value)} placeholder="https://" /></div>
          <div className="field"><label htmlFor="bt-total">Total records</label><input id="bt-total" inputMode="numeric" value={f.total ?? 0} onChange={(e) => set("total", n(e.target.value))} /></div>
          <div className="field"><label htmlFor="bt-done">Entered so far</label><input id="bt-done" inputMode="numeric" value={f.done ?? 0} onChange={(e) => set("done", n(e.target.value))} /></div>
          <div className="field"><label htmlFor="bt-checked">Checked in QA</label><input id="bt-checked" inputMode="numeric" value={f.checked ?? 0} onChange={(e) => set("checked", n(e.target.value))} /></div>
          <div className="field"><label htmlFor="bt-err">Mistakes found</label><input id="bt-err" inputMode="numeric" value={f.errors ?? 0} onChange={(e) => set("errors", n(e.target.value))} /></div>
          <div className="field"><label htmlFor="bt-min">Minutes spent</label><input id="bt-min" inputMode="numeric" value={f.minutes ?? 0} onChange={(e) => set("minutes", n(e.target.value))} /></div>
          <div className="field"><label htmlFor="bt-status">Stage</label><select id="bt-status" value={f.status ?? "todo"} onChange={(e) => set("status", e.target.value as Batch["status"])}>{BATCH_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
          <div className="field full"><label htmlFor="bt-notes">Instructions and notes</label><textarea id="bt-notes" rows={3} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Format rules, columns, what to skip…" /></div>
        </div>
        <div className="modal-foot">
          {b.id && <button type="button" className={`btn${sure ? " danger" : ""} left`} onClick={remove}>{sure ? "Tap again to delete" : "Delete"}</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

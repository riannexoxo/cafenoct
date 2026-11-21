"use client";

import "@/styles/pipeline.css";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { useFlip } from "@/lib/flip";
import { CARD_COLS, STAGES, positionAt, stageLabel, type Card, type Stage } from "@/lib/pipeline";
import { money } from "@/lib/format";
import { rel, today } from "@/lib/dates";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import Modal from "./modal";
import Nocti from "./nocti";
import Icon from "./icon";

type Lite = Pick<Client, "id" | "name" | "company" | "status" | "currency" | "personal"> & { email: string; contact: string };
const FROM_STATUS: Record<Client["status"], Stage> = { Lead: "lead", Active: "active", Paused: "paused", Past: "done" };
const byPos = (a: Card, b: Card) => a.position - b.position || a.id.localeCompare(b.id);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Deals from first hello to done. Drag a card to another stage or onto another card to reorder,
// or focus it and press Shift + arrows. Moves show at once and roll back if the save fails.
export default function Pipeline() {
  const [rows, reload, setRows] = useRows<Card>("pipeline", (s) => s.from("pipeline_cards").select(CARD_COLS).order("position").limit(500), ["pipeline_cards"]);
  const [clients] = useRows<Lite>("pipeline-clients", (s) => s.from("clients").select("id,name,company,status,currency,personal,email,contact").order("company").limit(500), ["clients"]);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [edit, setEdit] = useState<Partial<Card> | null>(null);
  const [convert, setConvert] = useState<Card | null>(null);
  const [over, setOver] = useState("");
  const [dragging, setDragging] = useState("");
  const [importing, setImporting] = useState(false);
  const [box, capture] = useFlip<HTMLDivElement>();
  const focusId = useRef("");

  // Keyboard focus follows a card after it moves.
  useLayoutEffect(() => {
    if (!focusId.current) return;
    box.current?.querySelector<HTMLElement>(`[data-flip-id="${focusId.current}"]`)?.focus();
    focusId.current = "";
  });

  const clientById = useMemo(() => new Map((clients ?? []).map((c) => [c.id, c])), [clients]);
  const all = useMemo(() => (rows ?? []).map((r) => ({ ...r, value: Number(r.value) || 0, tags: r.tags ?? [] })), [rows]);
  const tags = useMemo(() => [...new Set(all.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b)), [all]);
  const needle = q.trim().toLowerCase();
  const shown = all.filter((r) => {
    if (tag && !r.tags.includes(tag)) return false;
    if (!needle) return true;
    const c = r.client_id ? clientById.get(r.client_id) : undefined;
    return [r.title, r.contact, r.email, r.next_step, c ? clientLabel(c) : "", ...r.tags].some((x) => x.toLowerCase().includes(needle));
  });
  const stageList = (s: string, xs = all) => xs.filter((r) => r.stage === s).sort(byPos);
  const endPos = (s: string) => positionAt(stageList(s), stageList(s).length);

  // shortcut: equal positions (e.g. two cards moved here by an automation) can't be reordered between each other; renumber the stage if that ever shows up.
  async function move(c: Card, stage: Stage, beforeId?: string, keepFocus = false) {
    if (beforeId === c.id) return;
    const list = stageList(stage).filter((x) => x.id !== c.id);
    const at = beforeId ? list.findIndex((x) => x.id === beforeId) : -1;
    const position = positionAt(list, at < 0 ? list.length : at);
    if (stage === c.stage && position === c.position) return;
    capture();
    if (keepFocus) focusId.current = c.id;
    setRows((cur) => cur?.map((x) => (x.id === c.id ? { ...x, stage, position } : x)) ?? cur);
    const { error } = await supabase().from("pipeline_cards").update({ stage, position }).eq("id", c.id);
    if (error) {
      capture();
      setRows((cur) => cur?.map((x) => (x.id === c.id ? c : x)) ?? cur);
      toast("Could not move that card. It's back where it was.");
    } else if (stage !== c.stage) toast(`Moved to ${stageLabel(stage)}`);
  }

  function drop(e: React.DragEvent, stage: Stage, beforeId?: string) {
    e.preventDefault();
    e.stopPropagation();
    setOver("");
    const c = all.find((r) => r.id === e.dataTransfer.getData("text/card"));
    if (c) move(c, stage, beforeId);
  }

  const onKey = (c: Card) => (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (!e.shiftKey && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setEdit(c); return; }
    if (!e.shiftKey) return;
    const si = STAGES.findIndex((s) => s.key === c.stage);
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const t = STAGES[si + (e.key === "ArrowRight" ? 1 : -1)];
      e.preventDefault();
      if (t) move(c, t.key, undefined, true);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const list = stageList(c.stage), i = list.findIndex((x) => x.id === c.id);
      e.preventDefault();
      if (e.key === "ArrowUp" && i > 0) move(c, c.stage, list[i - 1].id, true);
      if (e.key === "ArrowDown" && i < list.length - 1) move(c, c.stage, list[i + 2]?.id, true);
    }
  };

  // One card for every client that doesn't have one yet, in the stage that matches their status.
  async function importClients() {
    if (!clients || importing) return;
    const have = new Set(all.map((r) => r.client_id).filter(Boolean));
    const todo = clients.filter((c) => !c.personal && !have.has(c.id));
    if (!todo.length) return toast("Every client already has a card.");
    const ends: Record<string, number> = {};
    const body = todo.map((c) => {
      const stage = FROM_STATUS[c.status] ?? "lead";
      ends[stage] = ends[stage] == null ? endPos(stage) : ends[stage] + 1;
      return {
        client_id: c.id, stage, position: ends[stage], title: (clientLabel(c).trim() || "Client").slice(0, 120),
        contact: (c.contact || (c.company ? c.name : "")).slice(0, 120), email: (c.email ?? "").slice(0, 254), currency: c.currency || "USD",
      };
    });
    setImporting(true);
    const { error } = await supabase().from("pipeline_cards").insert(body);
    setImporting(false);
    if (error) return toast("Could not import your clients. Try again.");
    toast(`Added ${body.length} ${body.length === 1 ? "card" : "cards"}`);
    reload();
  }

  const head = (
    <div className="head">
      <div>
        <h1>Pipeline</h1>
        <p>Every lead and client, from first hello to done. Drag a card, or focus it and press Shift + arrows.</p>
      </div>
      <div className="row">
        {!!clients?.length && <button type="button" className="btn ghost" onClick={importClients} disabled={importing}>{importing ? "Importing…" : "Import clients"}</button>}
        <button type="button" className="btn solid" onClick={() => setEdit({ stage: "lead" })}><Icon name="plus" /> Add lead</button>
      </div>
    </div>
  );

  if (!rows) return <>{head}<div className="pl-board" aria-busy="true">{STAGES.map((s) => <div key={s.key} className="board-col skel pl-col" />)}</div></>;

  return (
    <>
      {head}
      {!all.length ? (
        <div className="empty pl-empty">
          <Nocti mood="sleepy" size={88} />
          <p><b>No leads yet.</b><br />Add the next person you&apos;d love to work with.</p>
          <button type="button" className="btn solid" onClick={() => setEdit({ stage: "lead" })}>Add your first lead</button>
        </div>
      ) : (
        <>
          <div className="pl-tools" role="search">
            <label className="sr-only" htmlFor="pl-q">Search cards</label>
            <input id="pl-q" className="search" type="search" placeholder="Search leads" value={q} onChange={(e) => setQ(e.target.value)} />
            {!!tags.length && (
              <>
                <label className="sr-only" htmlFor="pl-tag">Filter by tag</label>
                <select id="pl-tag" className="search pl-tagpick" value={tag} onChange={(e) => setTag(e.target.value)}>
                  <option value="">All tags</option>
                  {tags.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </>
            )}
          </div>
          <div ref={box} className="pl-board">
            {STAGES.map((s) => {
              const xs = stageList(s.key, shown);
              const sums: Record<string, number> = {};
              xs.forEach((x) => { if (x.value > 0) sums[x.currency] = (sums[x.currency] ?? 0) + x.value; });
              const total = Object.entries(sums).map(([cur, v]) => money(v, cur)).join(" + ");
              return (
                <section key={s.key} className={`board-col pl-col${over === s.key ? " drop" : ""}`} style={{ ["--t" as string]: s.tone }} aria-label={`${s.label}, ${xs.length} ${xs.length === 1 ? "card" : "cards"}`}
                  onDragOver={(e) => { e.preventDefault(); setOver(s.key); }} onDragLeave={() => setOver((o) => (o === s.key ? "" : o))} onDrop={(e) => drop(e, s.key)}>
                  <header className="pl-h">
                    <div className="board-h"><span><i />{s.label}</span><span className="muted">{xs.length}</span></div>
                    <span key={total} className="pl-sum">{total || "No value yet"}</span>
                  </header>
                  {xs.map((c) => <CardView key={c.id} c={c} client={c.client_id ? clientById.get(c.client_id) : undefined} stage={s.label}
                    before={over === `${s.key}:${c.id}`} dragging={dragging === c.id} onOpen={() => setEdit(c)} onKey={onKey(c)} onConvert={() => setConvert(c)}
                    onDragStart={(e) => { e.dataTransfer.setData("text/card", c.id); e.dataTransfer.effectAllowed = "move"; setDragging(c.id); }}
                    onDragEnd={() => { setDragging(""); setOver(""); }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(`${s.key}:${c.id}`); }}
                    onDrop={(e) => drop(e, s.key, c.id)} />)}
                  {!xs.length && <div className="idea-empty">{needle || tag ? "No matches here" : "Drop a card here"}</div>}
                  <button type="button" className="pl-add" onClick={() => setEdit({ stage: s.key })} aria-label={`Add a card to ${s.label}`}><Icon name="plus" size={16} /> Add</button>
                </section>
              );
            })}
          </div>
        </>
      )}
      {edit && <Editor card={edit} clients={clients ?? []} endPos={endPos} onClose={() => setEdit(null)} onSaved={reload} />}
      {convert && <Convert card={convert} onClose={() => setConvert(null)} onDone={reload} />}
    </>
  );
}

type CardProps = {
  c: Card; client?: Lite; stage: string; before: boolean; dragging: boolean;
  onOpen: () => void; onKey: (e: React.KeyboardEvent) => void; onConvert: () => void;
  onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: (e: React.DragEvent) => void;
};

function CardView({ c, client, stage, before, dragging, onOpen, onKey, onConvert, ...drag }: CardProps) {
  const who = [client ? clientLabel(client) : "", c.contact && c.contact !== (client && clientLabel(client)) ? c.contact : ""].filter(Boolean).join(" · ");
  const t = today();
  const due = c.next_date ? (c.next_date < t ? " late" : c.next_date === t ? " today" : "") : "";
  return (
    <div data-flip-id={c.id} className={`tcard pl-card${before ? " before" : ""}${dragging ? " dragging" : ""}`} role="button" tabIndex={0} draggable
      aria-label={`${c.title}, ${stage}. Enter to edit, Shift and arrow keys to move.`} onClick={onOpen} onKeyDown={onKey} {...drag}>
      <b className="pl-title">{c.title}</b>
      {who && <span className="pl-who">{who}</span>}
      {c.value > 0 && <span className="pl-value">{money(c.value, c.currency)}</span>}
      {(c.next_step || c.next_date) && (
        <span className={`pl-next${due}`}>
          <Icon name="schedule" size={14} />
          <span>{c.next_step || "Next step"}{c.next_date && <em> · {rel(c.next_date)}</em>}</span>
        </span>
      )}
      {!!c.tags.length && <span className="pl-tags">{c.tags.map((x) => <span key={x} className="pl-tag">{x}</span>)}</span>}
      {!c.client_id && <button type="button" className="pl-convert" onClick={(e) => { e.stopPropagation(); onConvert(); }} onKeyDown={(e) => e.stopPropagation()}>Convert to client</button>}
    </div>
  );
}

function Editor({ card, clients, endPos, onClose, onSaved }: { card: Partial<Card>; clients: Lite[]; endPos: (s: string) => number; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    title: card.title ?? "", stage: (card.stage ?? "lead") as Stage, client_id: card.client_id ?? "", contact: card.contact ?? "", email: card.email ?? "",
    value: card.value ? String(card.value) : "", currency: card.currency ?? "USD", next_step: card.next_step ?? "", next_date: card.next_date ?? "",
    tags: (card.tags ?? []).join(", "), notes: card.notes ?? "",
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  // Same limits as the database checks on pipeline_cards.
  function check() {
    const title = f.title.trim(), value = f.value === "" ? 0 : Number(f.value), currency = f.currency.trim().toUpperCase();
    const tags = [...new Set(f.tags.split(",").map((t) => t.trim()).filter(Boolean))];
    if (!title) return "Give the card a title.";
    if (title.length > 120) return "Keep the title under 120 characters.";
    if (!STAGES.some((s) => s.key === f.stage)) return "Pick a stage.";
    if (f.contact.trim().length > 120) return "Keep the contact name under 120 characters.";
    if (f.email.trim().length > 254 || (f.email.trim() && !EMAIL.test(f.email.trim()))) return "That email doesn't look right.";
    if (!Number.isFinite(value) || value < 0) return "Value can't be below zero.";
    if (!/^[A-Z]{3}$/.test(currency)) return "Use a 3-letter currency code, like USD.";
    if (f.next_step.trim().length > 300) return "Keep the next step under 300 characters.";
    if (f.next_date && !/^\d{4}-\d{2}-\d{2}$/.test(f.next_date)) return "Pick a valid date.";
    if (tags.length > 12 || tags.some((t) => t.length > 30)) return "Use up to 12 tags, each under 30 characters.";
    if (f.notes.length > 4000) return "Notes can be up to 4000 characters.";
    return { title, stage: f.stage, client_id: f.client_id || null, contact: f.contact.trim(), email: f.email.trim(), value, currency, next_step: f.next_step.trim(), next_date: f.next_date || null, tags, notes: f.notes };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = check();
    if (typeof body === "string") return setMsg(body);
    setBusy(true);
    setMsg("Saving…");
    const moved = !card.id || body.stage !== card.stage;
    const row = moved ? { ...body, position: endPos(body.stage) } : body;
    const { error } = card.id ? await supabase().from("pipeline_cards").update(row).eq("id", card.id) : await supabase().from("pipeline_cards").insert(row);
    setBusy(false);
    if (error) return setMsg("Could not save. Check your connection and try again.");
    toast(card.id ? "Saved" : "Card added");
    onSaved();
    onClose();
  }

  async function remove() {
    if (!card.id) return;
    if (!sure) return setSure(true);
    setBusy(true);
    const { error } = await supabase().from("pipeline_cards").delete().eq("id", card.id);
    setBusy(false);
    if (error) return setMsg("Could not delete. Try again.");
    toast("Card deleted");
    onSaved();
    onClose();
  }

  return (
    <Modal label={card.id ? "Edit card" : "New card"} onClose={onClose} wide>
      <form onSubmit={save} style={{ display: "contents" }}>
        <h2>{card.id ? "Edit card" : "New card"}</h2>
        <div className="form">
          <div className="field full"><label htmlFor="pl-title">Title</label><input id="pl-title" value={f.title} maxLength={120} required onChange={(e) => set("title", e.target.value)} placeholder="Website refresh for Bloom Studio" /></div>
          <div className="field"><label htmlFor="pl-stage">Stage</label><select id="pl-stage" value={f.stage} onChange={(e) => set("stage", e.target.value as Stage)}>{STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
          <div className="field"><label htmlFor="pl-client">Client</label><select id="pl-client" value={f.client_id} onChange={(e) => set("client_id", e.target.value)}><option value="">Not a client yet</option>{clients.map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}</select></div>
          <div className="field"><label htmlFor="pl-contact">Contact</label><input id="pl-contact" value={f.contact} maxLength={120} onChange={(e) => set("contact", e.target.value)} placeholder="Who you talk to" /></div>
          <div className="field"><label htmlFor="pl-email">Email</label><input id="pl-email" type="email" value={f.email} maxLength={254} onChange={(e) => set("email", e.target.value)} /></div>
          <div className="field"><label htmlFor="pl-value">Value</label><input id="pl-value" type="number" inputMode="decimal" min={0} step="0.01" value={f.value} onChange={(e) => set("value", e.target.value)} placeholder="0" /></div>
          <div className="field"><label htmlFor="pl-cur">Currency</label><input id="pl-cur" value={f.currency} maxLength={3} autoCapitalize="characters" onChange={(e) => set("currency", e.target.value.toUpperCase())} /></div>
          <div className="field"><label htmlFor="pl-next">Next step</label><input id="pl-next" value={f.next_step} maxLength={300} onChange={(e) => set("next_step", e.target.value)} placeholder="Send the proposal" /></div>
          <div className="field"><label htmlFor="pl-date">Next step date</label><input id="pl-date" type="date" value={f.next_date} onChange={(e) => set("next_date", e.target.value)} /></div>
          <div className="field full"><label htmlFor="pl-tags">Tags</label><input id="pl-tags" value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="Referral, Retainer (comma between tags)" /></div>
          <div className="field full"><label htmlFor="pl-notes">Notes</label><textarea id="pl-notes" value={f.notes} maxLength={4000} onChange={(e) => set("notes", e.target.value)} style={{ minHeight: 80 }} /></div>
        </div>
        <div className="modal-foot">
          <span className="small muted left" role="status">{msg}</span>
          {card.id && <button type="button" className="btn danger" onClick={remove} disabled={busy}>{sure ? "Tap again to delete" : "Delete"}</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{busy ? "Saving…" : card.id ? "Save" : "Add card"}</button>
        </div>
      </form>
    </Modal>
  );
}

// Adds a clients row from the card (contact or title as the name) and links the card to it.
function Convert({ card, onClose, onDone }: { card: Card; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const name = (card.contact || card.title).trim();
  const status = card.stage === "active" ? "Active" : "Lead";
  async function go() {
    setBusy(true);
    const { data, error } = await supabase().from("clients")
      .insert({ name, email: card.email, contact: card.contact, status, currency: card.currency || "USD" }).select("id").single<{ id: string }>();
    if (error || !data) { setBusy(false); return toast("Could not add the client. Try again."); }
    const { error: e2 } = await supabase().from("pipeline_cards").update({ client_id: data.id }).eq("id", card.id);
    setBusy(false);
    toast(e2 ? "Client added, but the card could not be linked. Pick the client on the card." : `${name} is now a client`);
    onDone();
    onClose();
  }
  return (
    <Modal label="Convert to client" onClose={onClose}>
      <h2>Make {name} a client?</h2>
      <p className="muted">This adds {name} to your clients as {status === "Active" ? "an active client" : "a lead"} and links this card to them.</p>
      <div className="modal-foot">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn solid" onClick={go} disabled={busy}>{busy ? "Adding…" : "Convert"}</button>
      </div>
    </Modal>
  );
}

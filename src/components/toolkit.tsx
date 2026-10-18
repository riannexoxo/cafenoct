"use client";

import { useState, useSyncExternalStore } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { BANK_COLS, STARTER, kindOf, type BankItem, type Kind } from "@/lib/bank";
import { PLATFORMS } from "@/lib/posts";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import Modal from "./modal";
import Icon from "./icon";

type Section = "brand" | Kind;
const SECTIONS: [Section, string][] = [["brand", "Brand"], ["hook", "Hooks"], ["caption", "Captions"], ["cta", "Calls to action"], ["hashtags", "Hashtags"], ["idea", "Post ideas"], ["resource", "Resources"]];
const noop = () => () => {};
const safeUrl = (u: string) => { try { const x = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`); return x.protocol.startsWith("http") ? x.href : ""; } catch { return ""; } };

// The social media toolkit for a client (or your own library when no client is given).
export default function Toolkit({ client, clients }: { client?: Client; clients: Client[] }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="card skel" style={{ height: 420 }} aria-busy="true" />;
  return <Kit client={client} clients={clients} />;
}

function Kit({ client }: { client?: Client; clients: Client[] }) {
  const [section, setSection] = useState<Section>(client ? "brand" : "hook");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Partial<BankItem> | null>(null);
  const [showStarter, setShowStarter] = useState(false);
  const [ai, setAi] = useState<{ topic: string; platform: string; busy: boolean; items: { title: string; body: string }[] }>({ topic: "", platform: "Instagram", busy: false, items: [] });
  const [items, reload, setItems] = useRows<BankItem>(`bank:${client?.id ?? "mine"}`, (s) => {
    const base = s.from("bank_items").select(BANK_COLS).order("starred", { ascending: false }).order("position").order("created_at", { ascending: false });
    return client ? base.or(`client_id.eq.${client.id},client_id.is.null`) : base.is("client_id", null);
  }, ["bank_items"]);

  const all = items ?? [];
  const kinds: Kind[] = section === "brand" ? ["pillar", "voice"] : [section];
  const match = (i: BankItem) => !q || `${i.title} ${i.body} ${i.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase());
  const pillars = all.filter((i) => i.kind === "pillar" && (!client || i.client_id === client.id)).map((i) => i.title || i.body);
  const voice = all.filter((i) => i.kind === "voice" && (!client || i.client_id === client.id)).map((i) => i.body).join("\n");

  async function save(it: Partial<BankItem>) {
    const row = { client_id: it.client_id === undefined ? client?.id ?? null : it.client_id, kind: it.kind!, title: (it.title ?? "").trim(), body: (it.body ?? "").trim(), url: (it.url ?? "").trim(), tags: it.tags ?? [], status: it.status ?? "" };
    if (!row.title && !row.body) { toast("Write something first."); return false; }
    const { error } = it.id ? await supabase().from("bank_items").update(row).eq("id", it.id) : await supabase().from("bank_items").insert(row);
    if (error) { toast("Could not save. Try again."); return false; }
    reload();
    return true;
  }
  async function saveMany(list: { kind: Kind; title: string; body: string; url?: string; tags?: string[] }[]) {
    const { error } = await supabase().from("bank_items").insert(list.map((x) => ({ client_id: client?.id ?? null, kind: x.kind, title: x.title, body: x.body, url: x.url ?? "", tags: x.tags ?? [] })));
    if (error) return toast("Could not save. Try again.");
    toast(list.length === 1 ? "Saved to the toolkit" : `${list.length} saved to the toolkit`);
    reload();
  }
  async function copy(i: BankItem) {
    try { await navigator.clipboard.writeText(i.body || i.title); toast("Copied"); } catch { return toast("Copy was blocked here."); }
    setItems((r) => (r ?? []).map((x) => (x.id === i.id ? { ...x, used: x.used + 1 } : x)));
    await supabase().from("bank_items").update({ used: i.used + 1 }).eq("id", i.id);
  }
  async function star(i: BankItem) {
    setItems((r) => (r ?? []).map((x) => (x.id === i.id ? { ...x, starred: !x.starred } : x)));
    await supabase().from("bank_items").update({ starred: !i.starred }).eq("id", i.id);
  }
  async function toCalendar(i: BankItem) {
    const { error } = await supabase().from("posts").insert({ client_id: client?.id ?? null, title: i.title || i.body.slice(0, 60), notes: i.body, status: "Idea", platforms: ["Instagram"], platform: "Instagram", publish_on: null });
    if (error) return toast("Could not add it. Try again.");
    toast("Added to the content calendar's ideas. Drag it onto a day.");
  }
  async function writeWithAi() {
    const kind = section === "brand" ? "pillar" : section;
    if (kind === "voice" || kind === "resource") return;
    setAi((a) => ({ ...a, busy: true, items: [] }));
    try {
      const r = await fetch("/api/smm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, client: client ? clientLabel(client) : "my own brand", services: client?.services, topic: ai.topic, platform: ai.platform, pillars, voice, count: kind === "pillar" ? 5 : 6 }) });
      const j = (await r.json()) as { items?: { title: string; body: string }[]; error?: string };
      if (!r.ok || !j.items) { toast(j.error || "AI didn't respond. Try again."); return setAi((a) => ({ ...a, busy: false })); }
      setAi((a) => ({ ...a, busy: false, items: j.items! }));
    } catch { toast("Could not reach AI writing."); setAi((a) => ({ ...a, busy: false })); }
  }

  const list = all.filter((i) => kinds.includes(i.kind) && match(i));
  const savedBodies = new Set(all.map((i) => i.body.trim()));
  const starters = STARTER.filter((s) => kinds.includes(s.kind) && !savedBodies.has(s.body.trim()));
  const aiKind = section === "brand" ? "pillar" : section;
  const canAi = aiKind !== "resource";

  const card = (i: BankItem) => {
    const k = kindOf(i.kind);
    const tagCount = i.kind === "hashtags" ? (i.body.match(/#[\p{L}\p{N}_]+/gu) ?? []).length : 0;
    return (
      <div key={i.id} className={`bk${i.starred ? " starred" : ""}`}>
        <div className="bk-top">
          <span className="bk-kind">{section === "brand" ? k?.one : i.title || k?.one}{!i.client_id && client && <span className="pill" style={{ marginLeft: 6 }}>My library</span>}</span>
          <button className="bk-star" aria-label={i.starred ? "Unstar" : "Star"} aria-pressed={i.starred} onClick={() => star(i)}>{i.starred ? "★" : "☆"}</button>
        </div>
        {section === "brand" && i.title && <b>{i.title}</b>}
        {i.body && <p className="bk-body">{i.body}</p>}
        {i.url && safeUrl(i.url) && <a className="small" href={safeUrl(i.url)} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-ink)" }}>{i.url.replace(/^https?:\/\//, "").slice(0, 48)}</a>}
        <div className="bk-foot">
          <span className="small muted">{tagCount ? `${tagCount} hashtags` : i.used ? `Copied ${i.used}×` : i.tags.join(" · ")}</span>
          <span className="row" style={{ gap: 4 }}>
            {i.kind === "idea" && <button className="btn small ghost" onClick={() => toCalendar(i)} title="Add to the content calendar"><Icon name="content" /></button>}
            <button className="btn small ghost" onClick={() => setEdit(i)} aria-label="Edit"><Icon name="docs" /></button>
            {i.kind !== "resource" && <button className="btn small" onClick={() => copy(i)}><Icon name="copy" />Copy</button>}
          </span>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="ptabs"><div className="seg" role="tablist" aria-label="Toolkit sections">
        {SECTIONS.filter(([s]) => client || s !== "brand").map(([s, l]) => <button key={s} role="tab" aria-selected={section === s} className={section === s ? "on" : ""} style={section === s ? { background: "var(--card)", boxShadow: "0 1px 4px rgba(0,0,0,.08)" } : undefined} onClick={() => { setSection(s); setAi((a) => ({ ...a, items: [] })); setShowStarter(false); }}>{l}</button>)}
      </div></div>

      <div className="row">
        <p className="small muted grow" style={{ margin: 0 }}>{section === "brand" ? `Who ${client ? clientLabel(client) : "you"} are on social: the pillars every post fits into and the voice it's written in. AI uses these when it writes.` : kindOf(section)?.hint}</p>
        <input className="search" style={{ width: 180 }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the toolkit" />
        {starters.length > 0 && <button className={`btn${showStarter ? " solid" : ""}`} onClick={() => setShowStarter(!showStarter)}><Icon name="spark" />Starter library</button>}
        {section === "brand" ? (
          <>
            <button className="btn" onClick={() => setEdit({ kind: "pillar" })}><Icon name="plus" />Pillar</button>
            <button className="btn solid" onClick={() => setEdit({ kind: "voice", title: "Brand voice" })}><Icon name="plus" />Voice note</button>
          </>
        ) : <button className="btn solid" onClick={() => setEdit({ kind: section })}><Icon name="plus" />Add {kindOf(section)?.one.toLowerCase()}</button>}
      </div>

      {canAi && (
        <div className="card ai-box">
          <div className="row" style={{ gap: 8 }}>
            <Icon name="spark" />
            <b style={{ fontWeight: 500 }}>Write {section === "brand" ? "pillars" : kindOf(section)?.label.toLowerCase()} with AI</b>
            <input className="search grow" style={{ minWidth: 160 }} placeholder={section === "brand" ? "What the business does and who it's for" : "Topic or angle (e.g. wash day tips, holiday promo)"} value={ai.topic} onChange={(e) => setAi((a) => ({ ...a, topic: e.target.value }))} aria-label="Topic" />
            <select className="search" style={{ width: "auto" }} value={ai.platform} onChange={(e) => setAi((a) => ({ ...a, platform: e.target.value }))} aria-label="Platform">{PLATFORMS.slice(0, 5).map((p) => <option key={p.name}>{p.name}</option>)}</select>
            <button className="btn solid" disabled={ai.busy} onClick={writeWithAi}>{ai.busy ? "Writing…" : "Write"}</button>
          </div>
          {ai.items.length > 0 && (
            <>
              <div className="bk-grid" style={{ marginTop: 12 }}>{ai.items.map((x, n) => (
                <div key={n} className="bk draft">
                  <div className="bk-top"><span className="bk-kind">{x.title || "Draft"}</span></div>
                  <p className="bk-body">{x.body}</p>
                  <div className="bk-foot"><span /><button className="btn small" onClick={() => { saveMany([{ kind: aiKind as Kind, title: x.title, body: x.body }]); setAi((a) => ({ ...a, items: a.items.filter((_, j) => j !== n) })); }}><Icon name="plus" />Save</button></div>
                </div>
              ))}</div>
              <div className="row" style={{ marginTop: 10 }}><button className="btn small" onClick={() => { saveMany(ai.items.map((x) => ({ kind: aiKind as Kind, title: x.title, body: x.body }))); setAi((a) => ({ ...a, items: [] })); }}>Save all {ai.items.length}</button><button className="btn small ghost" onClick={() => setAi((a) => ({ ...a, items: [] }))}>Clear</button></div>
            </>
          )}
        </div>
      )}

      {showStarter && starters.length > 0 && (
        <div className="card">
          <h3><span>Starter library</span><button className="btn small" onClick={() => { saveMany(starters); setShowStarter(false); }}>Save all {starters.length}</button></h3>
          <div className="bk-grid">{starters.map((s) => (
            <div key={s.title + s.body} className="bk draft">
              <div className="bk-top"><span className="bk-kind">{s.title}</span></div>
              <p className="bk-body">{s.body}</p>
              <div className="bk-foot"><span className="small muted">{s.tags?.join(" · ")}</span><button className="btn small" onClick={() => saveMany([s])}><Icon name="plus" />Save</button></div>
            </div>
          ))}</div>
        </div>
      )}

      {items === null ? <div className="card skel" style={{ height: 200 }} /> : list.length ? (
        section === "brand" ? (
          <>
            {["pillar", "voice"].map((k) => {
              const xs = list.filter((i) => i.kind === k);
              return xs.length ? <div key={k}><div className="small muted" style={{ margin: "4px 0 8px" }}>{kindOf(k)?.label}</div><div className="bk-grid">{xs.map(card)}</div></div> : null;
            })}
          </>
        ) : <div className="bk-grid">{list.map(card)}</div>
      ) : (
        <div className="card empty">
          <b>{q ? "Nothing matches that search" : `No ${section === "brand" ? "pillars or voice notes" : kindOf(section)?.label.toLowerCase()} yet`}</b>
          <span>{q ? "Try another word." : starters.length ? "Start from the starter library, write some with AI, or add your own." : "Add your own, or write some with AI."}</span>
        </div>
      )}

      {edit && <ItemForm item={edit} onClose={() => setEdit(null)} onSave={async (x) => { if (await save(x)) { toast("Saved"); setEdit(null); } }} onDelete={async () => { if (!edit.id) return; await supabase().from("bank_items").delete().eq("id", edit.id); toast("Deleted"); reload(); setEdit(null); }} />}
    </>
  );
}

function ItemForm({ item, onClose, onSave, onDelete }: { item: Partial<BankItem>; onClose: () => void; onSave: (x: Partial<BankItem>) => void; onDelete: () => void }) {
  const [title, setTitle] = useState(item.title ?? "");
  const [body, setBody] = useState(item.body ?? "");
  const [url, setUrl] = useState(item.url ?? "");
  const [tags, setTags] = useState((item.tags ?? []).join(", "));
  const [sure, setSure] = useState(false);
  const k = kindOf(item.kind ?? "hook");
  const tagCount = item.kind === "hashtags" ? (body.match(/#[\p{L}\p{N}_]+/gu) ?? []).length : 0;
  return (
    <Modal label={k?.one ?? "Item"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave({ ...item, title, body, url, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }); }} style={{ display: "contents" }}>
        <h2>{item.id ? `Edit ${k?.one.toLowerCase()}` : `New ${k?.one.toLowerCase()}`}</h2>
        <div className="form">
          <div className="field full"><label htmlFor="bk-title">{item.kind === "pillar" ? "Pillar name" : item.kind === "resource" ? "Name" : "Label"}</label><input id="bk-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={item.kind === "pillar" ? "Education" : item.kind === "hashtags" ? "Curly hair set" : "Short name"} /></div>
          <div className="field full"><label htmlFor="bk-body" className="row" style={{ justifyContent: "space-between" }}><span>{item.kind === "pillar" ? "What posts in this pillar cover" : item.kind === "voice" ? "Tone, words to use, words to avoid, audience" : item.kind === "resource" ? "What it's for" : "Text"}</span>{tagCount > 0 && <span>{tagCount} hashtags</span>}</label>
            <textarea id="bk-body" value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: item.kind === "caption" || item.kind === "voice" ? 180 : 90 }} />
          </div>
          {item.kind === "resource" && <div className="field full"><label htmlFor="bk-url">Link</label><input id="bk-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></div>}
          <div className="field full"><label htmlFor="bk-tags">Tags (optional, separated by commas)</label><input id="bk-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="education, reels, promo" /></div>
        </div>
        <div className="modal-foot">
          {item.id && <button type="button" className="btn danger left" onClick={() => (sure ? onDelete() : setSure(true))}>{sure ? "Tap again to delete" : "Delete"}</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid">Save</button>
        </div>
      </form>
    </Modal>
  );
}

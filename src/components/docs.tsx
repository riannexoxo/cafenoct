"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { supabase, useRows } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import Seg from "./seg";
import Icon from "./icon";
import { MentionList, mentionText, useMentionHits, type Hit } from "./mentions";

type Doc = { id: string; client_id: string | null; title: string; body: string; pinned: boolean; updated_at: string };
const DOC_COLS = "id,client_id,title,body,pinned,updated_at";
const noop = () => () => {};

const TEMPLATES: { name: string; body: string }[] = [
  { name: "Blank", body: "" },
  { name: "SOP", body: "## Purpose\nWhat this task is for and when to do it.\n\n## Tools and access\n- \n\n## Steps\n1. \n2. \n3. \n\n## Checklist before you finish\n- [ ] \n- [ ] \n\n## Notes\n" },
  { name: "Brand kit", body: "## About the brand\nOne paragraph: what they do and who they serve.\n\n## Audience\n- Who:\n- What they struggle with:\n- What they want:\n\n## Voice\n- Sounds like:\n- Never sounds like:\n- Words we use:\n- Words we avoid:\n\n## Colors\n- Primary:\n- Secondary:\n\n## Fonts\n- Headings:\n- Body:\n\n## Links\n- Logo files:\n- Brand folder:\n" },
  { name: "Meeting notes", body: "## Meeting\nDate:\nWith:\n\n## What we covered\n- \n\n## Decisions\n- \n\n## Action items\n- [ ] \n- [ ] \n" },
  { name: "Client onboarding", body: "## Contact\n- Best way to reach them:\n- Time zone:\n- Working hours:\n\n## Priorities\n1. \n2. \n3. \n\n## Recurring tasks\n- [ ] Daily:\n- [ ] Weekly:\n- [ ] Monthly:\n\n## Tools\n- \n\n## Reporting\nHow and when they want updates.\n" },
  { name: "Website brief", body: "## Goal of the site\n\n## Pages\n- Home\n- About\n- Services\n- Contact\n\n## Sites they like\n- \n\n## Must-haves\n- [ ] \n\n## Content to collect\n- [ ] Logo\n- [ ] Photos\n- [ ] Page copy\n\n## Domain and hosting\n" },
  { name: "Content strategy", body: "## Goals this quarter\n- \n\n## Content pillars\n1. \n2. \n3. \n\n## Platforms and how often\n- Instagram:\n- Facebook:\n- TikTok:\n\n## Key dates and campaigns\n- \n\n## What to measure\n- \n" },
];

// --- A small, safe Markdown renderer: headings, lists, checklists, quotes, links, bold and italics. ---
function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Links are https, or internal paths starting with a single "/" (no "//" or "/\", which browsers treat as another site).
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+|\/(?![/\\])[^)\s\\]*)\)|https?:\/\/[^\s<>()]+)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0], k = `${key}-${i++}`;
    if (t.startsWith("**")) out.push(<b key={k}>{t.slice(2, -2)}</b>);
    else if (t.startsWith("`")) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("*")) out.push(<em key={k}>{t.slice(1, -1)}</em>);
    else if (t.startsWith("[") && m[2].startsWith("/")) { const label = t.slice(1, t.indexOf("]")); out.push(<Link key={k} href={m[2]} className={label.startsWith("@") ? "mention" : undefined}>{label}</Link>); }
    else if (t.startsWith("[")) out.push(<a key={k} href={m[2]} target="_blank" rel="noopener noreferrer">{t.slice(1, t.indexOf("]"))}</a>);
    else out.push(<a key={k} href={t} target="_blank" rel="noopener noreferrer">{t}</a>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
function Markdown({ body, onToggle }: { body: string; onToggle: (line: number) => void }) {
  const lines = body.split("\n");
  const out: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    let m;
    if ((m = l.match(/^(#{1,3})\s+(.*)$/))) { const H = (`h${m[1].length + 1}`) as "h2" | "h3" | "h4"; out.push(<H key={i}>{inline(m[2], `h${i}`)}</H>); continue; }
    if (/^---+\s*$/.test(l)) { out.push(<hr key={i} />); continue; }
    if (l.startsWith(">")) { out.push(<blockquote key={i}>{inline(l.replace(/^>\s?/, ""), `q${i}`)}</blockquote>); continue; }
    if (/^\s*[-*]\s+\[[ xX]\]/.test(l)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+\[[ xX]\]/.test(lines[i])) {
        const n = i, done = /\[[xX]\]/.test(lines[i]);
        items.push(<li key={n} className={done ? "done" : ""} onClick={() => onToggle(n)}>{inline(lines[i].replace(/^\s*[-*]\s+\[[ xX]\]\s?/, ""), `c${n}`)}</li>);
        i++;
      }
      i--; out.push(<ul key={`c${i}`} className="todo">{items}</ul>); continue;
    }
    if (/^\s*[-*]\s+/.test(l)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]) && !/^\s*[-*]\s+\[[ xX]\]/.test(lines[i])) { items.push(<li key={i}>{inline(lines[i].replace(/^\s*[-*]\s+/, ""), `u${i}`)}</li>); i++; }
      i--; out.push(<ul key={`u${i}`}>{items}</ul>); continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(<li key={i}>{inline(lines[i].replace(/^\s*\d+[.)]\s+/, ""), `o${i}`)}</li>); i++; }
      i--; out.push(<ol key={`o${i}`}>{items}</ol>); continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|---|\s*[-*]\s|\s*\d+[.)]\s)/.test(lines[i])) { para.push(lines[i]); i++; }
    i--; out.push(<p key={`p${i}`}>{para.flatMap((p, n) => [...(n ? [<br key={`br${i}-${n}`} />] : []), ...inline(p, `p${i}-${n}`)])}</p>);
  }
  return <div className="doc-body">{out.length ? out : <p className="muted">Nothing written yet.</p>}</div>;
}

// Docs for SOPs, brand kits, notes and briefs, per client or for yourself. Saves as you type.
export default function Docs({ clients, clientId }: { clients: Client[]; clientId?: string }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="card skel" style={{ height: 420 }} aria-busy="true" />;
  return <Library clients={clients} clientId={clientId} />;
}

function Library({ clients, clientId }: { clients: Client[]; clientId?: string }) {
  const [docs, reload, setDocs] = useRows<Doc>(`docs:${clientId ?? "all"}`, (s) => {
    let q = s.from("docs").select(DOC_COLS).order("pinned", { ascending: false }).order("updated_at", { ascending: false });
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  }, ["docs"]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [who, setWho] = useState("");
  const [picking, setPicking] = useState(false);
  const all = (docs ?? []).filter((d) => (!who || d.client_id === who) && (!q || `${d.title} ${d.body}`.toLowerCase().includes(q.toLowerCase())));
  const doc = (docs ?? []).find((d) => d.id === openId) ?? null;
  const client = (id: string | null) => clients.find((c) => c.id === id);

  async function create(t: (typeof TEMPLATES)[number]) {
    setPicking(false);
    const { data, error } = await supabase().from("docs").insert({ client_id: clientId ?? (who || null), title: t.name === "Blank" ? "Untitled" : t.name, body: t.body }).select(DOC_COLS).single();
    if (error || !data) return toast("Could not create the doc. Try again.");
    setDocs((r) => [data as Doc, ...(r ?? [])]);
    setOpenId((data as Doc).id);
  }

  return (
    <div className={`docs${doc ? " open" : ""}`}>
      <aside className="docs-list card">
        <div className="row" style={{ gap: 8 }}>
          <input className="search grow" placeholder="Search docs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search docs" />
          <button className="btn solid small" onClick={() => setPicking(!picking)}><Icon name="plus" />New</button>
        </div>
        {picking && <div className="tpl-list">{TEMPLATES.map((t) => <button key={t.name} className="tpl-pick" onClick={() => create(t)}><Icon name="docs" size={14} />{t.name}</button>)}</div>}
        {!clientId && <select className="search" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Client"><option value="">All docs</option>{clients.filter((c) => c.status !== "Past").map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}</select>}
        {docs === null ? <div className="small muted">Loading…</div> : all.length ? (
          <div className="docs-items">{all.map((d) => (
            <button key={d.id} className={`doc-item${d.id === openId ? " on" : ""}`} onClick={() => setOpenId(d.id)}>
              <b>{d.pinned && "📌 "}{d.title || "Untitled"}</b>
              <small>{!clientId && `${client(d.client_id) ? clientLabel(client(d.client_id)!) : "Personal"} · `}{new Date(d.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small>
            </button>
          ))}</div>
        ) : <p className="small muted">{q ? "No docs match." : "No docs yet. Start one from a template: SOPs, brand kits, meeting notes and more."}</p>}
      </aside>
      {doc ? <Editor key={doc.id} doc={doc} onBack={() => setOpenId(null)} onChange={(d) => setDocs((r) => (r ?? []).map((x) => (x.id === d.id ? d : x)))} onDeleted={() => { setOpenId(null); reload(); }} /> : (
        <div className="card empty docs-empty"><Icon name="docs" size={28} /><b>Pick a doc or start a new one</b><span>Templates for SOPs, brand kits, meeting notes, onboarding, website briefs and content strategy.</span></div>
      )}
    </div>
  );
}

function Editor({ doc, onBack, onChange, onDeleted }: { doc: Doc; onBack: () => void; onChange: (d: Doc) => void; onDeleted: () => void }) {
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body);
  const [mode, setMode] = useState<"write" | "read">(doc.body ? "read" : "write");
  const [state, setState] = useState<"saved" | "saving" | "error">("saved");
  const [sure, setSure] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ at: number; q: string } | null>(null); // "@" typed at body[at]
  const [active, setActive] = useState(0);
  const hits = useMentionHits(mention?.q ?? null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ title, body });
  useEffect(() => { latest.current = { title, body }; });

  const persist = async () => {
    const { title: t, body: b } = latest.current;
    const { error } = await supabase().from("docs").update({ title: t.trim() || "Untitled", body: b }).eq("id", doc.id);
    setState(error ? "error" : "saved");
    if (!error) onChange({ ...doc, title: t, body: b, updated_at: new Date().toISOString() });
  };
  const schedule = () => { setState("saving"); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(persist, 700); };
  // Save anything still waiting when you leave the doc.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); persist(); } }, []);

  const wrap = (before: string, after = before, placeholder = "text") => {
    const el = area.current; if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd, sel = body.slice(s, e) || placeholder;
    const next = body.slice(0, s) + before + sel + after + body.slice(e);
    setBody(next); schedule();
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length); });
  };
  const linePrefix = (prefix: string) => {
    const el = area.current; if (!el) return;
    const s = el.selectionStart, start = body.lastIndexOf("\n", s - 1) + 1;
    setBody(body.slice(0, start) + prefix + body.slice(start)); schedule();
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + prefix.length, s + prefix.length); });
  };
  const typed = (v: string, caret: number) => {
    setBody(v); schedule();
    const m = v.slice(0, caret).match(/(^|\s)@([^\s@[\]()]{0,30})$/);
    setMention(m ? { at: caret - m[2].length - 1, q: m[2] } : null); setActive(0);
  };
  const pick = (h: Hit) => {
    const el = area.current; if (!el || !mention) return;
    const end = el.selectionStart, text = mentionText(h) + " ";
    setBody(body.slice(0, mention.at) + text + body.slice(end)); schedule(); setMention(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(mention.at + text.length, mention.at + text.length); });
  };
  const keys = (e: React.KeyboardEvent) => {
    if (!mention) return;
    if (e.key === "Escape") { e.preventDefault(); setMention(null); }
    else if (!hits.length) return;
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % hits.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + hits.length) % hits.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(hits[Math.min(active, hits.length - 1)]); }
  };
  const startMention = () => {
    const el = area.current; if (!el) return;
    const s = el.selectionStart, pre = s && !/\s/.test(body[s - 1]) ? " @" : "@";
    typed(body.slice(0, s) + pre + body.slice(el.selectionEnd), s + pre.length);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + pre.length, s + pre.length); });
  };
  const toggleLine = (n: number) => {
    const ls = body.split("\n");
    ls[n] = /\[[xX]\]/.test(ls[n]) ? ls[n].replace(/\[[xX]\]/, "[ ]") : ls[n].replace(/\[ \]/, "[x]");
    setBody(ls.join("\n")); schedule();
  };
  async function pin() {
    const { error } = await supabase().from("docs").update({ pinned: !doc.pinned }).eq("id", doc.id);
    if (!error) onChange({ ...doc, pinned: !doc.pinned });
  }
  async function remove() {
    if (!sure) return setSure(true);
    if (timer.current) clearTimeout(timer.current);
    const { error } = await supabase().from("docs").delete().eq("id", doc.id);
    if (error) return toast("Could not delete. Try again.");
    toast("Doc deleted");
    onDeleted();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(`${title}\n\n${body}`); toast("Doc copied"); } catch { toast("Copy was blocked here."); }
  }

  return (
    <div className="card doc-editor">
      <div className="row" style={{ gap: 6 }}>
        <button className="btn small ghost docs-back" onClick={onBack}><Icon name="left" />Docs</button>
        <span className="grow small muted">{state === "saving" ? "Saving…" : state === "error" ? "Couldn't save. Check your connection." : "Saved"}</span>
        <Seg label="Mode" options={[["read", "Read"], ["write", "Write"]]} value={mode} onChange={setMode} />
        <button className="btn small ghost" onClick={pin} aria-pressed={doc.pinned}>{doc.pinned ? "Unpin" : "Pin"}</button>
        <button className="btn small ghost" onClick={copy}><Icon name="copy" /></button>
        <button className="btn small ghost danger" onClick={remove}>{sure ? "Delete?" : "Delete"}</button>
      </div>
      <input className="task-title" value={title} onChange={(e) => { setTitle(e.target.value); schedule(); }} placeholder="Untitled" aria-label="Doc title" />
      {mode === "write" ? (
        <>
          <div className="doc-tools" role="toolbar" aria-label="Formatting">
            <button onClick={() => linePrefix("## ")} title="Heading">H</button>
            <button onClick={() => wrap("**")} title="Bold"><b>B</b></button>
            <button onClick={() => wrap("*")} title="Italic"><em>I</em></button>
            <button onClick={() => linePrefix("- ")} title="Bullet list">•</button>
            <button onClick={() => linePrefix("1. ")} title="Numbered list">1.</button>
            <button onClick={() => linePrefix("- [ ] ")} title="Checklist">☐</button>
            <button onClick={() => linePrefix("> ")} title="Quote">“</button>
            <button onClick={() => wrap("[", "](https://)", "link text")} title="Link"><Icon name="link" size={14} /></button>
            <button onClick={startMention} title="Mention a task, client, invoice or post" aria-label="Mention">@</button>
          </div>
          <textarea ref={area} className="doc-text" value={body} onChange={(e) => typed(e.target.value, e.target.selectionStart)} onKeyDown={keys} onBlur={() => setMention(null)}
            aria-autocomplete="list" aria-controls={mention ? "doc-mentions" : undefined} aria-activedescendant={mention && hits.length ? `doc-mentions-${Math.min(active, hits.length - 1)}` : undefined}
            aria-label="Doc text" placeholder="Start writing. Use the buttons above, or ## for headings, - for bullets, - [ ] for checklists and @ to mention something." />
          {mention && <MentionList id="doc-mentions" hits={hits} active={Math.min(active, Math.max(0, hits.length - 1))} onPick={pick} />}
        </>
      ) : <div onDoubleClick={() => setMode("write")}><Markdown body={body} onToggle={toggleLine} /></div>}
    </div>
  );
}

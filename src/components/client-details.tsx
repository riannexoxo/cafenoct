"use client";

import "@/styles/client-record.css";
import { useState } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import Icon from "./icon";

type Row = { tags: string[] | null; fields: Record<string, unknown> | null };
const MAX_FIELDS = 30, MAX_TAGS = 30, KEY_MAX = 40, VAL_MAX = 500, TAG_MAX = 40;

// Tags and your own fields (birthday, brand colors, login hints…) on a client's record.
export default function ClientDetails({ clientId }: { clientId: string }) {
  const [rows, reload] = useRows<Row>(`client-details:${clientId}`, (s) => s.from("clients").select("tags,fields").eq("id", clientId).limit(1), ["clients"]);
  const row = rows?.[0];
  const tags = row?.tags ?? [];
  const saved = Object.entries(row?.fields ?? {}).map(([k, v]) => [k, String(v ?? "")] as [string, string]);
  const [tag, setTag] = useState("");
  const [draft, setDraft] = useState<[string, string][] | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = draft ?? saved;

  async function saveTags(next: string[]) {
    const { error } = await supabase().from("clients").update({ tags: next }).eq("id", clientId);
    if (error) return toast("Could not save the tag. Try again.");
    reload();
  }
  function addTag(e: React.FormEvent) {
    e.preventDefault();
    const t = tag.trim().replace(/\s+/g, " ").slice(0, TAG_MAX);
    if (!t) return;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) { setTag(""); return toast("That tag is already here."); }
    if (tags.length >= MAX_TAGS) return toast(`Up to ${MAX_TAGS} tags.`);
    setTag("");
    saveTags([...tags, t]);
  }

  const edit = (i: number, at: 0 | 1, v: string) => setDraft(fields.map((f, j) => (j === i ? (at === 0 ? [v, f[1]] : [f[0], v]) : f)));
  async function saveFields() {
    const clean = fields.map(([k, v]) => [k.trim(), v.trim()] as [string, string]).filter(([k, v]) => k || v);
    if (clean.some(([k]) => !k)) return toast("Every field needs a name.");
    if (clean.some(([k]) => k.length > KEY_MAX)) return toast(`Field names can be up to ${KEY_MAX} characters.`);
    if (clean.some(([, v]) => v.length > VAL_MAX)) return toast(`Values can be up to ${VAL_MAX} characters.`);
    if (new Set(clean.map(([k]) => k.toLowerCase())).size !== clean.length) return toast("Two fields have the same name.");
    if (clean.length > MAX_FIELDS) return toast(`Up to ${MAX_FIELDS} fields.`);
    setBusy(true);
    const { error } = await supabase().from("clients").update({ fields: Object.fromEntries(clean) }).eq("id", clientId);
    setBusy(false);
    if (error) return toast("Could not save. Try again.");
    toast("Details saved");
    setDraft(null);
    reload();
  }

  return (
    <section className="card cr-details" aria-label="Details">
      <h3><span>Details</span></h3>
      {rows === null ? <div className="skel" style={{ height: 80, borderRadius: 14 }} /> : (
        <>
          <div className="cr-label">Tags</div>
          <ul className="cr-tags" aria-label="Tags">
            {tags.map((t) => (
              <li key={t} className="cr-tag">
                <span>{t}</span>
                <button type="button" onClick={() => saveTags(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}><Icon name="x" size={12} /></button>
              </li>
            ))}
            {tags.length === 0 && <li className="small muted">No tags yet.</li>}
          </ul>
          <form className="cr-add" onSubmit={addTag}>
            <label htmlFor={`tag-${clientId}`} className="sr-only">New tag</label>
            <input id={`tag-${clientId}`} value={tag} maxLength={TAG_MAX} onChange={(e) => setTag(e.target.value)} placeholder="VIP, retainer, referral…" />
            <button type="submit" className="btn small" disabled={!tag.trim()}><Icon name="plus" />Add</button>
          </form>

          <div className="cr-label">Fields</div>
          {fields.length === 0 && <p className="small muted" style={{ margin: 0 }}>Keep anything handy here: birthday, brand colors, where their files live.</p>}
          <div className="cr-fields">
            {fields.map(([k, v], i) => (
              <div key={i} className="cr-field">
                <label className="sr-only" htmlFor={`fk-${i}`}>Field name</label>
                <input id={`fk-${i}`} value={k} maxLength={KEY_MAX} placeholder="Name" onChange={(e) => edit(i, 0, e.target.value)} />
                <label className="sr-only" htmlFor={`fv-${i}`}>Value for {k || "this field"}</label>
                <input id={`fv-${i}`} value={v} maxLength={VAL_MAX} placeholder="Value" onChange={(e) => edit(i, 1, e.target.value)} />
                <button type="button" className="btn small ghost" onClick={() => setDraft(fields.filter((_, j) => j !== i))} aria-label={`Remove ${k || "field"}`}><Icon name="x" size={14} /></button>
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn small" disabled={fields.length >= MAX_FIELDS} onClick={() => setDraft([...fields, ["", ""]])}><Icon name="plus" />Add field</button>
            {draft && (
              <>
                <button type="button" className="btn small ghost" onClick={() => setDraft(null)}>Cancel</button>
                <button type="button" className="btn small solid" disabled={busy} onClick={saveFields}>{busy ? "Saving…" : "Save"}</button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

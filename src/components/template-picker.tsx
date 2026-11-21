"use client";

// Save what's in a form as a template, and start new items from one. Shared by tasks, posts and invoices.
import { useState } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import Icon from "./icon";
import "@/styles/extras.css";

export type TemplateKind = "task" | "post" | "invoice";
type Tpl = { id: string; name: string; data: Record<string, unknown> };

// Template data can be edited by hand, so every value is checked before it goes back into a form.
export const str = (v: unknown, max = 5000) => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v).slice(0, max) : "");
export const list = (v: unknown, max = 100): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
export const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export default function TemplatePicker({ kind, pick, data, onApply }: { kind: TemplateKind; pick: boolean; data: () => Record<string, unknown>; onApply: (d: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const name = (naming ?? "").trim().slice(0, 80);
    if (!name) return toast("Give the template a name.");
    setBusy(true);
    const { error } = await supabase().from("templates").insert({ kind, name, data: data() });
    setBusy(false);
    if (error) return toast(/check|size/i.test(error.message) ? "That's too big to save as a template." : "Could not save the template. Try again.");
    toast("Saved as a template");
    setNaming(null);
  }

  return (
    <div className="tpl">
      <div className="row" style={{ gap: 6 }}>
        {pick && <button type="button" className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="docs" size={14} />From template</button>}
        {naming === null
          ? <button type="button" className="btn small ghost" onClick={() => setNaming(str(data().title, 80))}><Icon name="plus" size={14} />Save as template</button>
          : (
            <span className="row tpl-name" style={{ gap: 6, flexWrap: "nowrap" }}>
              <label className="sr-only" htmlFor={`tpl-name-${kind}`}>Template name</label>
              <input id={`tpl-name-${kind}`} autoFocus onFocus={(e) => e.currentTarget.select()} maxLength={80} value={naming} placeholder="Template name" onChange={(e) => setNaming(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } else if (e.key === "Escape") { e.stopPropagation(); setNaming(null); } }} />
              <button type="button" className="btn small" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
              <button type="button" className="btn small ghost" onClick={() => setNaming(null)}>Cancel</button>
            </span>
          )}
      </div>
      {pick && open && <TemplateList kind={kind} onApply={(d) => { onApply(d); setOpen(false); }} />}
    </div>
  );
}

function TemplateList({ kind, onApply }: { kind: TemplateKind; onApply: (d: Record<string, unknown>) => void }) {
  const [rows, reload] = useRows<Tpl>(`templates:${kind}`, (s) => s.from("templates").select("id,name,data").eq("kind", kind).order("created_at", { ascending: false }).limit(100), ["templates"]);
  const [sure, setSure] = useState("");
  async function remove(id: string) {
    if (sure !== id) return setSure(id);
    const { error } = await supabase().from("templates").delete().eq("id", id);
    if (error) return toast("Could not delete. Try again.");
    toast("Template deleted");
    setSure("");
    reload();
  }
  if (!rows) return <p className="small muted" aria-busy="true">Loading templates…</p>;
  if (!rows.length) return <p className="small muted">No templates yet. Fill in a {kind} and tap Save as template.</p>;
  return (
    <ul className="tpl-list">
      {rows.map((t) => (
        <li key={t.id}>
          <button type="button" className="tpl-use" onClick={() => { onApply(obj(t.data)); toast(`Filled in from ${t.name}`); }}>{t.name}</button>
          <button type="button" className="btn small ghost" aria-label={sure === t.id ? `Tap again to delete ${t.name}` : `Delete template ${t.name}`} onClick={() => remove(t.id)}>
            {sure === t.id ? "Delete?" : <Icon name="x" size={14} />}
          </button>
        </li>
      ))}
    </ul>
  );
}

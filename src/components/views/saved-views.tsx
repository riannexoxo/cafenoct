"use client";

import { useState } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import Icon from "@/components/icon";
import type { ViewConfig } from "./shared";

type Saved = { id: string; name: string; config: Partial<ViewConfig>; position: number };

// Your saved task views as chips: one click applies the view, filters and grouping.
export default function SavedViews({ current, apply }: { current: ViewConfig; apply: (c: Partial<ViewConfig>) => void }) {
  const [views, reload] = useRows<Saved>("saved-views:tasks", (s) => s.from("saved_views").select("id,name,config,position").eq("scope", "tasks").order("position").order("created_at").limit(50), ["saved_views"]);
  const [naming, setNaming] = useState<{ id?: string; name: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [sure, setSure] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = naming?.name.trim() ?? "";
    if (!name || name.length > 80) return toast("Give the view a name (up to 80 characters).");
    const { error } = naming?.id
      ? await supabase().from("saved_views").update({ name }).eq("id", naming.id)
      : await supabase().from("saved_views").insert({ scope: "tasks", name, config: current, position: (views?.length ?? 0) + 1 });
    if (error) return toast("Could not save the view. Try again.");
    toast(naming?.id ? "View renamed" : `Saved “${name}”`);
    setNaming(null);
    reload();
  }
  async function remove(v: Saved) {
    if (sure !== v.id) return setSure(v.id);
    const { error } = await supabase().from("saved_views").delete().eq("id", v.id);
    if (error) return toast("Could not delete it. Try again.");
    setSure("");
    reload();
  }

  return (
    <div className="vsaved" role="group" aria-label="Saved views">
      {(views ?? []).map((v) => editing ? (
        <span key={v.id} className="vsaved-chip on">
          <button type="button" onClick={() => setNaming({ id: v.id, name: v.name })} aria-label={`Rename ${v.name}`}>{v.name}</button>
          <button type="button" className={sure === v.id ? "bad-t" : ""} onClick={() => remove(v)} aria-label={sure === v.id ? `Tap again to delete ${v.name}` : `Delete ${v.name}`}>{sure === v.id ? "Delete?" : <Icon name="x" size={12} />}</button>
        </span>
      ) : (
        <button key={v.id} type="button" className="vsaved-chip" onClick={() => apply(v.config)}>{v.name}</button>
      ))}
      {naming ? (
        <form onSubmit={save} className="vsaved-form">
          <input autoFocus value={naming.name} maxLength={80} onChange={(e) => setNaming({ ...naming, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Escape") setNaming(null); }} placeholder="Name this view" aria-label="View name" />
          <button className="btn small solid" type="submit">{naming.id ? "Rename" : "Save"}</button>
          <button className="btn small ghost" type="button" onClick={() => setNaming(null)}>Cancel</button>
        </form>
      ) : (
        <>
          <button type="button" className="vsaved-add" onClick={() => setNaming({ name: "" })}><Icon name="plus" size={13} />Save this view</button>
          {(views ?? []).length > 0 && <button type="button" className="vsaved-add" aria-pressed={editing} onClick={() => { setEditing(!editing); setSure(""); }}>{editing ? "Done" : "Edit"}</button>}
        </>
      )}
    </div>
  );
}

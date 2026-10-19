"use client";

import { useState, useSyncExternalStore } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import type { Client } from "@/lib/types";
import Icon from "./icon";

type Color = { name: string; hex: string };
type Font = { name: string; use: string };
type Link = { label: string; url: string };
type Kit = { client_id: string; colors: Color[]; fonts: Font[]; links: Link[]; notes: string };
const noop = () => () => {};
const href = (u: string) => { if (!u.trim()) return ""; try { return new URL(/^https?:\/\//i.test(u) ? u.trim() : `https://${u.trim()}`).href; } catch { return ""; } };
const hexOk = (h: string) => /^#[0-9a-f]{6}$/i.test(h);

// A client's brand in one place: colors to copy, fonts, logo and asset links, and rules to remember.
export default function BrandKit({ client }: { client: Client }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  const [rows, reload] = useRows<Kit>(`brand:${client.id}`, (s) => s.from("brand_kits").select("client_id,colors,fonts,links,notes").eq("client_id", client.id).limit(1), ["brand_kits"]);
  if (!ready || rows === null) return <div className="card skel" style={{ height: 320 }} aria-busy="true" />;
  return <Editor key={JSON.stringify(rows[0] ?? {})} client={client} kit={rows[0]} onSaved={reload} />;
}

function Editor({ client, kit, onSaved }: { client: Client; kit?: Kit; onSaved: () => void }) {
  const [colors, setColors] = useState<Color[]>(kit?.colors ?? []);
  const [fonts, setFonts] = useState<Font[]>(kit?.fonts ?? []);
  const [links, setLinks] = useState<Link[]>(kit?.links ?? []);
  const [notes, setNotes] = useState(kit?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const touch = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirty(true); };
  const sColors = touch(setColors), sFonts = touch(setFonts), sLinks = touch(setLinks), sNotes = touch(setNotes);

  async function save() {
    setBusy(true);
    const { error } = await supabase().from("brand_kits").upsert({
      client_id: client.id, colors: colors.filter((c) => hexOk(c.hex)), fonts: fonts.filter((f) => f.name.trim()),
      links: links.filter((l) => l.url.trim()), notes: notes.trim(), updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" });
    setBusy(false);
    if (error) return toast("Could not save. Try again.");
    setDirty(false);
    toast("Brand kit saved");
    onSaved();
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast(`Copied ${text}`); } catch { toast("Copy was blocked here."); }
  }

  return (
    <>
      <div className="card">
        <h3><span>Colors</span><button className="btn small" onClick={() => sColors([...colors, { name: "", hex: client.color && hexOk(client.color) ? client.color : "#976A4B" }])}><Icon name="plus" />Color</button></h3>
        {colors.length ? (
          <div className="swatches">
            {colors.map((c, i) => (
              <div className="swatch" key={i}>
                <button type="button" className="swatch-chip" style={{ background: hexOk(c.hex) ? c.hex : "transparent" }} onClick={() => copy(c.hex.toUpperCase())} aria-label={`Copy ${c.hex}`} title="Tap to copy" />
                <input value={c.name} onChange={(e) => sColors(colors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" aria-label="Color name" />
                <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                  <input type="color" value={hexOk(c.hex) ? c.hex : "#000000"} onChange={(e) => sColors(colors.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} aria-label="Pick color" />
                  <input className="num" value={c.hex} onChange={(e) => sColors(colors.map((x, j) => (j === i ? { ...x, hex: e.target.value.trim() } : x)))} aria-label="Hex code" />
                  <button type="button" className="btn small ghost" onClick={() => sColors(colors.filter((_, j) => j !== i))} aria-label="Remove color"><Icon name="x" /></button>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="small muted">Add the brand colors. Tap a swatch to copy its hex code.</p>}
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <h3><span>Fonts</span><button className="btn small" onClick={() => sFonts([...fonts, { name: "", use: "" }])}><Icon name="plus" />Font</button></h3>
          {fonts.length ? fonts.map((f, i) => (
            <div className="row kit-row" key={i}>
              <input className="grow" value={f.name} onChange={(e) => sFonts(fonts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Font name" aria-label="Font name" style={{ fontFamily: f.name ? `"${f.name}", var(--font)` : undefined }} />
              <input value={f.use} onChange={(e) => sFonts(fonts.map((x, j) => (j === i ? { ...x, use: e.target.value } : x)))} placeholder="Headings, body…" aria-label="Used for" />
              <button type="button" className="btn small ghost" onClick={() => sFonts(fonts.filter((_, j) => j !== i))} aria-label="Remove font"><Icon name="x" /></button>
            </div>
          )) : <p className="small muted">Which fonts they use, and for what.</p>}
        </div>
        <div className="card">
          <h3><span>Logos and files</span><button className="btn small" onClick={() => sLinks([...links, { label: "", url: "" }])}><Icon name="plus" />Link</button></h3>
          {links.length ? links.map((l, i) => (
            <div className="row kit-row" key={i}>
              <input value={l.label} onChange={(e) => sLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Logo files" aria-label="Label" />
              <input className="grow" value={l.url} onChange={(e) => sLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="Drive, Canva brand kit…" aria-label="Link" />
              {href(l.url) && <a className="btn small" href={href(l.url)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${l.label || "link"}`}><Icon name="link" /></a>}
              <button type="button" className="btn small ghost" onClick={() => sLinks(links.filter((_, j) => j !== i))} aria-label="Remove link"><Icon name="x" /></button>
            </div>
          )) : <p className="small muted">Logo files, photos, the Canva brand kit, past designs.</p>}
        </div>
      </div>

      <div className="card">
        <h3><span>Brand rules</span></h3>
        <textarea className="eod" style={{ minHeight: 120 }} value={notes} onChange={(e) => sNotes(e.target.value)} placeholder="Logo clear space, words to avoid, photo style, emoji or not…" aria-label="Brand rules" />
      </div>

      <div className="row" style={{ justifyContent: "flex-end", position: "sticky", bottom: 16 }}>
        <button className="btn solid" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : dirty ? "Save brand kit" : "Saved"}</button>
      </div>
    </>
  );
}

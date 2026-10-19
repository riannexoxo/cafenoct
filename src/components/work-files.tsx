"use client";
/* eslint-disable @next/next/no-img-element -- plain <img> on purpose: next/image would resize and recompress, and these must show the original file. */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase, useRows } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import { ACCEPT, BUCKET, downloadUrl, isImage, isVideo, sizeText, uploadWorkFile, useSigned, type WorkFile } from "@/lib/work-files";
import type { CanvaLink, Kind } from "@/lib/deliverables";
import Modal from "./modal";
import Icon from "./icon";

type Design = { id: string; title: string; thumb: string; w: number; h: number; updated: number };

// The files on a design or video request, kept at original quality, plus its linked Canva design.
export default function WorkFiles({ id, kind, files, canva, canvaReady, onChange }: {
  id: string; kind: Kind; files: WorkFile[]; canva: CanvaLink; canvaReady: boolean; onChange: (p: { files?: WorkFile[]; canva?: CanvaLink }) => void;
}) {
  const path = usePathname();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [over, setOver] = useState(false);
  const [view, setView] = useState<WorkFile | null>(null);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!view) return;
    // Escape closes the viewer only, not the request behind it.
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); setView(null); setZoom(false); } };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [view]);
  const [pick, setPick] = useState(false);
  const [conn] = useRows<{ name: string }>("canva-conn", (s) => s.from("canva_connections").select("name").limit(1), ["canva_connections"]);
  const connected = !!conn?.length;
  const urls = useSigned([...files.map((f) => f.path), canva.thumb ?? ""]);

  async function add(list: FileList | File[]) {
    const arr = [...list];
    if (!arr.length) return;
    const added: WorkFile[] = [];
    for (const [i, f] of arr.entries()) {
      setBusy(`Uploading ${i + 1} of ${arr.length}…`);
      const r = await uploadWorkFile(f, id);
      if (r.error) toast(r.error); else if (r.file) added.push(r.file);
    }
    setBusy("");
    if (!added.length) return;
    const next = [...files, ...added];
    const { error } = await supabase().from("deliverables").update({ files: next }).eq("id", id);
    if (error) return toast("Uploaded, but couldn't save the list. Try again.");
    onChange({ files: next });
    toast(added.length === 1 ? "File added at full quality" : `${added.length} files added at full quality`);
  }
  async function remove(f: WorkFile) {
    if (!confirm(`Remove ${f.name}? This deletes the file.`)) return;
    const next = files.filter((x) => x.path !== f.path);
    await supabase().storage.from(BUCKET).remove([f.path]);
    await supabase().from("deliverables").update({ files: next }).eq("id", id);
    onChange({ files: next });
  }
  async function download(f: WorkFile) {
    const u = await downloadUrl(f);
    if (u) window.location.assign(u); else toast("Couldn't get the file. Try again.");
  }
  async function saveFromCanva() {
    setBusy("Exporting from Canva at full quality…");
    const r = await fetch("/api/canva/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deliverable: id }) }).then((x) => x.json()).catch(() => ({ error: "Check your connection." }));
    setBusy("");
    if (r.error) return toast(r.error);
    onChange({ files: r.files });
    toast(`Saved ${r.added} PNG${r.added === 1 ? "" : "s"} from Canva`);
  }
  async function unlink() {
    await supabase().from("deliverables").update({ canva: {} }).eq("id", id);
    onChange({ canva: {} });
  }

  return (
    <div className="field full">
      <label>Files <span className="muted">(kept at original quality)</span></label>

      {(kind === "design" || canva.id) && (
        <div className="canva-box">
          {canva.id ? (
            <>
              {canva.thumb && urls[canva.thumb] ? <img src={urls[canva.thumb]} alt="" className="canva-thumb" /> : <span className="canva-thumb canva-ph">C</span>}
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="ellipsis">{canva.title}</div>
                <div className="small muted">Linked Canva design{canva.pages && canva.pages > 1 ? ` · ${canva.pages} pages` : ""}</div>
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  <a className="btn small solid" href={`/api/canva/open?id=${encodeURIComponent(canva.id)}`} target="_blank" rel="noopener noreferrer"><Icon name="link" />Open in Canva</a>
                  <button type="button" className="btn small" disabled={!!busy} onClick={saveFromCanva}><Icon name="file" />Save as PNG</button>
                  <button type="button" className="btn small ghost" onClick={unlink}>Unlink</button>
                </div>
              </div>
            </>
          ) : connected ? (
            <><span className="canva-thumb canva-ph">C</span><div className="grow small muted">Pick the Canva design for this request to see it here and open it in one tap.</div><button type="button" className="btn small solid" onClick={() => setPick(true)}>Link a Canva design</button></>
          ) : canvaReady ? (
            <><span className="canva-thumb canva-ph">C</span><div className="grow small muted">Connect your Canva account to link designs and save them here at full quality.</div><a className="btn small" href={`/api/canva/start?back=${encodeURIComponent(path)}`}>Connect Canva</a></>
          ) : (
            <><span className="canva-thumb canva-ph">C</span><div className="grow small muted">Canva connection is coming soon. For now, upload your exports below.</div></>
          )}
        </div>
      )}

      <div className={`drop-zone${over ? " over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
        <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
        <button type="button" className="btn small" disabled={!!busy} onClick={() => input.current?.click()}><Icon name="plus" />Add files</button>
        <span className="small muted">{busy || "or drop them here · PNG, JPG, PDF, MP4, MOV · up to 50 MB each"}</span>
      </div>

      {files.length > 0 && (
        <div className="file-grid">
          {[...files].reverse().map((f) => (
            <div className="file-tile" key={f.path}>
              <button type="button" className="file-prev" onClick={() => setView(f)} aria-label={`View ${f.name}`}>
                {isImage(f) && urls[f.path] ? <img src={urls[f.path]} alt="" loading="lazy" />
                  : isVideo(f) && urls[f.path] ? <video src={urls[f.path]} muted preload="metadata" />
                  : <span className="file-ext">{f.name.split(".").pop()?.toUpperCase()}</span>}
              </button>
              <div className="file-meta">
                <span className="ellipsis" title={f.name}>{f.name}</span>
                <small className="muted num">{[f.w && f.h ? `${f.w}×${f.h}` : "", sizeText(f.size), f.from === "canva" ? "Canva" : ""].filter(Boolean).join(" · ")}</small>
              </div>
              <div className="row" style={{ gap: 4 }}>
                <button type="button" className="btn small" onClick={() => download(f)} aria-label={`Download ${f.name}`} title="Download original"><Icon name="file" /></button>
                <button type="button" className="btn small ghost" onClick={() => remove(f)} aria-label={`Remove ${f.name}`}><Icon name="x" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {view && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={view.name} onClick={(e) => { if (e.target === e.currentTarget) setView(null); }}>
          <div className="lightbox-bar">
            <span className="ellipsis">{view.name}{view.w && view.h ? ` · ${view.w}×${view.h}` : ""} · {sizeText(view.size)}</span>
            <button type="button" className="btn small" onClick={() => download(view)}><Icon name="file" />Download original</button>
            <button type="button" className="btn small" onClick={() => { setView(null); setZoom(false); }} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="lightbox-body" onClick={(e) => { if (e.target === e.currentTarget) setView(null); }}>
            {isImage(view) ? <img src={urls[view.path]} alt={view.name} className={zoom ? "zoom" : ""} onClick={() => setZoom(!zoom)} title={zoom ? "Fit to screen" : "View at 100%"} /> : isVideo(view) ? <video src={urls[view.path]} controls autoPlay /> : <iframe src={urls[view.path]} title={view.name} />}
          </div>
        </div>
      )}

      {pick && <CanvaPicker onClose={() => setPick(false)} onPick={async (d) => {
        setPick(false); setBusy("Linking the Canva design…");
        const r = await fetch("/api/canva/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deliverable: id, design: d.id }) }).then((x) => x.json()).catch(() => ({ error: "Check your connection." }));
        setBusy("");
        if (r.error) return toast(r.error);
        onChange({ canva: r.canva });
        toast("Canva design linked");
      }} />}
    </div>
  );
}

function CanvaPicker({ onClose, onPick }: { onClose: () => void; onPick: (d: Design) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Design[] | null>(null);
  const [next, setNext] = useState("");
  const [err, setErr] = useState("");
  const load = async (query: string, more = "") => {
    setErr("");
    const r = await fetch(`/api/canva/designs?${new URLSearchParams({ q: query, next: more })}`).then((x) => x.json()).catch(() => ({ error: "Check your connection." }));
    if (r.error) { setErr(r.reconnect ? "Your Canva sign-in expired. Close this and connect Canva again." : r.error); setItems((x) => x ?? []); return; }
    setItems((x) => (more ? [...(x ?? []), ...r.items] : r.items));
    setNext(r.next ?? "");
  };
  useEffect(() => { const t = setTimeout(() => load(q), q ? 350 : 0); return () => clearTimeout(t); }, [q]);
  return (
    <Modal label="Pick a Canva design" onClose={onClose} wide>
      <h2>Pick a Canva design</h2>
      <input className="search" style={{ width: "100%", marginBottom: 12 }} placeholder="Search your designs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search Canva designs" />
      {err && <p className="small bad-t">{err}</p>}
      {items === null ? <div className="skel" style={{ height: 240 }} /> : items.length ? (
        <div className="canva-grid">
          {items.map((d) => (
            <button type="button" key={d.id} className="canva-item" onClick={() => onPick(d)}>
              {d.thumb ? <img src={d.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="canva-ph">C</span>}
              <span className="ellipsis">{d.title}</span>
            </button>
          ))}
        </div>
      ) : !err && <p className="small muted">No designs found.</p>}
      <div className="modal-foot">
        {next && <button type="button" className="btn left" onClick={() => load(q, next)}>Load more</button>}
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

"use client";

// Files on a task card (Trello-style). Stored in the private "attachments" bucket under your user id,
// opened through signed links that last an hour. Each change is saved to the task right away.
import { useRef, useState } from "react";
import { supabase } from "@/lib/use-rows";
import { sizeText, useSigned } from "@/lib/work-files";
import { toast } from "@/lib/toast";
import type { TFile } from "@/lib/work";
import Icon from "./icon";
import "@/styles/extras.css";

export const ATTACH = "attachments";
const MAX = 25 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "application/pdf", "text/plain", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/zip", "video/mp4", "video/quicktime"];

// The saved list can be edited outside the app, so only well-formed entries are shown.
export const cleanFiles = (v: unknown): TFile[] => (Array.isArray(v) ? v : [])
  .filter((f) => f && typeof f.path === "string" && f.path)
  .map((f) => ({ path: f.path, name: String(f.name ?? "file").slice(0, 200), size: Number(f.size) || 0, type: String(f.type ?? "") }));
export const firstImage = (v: unknown) => cleanFiles(v).find((f) => f.type.startsWith("image/") && f.type !== "image/heic")?.path ?? "";

function pathFor(uid: string, taskId: string, name: string) {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "file";
  return `${uid}/${taskId}/${crypto.randomUUID().slice(0, 8)}-${base}${ext ? `.${ext}` : ""}`;
}

export default function TaskFiles({ taskId, initial }: { taskId: string; initial: unknown }) {
  const [files, setFiles] = useState<TFile[]>(() => cleanFiles(initial));
  const [busy, setBusy] = useState("");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const urls = useSigned(files.map((f) => f.path), ATTACH);

  async function persist(next: TFile[]) {
    const { error } = await supabase().from("tasks").update({ files: next }).eq("id", taskId);
    if (!error) setFiles(next);
    return !error;
  }

  async function add(list: FileList | null) {
    const picked = [...(list ?? [])];
    if (!picked.length || busy) return;
    const big = picked.find((f) => f.size > MAX), odd = picked.find((f) => !TYPES.includes(f.type));
    if (big) return toast(`${big.name} is over 25 MB. Share a Drive link for big files instead.`);
    if (odd) return toast(`${odd.name} can't be attached. Try an image, PDF, Office file, text, ZIP, MP4 or MOV.`);
    if (files.length + picked.length > 20) return toast("A task can hold up to 20 files.");
    const { data: auth } = await supabase().auth.getSession();
    const uid = auth.session?.user.id;
    if (!uid) return toast("Please sign in again.");
    const added: TFile[] = [];
    for (const [i, f] of picked.entries()) {
      setBusy(`Uploading ${i + 1} of ${picked.length}…`);
      const path = pathFor(uid, taskId, f.name);
      const { error } = await supabase().storage.from(ATTACH).upload(path, f, { upsert: false, contentType: f.type });
      if (error) { toast(/exceeded|size/i.test(error.message) ? `${f.name} is too big.` : `${f.name} didn't upload. Check your connection.`); continue; }
      added.push({ path, name: f.name.slice(0, 200), size: f.size, type: f.type });
    }
    if (added.length && !(await persist([...files, ...added]))) {
      await supabase().storage.from(ATTACH).remove(added.map((f) => f.path)); // don't leave files the task doesn't know about
      toast("Could not attach the files. Try again.");
    } else if (added.length) toast(added.length === 1 ? "File attached" : `${added.length} files attached`);
    setBusy("");
  }

  async function remove(f: TFile) {
    setBusy(`Removing ${f.name}…`);
    const { error } = await supabase().storage.from(ATTACH).remove([f.path]);
    const ok = !error && (await persist(files.filter((x) => x.path !== f.path)));
    setBusy("");
    toast(ok ? "File removed" : "Could not remove it. Try again.");
  }

  return (
    <div className="field full"><label htmlFor={`tf-${taskId}`}>Files</label>
      {files.length > 0 && (
        <ul className="tfiles">
          {files.map((f) => (
            <li key={f.path}>
              <Icon name="file" size={14} />
              {urls[f.path] ? <a href={urls[f.path]} target="_blank" rel="noopener noreferrer" className="grow">{f.name}</a> : <span className="grow">{f.name}</span>}
              <span className="small muted">{sizeText(f.size)}</span>
              <button type="button" className="btn small ghost" disabled={!!busy} aria-label={`Remove ${f.name}`} onClick={() => remove(f)}><Icon name="x" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className={`drop-zone${over ? " over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
        <input id={`tf-${taskId}`} ref={input} type="file" multiple accept={TYPES.join(",")} hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <button type="button" className="btn small" disabled={!!busy} onClick={() => input.current?.click()}><Icon name="plus" />Attach files</button>
        <span className="small muted" aria-live="polite">{busy || "or drop them here · up to 25 MB each"}</span>
      </div>
    </div>
  );
}

"use client";

// Work files on design and video requests. Files are stored exactly as uploaded (no resizing, no recompression)
// in a private bucket, and shown through short-lived signed links.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/use-rows";

export type WorkFile = { path: string; name: string; type: string; size: number; w?: number; h?: number; at: string; from?: "upload" | "canva" };
export const BUCKET = "work-files";
export const MAX_BYTES = 50 * 1024 * 1024;
export const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/avif,image/tiff,application/pdf,video/mp4,video/quicktime,video/webm";

export const isImage = (f: Pick<WorkFile, "type">) => f.type.startsWith("image/") && f.type !== "image/tiff";
export const isVideo = (f: Pick<WorkFile, "type">) => f.type.startsWith("video/");
export const sizeText = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const coverOf = (files: WorkFile[] = [], thumb?: string) => files.findLast(isImage)?.path ?? thumb ?? "";

// Width and height in pixels, read from the file itself.
async function dimensions(file: File): Promise<{ w?: number; h?: number }> {
  try {
    if (file.type.startsWith("image/")) { const b = await createImageBitmap(file); const r = { w: b.width, h: b.height }; b.close(); return r; }
    if (file.type.startsWith("video/")) {
      return await new Promise((res) => {
        const v = document.createElement("video"), url = URL.createObjectURL(file);
        v.preload = "metadata"; v.onloadedmetadata = () => { res({ w: v.videoWidth, h: v.videoHeight }); URL.revokeObjectURL(url); };
        v.onerror = () => { res({}); URL.revokeObjectURL(url); }; v.src = url;
      });
    }
  } catch { /* unknown size is fine */ }
  return {};
}

export async function uploadWorkFile(file: File, deliverableId: string): Promise<{ file?: WorkFile; error?: string }> {
  if (file.size > MAX_BYTES) return { error: `${file.name} is over 50 MB. Share a Drive link for big videos instead.` };
  if (!ACCEPT.split(",").includes(file.type)) return { error: `${file.name} isn't a supported file (images, PDF, MP4, MOV, WEBM).` };
  const { data: auth } = await supabase().auth.getSession();
  const uid = auth.session?.user.id;
  if (!uid) return { error: "Please sign in again." };
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${uid}/${deliverableId}/${Date.now()}-${safe}`;
  const dims = await dimensions(file);
  // upsert false: an uploaded file can never be replaced or changed in place.
  const { error } = await supabase().storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type, cacheControl: "31536000" });
  if (error) return { error: /exceeded|size/i.test(error.message) ? `${file.name} is too big.` : "Upload failed. Check your connection." };
  return { file: { path, name: file.name, type: file.type, size: file.size, ...dims, at: new Date().toISOString(), from: "upload" } };
}

// Signed links for a set of files, refreshed before they expire (links last an hour).
const cache = new Map<string, { url: string; until: number }>();
export function useSigned(paths: string[]) {
  const key = [...new Set(paths.filter(Boolean))].sort().join("|");
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const list = key ? key.split("|") : [];
    const now = Date.now(), need = list.filter((p) => !(cache.get(p)?.until ?? 0) || cache.get(p)!.until < now + 60000);
    const done = () => setUrls(Object.fromEntries(list.map((p) => [p, cache.get(p)?.url ?? ""])));
    if (!need.length) { done(); return; }
    let alive = true;
    supabase().storage.from(BUCKET).createSignedUrls(need, 3600).then(({ data }) => {
      (data ?? []).forEach((d) => { if (d.signedUrl && d.path) cache.set(d.path, { url: d.signedUrl, until: Date.now() + 3500 * 1000 }); });
      if (alive) done();
    });
    return () => { alive = false; };
  }, [key]);
  return urls;
}

// A download link for the original file, with its original name.
export async function downloadUrl(f: WorkFile) {
  const { data } = await supabase().storage.from(BUCKET).createSignedUrl(f.path, 600, { download: f.name });
  return data?.signedUrl ?? "";
}

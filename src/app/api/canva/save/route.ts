import { canvaExportPng, pngSize } from "@/lib/canva";
import { withCanva } from "@/lib/canva-route";

export const maxDuration = 60;

// Saves the linked Canva design into the request's files as lossless PNGs at full size, one per page.
export async function POST(request: Request) {
  const c = await withCanva();
  if (c.error) return c.error;
  const { deliverable } = await request.json().catch(() => ({}));
  const { data: row } = await c.supabase.from("deliverables").select("id,files,canva").eq("id", deliverable).maybeSingle<{ id: string; files: unknown[]; canva: { id?: string; title?: string } }>();
  if (!row?.canva?.id) return Response.json({ error: "Link a Canva design first." }, { status: 400 });
  try {
    const urls = await canvaExportPng(c.token, row.canva.id);
    const added = [];
    for (const [i, url] of urls.entries()) {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > 50 * 1024 * 1024) continue;
      const name = `${(row.canva.title || "Canva design").replace(/[^\w\- ]+/g, "").trim() || "Canva design"}${urls.length > 1 ? ` page ${i + 1}` : ""}.png`;
      const path = `${c.uid}/${deliverable}/${Date.now()}-${name.replace(/\s+/g, "_")}`;
      const up = await c.supabase.storage.from("work-files").upload(path, bytes, { contentType: "image/png", upsert: false, cacheControl: "31536000" });
      if (up.error) continue;
      added.push({ path, name, type: "image/png", size: bytes.length, ...pngSize(bytes), at: new Date().toISOString(), from: "canva" });
    }
    if (!added.length) return Response.json({ error: "Canva exported, but the files couldn't be saved. Try again." }, { status: 502 });
    const files = [...(row.files ?? []), ...added];
    await c.supabase.from("deliverables").update({ files }).eq("id", deliverable);
    return Response.json({ files, added: added.length });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Canva didn't respond." }, { status: 502 });
  }
}

import { canvaDesign } from "@/lib/canva";
import { withCanva } from "@/lib/canva-route";

export const maxDuration = 30;

// Links a Canva design to a request and keeps a copy of its preview (Canva's own preview links expire in 15 minutes).
export async function POST(request: Request) {
  const c = await withCanva();
  if (c.error) return c.error;
  const { deliverable, design } = await request.json().catch(() => ({}));
  if (!deliverable || !design) return Response.json({ error: "Missing design." }, { status: 400 });
  const { data: row } = await c.supabase.from("deliverables").select("id").eq("id", deliverable).maybeSingle();
  if (!row) return Response.json({ error: "That request wasn't found." }, { status: 404 });
  try {
    const d = await canvaDesign(c.token, String(design));
    let thumb = "";
    if (d.thumb) {
      const img = await fetch(d.thumb, { signal: AbortSignal.timeout(15000) });
      if (img.ok) {
        const type = img.headers.get("content-type")?.split(";")[0] || "image/png";
        const path = `${c.uid}/${deliverable}/canva-${d.id}-${Date.now()}.${type.includes("jpeg") ? "jpg" : "png"}`;
        const up = await c.supabase.storage.from("work-files").upload(path, new Uint8Array(await img.arrayBuffer()), { contentType: type, upsert: false });
        if (!up.error) thumb = path;
      }
    }
    const canva = { id: d.id, title: d.title, thumb, w: d.w, h: d.h, pages: d.pages };
    await c.supabase.from("deliverables").update({ canva }).eq("id", deliverable);
    return Response.json({ canva });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Canva didn't respond." }, { status: 502 });
  }
}

import { canvaDesigns } from "@/lib/canva";
import { withCanva } from "@/lib/canva-route";

// Your Canva designs, newest first, or matching a search.
export async function GET(request: Request) {
  const c = await withCanva();
  if (c.error) return c.error;
  const q = new URL(request.url).searchParams;
  try { return Response.json(await canvaDesigns(c.token, q.get("q") ?? "", q.get("next") ?? "")); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Canva didn't respond." }, { status: 502 }); }
}

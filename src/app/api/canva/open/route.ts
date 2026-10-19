import { canvaDesign } from "@/lib/canva";
import { APP_URL } from "@/lib/social";
import { withCanva } from "@/lib/canva-route";

// Opens a design in Canva with a fresh editing link (Canva's links expire after 30 days).
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const c = await withCanva();
  if (c.error) return Response.redirect(`${APP_URL}/designs?canva=reconnect`, 303);
  try { return Response.redirect((await canvaDesign(c.token, id)).edit, 303); }
  catch { return Response.redirect(`https://www.canva.com/design/${encodeURIComponent(id)}/edit`, 303); }
}

import { adminClient } from "@/lib/automations-server";
import { canvaConnect } from "@/lib/canva";
import { APP_URL } from "@/lib/social";
import { me, recall, safeBack } from "@/lib/canva-route";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const saved = await recall(["state", "verifier", "back"]);
  const back = `${APP_URL}${safeBack(saved.back)}`;
  const { uid } = await me();
  if (!uid) return Response.redirect(`${APP_URL}/login`, 303);
  if (!saved.state || saved.state !== q.get("state")) return Response.redirect(`${back}?canva=expired`, 303);
  if (q.get("error") || !q.get("code")) return Response.redirect(`${back}?canva=declined`, 303);
  try {
    await canvaConnect(adminClient(), uid, q.get("code")!, saved.verifier);
    return Response.redirect(`${back}?canva=connected`, 303);
  } catch (e) {
    console.error("canva connect", e instanceof Error ? e.message : e);
    return Response.redirect(`${back}?canva=failed`, 303);
  }
}

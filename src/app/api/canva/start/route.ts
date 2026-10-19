import { canvaAuthUrl, canvaReady, pkce } from "@/lib/canva";
import { APP_URL } from "@/lib/social";
import { me, remember, safeBack } from "@/lib/canva-route";

// Sends you to Canva to say yes, then brings you back to the page you came from.
export async function GET(request: Request) {
  const back = safeBack(new URL(request.url).searchParams.get("back"));
  const { uid } = await me();
  if (!uid) return Response.redirect(`${APP_URL}/login`, 303);
  if (!canvaReady()) return Response.redirect(`${APP_URL}${back}?canva=notready`, 303);
  const state = crypto.randomUUID(), { verifier, challenge } = await pkce();
  await remember({ state, verifier, back });
  return Response.redirect(canvaAuthUrl(state, challenge), 303);
}

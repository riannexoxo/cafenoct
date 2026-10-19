import { tiktokAuthUrl, tiktokReady } from "@/lib/social";
import { back, newState, signedInUser } from "@/lib/social-route";

// Sends you to TikTok. Whoever is signed in to TikTok in this browser is the account that connects.
export async function GET() {
  if (!(await signedInUser())) return back({ social_error: "Please sign in again." });
  if (!tiktokReady()) return back({ social_error: "TikTok isn't set up yet. Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in Vercel first." });
  return Response.redirect(tiktokAuthUrl(await newState()), 303);
}

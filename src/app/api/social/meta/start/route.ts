import { metaAuthUrl, metaReady } from "@/lib/social";
import { back, newState, signedInUser } from "@/lib/social-route";

// Sends you to Facebook to pick the Pages (and their Instagram accounts) CafeNoct can read.
export async function GET() {
  if (!(await signedInUser())) return back({ social_error: "Please sign in again." });
  if (!metaReady()) return back({ social_error: "Facebook isn't set up yet. Add META_APP_ID and META_APP_SECRET in Vercel first." });
  return Response.redirect(metaAuthUrl(await newState()), 303);
}

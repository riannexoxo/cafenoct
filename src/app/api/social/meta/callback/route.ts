import { adminClient } from "@/lib/automations-server";
import { metaAccounts, saveAccounts, syncMany, type Account } from "@/lib/social";
import { back, checkState, signedInUser } from "@/lib/social-route";

export const maxDuration = 60;

// Facebook sends you back here after you say yes. Saves the Pages and Instagram accounts, then pulls their posts.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const uid = await signedInUser();
  if (!uid) return back({ social_error: "Please sign in again." });
  if (!(await checkState(q.get("state")))) return back({ social_error: "That sign-in link expired. Try Connect again." });
  if (q.get("error")) return back({ social_error: q.get("error_description") || "Facebook didn't connect." });
  try {
    const list = await metaAccounts(q.get("code") ?? "");
    if (!list.length) return back({ social_error: "Facebook didn't share any Pages. Try again and tick the Pages you manage." });
    const sb = adminClient();
    const n = await saveAccounts(sb, uid, list);
    const { data } = await sb.from("social_accounts").select("id,user_id,client_id,platform,external_id,name,import").eq("user_id", uid).in("platform", ["Facebook", "Instagram"]);
    await syncMany(sb, (data ?? []) as Account[], () => "Asia/Manila");
    return back({ connected: `${n} Facebook and Instagram account${n === 1 ? "" : "s"}` });
  } catch (e) {
    console.error("meta connect", e instanceof Error ? e.message : e);
    return back({ social_error: `Facebook said: ${e instanceof Error ? e.message : "something went wrong"}` });
  }
}

import { adminClient } from "@/lib/automations-server";
import { saveAccounts, syncMany, tiktokAccount, type Account } from "@/lib/social";
import { back, checkState, signedInUser } from "@/lib/social-route";

export const maxDuration = 60;

// TikTok sends you back here after you say yes. Saves the account, then pulls its videos.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const uid = await signedInUser();
  if (!uid) return back({ social_error: "Please sign in again." });
  if (!(await checkState(q.get("state")))) return back({ social_error: "That sign-in link expired. Try Connect again." });
  if (q.get("error")) return back({ social_error: q.get("error_description") || "TikTok didn't connect." });
  try {
    const a = await tiktokAccount(q.get("code") ?? "");
    const sb = adminClient();
    await saveAccounts(sb, uid, [a]);
    const { data } = await sb.from("social_accounts").select("id,user_id,client_id,platform,external_id,name,import").eq("user_id", uid).eq("platform", "TikTok").eq("external_id", a.external_id);
    await syncMany(sb, (data ?? []) as Account[], () => "Asia/Manila");
    return back({ connected: a.name });
  } catch (e) {
    console.error("tiktok connect", e instanceof Error ? e.message : e);
    return back({ social_error: `TikTok said: ${e instanceof Error ? e.message : "something went wrong"}` });
  }
}

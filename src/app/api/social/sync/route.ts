import { adminClient } from "@/lib/automations-server";
import { syncMany, type Account } from "@/lib/social";
import { signedInUser } from "@/lib/social-route";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

// "Sync now": pulls fresh numbers for your connected accounts (or one, with ?id=).
export async function POST(request: Request) {
  const uid = await signedInUser();
  if (!uid) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  const supabase = await createClient();
  const { data: prof } = await supabase.from("profiles").select("settings").maybeSingle<{ settings: { automations?: { tz?: string } } | null }>();
  const sb = adminClient();
  let q = sb.from("social_accounts").select("id,user_id,client_id,platform,external_id,name,import").eq("user_id", uid);
  if (id) q = q.eq("id", id);
  const { data } = await q;
  const r = await syncMany(sb, (data ?? []) as Account[], () => prof?.settings?.automations?.tz || "Asia/Manila");
  return Response.json(r);
}

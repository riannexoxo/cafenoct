import { adminClient } from "@/lib/automations-server";
import { me } from "@/lib/canva-route";

export async function POST() {
  const { uid } = await me();
  if (!uid) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const admin = adminClient();
  await Promise.all([admin.from("canva_tokens").delete().eq("user_id", uid), admin.from("canva_connections").delete().eq("user_id", uid)]);
  return Response.json({ ok: true });
}

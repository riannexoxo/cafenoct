import { createClient } from "@/lib/supabase/server";
import { pushReady, pushTo } from "@/lib/automations-server";

// Sends a test reminder to every device you turned on.
export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return Response.json({ error: "Please sign in again." }, { status: 401 });
  if (!pushReady()) return Response.json({ error: "Phone reminders aren't set up on the server yet." }, { status: 503 });
  const { data: subs } = await supabase.from("push_subs").select("id,endpoint,p256dh,auth");
  if (!subs?.length) return Response.json({ error: "No devices are turned on yet." }, { status: 400 });
  const sent = await pushTo(supabase, subs, { title: "CafeNoct reminders are on ☕", body: "This is how your EOD, task, invoice and meeting nudges will look.", url: "/automations" });
  return Response.json({ sent });
}

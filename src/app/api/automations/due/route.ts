import { createClient } from "@/lib/supabase/server";
import { gather } from "@/lib/automations-server";
import { autoSettings, dueNudges, plannedNudges } from "@/lib/automations";
import { partsIn, zonedMs } from "@/lib/tz";
import { addDays } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Your reminders: what's due right now (the Mac app shows these while it's open),
// or with ?day=1, everything planned for today (the Automations page preview).
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub as string | undefined;
  if (!uid) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const { data: prof } = await supabase.from("profiles").select("settings,gcal_url").maybeSingle<{ settings: { automations?: unknown } | null; gcal_url: string | null }>();
  if (!prof?.settings?.automations) return Response.json({ on: false, nudges: [] });
  const s = autoSettings(prof.settings.automations);
  const now = Date.now();
  const data = await gather(supabase, uid, s, prof.gcal_url ?? "", now);
  if (new URL(request.url).searchParams.get("day")) {
    const d = partsIn(now, s.tz).date, from = zonedMs(d, 0, s.tz), to = zonedMs(addDays(d, 1), 0, s.tz);
    const { data: log } = await supabase.from("automation_log").select("key,title,body,url,sent_at").order("sent_at", { ascending: false }).limit(12);
    return Response.json({ on: true, nudges: plannedNudges(s, data, now).filter((n) => n.at >= from && n.at < to), sent: log ?? [] });
  }
  return Response.json({ on: true, nudges: dueNudges(s, data, now) });
}

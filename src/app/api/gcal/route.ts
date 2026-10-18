import { createClient } from "@/lib/supabase/server";
import { feedUrl, parseIcs } from "@/lib/ics";

// Your Google Calendar events for a date range, read from the private iCal address saved in Settings.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const { data: prof } = await supabase.from("profiles").select("gcal_url").maybeSingle<{ gcal_url: string }>();
  if (!prof?.gcal_url) return Response.json({ connected: false, events: [] });

  const q = new URL(request.url).searchParams;
  const from = Date.parse(q.get("from") ?? ""), to = Date.parse(q.get("to") ?? "");
  if (!from || !to || to <= from || to - from > 70 * 864e5) return Response.json({ error: "Pick a shorter date range." }, { status: 400 });
  const url = feedUrl(prof.gcal_url);
  if (!url) return Response.json({ connected: true, error: "That calendar address isn't one CafeNoct can read. Paste the secret iCal address from Google Calendar.", events: [] });

  try {
    const res = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
    if (!res.ok) return Response.json({ connected: true, error: res.status === 404 ? "Google says that calendar address doesn't exist anymore. Paste the new secret address in Settings." : "Google Calendar didn't respond. It will try again soon.", events: [] });
    const text = await res.text();
    if (text.length > 15_000_000) return Response.json({ connected: true, error: "That calendar is too large to read.", events: [] });
    return Response.json({ connected: true, events: parseIcs(text, from, to) });
  } catch (e) {
    console.error("gcal error", e instanceof Error ? e.message : e);
    return Response.json({ connected: true, error: "Couldn't read your Google Calendar right now.", events: [] });
  }
}

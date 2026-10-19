import { adminClient, gather, pushTo } from "@/lib/automations-server";
import { autoSettings, dueNudges } from "@/lib/automations";
import { syncMany, type Account } from "@/lib/social";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = { user_id: string; settings: { automations?: unknown } | null; gcal_url: string | null };

// Runs every 5 minutes (Supabase pg_cron calls it with a key kept in the Vault).
// Sends each due reminder once to every device that turned notifications on.
export async function GET(request: Request) {
  const key = request.headers.get("x-cron-key") ?? "";
  if (key.length < 32) return new Response("Not allowed", { status: 401 });
  const sb = adminClient();
  const { data: ok } = await sb.rpc("cron_key_ok", { k: key });
  if (ok !== true) return new Response("Not allowed", { status: 401 });

  const [{ data: subs }, { data: profiles }] = await Promise.all([
    sb.from("push_subs").select("id,user_id,endpoint,p256dh,auth"),
    sb.from("profiles").select("user_id,settings,gcal_url").not("settings->automations", "is", null),
  ]);
  const now = Date.now();
  let sent = 0;
  for (const p of (profiles ?? []) as Row[]) {
    const mine = (subs ?? []).filter((x) => x.user_id === p.user_id);
    if (!mine.length) continue;
    const s = autoSettings(p.settings?.automations);
    const due = dueNudges(s, await gather(sb, p.user_id, s, p.gcal_url ?? "", now), now);
    if (!due.length) continue;
    const { data: done } = await sb.from("automation_log").select("key").eq("user_id", p.user_id).in("key", due.map((n) => n.key));
    const fresh = due.filter((n) => !(done ?? []).some((d) => d.key === n.key));
    for (const n of fresh.slice(0, 5)) {
      // Log first so a slow run and the next one never both send it.
      const { error } = await sb.from("automation_log").insert({ user_id: p.user_id, key: n.key, title: n.title, body: n.body, url: n.url });
      if (error) continue;
      sent += await pushTo(sb, mine, { title: n.title, body: n.body, url: n.url, tag: n.key });
    }
  }

  // Connected social accounts refresh their numbers every 6 hours, a few per run.
  const stale = new Date(now - 6 * 3600000).toISOString();
  const { data: accounts } = await sb.from("social_accounts").select("id,user_id,client_id,platform,external_id,name,import")
    .or(`last_synced_at.is.null,last_synced_at.lt.${stale}`).order("last_synced_at", { ascending: true, nullsFirst: true }).limit(4);
  const tz = (uid: string) => autoSettings(((profiles ?? []) as Row[]).find((p) => p.user_id === uid)?.settings?.automations).tz;
  const social = accounts?.length ? await syncMany(sb, accounts as Account[], tz) : null;

  return Response.json({ ok: true, sent, synced: social ? social.updated + social.added : 0 });
}

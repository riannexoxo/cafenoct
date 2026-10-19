// Server side of Automations: loads what the reminders need and sends them to your devices.
import webpush from "web-push";
import { createClient as createAdmin, type SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/dates";
import { EVENT_COLS, type CalEvent, type GEvent } from "@/lib/cal";
import { feedUrl, parseIcs } from "@/lib/ics";
import { partsIn } from "@/lib/tz";
import { supabaseUrl } from "@/lib/supabase/env";
import type { AutoData, AutoInvoice, AutoReport, AutoSettings, AutoTask } from "@/lib/automations";
import type { Client } from "@/lib/types";

// Only for the scheduled check: it reads every account, so it uses the server's secret key.
export function adminClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createAdmin(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function googleSoon(gcal: string, now: number): Promise<GEvent[]> {
  const url = feedUrl(gcal);
  if (!url) return [];
  try {
    const res = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const text = await res.text();
    return text.length > 15_000_000 ? [] : parseIcs(text, now - 3600000, now + 864e5);
  } catch { return []; }
}

// Everything one person's reminders look at. Works with the signed-in client or the secret one.
export async function gather(sb: SupabaseClient, userId: string, s: AutoSettings, gcal: string, now = Date.now()): Promise<AutoData> {
  const today = partsIn(now, s.tz).date;
  const [clients, tasks, invoices, events, reports, google] = await Promise.all([
    sb.from("clients").select("*").eq("user_id", userId),
    sb.from("tasks").select("id,title,status,due_date,client_id,repeat").eq("user_id", userId).neq("status", "done").lte("due_date", today),
    sb.from("invoices").select("id,number,client_id,due_date,status,currency,items").eq("user_id", userId).eq("status", "sent"),
    sb.from("events").select(EVENT_COLS).eq("user_id", userId).eq("kind", "meeting"),
    sb.from("reports").select("client_id,kind,period_start").eq("user_id", userId).gte("period_start", addDays(today, -9)),
    s.meetings.on && s.meetings.google && gcal ? googleSoon(gcal, now) : Promise.resolve([] as GEvent[]),
  ]);
  return {
    clients: (clients.data ?? []) as Client[],
    tasks: (tasks.data ?? []) as AutoTask[],
    invoices: (invoices.data ?? []) as AutoInvoice[],
    events: (events.data ?? []) as CalEvent[],
    reports: (reports.data ?? []) as AutoReport[],
    google,
  };
}

let ready = false;
export function pushReady() {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!ready) { webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://cafenoct.vercel.app", pub, priv); ready = true; }
  return true;
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

// Sends one notification to each device. Devices that unsubscribed are removed.
export async function pushTo(sb: SupabaseClient, subs: Sub[], msg: { title: string; body: string; url: string; tag?: string }) {
  if (!pushReady()) return 0;
  let sent = 0;
  await Promise.all(subs.map(async (x) => {
    try {
      await webpush.sendNotification({ endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } }, JSON.stringify(msg), { TTL: 3600, urgency: "high" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from("push_subs").delete().eq("id", x.id);
      else console.error("push failed", code ?? (e instanceof Error ? e.message : e));
    }
  }));
  return sent;
}

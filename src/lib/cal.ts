// Calendar and time helpers. Minutes are counted from midnight on the viewer's device.
import { pad, parseYmd, weekday, ymd } from "@/lib/dates";
import type { Client } from "@/lib/types";

export const HH = 48; // pixels per hour on the calendar grid

export type TimeEntry = { id: string; client_id: string | null; started_at: string; minutes: number; note: string; source: string };
export type CalEvent = { id: string; client_id: string | null; title: string; starts_at: string; ends_at: string; notes: string };

export const toMin = (s: string | null | undefined) => { if (!s) return 0; const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
export const minToTime = (m: number) => { const x = Math.max(0, Math.min(m, 1439)); return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };
export const snap15 = (m: number) => Math.round(m / 15) * 15;
export const fmtClock = (m: number) => { const hh = Math.floor(m / 60) % 24, mm = Math.round(m % 60); return `${hh % 12 || 12}${mm ? ":" + pad(mm) : ""}${hh < 12 ? "am" : "pm"}`; };
export const hm = (minutes: number) => { const h = Math.floor(minutes / 60), m = Math.round(minutes % 60); return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`; };

// A moment as the local date and minutes since local midnight.
export const localParts = (iso: string) => { const d = new Date(iso); return { date: ymd(d), min: d.getHours() * 60 + d.getMinutes() }; };
// A local date plus minutes, back to a moment Supabase can store. 1440 minutes rolls to the next day.
export const isoAt = (date: string, min: number) => { const d = parseYmd(date); d.setMinutes(min); return d.toISOString(); };

// Usual client hours on a day. Clients without a start time stack from 8:00.
export function planBlocks(d: string, clients: Client[]) {
  let cursor = 8 * 60;
  const out: { c: Client; s: number; e: number }[] = [];
  clients
    .filter((c) => c.status === "Active" && c.hours_per_day && c.work_days.includes(weekday(d)))
    .sort((a, b) => (a.start_time ? 0 : 1) - (b.start_time ? 0 : 1) || (a.start_time ?? "").localeCompare(b.start_time ?? ""))
    .forEach((c) => {
      const len = (c.hours_per_day ?? 0) * 60, s = c.start_time ? toMin(c.start_time) : cursor;
      out.push({ c, s, e: Math.min(1440, s + len) });
      if (!c.start_time) cursor = s + len;
    });
  return out.sort((a, b) => a.s - b.s);
}

// Overlapping blocks share the width side by side.
export function laneLayout<T extends { s: number; e: number }>(items: T[]) {
  const out = items.map((it) => ({ ...it, lane: 0, lanes: 1 })).sort((a, b) => a.s - b.s || b.e - a.e);
  let group: typeof out = [], groupEnd = -1;
  const flush = () => {
    const ends: number[] = [];
    group.forEach((it) => { let l = ends.findIndex((e) => e <= it.s); if (l < 0) { l = ends.length; ends.push(0); } ends[l] = it.e; it.lane = l; });
    group.forEach((it) => { it.lanes = Math.max(1, ends.length); });
    group = [];
  };
  out.forEach((it) => { if (it.s >= groupEnd) { flush(); groupEnd = it.e; } else groupEnd = Math.max(groupEnd, it.e); group.push(it); });
  flush();
  return out;
}

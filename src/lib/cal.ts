// Calendar and time helpers. Minutes are counted from midnight on the viewer's device.
import { addDays, pad, weekday } from "@/lib/dates";
import { deviceTz, partsIn, zonedIso, zonedMs } from "@/lib/tz";
import type { Client } from "@/lib/types";

export const HH = 48; // pixels per hour on the calendar grid

export type TimeEntry = { id: string; client_id: string | null; started_at: string; minutes: number; note: string; source: string };
export type CalEvent = { id: string; client_id: string | null; title: string; starts_at: string; ends_at: string; notes: string };

export const toMin = (s: string | null | undefined) => { if (!s) return 0; const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
export const minToTime = (m: number) => { const x = Math.max(0, Math.min(m, 1439)); return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };
export const snap15 = (m: number) => Math.round(m / 15) * 15;
export const fmtClock = (m: number) => { const hh = Math.floor(m / 60) % 24, mm = Math.round(m % 60); return `${hh % 12 || 12}${mm ? ":" + pad(mm) : ""}${hh < 12 ? "am" : "pm"}`; };
export const hm = (minutes: number) => { const h = Math.floor(minutes / 60), m = Math.round(minutes % 60); return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`; };

// A moment as the date and minutes since midnight in a time zone (yours unless another is given).
export const localParts = (iso: string, tz = deviceTz()) => partsIn(iso, tz);
// A date plus minutes in a time zone, back to a moment Supabase can store. 1440 minutes rolls to the next day.
export const isoAt = (date: string, min: number, tz = deviceTz()) => zonedIso(date, min, tz);

export type Plan = { c: Client; s: number; e: number; tz: string; theirS: number; theirE: number };
// Usual client hours that fall on day d, seen from time zone tz. Each client's hours are in their own
// time zone, so 9am–4pm Eastern lands in the evening in Manila and can spill into the next day.
// Clients without a start time stack from 8:00 their time.
export function planBlocks(d: string, clients: Client[], tz = deviceTz()) {
  const dayStart = zonedMs(d, 0, tz), dayEnd = zonedMs(addDays(d, 1), 0, tz);
  const cursors = new Map<string, number>();
  const out: Plan[] = [];
  const list = clients
    .filter((c) => c.status === "Active" && c.hours_per_day && c.work_days.length)
    .sort((a, b) => (a.start_time ? 0 : 1) - (b.start_time ? 0 : 1) || (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  for (const cd of [addDays(d, -1), d, addDays(d, 1)]) {
    for (const c of list) {
      if (!c.work_days.includes(weekday(cd))) continue;
      const ctz = c.timezone || tz, key = `${ctz}|${cd}`, len = (c.hours_per_day ?? 0) * 60;
      const s = c.start_time ? toMin(c.start_time) : cursors.get(key) ?? 8 * 60;
      if (!c.start_time) cursors.set(key, s + len);
      const a = zonedMs(cd, s, ctz), b = a + len * 60000;
      if (b <= dayStart || a >= dayEnd) continue;
      out.push({ c, tz: ctz, theirS: s, theirE: s + len, s: Math.round((Math.max(a, dayStart) - dayStart) / 60000), e: Math.round((Math.min(b, dayEnd) - dayStart) / 60000) });
    }
  }
  return out.sort((x, y) => x.s - y.s);
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

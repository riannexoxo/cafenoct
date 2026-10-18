// Calendar and time helpers. Minutes are counted from midnight on the viewer's device.
import { addDays, pad, weekday } from "@/lib/dates";
import { deviceTz, partsIn, zonedIso, zonedMs } from "@/lib/tz";
import type { Client } from "@/lib/types";

export const HH = 48; // pixels per hour on the calendar grid

export type TimeEntry = { id: string; client_id: string | null; started_at: string; minutes: number; note: string; source: string };
export type CalEvent = {
  id: string; client_id: string | null; title: string; starts_at: string; ends_at: string; notes: string;
  kind: "block" | "meeting"; link: string; repeat: "none" | "daily" | "weekdays" | "weekly" | "monthly";
  repeat_days: number[]; repeat_until: string | null; skip_dates: string[]; tz: string;
};
export const EVENT_COLS = "id,client_id,title,starts_at,ends_at,notes,kind,link,repeat,repeat_days,repeat_until,skip_dates,tz";
// An event from Google Calendar (read only).
export type GEvent = { id: string; title: string; start: string; end: string; allDay: boolean; link: string; location: string; description: string };
// One showing of an event: a one-off event, one day of a repeating series, or a Google event.
export type Occurrence = { ev: CalEvent; key: string; start: number; end: number; occ: string | null; google?: GEvent };

export const toMin = (s: string | null | undefined) => { if (!s) return 0; const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
export const minToTime = (m: number) => { const x = Math.max(0, Math.min(m, 1439)); return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };
export const snap15 = (m: number) => Math.round(m / 15) * 15;
export const fmtClock = (m: number) => { const hh = Math.floor(m / 60) % 24, mm = Math.round(m % 60); return `${hh % 12 || 12}${mm ? ":" + pad(mm) : ""}${hh < 12 ? "am" : "pm"}`; };
export const hm = (minutes: number) => { const h = Math.floor(minutes / 60), m = Math.round(minutes % 60); return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`; };

// A moment as the date and minutes since midnight in a time zone (yours unless another is given).
export const localParts = (iso: string, tz = deviceTz()) => partsIn(iso, tz);
// A date plus minutes in a time zone, back to a moment Supabase can store. 1440 minutes rolls to the next day.
export const isoAt = (date: string, min: number, tz = deviceTz()) => zonedIso(date, min, tz);

export type Plan = { c: Client; s: number; e: number; tz: string; theirS: number; theirE: number; starts: boolean };
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
      const ctz = c.hours_tz || c.timezone || tz, key = `${ctz}|${cd}`, len = (c.hours_per_day ?? 0) * 60;
      const fixed = c.day_starts?.[weekday(cd)] || c.start_time;
      const s = fixed ? toMin(fixed) : cursors.get(key) ?? 8 * 60;
      if (!fixed) cursors.set(key, s + len);
      const a = zonedMs(cd, s, ctz), b = a + len * 60000;
      if (b <= dayStart || a >= dayEnd) continue;
      out.push({ c, tz: ctz, theirS: s, theirE: s + len, starts: a >= dayStart, s: Math.round((Math.max(a, dayStart) - dayStart) / 60000), e: Math.round((Math.min(b, dayEnd) - dayStart) / 60000) });
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

// Does this client's usual shift start on day d (in your time)? A night shift that runs past
// midnight counts for the day it starts.
export const worksOn = (d: string, c: Client) => planBlocks(d, [c]).some((p) => p.starts);

// The next date after `after` that a repeating task should come back on.
export function nextDue(repeat: string, after: string, c?: Client) {
  if (repeat === "weekly") return addDays(after, 7);
  if (repeat === "monthly") {
    const [y, m, d] = after.split("-").map(Number);
    const last = new Date(y, m + 1, 0).getDate();
    return `${m === 12 ? y + 1 : y}-${pad(m === 12 ? 1 : m + 1)}-${pad(Math.min(d, last))}`;
  }
  const flexible = !c || !c.work_days.length || !c.hours_per_day;
  for (let i = 1; i <= 14; i++) {
    const d = addDays(after, i);
    if (flexible || worksOn(d, c)) return d;
  }
  return addDays(after, 1);
}

// Does a repeating series happen on date dd (in the series' own time zone)?
function occursOn(ev: CalEvent, dd: string, first: string) {
  const wd = weekday(dd);
  switch (ev.repeat) {
    case "daily": return true;
    case "weekdays": return wd <= 5;
    case "weekly": return ev.repeat_days?.length ? ev.repeat_days.includes(wd) : wd === weekday(first);
    case "monthly": return dd.slice(8) === first.slice(8);
    default: return false;
  }
}

// Every showing of these events between two moments. Repeating series repeat in their own time zone,
// so a 10am Eastern meeting stays at 10am Eastern through daylight saving changes.
export function expandEvents(events: CalEvent[], fromMs: number, toMs: number, fallbackTz = deviceTz()) {
  const out: Occurrence[] = [];
  for (const ev of events) {
    const s = Date.parse(ev.starts_at), len = Math.max(15 * 60000, Date.parse(ev.ends_at) - s);
    if (!ev.repeat || ev.repeat === "none") {
      if (s + len > fromMs && s < toMs) out.push({ ev, key: ev.id, start: s, end: s + len, occ: null });
      continue;
    }
    const tz = ev.tz || fallbackTz, first = partsIn(s, tz), last = partsIn(toMs, tz).date;
    let dd = partsIn(Math.max(s, fromMs - len), tz).date;
    for (let i = 0; dd <= last && i < 400; i++, dd = addDays(dd, 1)) {
      if (dd < first.date) continue;
      if (ev.repeat_until && dd > ev.repeat_until) break;
      if (ev.skip_dates?.includes(dd) || !occursOn(ev, dd, first.date)) continue;
      const a = zonedMs(dd, first.min, tz);
      if (a + len > fromMs && a < toMs) out.push({ ev, key: `${ev.id}:${dd}`, start: a, end: a + len, occ: dd });
    }
  }
  return out;
}

export const REPEAT_LABELS: Record<CalEvent["repeat"], string> = { none: "Does not repeat", daily: "Every day", weekdays: "Every weekday (Mon–Fri)", weekly: "Every week", monthly: "Every month" };

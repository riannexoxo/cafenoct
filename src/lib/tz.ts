// Time zones. Uses the time zone data built into every browser, so daylight saving is handled
// automatically and nothing needs to be fetched from an outside service.
import { pad } from "@/lib/dates";

export const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const fmts = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    fmts.set(tz, f);
  }
  return f;
}
function wall(ms: number, tz: string) {
  const p: Record<string, number> = {};
  fmt(tz).formatToParts(new Date(ms)).forEach((x) => { if (x.type !== "literal") p[x.type] = Number(x.value); });
  return { y: p.year, mo: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}

// A moment as the date and minutes since midnight in a time zone.
export function partsIn(at: number | string, tz: string) {
  const w = wall(typeof at === "string" ? Date.parse(at) : at, tz);
  return { date: `${w.y}-${pad(w.mo)}-${pad(w.d)}`, min: w.h * 60 + w.mi };
}
// How far a time zone is ahead of UTC at a moment, in minutes.
function offset(ms: number, tz: string) {
  const w = wall(ms, tz);
  return (Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000) / 60000;
}
// A date plus minutes in a time zone, as a moment. 1440 minutes rolls to the next day.
export function zonedMs(date: string, min: number, tz: string) {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, min);
  const o1 = offset(guess - offset(guess, tz) * 60000, tz);
  return guess - o1 * 60000;
}
export const zonedIso = (date: string, min: number, tz: string) => new Date(zonedMs(date, min, tz)).toISOString();
export const todayIn = (tz: string) => partsIn(Date.now(), tz).date;

// "ET", "PT", "PHT"…
export function tzShort(tz: string, at = Date.now()) {
  for (const timeZoneName of ["shortGeneric", "short"] as const) {
    try {
      const n = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName }).formatToParts(new Date(at)).find((x) => x.type === "timeZoneName")?.value;
      if (n && !/^GMT[+-]/.test(n)) return n;
    } catch {}
  }
  const o = offset(at, tz);
  return `GMT${o >= 0 ? "+" : "-"}${Math.floor(Math.abs(o) / 60)}${Math.abs(o) % 60 ? ":" + pad(Math.abs(o) % 60) : ""}`;
}

// Time zones offered on the client form.
export const ZONES: [string, string][] = [
  ["America/New_York", "Eastern (New York, Miami)"],
  ["America/Chicago", "Central (Chicago, Dallas)"],
  ["America/Denver", "Mountain (Denver)"],
  ["America/Phoenix", "Arizona (no daylight saving)"],
  ["America/Los_Angeles", "Pacific (Los Angeles, Seattle)"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
  ["America/Toronto", "Toronto"],
  ["America/Vancouver", "Vancouver"],
  ["Europe/London", "London"],
  ["Europe/Dublin", "Dublin"],
  ["Europe/Paris", "Central Europe (Paris, Berlin)"],
  ["Asia/Dubai", "Dubai"],
  ["Asia/Manila", "Philippines"],
  ["Asia/Singapore", "Singapore"],
  ["Australia/Perth", "Perth"],
  ["Australia/Brisbane", "Brisbane"],
  ["Australia/Sydney", "Sydney, Melbourne"],
  ["Pacific/Auckland", "New Zealand"],
];

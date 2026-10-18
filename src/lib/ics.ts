import ICAL from "ical.js";
import type { GEvent } from "@/lib/cal";

// Calendar feeds we read. Only these hosts, so the server never fetches anything else.
const HOSTS = [/^calendar\.google\.com$/, /^p\d+-caldav\.icloud\.com$/, /^outlook\.(live|office365)\.com$/, /^outlook\.office\.com$/];

export function feedUrl(raw: string) {
  try {
    const u = new URL(raw.trim().replace(/^webcal:\/\//i, "https://"));
    if (u.protocol !== "https:" || !HOSTS.some((h) => h.test(u.hostname))) return null;
    return u.href;
  } catch { return null; }
}

const plain = (s: string) => s
  .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\n{3,}/g, "\n\n").trim();
const MEETING = /https?:\/\/[^\s<>"')]*(zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|whereby\.com|webex\.com|gotomeeting\.com)[^\s<>"')]*/i;
const ANY_URL = /https?:\/\/[^\s<>"')]+/i;

// Every event in an iCal feed between two moments, with repeating events expanded.
export function parseIcs(text: string, from: number, to: number): GEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  root.getAllSubcomponents("vtimezone").forEach((z) => ICAL.TimezoneService.register(z));
  const masters: ICAL.Event[] = [];
  const exceptions = new Map<string, ICAL.Event[]>();
  for (const v of root.getAllSubcomponents("vevent")) {
    if (String(v.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") continue;
    const e = new ICAL.Event(v);
    if (e.isRecurrenceException()) exceptions.set(e.uid, [...(exceptions.get(e.uid) ?? []), e]);
    else masters.push(e);
  }
  const out: GEvent[] = [];
  const linkOf = (e: ICAL.Event) => {
    const desc = plain(e.description || ""), loc = e.location || "";
    const conf = String(e.component.getFirstPropertyValue("x-google-conference") ?? "");
    return conf || (loc.match(MEETING) ?? desc.match(MEETING) ?? loc.match(ANY_URL) ?? desc.match(ANY_URL))?.[0] || "";
  };
  const push = (e: ICAL.Event, s: ICAL.Time, en: ICAL.Time, fallbackLink = "") => {
    const allDay = s.isDate, a = s.toJSDate().getTime(), b = en.toJSDate().getTime();
    if (!(b > from && a < to) || out.length > 3000) return;
    const desc = plain(e.description || ""), loc = e.location || "";
    const link = linkOf(e) || fallbackLink;
    out.push({
      id: `${e.uid}:${a}`, title: e.summary || "Busy", allDay, link, location: loc, description: desc.slice(0, 4000),
      start: allDay ? s.toString().slice(0, 10) : new Date(a).toISOString(),
      end: allDay ? en.toString().slice(0, 10) : new Date(Math.max(b, a + 15 * 60000)).toISOString(),
    });
  };
  for (const m of masters) {
    exceptions.get(m.uid)?.forEach((x) => m.relateException(x));
    if (!m.isRecurring()) { push(m, m.startDate, m.endDate || m.startDate); continue; }
    const it = m.iterator(), seriesLink = linkOf(m);
    for (let i = 0, next = it.next(); next && i < 20000; i++, next = it.next()) {
      if (next.toJSDate().getTime() >= to) break;
      const d = m.getOccurrenceDetails(next);
      push(d.item, d.startDate, d.endDate, seriesLink);
    }
  }
  return out;
}

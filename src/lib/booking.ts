// Free times on a public booking page, worked out the same way booking_create checks them:
// on a 15-minute grid from day_start, on allowed days, inside the notice and horizon, clear of busy times.
import { addDays, weekday } from "@/lib/dates";
import { todayIn, zonedMs } from "@/lib/tz";

export type BookingInfo = {
  title: string; intro: string; duration_min: number; days: number[]; day_start: string; day_end: string; tz: string;
  notice_hours: number; horizon_days: number; owner: string | null; busy: [string, string][];
};

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };

export function freeSlots(b: BookingInfo, now: number): number[] {
  const dur = b.duration_min * 60000, from = toMin(b.day_start), to = toMin(b.day_end);
  const earliest = now + b.notice_hours * 36e5, latest = now + b.horizon_days * 864e5;
  const busy = (b.busy ?? []).map(([s, e]) => [Date.parse(s), Date.parse(e)]);
  const out: number[] = [];
  let date = todayIn(b.tz);
  for (let i = 0; i <= b.horizon_days + 1; i++, date = addDays(date, 1)) {
    if (!b.days.includes(weekday(date))) continue;
    for (let m = from; m + b.duration_min <= to; m += 15) {
      const s = zonedMs(date, m, b.tz), e = s + dur;
      if (s < earliest || s > latest) continue;
      if (busy.some(([bs, be]) => bs < e && s < be)) continue;
      out.push(s);
    }
  }
  return out;
}

// A one-event calendar file for the visitor's own calendar app.
export function icsHref(title: string, start: number, end: number, uid: string) {
  const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => "\\" + c).replace(/\r?\n/g, "\\n");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CafeNoct//Booking//EN", "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${utc(Date.now())}`,
    `DTSTART:${utc(start)}`, `DTEND:${utc(end)}`, `SUMMARY:${esc(title)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
}

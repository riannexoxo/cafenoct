// Automations: which reminders are due and when. Used by the every-5-minutes check on the server,
// by the Mac app while it's open, and by the Automations page preview.
import { addDays, parseYmd, weekStartYmd, weekday } from "@/lib/dates";
import { expandEvents, planBlocks, toMin, type CalEvent, type GEvent } from "@/lib/cal";
import { partsIn, zonedMs } from "@/lib/tz";
import { total } from "@/lib/invoices";
import { clientLabel, type Client } from "@/lib/types";

export type AutoSettings = {
  tz: string; // your time zone, saved from your device
  eod: { on: boolean; before: number; skip: string[] }; // minutes before a shift ends; clients to leave out
  tasks: { on: boolean; at: string }; // daily check-in time, HH:MM
  invoices: { on: boolean; days: number }; // nudge this many days before the due date
  meetings: { on: boolean; before: number; google: boolean };
  nextUp: { on: boolean }; // after you finish a task, show what's next
};

export const AUTO_DEFAULTS: AutoSettings = {
  tz: "Asia/Manila",
  eod: { on: true, before: 30, skip: [] },
  tasks: { on: true, at: "08:00" },
  invoices: { on: true, days: 2 },
  meetings: { on: true, before: 10, google: true },
  nextUp: { on: true },
};

export function autoSettings(raw: unknown): AutoSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<AutoSettings>;
  const d = AUTO_DEFAULTS;
  return { tz: r.tz || d.tz, eod: { ...d.eod, ...r.eod }, tasks: { ...d.tasks, ...r.tasks }, invoices: { ...d.invoices, ...r.invoices }, meetings: { ...d.meetings, ...r.meetings }, nextUp: { ...d.nextUp, ...r.nextUp } };
}

export type AutoTask = { id: string; title: string; status: string; due_date: string | null; client_id: string | null; repeat: string };
export type AutoInvoice = { id: string; number: string; client_id: string | null; due_date: string | null; status: string; currency: string; items: { desc: string; qty: number; rate: number }[] };
export type AutoReport = { client_id: string; kind: string; period_start: string };
export type AutoData = { clients: Client[]; tasks: AutoTask[]; invoices: AutoInvoice[]; events: CalEvent[]; google: GEvent[]; reports: AutoReport[] };

// One reminder. It goes out once, any time between `at` and `until`.
export type Nudge = { key: string; kind: "eod" | "tasks" | "invoice" | "meeting"; title: string; body: string; url: string; at: number; until: number };

const daysBetween = (a: string, b: string) => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 864e5);
const money = (n: number, cur: string) => { try { return n.toLocaleString("en-US", { style: "currency", currency: cur || "USD" }); } catch { return `${cur} ${n}`; } };

// Every reminder that could go out around this moment (from a day back to a day ahead).
export function plannedNudges(s: AutoSettings, d: AutoData, now: number): Nudge[] {
  const out: Nudge[] = [];
  const tz = s.tz, todayD = partsIn(now, tz).date, endOfDay = zonedMs(addDays(todayD, 1), 0, tz);
  const label = (id: string | null) => { const c = d.clients.find((x) => x.id === id); return c ? clientLabel(c) : ""; };
  const at = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });

  // EOD report due near the end of each client's shift.
  if (s.eod.on) {
    for (const c of d.clients) {
      if (c.status !== "Active" || c.personal || !c.hours_per_day || !c.work_days?.length || s.eod.skip.includes(c.id)) continue;
      const ctz = c.timezone || tz, weekly = c.report_cadence === "Weekly", lastDay = Math.max(...c.work_days);
      const cToday = partsIn(now, ctz).date;
      for (const day of [addDays(cToday, -1), cToday, addDays(cToday, 1)]) {
        if (weekly && weekday(day) !== lastDay) continue;
        for (const p of planBlocks(day, [c], ctz).filter((x) => x.starts)) {
          const end = zonedMs(day, 0, ctz) + (p.s + p.theirE - p.theirS) * 60000;
          const kind = weekly ? "week" : "day", period = weekly ? weekStartYmd(day) : day;
          if (d.reports.some((r) => r.client_id === c.id && r.kind === kind && r.period_start === period)) continue;
          out.push({
            key: `eod:${c.id}:${day}`, kind: "eod", url: `/clients/${c.id}/reports`,
            title: `${weekly ? "Weekly report" : "EOD"} for ${clientLabel(c)}`,
            body: `Your shift ends at ${at(end)}. Tap to open it. It is already drafted from your logged time.`,
            at: end - s.eod.before * 60000, until: end + 4 * 3600000,
          });
        }
      }
    }
  }

  const digestAt = zonedMs(todayD, toMin(s.tasks.at || "08:00"), tz);

  // Morning check-in: tasks due today or overdue, including repeating ones.
  if (s.tasks.on) {
    const open = d.tasks.filter((t) => t.status !== "done" && t.due_date && t.due_date <= todayD)
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
    if (open.length) {
      const late = open.filter((t) => t.due_date! < todayD).length, dueNow = open.length - late;
      const parts = [dueNow && `${dueNow} due today`, late && `${late} overdue`].filter(Boolean).join(", ");
      const names = open.slice(0, 3).map((t) => t.title + (label(t.client_id) ? ` (${label(t.client_id)})` : "")).join(" · ");
      out.push({ key: `tasks:${todayD}`, kind: "tasks", url: "/work", title: `Today's check-in: ${parts}`, body: names + (open.length > 3 ? ` +${open.length - 3} more` : ""), at: digestAt, until: endOfDay });
    }
  }

  // Invoices coming due, then overdue (every 3 days until paid).
  if (s.invoices.on) {
    for (const inv of d.invoices) {
      if (inv.status !== "sent" || !inv.due_date) continue;
      const left = daysBetween(todayD, inv.due_date), who = label(inv.client_id) || "a client", amt = money(total(inv), inv.currency);
      const url = inv.client_id ? `/clients/${inv.client_id}/invoices` : "/invoices";
      if (left >= 0 && left <= s.invoices.days) {
        out.push({ key: `inv:${inv.id}:soon`, kind: "invoice", url, at: digestAt, until: endOfDay, title: `Invoice ${inv.number} is due ${left === 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`}`, body: `${amt} from ${who}. A gentle reminder to them could help.` });
      } else if (left < 0) {
        const late = -left;
        out.push({ key: `inv:${inv.id}:late:${Math.floor((late - 1) / 3)}`, kind: "invoice", url, at: digestAt, until: endOfDay, title: `Invoice ${inv.number} is ${late} day${late === 1 ? "" : "s"} overdue`, body: `${amt} from ${who}. Mark it paid if it came in, or send a follow-up.` });
      }
    }
  }

  // A heads-up before meetings (yours and, if connected, Google Calendar's).
  if (s.meetings.on) {
    const before = s.meetings.before * 60000;
    for (const o of expandEvents(d.events.filter((e) => e.kind === "meeting"), now - 864e5, now + 864e5, tz)) {
      const who = label(o.ev.client_id);
      out.push({ key: `meet:${o.key}`, kind: "meeting", url: o.ev.link || "/calendar", at: o.start - before, until: o.start + 5 * 60000, title: `${o.ev.title || "Meeting"} at ${at(o.start)}`, body: [who, o.ev.link ? "Tap to join." : "Starts soon."].filter(Boolean).join(" · ") });
    }
    if (s.meetings.google) {
      for (const g of d.google) {
        if (g.allDay) continue;
        const start = Date.parse(g.start);
        out.push({ key: `gmeet:${g.id}:${start}`, kind: "meeting", url: g.link || "/calendar", at: start - before, until: start + 5 * 60000, title: `${g.title || "Event"} at ${at(start)}`, body: g.link ? "Tap to join." : g.location || "From Google Calendar" });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// The reminders that should go out right now.
export const dueNudges = (s: AutoSettings, d: AutoData, now: number) => plannedNudges(s, d, now).filter((n) => n.at <= now && now < n.until);

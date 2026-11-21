"use client";

// "Remind me" on any item. When the time comes it shows up in your Inbox (delivered by useUnread).
import { useState } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import Icon from "./icon";
import "@/styles/extras.css";

type Entity = "task" | "post" | "invoice" | "deliverable" | "project" | "client" | "event";
type Reminder = { id: string; remind_at: string };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const at = (days: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d; };
// Only paths inside the app, never another site.
const internal = (h: string) => (/^\/[^/\\]/.test(h) ? h : "");

function presets(): [string, Date][] {
  const now = new Date(), toMon = ((8 - now.getDay()) % 7) || 7;
  return ([
    ["In 1 hour", new Date(now.getTime() + 3600_000)],
    ["This evening (6pm)", at(0, 18)],
    ["Tomorrow 9am", at(1, 9)],
    ["Next Monday 9am", at(toMon, 9)],
  ] as [string, Date][]).filter(([, d]) => d.getTime() > now.getTime());
}

export default function RemindButton({ title, href, entity, entityId, clientId }: { title: string; href: string; entity: Entity; entityId: string; clientId: string | null }) {
  const [open, setOpen] = useState<[string, Date][] | null>(null); // presets are worked out when the menu opens
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, reload] = useRows<Reminder>(`reminders:${entityId}`, (s) => s.from("reminders").select("id,remind_at").eq("entity_id", entityId).is("sent_at", null).order("remind_at").limit(20), ["reminders"]);

  async function add(d: Date) {
    if (!(d.getTime() > new Date().getTime())) return toast("Pick a time in the future.");
    setBusy(true);
    const { error } = await supabase().from("reminders").insert({
      title: title.trim().slice(0, 300) || `Check this ${entity}`, href: internal(href), entity, entity_id: entityId, client_id: clientId, remind_at: d.toISOString(),
    });
    setBusy(false);
    if (error) return toast("Could not set the reminder. Try again.");
    toast(`Got it. I'll remind you ${when(d.toISOString())}.`);
    setOpen(null);
    setCustom("");
    reload();
  }
  async function cancel(id: string) {
    const { error } = await supabase().from("reminders").delete().eq("id", id);
    if (error) return toast("Could not cancel it. Try again.");
    toast("Reminder cancelled");
    reload();
  }

  return (
    <div className="remind">
      <button type="button" className="btn small ghost" aria-expanded={!!open} onClick={() => setOpen(open ? null : presets())}><Icon name="bell" size={14} />Remind me</button>
      {open && (
        <div className="remind-menu" role="group" aria-label="When to remind you">
          {open.map(([label, d]) => <button key={label} type="button" className="btn small" disabled={busy} onClick={() => add(d)}>{label}</button>)}
          <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
            <label className="sr-only" htmlFor={`rm-${entityId}`}>Pick a date and time</label>
            <input id={`rm-${entityId}`} type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (custom) add(new Date(custom)); } }} />
            <button type="button" className="btn small" disabled={busy || !custom} onClick={() => add(new Date(custom))}>Set</button>
          </span>
        </div>
      )}
      {!!rows?.length && (
        <ul className="remind-list" aria-label="Upcoming reminders">
          {rows.map((r) => (
            <li key={r.id}>
              <Icon name="bell" size={12} /><span>{when(r.remind_at)}</span>
              <button type="button" className="btn small ghost" aria-label={`Cancel the reminder for ${when(r.remind_at)}`} onClick={() => cancel(r.id)}><Icon name="x" size={12} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

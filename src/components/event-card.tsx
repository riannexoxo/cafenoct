"use client";

import { useState } from "react";
import { supabase } from "@/lib/use-rows";
import { parseYmd } from "@/lib/dates";
import { REPEAT_LABELS, type CalEvent, type Occurrence } from "@/lib/cal";
import { tzShort } from "@/lib/tz";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import Modal from "./modal";
import Icon from "./icon";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const safeUrl = (u: string) => { try { const x = new URL(u.trim()); return x.protocol === "https:" || x.protocol === "http:" ? x.href : ""; } catch { return ""; } };

// Notes with web addresses turned into links.
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')]+)/g);
  return <>{parts.map((p, i) => (i % 2 && safeUrl(p) ? <a key={i} href={safeUrl(p)} target="_blank" rel="noopener noreferrer">{p}</a> : p))}</>;
}

// The details of one event, like tapping an event in Apple or Google Calendar.
export default function EventCard({ o, clients, tz, onClose, onEdit, onChanged }: { o: Occurrence; clients: Client[]; tz: string; onClose: () => void; onEdit: (ev: CalEvent) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const ev = o.ev, c = clients.find((x) => x.id === ev.client_id);
  const time = (ms: number, zone: string) => new Date(ms).toLocaleTimeString("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase();
  const date = new Date(o.start).toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" });
  const allDay = o.google?.allDay;
  const link = safeUrl(ev.link);
  const theirs = c?.timezone && c.timezone !== tz ? `${time(o.start, c.timezone)}–${time(o.end, c.timezone)} ${tzShort(c.timezone)} for ${c.name.split(" ")[0]}` : "";
  const repeat = ev.repeat !== "none" ? `${REPEAT_LABELS[ev.repeat]}${ev.repeat === "weekly" && ev.repeat_days?.length ? ` on ${ev.repeat_days.map((d) => DAYS[d - 1]).join(", ")}` : ""}${ev.repeat_until ? `, until ${parseYmd(ev.repeat_until).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}` : "";
  const label = o.google ? "Google Calendar" : ev.kind === "meeting" ? "Meeting" : "Work block";

  async function skipThisOne() {
    if (!o.occ) return;
    setBusy(true);
    const { error } = await supabase().from("events").update({ skip_dates: [...(ev.skip_dates ?? []), o.occ] }).eq("id", ev.id);
    setBusy(false);
    if (error) return toast("Could not update. Try again.");
    toast("Removed this one. The rest of the series stays.");
    onChanged();
    onClose();
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); toast("Link copied"); } catch { toast("Copy was blocked here."); }
  }

  return (
    <Modal label={ev.title || label} onClose={onClose}>
      <div className="evc" style={{ ["--c" as string]: c?.color ?? "var(--lilac)" }}>
        <div className="eyebrow">{label}{c ? ` · ${clientLabel(c)}` : ""}</div>
        <h2>{ev.title || (c ? clientLabel(c) : "Untitled")}</h2>
        <div className="evc-rows">
          <div><Icon name="schedule" size={16} /><span>{allDay ? `${parseYmd(o.google!.start).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · All day` : <>{date} · {time(o.start, tz)}–{time(o.end, tz)} <span className="muted">{tzShort(tz)}</span>{theirs && <small className="muted" style={{ display: "block" }}>{theirs}</small>}</>}</span></div>
          {repeat && <div><Icon name="repeat" size={16} /><span>{repeat}</span></div>}
          {o.google?.location && !safeUrl(o.google.location) && <div><Icon name="today" size={16} /><span>{o.google.location}</span></div>}
          {link && <div><Icon name="link" size={16} /><span style={{ overflowWrap: "anywhere" }}><a href={link} target="_blank" rel="noopener noreferrer">{link.replace(/^https?:\/\//, "").slice(0, 60)}</a></span></div>}
          {ev.notes && <div><Icon name="docs" size={16} /><span className="evc-notes"><Linked text={ev.notes} /></span></div>}
        </div>
        {link && (
          <div className="row">
            <a className="btn solid" href={link} target="_blank" rel="noopener noreferrer"><Icon name="play" />{ev.kind === "meeting" ? "Join meeting" : "Open link"}</a>
            <button type="button" className="btn" onClick={copyLink}><Icon name="copy" />Copy link</button>
          </div>
        )}
      </div>
      <div className="modal-foot">
        {o.google ? (
          <span className="small muted left">From your Google Calendar. Change it there and it updates here.</span>
        ) : (
          <>
            {o.occ && <button type="button" className="btn ghost left" disabled={busy} onClick={skipThisOne}>Remove just this one</button>}
            <button type="button" className="btn" onClick={() => onEdit(ev)}>{o.occ ? "Edit series" : "Edit"}</button>
          </>
        )}
        <button type="button" className="btn solid" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

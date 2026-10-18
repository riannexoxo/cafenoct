"use client";

import { useState } from "react";
import { supabase } from "@/lib/use-rows";
import { REPEAT_LABELS, fmtClock, isoAt, localParts, minToTime, toMin, type CalEvent } from "@/lib/cal";
import { weekday } from "@/lib/dates";
import { toast } from "@/lib/toast";
import { deviceTz, todayIn, tzShort } from "@/lib/tz";
import { clientLabel, type Client } from "@/lib/types";
import Modal from "./modal";
import Seg from "./seg";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type EventDraft = Partial<CalEvent> & { date?: string; start?: string; end?: string };

// Block time or add a meeting (with a link, and repeating if you like) for a client or for yourself.
export default function EventForm({ ev = {}, clients, onClose, onSaved, tz: zone }: { ev?: EventDraft; clients: Client[]; onClose: () => void; onSaved?: () => void; tz?: string }) {
  // A repeating series keeps the time zone it was made in.
  const [tz] = useState(() => ev.tz || zone || deviceTz());
  const [init] = useState(() => {
    if (ev.starts_at && ev.ends_at) {
      const s = localParts(ev.starts_at, tz), e = localParts(ev.ends_at, tz);
      return { date: s.date, start: minToTime(s.min), end: e.date !== s.date ? "23:59" : minToTime(e.min) };
    }
    return { date: ev.date ?? todayIn(tz), start: ev.start ?? "09:00", end: ev.end ?? (ev.kind === "meeting" ? "09:30" : "10:00") };
  });
  const [clientId, setClientId] = useState(ev.client_id ?? "");
  const [title, setTitle] = useState(ev.title ?? "");
  const [date, setDate] = useState(init.date);
  const [start, setStart] = useState(init.start);
  const [end, setEnd] = useState(init.end);
  const [notes, setNotes] = useState(ev.notes ?? "");
  const [kind, setKind] = useState<CalEvent["kind"]>(ev.kind ?? "block");
  const [link, setLink] = useState(ev.link ?? "");
  const [repeat, setRepeat] = useState<CalEvent["repeat"]>(ev.repeat ?? "none");
  const [repeatDays, setRepeatDays] = useState<number[]>(ev.repeat_days ?? []);
  const [until, setUntil] = useState(ev.repeat_until ?? "");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);

  const heading = ev.id ? (kind === "meeting" ? "Edit meeting" : "Edit work block") : kind === "meeting" ? "New meeting" : "Block time";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const s = toMin(start), en = end === "23:59" ? 1440 : toMin(end);
    if (en <= s) return toast("End time must be after start time.");
    const url = link.trim() && !/^https?:\/\//i.test(link.trim()) ? `https://${link.trim()}` : link.trim();
    if (url) { try { new URL(url); } catch { return toast("That link doesn't look right. Paste the full meeting address."); } }
    setBusy(true);
    const row = {
      client_id: clientId || null, title: title.trim(), starts_at: isoAt(date, s, tz), ends_at: isoAt(date, en, tz), notes: notes.trim(),
      kind, link: url, repeat, repeat_days: repeat === "weekly" ? (repeatDays.length ? repeatDays : [weekday(date)]) : [], repeat_until: repeat !== "none" && until ? until : null, tz: repeat !== "none" ? tz : "",
    };
    const { error } = ev.id ? await supabase().from("events").update(row).eq("id", ev.id) : await supabase().from("events").insert(row);
    setBusy(false);
    if (error) return toast("Could not save. Check your connection.");
    toast(ev.id ? (kind === "meeting" ? "Meeting saved" : "Block saved") : kind === "meeting" ? `Meeting added${repeat !== "none" ? `, ${REPEAT_LABELS[repeat].toLowerCase()}` : ""}` : `Blocked ${fmtClock(s)}–${fmtClock(en)}`);
    onSaved?.();
    onClose();
  }
  async function remove() {
    if (!ev.id) return;
    if (!sure) return setSure(true);
    setBusy(true);
    const { error } = await supabase().from("events").delete().eq("id", ev.id);
    setBusy(false);
    if (error) return toast("Could not delete. Try again.");
    toast("Block deleted");
    onSaved?.();
    onClose();
  }

  return (
    <Modal label={heading} onClose={onClose}>
      <form onSubmit={save} style={{ display: "contents" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>{heading}</h2>
          <Seg label="Type" options={[["block", "Work block"], ["meeting", "Meeting"]]} value={kind} onChange={setKind} />
        </div>
        <div className="form">
          <div className="field"><label htmlFor="ef-client">Client</label>
            <select id="ef-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">No client</option>
              {clients.filter((c) => c.status !== "Past" || c.id === clientId).map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="ef-title">{kind === "meeting" ? "Meeting name" : "What you will work on"}</label><input id="ef-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "meeting" ? "ADAH team daily" : "Inbox, call, design…"} /></div>
          <div className="field full"><label htmlFor="ef-date">{repeat !== "none" ? "Starts on" : "Date"}{tz !== deviceTz() ? ` (times in ${tzShort(tz)})` : ""}</label><input id="ef-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="ef-start">Start</label><input id="ef-start" type="time" step={300} required value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="field"><label htmlFor="ef-end">End</label><input id="ef-end" type="time" step={300} required value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <div className="field full"><label htmlFor="ef-link">{kind === "meeting" ? "Meeting link" : "Link"}</label><input id="ef-link" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://zoom.us/j/… or https://meet.google.com/…" /></div>
          <div className="field"><label htmlFor="ef-repeat">Repeats</label>
            <select id="ef-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as CalEvent["repeat"])}>
              {(Object.keys(REPEAT_LABELS) as CalEvent["repeat"][]).map((k) => <option key={k} value={k}>{REPEAT_LABELS[k]}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="ef-until">Until (optional)</label><input id="ef-until" type="date" disabled={repeat === "none"} value={until} min={date} onChange={(e) => setUntil(e.target.value)} /></div>
          {repeat === "weekly" && (
            <div className="field full"><label>On these days</label>
              <div className="row" style={{ gap: 6 }}>{DAYS.map((d, i) => {
                const on = repeatDays.length ? repeatDays.includes(i + 1) : weekday(date) === i + 1;
                return <button key={d} type="button" className={`pill ${on ? "acc" : ""}`} aria-pressed={on} style={{ border: 0, padding: "5px 11px" }}
                  onClick={() => { const cur = repeatDays.length ? repeatDays : [weekday(date)]; setRepeatDays(on ? cur.filter((x) => x !== i + 1) : [...cur, i + 1].sort()); }}>{d}</button>;
              })}</div>
            </div>
          )}
          <div className="field full"><label htmlFor="ef-notes">Notes</label><textarea id="ef-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <div className="modal-foot">
          {ev.id && <button type="button" className="btn danger left" disabled={busy} onClick={remove}>{sure ? "Tap again to delete" : ev.repeat && ev.repeat !== "none" ? "Delete series" : "Delete"}</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { supabase } from "@/lib/use-rows";
import { today } from "@/lib/dates";
import { fmtClock, isoAt, localParts, minToTime, toMin, type CalEvent } from "@/lib/cal";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import Modal from "./modal";

export type EventDraft = Partial<CalEvent> & { date?: string; start?: string; end?: string };

// Block time on the calendar for a client or for yourself.
export default function EventForm({ ev = {}, clients, onClose, onSaved }: { ev?: EventDraft; clients: Client[]; onClose: () => void; onSaved?: () => void }) {
  const [init] = useState(() => {
    if (ev.starts_at && ev.ends_at) {
      const s = localParts(ev.starts_at), e = localParts(ev.ends_at);
      return { date: s.date, start: minToTime(s.min), end: e.date !== s.date ? "23:59" : minToTime(e.min) };
    }
    return { date: ev.date ?? today(), start: ev.start ?? "09:00", end: ev.end ?? "10:00" };
  });
  const [clientId, setClientId] = useState(ev.client_id ?? "");
  const [title, setTitle] = useState(ev.title ?? "");
  const [date, setDate] = useState(init.date);
  const [start, setStart] = useState(init.start);
  const [end, setEnd] = useState(init.end);
  const [notes, setNotes] = useState(ev.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const s = toMin(start), en = end === "23:59" ? 1440 : toMin(end);
    if (en <= s) return toast("End time must be after start time.");
    setBusy(true);
    const row = { client_id: clientId || null, title: title.trim(), starts_at: isoAt(date, s), ends_at: isoAt(date, en), notes: notes.trim() };
    const { error } = ev.id ? await supabase().from("events").update(row).eq("id", ev.id) : await supabase().from("events").insert(row);
    setBusy(false);
    if (error) return toast("Could not save. Check your connection.");
    toast(ev.id ? "Block saved" : `Blocked ${fmtClock(s)}–${fmtClock(en)}`);
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
    <Modal label={ev.id ? "Edit work block" : "Block time"} onClose={onClose}>
      <form onSubmit={save} style={{ display: "contents" }}>
        <h2>{ev.id ? "Edit work block" : "Block time"}</h2>
        <div className="form">
          <div className="field"><label htmlFor="ef-client">Client</label>
            <select id="ef-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">No client</option>
              {clients.filter((c) => c.status !== "Past" || c.id === clientId).map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="ef-title">What you will work on</label><input id="ef-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Inbox, call, design…" /></div>
          <div className="field full"><label htmlFor="ef-date">Date</label><input id="ef-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="ef-start">Start</label><input id="ef-start" type="time" step={300} required value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="field"><label htmlFor="ef-end">End</label><input id="ef-end" type="time" step={300} required value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <div className="field full"><label htmlFor="ef-notes">Notes</label><textarea id="ef-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <div className="modal-foot">
          {ev.id && <button type="button" className="btn danger left" disabled={busy} onClick={remove}>{sure ? "Tap again to delete" : "Delete"}</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

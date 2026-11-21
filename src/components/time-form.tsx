"use client";

import { useState } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { hm, isoAt, localParts, minToTime, snap15, toMin, type TimeEntry } from "@/lib/cal";
import { toast } from "@/lib/toast";
import { deviceTz, partsIn, todayIn, tzShort } from "@/lib/tz";
import { clientLabel, type Client } from "@/lib/types";
import Modal from "./modal";

export type TimeDraft = Partial<TimeEntry>;

// Log or fix hours. Start, end and length stay in step with each other.
// tz is the time zone the times are shown and typed in (yours unless a client portal says otherwise).
export default function TimeForm({ entry = {}, clients, onClose, onSaved, tz: zone }: { entry?: TimeDraft; clients: Client[]; onClose: () => void; onSaved?: () => void; tz?: string }) {
  const [tz] = useState(() => zone || deviceTz());
  const [init] = useState(() => {
    if (entry.started_at) {
      const p = localParts(entry.started_at, tz), m = entry.minutes ?? 60;
      return { date: p.date, start: minToTime(p.min), end: minToTime((p.min + m) % 1440), minutes: m };
    }
    const now = snap15(partsIn(Date.now(), tz).min), m = entry.minutes ?? 60;
    return { date: todayIn(tz), start: minToTime(Math.max(0, now - m)), end: minToTime(now), minutes: m };
  });
  const [clientId, setClientId] = useState(entry.client_id ?? "");
  const [taskId, setTaskId] = useState(entry.task_id ?? "");
  // Callers that never loaded task_id leave it undefined: keep it as it is unless a task is picked here.
  const [taskKnown, setTaskKnown] = useState(!entry.id || entry.task_id !== undefined);
  const keep = entry.task_id ?? "";
  const [tasks] = useRows<{ id: string; title: string }>(`tf-tasks:${clientId}:${keep}`, (s) => {
    let q = s.from("tasks").select("id,title").order("title").limit(200);
    q = clientId ? q.eq("client_id", clientId) : q.is("client_id", null);
    return keep ? q.or(`status.neq.done,id.eq.${keep}`) : q.neq("status", "done");
  }, []);
  const [date, setDate] = useState(init.date);
  const [start, setStart] = useState(init.start);
  const [end, setEnd] = useState(init.end);
  const [hours, setHours] = useState(String(Math.floor(init.minutes / 60)));
  const [mins, setMins] = useState(String(init.minutes % 60));
  const [note, setNote] = useState(entry.note ?? "");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);

  const setLength = (m: number) => { setHours(String(Math.floor(m / 60))); setMins(String(m % 60)); };
  const span = (s: string, e: string) => { const d = toMin(e) - toMin(s); return d > 0 ? d : d + 1440; };
  const onStart = (v: string) => { setStart(v); if (v && end) setLength(span(v, end)); };
  const onEnd = (v: string) => { setEnd(v); if (start && v) setLength(span(start, v)); };
  const onLength = (h: string, m: string) => { setHours(h); setMins(m); const total = (+h || 0) * 60 + (+m || 0); if (start && total > 0) setEnd(minToTime((toMin(start) + total) % 1440)); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const minutes = (+hours || 0) * 60 + (+mins || 0);
    if (minutes <= 0) return toast("Enter how long you worked.");
    if (!start) return toast("Add a start time.");
    setBusy(true);
    const row = { client_id: clientId || null, started_at: isoAt(date, toMin(start), tz), minutes, note: note.trim(), ...(taskKnown ? { task_id: taskId || null } : {}) };
    const { error } = entry.id
      ? await supabase().from("time_entries").update(row).eq("id", entry.id)
      : await supabase().from("time_entries").insert({ ...row, source: "manual" });
    setBusy(false);
    if (error) return toast("Could not save. Check your connection.");
    toast(entry.id ? `Saved ${hm(minutes)}` : `Logged ${hm(minutes)}`);
    onSaved?.();
    onClose();
  }
  async function remove() {
    if (!entry.id) return;
    if (!sure) return setSure(true);
    setBusy(true);
    const { error } = await supabase().from("time_entries").delete().eq("id", entry.id);
    setBusy(false);
    if (error) return toast("Could not delete. Try again.");
    toast("Entry deleted");
    onSaved?.();
    onClose();
  }

  return (
    <Modal label={entry.id ? "Edit hours" : "Log time"} onClose={onClose}>
      <form onSubmit={save} style={{ display: "contents" }}>
        <h2>{entry.id ? "Edit hours" : "Log time"}</h2>
        <div className="form">
          <div className="field"><label htmlFor="tf-client">Client</label>
            <select id="tf-client" value={clientId} onChange={(e) => { setClientId(e.target.value); setTaskId(""); setTaskKnown(true); }}>
              <option value="">No client</option>
              {clients.filter((c) => c.status !== "Past" || c.id === clientId).map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="tf-task">Task</label>
            <select id="tf-task" value={taskId} onChange={(e) => { setTaskId(e.target.value); setTaskKnown(true); }}>
              <option value="">No task</option>
              {(tasks ?? []).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="tf-date">Date</label><input id="tf-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="tf-start">Start</label><input id="tf-start" type="time" step={300} value={start} onChange={(e) => onStart(e.target.value)} /></div>
          <div className="field"><label htmlFor="tf-end">End</label><input id="tf-end" type="time" step={300} value={end} onChange={(e) => onEnd(e.target.value)} /></div>
          <div className="field"><label htmlFor="tf-h">Hours</label><input id="tf-h" type="number" inputMode="numeric" min={0} max={24} value={hours} onChange={(e) => onLength(e.target.value, mins)} /></div>
          <div className="field"><label htmlFor="tf-m">Minutes</label><input id="tf-m" type="number" inputMode="numeric" min={0} max={59} value={mins} onChange={(e) => onLength(hours, e.target.value)} /></div>
          <p className="small muted full" style={{ margin: 0 }}>Change the start or end and the hours update. Change the hours and the end time follows.{tz !== deviceTz() ? ` Times are in ${tzShort(tz)}.` : ""}</p>
          <div className="field full"><label htmlFor="tf-note">What you did</label><input id="tf-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shows in your EOD report" /></div>
        </div>
        <div className="modal-foot">
          {entry.id && <button type="button" className="btn danger left" disabled={busy} onClick={remove}>{sure ? "Tap again to delete" : "Delete"}</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

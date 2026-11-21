"use client";

import { useState } from "react";
import { hm } from "@/lib/cal";
import { toast } from "@/lib/toast";
import { Clock, startTimer, stopTimer, useTimers } from "./timers";
import Icon from "./icon";
import "@/styles/time.css";

// One-click start/stop for a client (and optionally one task). Uses the same timers as the Time page,
// so stopping here saves through the atomic stop_timer step too.
export default function TimerButton({ clientId, taskId = null, note = "", label = "this client", small = false }: { clientId: string | null; taskId?: string | null; note?: string; label?: string; small?: boolean }) {
  const [rows, reload, setRows] = useTimers();
  const [busy, setBusy] = useState(false);
  const forClient = (rows ?? []).filter((t) => t.client_id === clientId);
  const mine = forClient.find((t) => !taskId || t.task_id === taskId);

  async function toggle() {
    if (busy || !rows) return;
    setBusy(true);
    if (mine) {
      setRows((r) => (r ?? []).filter((x) => x.id !== mine.id));
      const { minutes, error } = await stopTimer(mine);
      setBusy(false);
      if (error) { reload(); return toast(error.code === "P0002" ? "That timer was already stopped." : "Could not save. Check your connection."); }
      return toast(minutes > 600 ? `Saved ${hm(minutes)}. That's long, so fix it on the Time page if you forgot to stop.` : `Saved ${hm(minutes)} to ${label}`);
    }
    if (clientId && forClient.length) { setBusy(false); return toast(`${label} already has a timer running.`); }
    const { data } = await startTimer(clientId, note, taskId);
    setBusy(false);
    if (data) { setRows((r) => [...(r ?? []), data]); toast(`Timer started for ${label}`); } else { reload(); toast("Could not start the timer. Check your connection."); }
  }

  return (
    <button type="button" className={`btn timer-btn${small ? " small" : ""}${mine ? " on" : ""}`} onClick={toggle} disabled={busy || !rows}
      aria-label={mine ? `Stop timer for ${label}` : `Start timer for ${label}`} aria-pressed={!!mine}>
      <Icon name={mine ? "stop" : "play"} />{mine ? <Clock since={mine.started_at} /> : small ? "Start" : "Start timer"}
    </button>
  );
}

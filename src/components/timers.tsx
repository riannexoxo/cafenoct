"use client";

import { useEffect, useState } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { clock } from "@/lib/dates";
import { hm } from "@/lib/cal";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import Icon from "./icon";
import TimeForm, { type TimeDraft } from "./time-form";

type Timer = { id: string; client_id: string | null; note: string; started_at: string };

export function useTimers() {
  return useRows<Timer>("timers", (s) => s.from("timers").select("id,client_id,note,started_at").order("started_at"), ["timers"]);
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  return now;
}

export async function startTimer(clientId: string | null, note = "") {
  return supabase().from("timers").insert({ client_id: clientId, note }).select("id,client_id,note,started_at").single();
}

// Stopping turns the timer into a time entry in one database step (stop_timer): the timer is claimed and the
// entry written together, so a failed step or a second stop can never log the same time twice.
export async function stopTimer(t: Timer) {
  const { data, error } = await supabase().rpc("stop_timer", { p_id: t.id });
  const entry = data as (TimeDraft & { minutes: number }) | null;
  const minutes = entry?.minutes ?? Math.max(1, Math.round((Date.now() - new Date(t.started_at).getTime()) / 60000));
  return { minutes, entry, error };
}

export function Clock({ since }: { since: string }) {
  const now = useNow();
  return <span className="num">{clock(now - new Date(since).getTime())}</span>;
}

// Running timers, plus a way to start one. Several can run at once; each keeps going until you stop it.
export default function Timers({ clients, clientId }: { clients: Client[]; clientId?: string }) {
  const [rows, reload, setRows] = useTimers();
  const [pick, setPick] = useState(clientId ?? "");
  const [note, setNote] = useState("");
  const [fix, setFix] = useState<TimeDraft | null>(null);
  const mine = (rows ?? []).filter((t) => !clientId || t.client_id === clientId);
  const label = (id: string | null) => { const c = clients.find((x) => x.id === id); return c ? clientLabel(c) : "No client"; };

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const cid = clientId ?? (pick || null);
    if (cid && (rows ?? []).some((t) => t.client_id === cid)) return toast(`${label(cid)} already has a timer running.`);
    const { data } = await startTimer(cid, note);
    setNote("");
    if (data) { setRows((r) => [...(r ?? []), data]); toast(`Timer started${cid ? ` for ${label(cid)}` : ""}`); } else reload();
  }
  async function stop(t: Timer) {
    setRows((r) => (r ?? []).filter((x) => x.id !== t.id));
    const { minutes, entry, error } = await stopTimer(t);
    if (error) { reload(); return toast(error.code === "P0002" ? "That timer was already stopped." : "Could not save. Check your connection."); }
    // Over 10 hours usually means the timer was left running. Open the entry so it's easy to fix.
    if (minutes > 600 && entry) { toast(`Saved ${hm(minutes)}. That's long, so fix it if you forgot to stop.`); setFix(entry); }
    else toast(`Saved ${hm(minutes)} to ${label(t.client_id)}`);
  }

  return (
    <div className="card">
      <h3><span>{mine.length ? "Running now" : "Timer"}</span>{mine.length > 0 && <span className="muted">{mine.length} running</span>}</h3>
      {mine.length > 0 && (
        <div className="list" style={{ marginBottom: 10 }}>
          {mine.map((t) => (
            <div className="li" key={t.id}>
              <span className="dot-live" />
              <span className="t">{label(t.client_id)}<small>{t.note || "Working"} · since {new Date(t.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></span>
              <Clock since={t.started_at} />
              <button className="btn small solid" onClick={() => stop(t)}><Icon name="stop" />Stop</button>
            </div>
          ))}
        </div>
      )}
      {!(clientId && mine.length) && (
        <form className="row" onSubmit={start}>
          <input className="search grow" style={{ width: "auto", minWidth: 140 }} placeholder="What are you working on?" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Timer note" />
          {!clientId && (
            <select className="search" style={{ width: "auto" }} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Client">
              <option value="">No client</option>
              {clients.filter((c) => c.status === "Active").map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
            </select>
          )}
          <button className="btn solid" type="submit"><Icon name="play" />{mine.length ? "Start another" : "Start timer"}</button>
        </form>
      )}
      {fix && <TimeForm entry={fix} clients={clients} onClose={() => setFix(null)} />}
    </div>
  );
}

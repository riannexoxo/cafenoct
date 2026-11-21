"use client";

import "@/styles/idle.css";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/use-rows";
import { hm } from "@/lib/cal";
import { toast } from "@/lib/toast";
import Nocti from "./nocti";
import { stopTimer, useTimers } from "./timers";

const IDLE_MS = 10 * 60000;
const KEY = "cn-last-active"; // shared across tabs, so working in one tab doesn't count as away in another
const readShared = () => { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } };

// While a timer runs and you've been away 10 minutes (no mouse, touch or keys), asks "Still working?".
// Stop ends the timers and takes the away time back off, so the logged time stays honest.
export default function IdleCheck() {
  const [timers] = useTimers();
  const [since, setSince] = useState<number | null>(null); // when you went quiet
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const last = useRef(0);
  const running = (timers ?? []).length > 0;
  const live = useRef(running);
  useEffect(() => { live.current = running; }, [running]);

  useEffect(() => {
    last.current = Date.now();
    let wrote = 0;
    const seen = () => {
      const t = Date.now(), quiet = Math.max(last.current, readShared());
      // Coming back after 10 quiet minutes asks right away (timers in background tabs tick slowly).
      if (live.current && t - quiet >= IDLE_MS) { setNow(t); setSince((s) => s ?? quiet); }
      last.current = t;
      if (t - wrote > 30000) { wrote = t; try { localStorage.setItem(KEY, String(t)); } catch { /* private mode: this tab only */ } }
    };
    const evs = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, seen, { passive: true }));
    return () => evs.forEach((e) => window.removeEventListener(e, seen));
  }, []);

  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => {
      const t = Date.now(), quiet = Math.max(last.current, readShared());
      setNow(t);
      setSince((s) => s ?? (t - quiet >= IDLE_MS ? quiet : null));
    }, 15000);
    return () => clearInterval(i);
  }, [running]);

  if (!running || since === null) return null;
  const away = Math.max(1, Math.round((now - since) / 60000));

  const keep = () => { last.current = Date.now(); setSince(null); };
  async function stop() {
    if (busy || since === null) return;
    setBusy(true);
    const stopAt = Date.now();
    let saved = 0, failed = false;
    for (const t of timers ?? []) {
      const { entry, error } = await stopTimer(t);
      if (error || !entry?.id) { failed = failed || !!error; continue; }
      // Only the away time that happened while this timer ran comes off, and an entry never drops below 1 minute.
      const idle = Math.round((stopAt - Math.max(since, Date.parse(t.started_at))) / 60000);
      const minutes = Math.max(1, entry.minutes - Math.max(0, idle));
      const { error: e2 } = minutes === entry.minutes ? { error: null } : await supabase().from("time_entries").update({ minutes }).eq("id", entry.id);
      if (e2) failed = true;
      saved += e2 ? entry.minutes : minutes;
    }
    setBusy(false); setSince(null); last.current = Date.now();
    toast(failed ? "Timer stopped, but the away time couldn't be removed. You can fix it in Time." : `Stopped. Saved ${hm(saved)}, without the ${hm(away)} away.`);
  }

  return (
    <div className="idle-panel" role="dialog" aria-modal="false" aria-labelledby="idle-t" aria-describedby="idle-d">
      <Nocti mood="awake" state="watch" size={56} />
      <div className="grow">
        <b id="idle-t">Still working?</b>
        <p id="idle-d" className="small muted">It&apos;s been quiet for {hm(away)} and your timer is still going.</p>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn small solid" onClick={keep} disabled={busy}>Keep going</button>
          <button type="button" className="btn small" onClick={stop} disabled={busy}>{busy ? "Stopping…" : `Stop and remove ${hm(away)}`}</button>
        </div>
      </div>
    </div>
  );
}

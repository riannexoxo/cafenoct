// The Pomodoro focus timer. Its state lives in this browser (so it survives moving between pages and reloads);
// finished focus sessions are logged as time for the chosen client.
import { supabase } from "@/lib/use-rows";
import { toast } from "@/lib/toast";

export type Phase = "focus" | "short" | "long";
export type Lengths = { focus: number; short: number; long: number; every: number };
export type FocusState = {
  phase: Phase; running: boolean; endAt: number; remaining: number; startedAt: number;
  clientId: string; taskId: string; note: string; leaves: number; done: number; len: Lengths;
};

const KEY = "cafenoct.focus";
export const DEFAULT_LEN: Lengths = { focus: 25, short: 5, long: 15, every: 4 };
const fresh = (len = DEFAULT_LEN): FocusState => ({ phase: "focus", running: false, endAt: 0, remaining: len.focus * 60, startedAt: 0, clientId: "", taskId: "", note: "", leaves: 0, done: 0, len });
export const phaseSecs = (s: FocusState, p = s.phase) => (p === "focus" ? s.len.focus : p === "short" ? s.len.short : s.len.long) * 60;

let cache: FocusState | null = null;
export function read(): FocusState {
  if (cache) return cache;
  try { cache = { ...fresh(), ...(JSON.parse(localStorage.getItem(KEY) || "null") ?? {}) }; } catch { cache = fresh(); }
  return cache!;
}
function write(s: FocusState) {
  cache = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  window.dispatchEvent(new Event("cafenoct:focus"));
}
export function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; cb(); } };
  window.addEventListener("cafenoct:focus", cb);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener("cafenoct:focus", cb); window.removeEventListener("storage", onStorage); };
}
export const secondsLeft = (s: FocusState, now = Date.now()) => (s.running ? Math.max(0, Math.round((s.endAt - now) / 1000)) : s.remaining);

export function update(patch: Partial<FocusState>) { write({ ...read(), ...patch }); }
export function start() {
  const s = read();
  if (s.running) return;
  write({ ...s, running: true, endAt: Date.now() + s.remaining * 1000, startedAt: s.startedAt || Date.now() });
  keepAwake(true);
}
export function pause() { const s = read(); if (s.running) write({ ...s, running: false, remaining: secondsLeft(s) }); keepAwake(false); }
export function setPhase(phase: Phase) { const s = read(); write({ ...s, phase, running: false, remaining: phaseSecs(s, phase), startedAt: 0, leaves: 0 }); keepAwake(false); }
export function reset() { setPhase(read().phase); }
export function setLengths(len: Lengths) { const s = read(); write({ ...s, len, remaining: s.running ? s.remaining : phaseSecs({ ...s, len }) }); }
export function noteLeave() { const s = read(); if (s.running && s.phase === "focus") write({ ...s, leaves: s.leaves + 1 }); }

// Ends the current phase. A finished (or stopped-early) focus session is logged as time.
export async function complete(how: "done" | "skip" | "stop" = "done") {
  const s = read();
  if (how === "done" && (!s.running || Date.now() < s.endAt)) return;
  const worked = Math.round((phaseSecs(s) - secondsLeft(s)) / 60);
  const minutes = how === "done" ? s.len.focus : worked;
  const log = s.phase === "focus" && how !== "skip" && minutes >= 1;
  const done = s.done + (s.phase === "focus" && how === "done" ? 1 : 0);
  const next: Phase = s.phase !== "focus" ? "focus" : done % s.len.every === 0 && how === "done" ? "long" : "short";
  // Save the new phase first, so another tab or page can't log the same session twice.
  write({ ...s, phase: next, running: false, remaining: phaseSecs(s, next), startedAt: 0, leaves: 0, done });
  keepAwake(false);
  if (how === "done") chime();
  if (log) {
    const { error } = await supabase().from("time_entries").insert({
      client_id: s.clientId || null, task_id: s.taskId || null, started_at: new Date(s.startedAt || Date.now() - minutes * 60000).toISOString(),
      minutes, note: s.note || "Focus session", source: "focus", leaves: s.leaves,
    });
    if (error) return toast("The session ended but couldn't be logged. Add it in Time.");
    toast(s.leaves ? `${minutes} minutes logged. You left ${s.leaves} time${s.leaves > 1 ? "s" : ""}. Take a break.` : `${minutes} minutes logged with zero distractions. Take a break.`);
  } else if (s.phase !== "focus" && how === "done") toast("Break's over. Ready for the next one?");
}

let actx: AudioContext | null = null;
function chime() {
  try {
    actx = actx || new AudioContext();
    [523, 784].forEach((f, i) => {
      const o = actx!.createOscillator(), g = actx!.createGain(), t = actx!.currentTime + i * 0.26;
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g).connect(actx!.destination); o.start(t); o.stop(t + 0.75);
    });
  } catch {}
}
// Keeps the screen on while a session runs, where the browser allows it.
let lock: { release: () => Promise<void> } | null = null;
async function keepAwake(on: boolean) {
  try {
    if (on && !lock && "wakeLock" in navigator) lock = await (navigator as unknown as { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen");
    if (!on && lock) { await lock.release(); lock = null; }
  } catch {}
}

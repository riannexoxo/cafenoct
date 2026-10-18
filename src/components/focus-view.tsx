"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { pad, parseYmd, today } from "@/lib/dates";
import { hm } from "@/lib/cal";
import { DEFAULT_LEN, complete, pause, phaseSecs, read, reset, secondsLeft, setLengths, setPhase, start, subscribe, update, type FocusState, type Lengths } from "@/lib/focus";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import Modal from "./modal";
import Icon from "./icon";

type T = { id: string; title: string; client_id: string | null };
type E = { minutes: number; leaves: number };
const server = () => null;
const toggle = () => (read().running ? pause() : start());
const leaveFullscreen = () => { try { if (document.fullscreenElement) document.exitFullscreen(); } catch {} };
const QUOTES = ["One task. Start small.", "Done is better than perfect.", "Slow is smooth, smooth is fast.", "You only have to do the next step.", "Protect this time like a client meeting."];

function Ring({ s, now }: { s: FocusState; now: number }) {
  const total = phaseSecs(s), left = secondsLeft(s, now), frac = total ? left / total : 0, RC = 2 * Math.PI * 54, a = frac * 2 * Math.PI, lit = Math.round(frac * 48);
  return (
    <>
      <div className="ring" role="timer" aria-label={`${Math.ceil(left / 60)} minutes left`}>
        <svg viewBox="-4 -4 128 128" aria-hidden="true">
          <circle className="trk" cx="60" cy="60" r="54" fill="none" strokeWidth="3" />
          {[...Array(48)].map((_, i) => { const t = (i / 48) * 2 * Math.PI; return <line key={i} className={`tk${i < lit ? " lit" : ""}`} x1={60 + 58 * Math.cos(t)} y1={60 + 58 * Math.sin(t)} x2={60 + 61 * Math.cos(t)} y2={60 + 61 * Math.sin(t)} strokeWidth="1" strokeLinecap="round" />; })}
          <circle className="prg" cx="60" cy="60" r="54" fill="none" strokeWidth="3" strokeDasharray={RC} strokeDashoffset={RC * (1 - frac)} />
          <circle className="knob" r="3.4" strokeWidth="1.6" cx={60 + 54 * Math.cos(a)} cy={60 + 54 * Math.sin(a)} />
        </svg>
        <div className="mid"><div><div className="clock num">{pad(Math.floor(left / 60))}:{pad(left % 60)}</div><div className="phase">{s.phase === "focus" ? "Focus" : s.phase === "long" ? "Long break" : "Break"}</div></div></div>
      </div>
      <div className="dots" aria-label={`${s.done % s.len.every} of ${s.len.every} sessions before a long break`}>{[...Array(s.len.every)].map((_, i) => <i key={i} className={i < s.done % s.len.every ? "on" : ""} />)}</div>
    </>
  );
}

// Pomodoro focus: pick what you're working on, press start, stay with it.
export default function FocusView({ clients, saved }: { clients: Client[]; saved: Partial<Lengths> }) {
  const s = useSyncExternalStore(subscribe, read, server) as FocusState | null;
  const [now, setNow] = useState(() => Date.now());
  const [zen, setZen] = useState(false);
  const [edit, setEdit] = useState(false);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(i); }, []);
  // Use your saved lengths the first time this browser opens Focus.
  useEffect(() => { const f = read(); if (!f.running && !f.startedAt && JSON.stringify(f.len) === JSON.stringify(DEFAULT_LEN) && Object.keys(saved).length) setLengths({ ...DEFAULT_LEN, ...saved }); }, [saved]);
  useEffect(() => {
    if (!s) return;
    const left = secondsLeft(s, now);
    document.title = s.running ? `${pad(Math.floor(left / 60))}:${pad(left % 60)} · ${s.phase === "focus" ? "Focus" : "Break"}` : "Focus · CafeNoct";
    return () => { document.title = "CafeNoct"; };
  }, [s, now]);
  useEffect(() => {
    if (!zen) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setZen(false); leaveFullscreen(); } if (e.key === " ") { e.preventDefault(); toggle(); } };
    const fs = () => { if (!document.fullscreenElement) setZen(false); };
    document.addEventListener("keydown", k);
    document.addEventListener("fullscreenchange", fs);
    return () => { document.removeEventListener("keydown", k); document.removeEventListener("fullscreenchange", fs); };
  });

  const t0 = parseYmd(today()).toISOString();
  const [tasks] = useRows<T>("focus-tasks", (q) => q.from("tasks").select("id,title,client_id").neq("status", "done").order("due_date", { nullsFirst: false }).limit(200), ["tasks"]);
  const [todayRows] = useRows<E>("focus-today", (q) => q.from("time_entries").select("minutes,leaves").eq("source", "focus").gte("started_at", t0), ["time_entries"]);
  if (!s) return <div className="card skel" style={{ height: 460 }} aria-busy="true" />;

  const client = (id: string | null) => clients.find((c) => c.id === id);
  const enterZen = async () => { setZen(true); try { await document.documentElement.requestFullscreen?.(); } catch {} };
  const exitZen = () => { setZen(false); leaveFullscreen(); };
  const pickTask = (id: string) => { const tk = (tasks ?? []).find((x) => x.id === id); update({ taskId: id, ...(tk ? { note: tk.title, clientId: tk.client_id ?? "" } : {}) }); };
  const mins = (todayRows ?? []).reduce((a, e) => a + e.minutes, 0), leaves = (todayRows ?? []).reduce((a, e) => a + (e.leaves || 0), 0);
  const quote = QUOTES[(s.done + new Date().getDate()) % QUOTES.length];
  const worked = s.phase === "focus" ? Math.round((phaseSecs(s) - secondsLeft(s, now)) / 60) : 0;

  const controls = (
    <div className="row" style={{ justifyContent: "center" }}>
      <button className="btn solid" onClick={toggle}><Icon name={s.running ? "pause" : "play"} />{s.running ? "Pause" : s.startedAt ? "Resume" : s.phase === "focus" ? "Start focus" : "Start break"}</button>
      <button className="btn" onClick={() => complete("skip")}>Skip</button>
      {s.phase === "focus" && worked >= 1 && <button className="btn" onClick={() => complete("stop")} title="End now and log the minutes so far">Stop and log {worked}m</button>}
      <button className="btn ghost" onClick={reset}>Reset</button>
    </div>
  );

  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: -8 }}>
        <button className="btn" onClick={() => setEdit(true)}><Icon name="settings" />Lengths</button>
        <button className="btn" onClick={enterZen}><Icon name="expand" />Full screen focus</button>
      </div>
      <div className="focus-wrap">
        <div className="card ring-card">
          <Ring s={s} now={now} />
          {controls}
          <div className="seg" role="group" aria-label="Phase">
            {(["focus", "short", "long"] as const).map((p) => <button key={p} className={s.phase === p ? "on" : ""} style={s.phase === p ? { background: "var(--card)", boxShadow: "0 1px 4px rgba(0,0,0,.08)" } : undefined} onClick={() => setPhase(p)}>{p === "focus" ? `Focus ${s.len.focus}` : p === "short" ? `Break ${s.len.short}` : `Long ${s.len.long}`}</button>)}
          </div>
        </div>
        <div className="grid" style={{ alignContent: "start" }}>
          <div className="card">
            <h3><span>What are you focusing on?</span></h3>
            <div className="form">
              <div className="field full"><label htmlFor="f-task">Task</label>
                <select id="f-task" value={s.taskId} onChange={(e) => pickTask(e.target.value)}>
                  <option value="">Something else</option>
                  {(tasks ?? []).map((x) => <option key={x.id} value={x.id}>{x.title}{client(x.client_id) ? ` · ${clientLabel(client(x.client_id)!)}` : ""}</option>)}
                </select>
              </div>
              <div className="field full"><label htmlFor="f-note">In a few words</label><input id="f-note" value={s.note} onChange={(e) => update({ note: e.target.value })} placeholder="Write October captions" /></div>
              <div className="field full"><label htmlFor="f-client">Client (the time logs here)</label>
                <select id="f-client" value={s.clientId} onChange={(e) => update({ clientId: e.target.value })}>
                  <option value="">No client</option>
                  {clients.filter((c) => c.status === "Active").map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="card">
            <h3><span>Today</span><span className="muted">{(todayRows ?? []).length} session{(todayRows ?? []).length === 1 ? "" : "s"}</span></h3>
            <div className="stats" style={{ border: 0, background: "none", gap: 12, gridTemplateColumns: "repeat(2, 1fr)" }}>
              <div className="stat" style={{ padding: 0 }}><span className="k">Focused</span><span className="v">{hm(mins)}</span></div>
              <div className="stat" style={{ padding: 0 }}><span className="k">Times you left</span><span className="v">{leaves}</span></div>
            </div>
          </div>
          <div className="card small muted">Leaving this tab during a focus session gets counted. To silence other apps too, turn on Focus mode on your Mac or Do Not Disturb on your phone.</div>
        </div>
      </div>

      {zen && (
        <div className="zen" role="dialog" aria-modal="true" aria-label="Full screen focus">
          <div className="eyebrow">{s.phase === "focus" ? "Focus" : "Break"}{client(s.clientId) ? ` · ${clientLabel(client(s.clientId)!)}` : ""}</div>
          {s.note && <div className="task">{s.note}</div>}
          <Ring s={s} now={now} />
          {controls}
          <p className="quote">{quote}</p>
          <button className="btn ghost small" onClick={exitZen}>Exit full screen (Esc)</button>
        </div>
      )}
      {edit && <LengthsForm len={s.len} onClose={() => setEdit(false)} />}
    </>
  );
}

function LengthsForm({ len, onClose }: { len: Lengths; onClose: () => void }) {
  const [v, setV] = useState(len);
  const set = (k: keyof Lengths, n: string) => setV((x) => ({ ...x, [k]: Math.max(1, Math.min(k === "every" ? 8 : 120, Number(n) || 1)) }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLengths(v);
    const { data: auth } = await supabase().auth.getSession();
    const uid = auth.session?.user.id ?? "";
    const { data } = await supabase().from("profiles").select("settings").eq("user_id", uid).maybeSingle<{ settings: Record<string, unknown> }>();
    const { error } = await supabase().from("profiles").update({ settings: { ...(data?.settings ?? {}), focus: v } }).eq("user_id", uid);
    toast(error ? "Saved on this device only." : "Lengths saved");
    onClose();
  }
  return (
    <Modal label="Focus lengths" onClose={onClose}>
      <form onSubmit={save} style={{ display: "contents" }}>
        <h2>Focus lengths</h2>
        <div className="form">
          <div className="field"><label htmlFor="l-f">Focus (minutes)</label><input id="l-f" type="number" min={1} max={120} value={v.focus} onChange={(e) => set("focus", e.target.value)} /></div>
          <div className="field"><label htmlFor="l-s">Short break</label><input id="l-s" type="number" min={1} max={60} value={v.short} onChange={(e) => set("short", e.target.value)} /></div>
          <div className="field"><label htmlFor="l-l">Long break</label><input id="l-l" type="number" min={1} max={90} value={v.long} onChange={(e) => set("long", e.target.value)} /></div>
          <div className="field"><label htmlFor="l-e">Long break after</label><input id="l-e" type="number" min={2} max={8} value={v.every} onChange={(e) => set("every", e.target.value)} /></div>
        </div>
        <div className="modal-foot"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn solid">Save</button></div>
      </form>
    </Modal>
  );
}

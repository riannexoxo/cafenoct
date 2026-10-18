"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { supabase, useRows } from "@/lib/use-rows";
import { addDays, parseYmd, weekStartYmd, weekday } from "@/lib/dates";
import { deviceTz, partsIn, todayIn, tzShort, zonedIso } from "@/lib/tz";
import { EVENT_COLS, HH, expandEvents, fmtClock, hm, isoAt, laneLayout, localParts, minToTime, planBlocks, snap15, type CalEvent, type GEvent, type Occurrence, type TimeEntry } from "@/lib/cal";
import { hrs } from "@/lib/format";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import { useTimers } from "./timers";
import EventForm, { type EventDraft } from "./event-form";
import EventCard from "./event-card";
import TimeForm from "./time-form";
import Seg from "./seg";
import Icon from "./icon";

type Item =
  | { k: "plan"; id: string; c: Client; s: number; e: number; their: string }
  | { k: "ev"; id: string; ev: CalEvent; o: Occurrence; fixed: boolean; s: number; e: number }
  | { k: "wk"; id: string; x: TimeEntry; s: number; e: number };
type Placed = Item & { lane: number; lanes: number };
type Drag = { mode: "create" | "move" | "resize"; it?: Placed; y0: number; a: number; s0: number; e0: number; s: number; e: number; date: string; moved: boolean };
type Form = { kind: "ev"; draft: EventDraft } | { kind: "wk"; draft: Partial<TimeEntry> } | { kind: "card"; o: Occurrence } | null;

const noop = () => () => {};
const ENTRY_COLS = "id,client_id,started_at,minutes,note,source";

// Week or day grid: usual client hours, blocked time, logged time and running timers.
// tz is the time zone the grid is drawn in: yours on My calendar, the client's in their portal.
export default function Calendar({ clients, clientId, tz }: { clients: Client[]; clientId?: string; tz?: string }) {
  // Dates depend on where you are, so the grid draws only on your device.
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="cg skel" style={{ height: "min(68vh, 760px)" }} aria-busy="true" />;
  return <Grid clients={clients} clientId={clientId} zone={tz} />;
}

function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(i); }, []);
  return now;
}

function Grid({ clients, clientId, zone }: { clients: Client[]; clientId?: string; zone?: string }) {
  const router = useRouter();
  const [tz] = useState(() => zone || deviceTz());
  const [mode, setMode] = useState<"day" | "week">(() => (window.innerWidth < 760 ? "day" : "week"));
  const [anchor, setAnchor] = useState(() => todayIn(tz));
  const [form, setForm] = useState<Form>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const now = useMinuteClock();

  const days = mode === "day" ? [anchor] : [...Array(7)].map((_, i) => addDays(weekStartYmd(anchor), i));
  const from = zonedIso(days[0], 0, tz), to = zonedIso(addDays(days[days.length - 1], 1), 0, tz);
  const scope = `${clientId ?? "all"}:${days[0]}:${days.length}`;
  const [entries, reloadEntries, setEntries] = useRows<TimeEntry>(`cal-time:${scope}`, (s) => {
    let q = s.from("time_entries").select(ENTRY_COLS).gte("started_at", from).lt("started_at", to);
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  }, ["time_entries"]);
  const [events, reloadEvents, setEvents] = useRows<CalEvent>(`cal-ev:${scope}`, (s) => {
    // One-off events in view, plus every repeating series that started before the end of the view.
    let q = s.from("events").select(EVENT_COLS).or(`and(starts_at.gte.${from},starts_at.lt.${to}),and(repeat.neq.none,starts_at.lt.${to})`);
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  }, ["events"]);
  const [timers] = useTimers();
  const [google, setGoogle] = useState<GEvent[]>([]);

  // Google Calendar events (My calendar only), refreshed every few minutes.
  useEffect(() => {
    if (clientId) return;
    let alive = true;
    const load = () => fetch(`/api/gcal?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { events?: GEvent[] } | null) => { if (alive && j?.events) setGoogle(j.events); })
      .catch(() => {});
    load();
    const i = setInterval(load, 5 * 60000);
    return () => { alive = false; clearInterval(i); };
  }, [from, to, clientId]);

  useEffect(() => {
    const h = new Date().getHours();
    if (scroller.current) scroller.current.scrollTop = Math.max(0, Math.min(h - 2, 7)) * HH;
  }, []);

  const t = todayIn(tz);
  const nowM = partsIn(now.getTime(), tz).min;
  const color = (id: string | null, fallback: string) => clients.find((c) => c.id === id)?.color ?? fallback;
  const name = (id: string | null) => { const c = clients.find((x) => x.id === id); return c ? clientLabel(c) : "No client"; };
  const mine = <T extends { client_id: string | null }>(x: T) => !clientId || x.client_id === clientId;

  const gAsEvent = (g: GEvent): CalEvent => ({ id: `g:${g.id}`, client_id: null, title: g.title, starts_at: g.start, ends_at: g.end, notes: g.description, kind: "meeting", link: g.link, repeat: "none", repeat_days: [], repeat_until: null, skip_dates: [], tz: "" });
  const occurrences: Occurrence[] = [
    ...expandEvents((events ?? []).filter(mine), Date.parse(from), Date.parse(to), tz),
    ...google.filter((g) => !g.allDay).map((g) => ({ ev: gAsEvent(g), key: `g:${g.id}`, start: Date.parse(g.start), end: Date.parse(g.end), occ: null, google: g })),
  ];
  const allDay = google.filter((g) => g.allDay);

  const cols = days.map((d) => {
    const plan = planBlocks(d, clients, tz).filter((p) => !clientId || p.c.id === clientId).map((p): Item => ({
      k: "plan", id: `plan:${p.c.id}:${p.theirS}:${p.s}`, c: p.c, s: p.s, e: p.e,
      their: p.tz !== tz ? `${fmtClock(p.theirS)}–${fmtClock(p.theirE)} ${tzShort(p.tz)}` : "",
    }));
    const evs = occurrences.flatMap((o): Item[] => {
      const s = partsIn(o.start, tz), e = partsIn(o.end, tz);
      if (s.date !== d) return [];
      return [{ k: "ev", id: o.key, ev: o.ev, o, fixed: !!o.google || o.occ !== null, s: s.min, e: Math.max(s.min + 15, e.date === d ? e.min : 1440) }];
    });
    const days_ = allDay.filter((g) => g.start.slice(0, 10) <= d && d < g.end.slice(0, 10));
    const worked = (entries ?? []).filter(mine).flatMap((x): Item[] => {
      const p = localParts(x.started_at, tz);
      return p.date === d ? [{ k: "wk", id: x.id, x, s: p.min, e: Math.min(1440, p.min + Math.max(10, x.minutes)) }] : [];
    });
    const lives = d === t ? (timers ?? []).filter(mine).map((tm) => { const p = localParts(tm.started_at, tz); return { tm, s: p.date === d ? p.min : 0, e: Math.max(nowM, 1) }; }) : [];
    const planned = plan.reduce((a, p) => a + p.e - p.s, 0);
    const logged = worked.reduce((a, w) => a + (w.k === "wk" ? w.x.minutes : 0), 0);
    return { d, left: laneLayout([...plan, ...evs]) as Placed[], right: laneLayout(worked) as Placed[], lives, planned, logged, allDay: days_ };
  });
  const totalPlanned = cols.reduce((a, c) => a + c.planned, 0), totalLogged = cols.reduce((a, c) => a + c.logged, 0);

  // ----- drag to create, move and resize (15-minute steps) -----
  const minuteAt = (col: Element, y: number) => (y - col.getBoundingClientRect().top) / HH * 60;
  function down(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement, col = target.closest<HTMLElement>(".cg-col");
    if (!col) return;
    const blk = target.closest<HTMLElement>(".cg-b"), date = col.dataset.date!;
    let next: Drag;
    if (blk) {
      const kind = blk.dataset.kind;
      if (kind !== "ev" && kind !== "wk") return; // repeating and Google events open on click instead
      const it = cols.find((c) => c.d === date)?.[kind === "ev" ? "left" : "right"].find((x) => x.id === blk.dataset.id);
      if (!it) return;
      const s0 = it.s, e0 = it.k === "wk" ? it.s + it.x.minutes : it.e;
      next = { mode: target.closest(".cg-rs") ? "resize" : "move", it, y0: e.clientY, a: s0, s0, e0, s: s0, e: e0, date, moved: false };
    } else {
      const m = Math.max(0, Math.min(1425, snap15(minuteAt(col, e.clientY) - 7.5)));
      next = { mode: "create", y0: e.clientY, a: m, s0: m, e0: m + 60, s: m, e: m + 60, date, moved: false };
    }
    dragRef.current = next;
    setDrag(next);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.abs(dy) < 5 && d.mode !== "move") return;
    const dm = snap15(dy / HH * 60);
    let { s, e: en, date } = d;
    if (d.mode === "create") { const b = snap15(d.a + dy / HH * 60); s = Math.max(0, Math.min(d.a, b)); en = Math.min(1440, Math.max(d.a, b, s + 15)); }
    else if (d.mode === "resize") en = Math.min(1440, Math.max(d.s0 + 15, d.e0 + dm));
    else {
      const len = d.e0 - d.s0;
      s = Math.max(0, Math.min(1440 - len, d.s0 + dm)); en = s + len;
      const over = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList.contains("cg-col")) as HTMLElement | undefined;
      if (over?.dataset.date) date = over.dataset.date;
    }
    const moved = d.moved || Math.abs(dy) >= 5 || date !== d.date;
    if (s === d.s && en === d.e && date === d.date && moved === d.moved) return;
    dragRef.current = { ...d, s, e: en, date, moved };
    setDrag(dragRef.current);
  }
  function cancel() { dragRef.current = null; setDrag(null); }
  async function up() {
    const d = dragRef.current;
    cancel();
    if (!d) return;
    if (d.mode === "create") {
      const [s, en] = d.moved ? [d.s, d.e] : [d.a, Math.min(1440, d.a + 60)];
      return setForm({ kind: "ev", draft: { date: d.date, start: minToTime(s), end: en >= 1440 ? "23:59" : minToTime(en), client_id: clientId ?? null } });
    }
    const it = d.it!;
    if (!d.moved) return setForm(it.k === "ev" ? { kind: "card", o: it.o } : it.k === "wk" ? { kind: "wk", draft: it.x } : null);
    if (it.k === "ev") {
      const patch = { starts_at: isoAt(d.date, d.s, tz), ends_at: isoAt(d.date, d.e, tz) };
      setEvents((r) => (r ?? []).map((x) => (x.id === it.id ? { ...x, ...patch } : x)));
      const { error } = await supabase().from("events").update(patch).eq("id", it.id);
      if (error) { reloadEvents(); return toast("Could not save. Check your connection."); }
      toast(`Moved to ${fmtClock(d.s)}–${fmtClock(d.e)}${d.date !== localParts(it.ev.starts_at, tz).date ? `, ${parseYmd(d.date).toLocaleDateString("en-US", { weekday: "short" })}` : ""}`);
    } else if (it.k === "wk") {
      const patch = { started_at: isoAt(d.date, d.s, tz), minutes: d.e - d.s };
      setEntries((r) => (r ?? []).map((x) => (x.id === it.id ? { ...x, ...patch } : x)));
      const { error } = await supabase().from("time_entries").update(patch).eq("id", it.id);
      if (error) { reloadEntries(); return toast("Could not save. Check your connection."); }
      toast(`Updated: ${hm(patch.minutes)} from ${fmtClock(d.s)}`);
    }
  }

  // ----- drawing -----
  const y = (m: number) => (m / 60) * HH;
  const box = (s: number, e: number, lane: number, lanes: number, x0: number, w: number, min = 16): React.CSSProperties => ({ top: y(s), height: Math.max(min, y(e) - y(s) - 2), left: `calc(${x0}% + ${(lane / lanes) * w}%)`, width: `calc(${w / lanes}% - 3px)` });
  const block = (it: Placed, s = it.s, e = it.e, dragging = false) => {
    const cls = dragging ? " dragging" : "";
    if (it.k === "plan") return (
      <div key={it.id} className="cg-b plan" style={{ ...box(s, e, it.lane, it.lanes, 0, 58), ["--c" as string]: it.c.color }} title={`${clientLabel(it.c)} · usual hours${it.their ? ` (${it.their} their time)` : ""}`} role="link" tabIndex={0}
        onClick={() => router.push(`/clients/${it.c.id}`)} onKeyDown={(ev) => { if (ev.key === "Enter") router.push(`/clients/${it.c.id}`); }}>
        <b>{clientLabel(it.c)}</b><small>{fmtClock(s)}–{fmtClock(e)}</small>{it.their && <small className="their">{it.their}</small>}
      </div>
    );
    if (it.k === "ev") return (
      <div key={it.id} data-kind={it.fixed ? undefined : "ev"} data-id={it.id} role="button" tabIndex={0}
        className={`cg-b ev${it.ev.kind === "meeting" ? " meet" : ""}${it.o.google ? " gcal" : ""}${it.fixed ? " fixed" : ""}${cls}`}
        style={{ ...box(s, e, it.lane, it.lanes, 0, 58), ["--c" as string]: color(it.ev.client_id, "var(--lilac)") }}
        title={`${it.ev.title || name(it.ev.client_id)}${it.o.google ? " · Google Calendar" : it.o.occ ? " · repeats" : ""}`}
        onClick={it.fixed ? () => setForm({ kind: "card", o: it.o }) : undefined}
        onKeyDown={(ev) => { if (ev.key === "Enter") setForm({ kind: "card", o: it.o }); }}>
        <b>{it.o.occ && <Icon name="repeat" size={10} className="cg-ico" />}{it.ev.link && <Icon name="link" size={10} className="cg-ico" />}{it.ev.title || name(it.ev.client_id)}</b>
        <small>{fmtClock(s)}–{fmtClock(e)}</small>{!it.fixed && <i className="cg-rs" aria-hidden="true" />}
      </div>
    );
    const minutes = dragging ? e - s : it.x.minutes;
    return (
      <div key={it.id} data-kind="wk" data-id={it.id} className={`cg-b wk${cls}`} style={{ ...box(s, dragging ? e : Math.max(e, s + 10), it.lane, it.lanes, 60, 40), ["--c" as string]: color(it.x.client_id, "var(--accent)") }} role="button" tabIndex={0}
        title={`${name(it.x.client_id)}: ${hm(minutes)}${it.x.note ? " · " + it.x.note : ""}`} onKeyDown={(ev) => { if (ev.key === "Enter") setForm({ kind: "wk", draft: it.x }); }}>
        <b>{hm(minutes)}</b><small>{it.x.note || name(it.x.client_id)}</small><i className="cg-rs" aria-hidden="true" />
      </div>
    );
  };
  const live = drag && drag.mode !== "create" && drag.moved ? drag : null;
  const grid = `52px repeat(${days.length}, minmax(0, 1fr))`;
  const rangeTitle = mode === "day"
    ? parseYmd(days[0]).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : `${parseYmd(days[0]).toLocaleDateString("en-US", { month: "long", day: "numeric" })} – ${parseYmd(days[6]).toLocaleDateString("en-US", days[0].slice(5, 7) === days[6].slice(5, 7) ? { day: "numeric" } : { month: "long", day: "numeric" })}`;
  const shift = (n: number) => setAnchor(n === 0 ? todayIn(tz) : addDays(anchor, n * (mode === "day" ? 1 : 7)));
  const newBlock = () => setForm({ kind: "ev", draft: { date: days.includes(t) ? t : days[0], client_id: clientId ?? null } });
  const newMeeting = () => setForm({ kind: "ev", draft: { date: days.includes(t) ? t : days[0], client_id: clientId ?? null, kind: "meeting" } });

  return (
    <>
      <div className="row cal-bar">
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="cal-title">{rangeTitle}</b>
          <span className="small muted">{hrs(totalLogged)}h logged of {hrs(totalPlanned)}h planned · times in {tz === deviceTz() ? "your time" : "their time"} ({tzShort(tz)})</span>
        </div>
        <Seg label="Calendar view" options={[["day", "Day"], ["week", "Week"]]} value={mode} onChange={setMode} />
        <div className="row" style={{ gap: 6 }}>
          <button className="btn" onClick={() => shift(-1)} aria-label={mode === "day" ? "Previous day" : "Previous week"}><Icon name="left" /></button>
          <button className="btn" onClick={() => shift(0)}>Today</button>
          <button className="btn" onClick={() => shift(1)} aria-label={mode === "day" ? "Next day" : "Next week"}><Icon name="right" /></button>
        </div>
        <button className="btn" onClick={newMeeting}><Icon name="chat" />Meeting</button>
        <button className="btn solid" onClick={newBlock}><Icon name="plus" />Block time</button>
      </div>
      <div className="cg">
        <div className="cg-head" style={{ gridTemplateColumns: grid }}>
          <span />
          {cols.map((c) => (
            <button key={c.d} className={`cg-day${c.d === t ? " today" : ""}`} onClick={() => { setMode("day"); setAnchor(c.d); }} aria-label={`Open ${parseYmd(c.d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`}>
              <span>{parseYmd(c.d).toLocaleDateString("en-US", { weekday: "short" })}</span>
              <b>{+c.d.slice(8)}</b>
              <small>{hrs(c.logged)}h{c.planned ? ` / ${hrs(c.planned)}h` : ""}</small>
            </button>
          ))}
        </div>
        {cols.some((c) => c.allDay.length) && (
          <div className="cg-head cg-allday" style={{ gridTemplateColumns: grid }}>
            <span className="small muted" style={{ alignSelf: "center", textAlign: "right", paddingRight: 8, fontSize: 10 }}>All day</span>
            {cols.map((c) => (
              <div key={c.d} className="cg-ad">{c.allDay.map((g) => (
                <button key={g.id} className="cg-chip" onClick={() => setForm({ kind: "card", o: { ev: gAsEvent(g), key: `g:${g.id}`, start: Date.parse(g.start), end: Date.parse(g.end), occ: null, google: g } })}>{g.title}</button>
              ))}</div>
            ))}
          </div>
        )}
        <div className="cg-scroll" ref={scroller}>
          <div className="cg-body" style={{ gridTemplateColumns: grid, height: 24 * HH }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>
            <div className="cg-hours" aria-hidden="true">{[...Array(24)].map((_, h) => <span key={h} style={{ top: h * HH }}>{h ? fmtClock(h * 60) : ""}</span>)}</div>
            {cols.map((c) => (
              <div key={c.d} className={`cg-col${c.d === t ? " today" : ""}${weekday(c.d) > 5 ? " we" : ""}`} data-date={c.d}>
                {c.left.filter((it) => it.id !== live?.it?.id).map((it) => block(it))}
                {c.right.filter((it) => it.id !== live?.it?.id).map((it) => block(it))}
                {live?.it && live.date === c.d && block(live.it, live.s, live.e, true)}
                {c.lives.map((lv, i) => (
                  <div key={lv.tm.id} className="cg-b wk live" style={{ top: y(lv.s), height: Math.max(16, y(lv.e) - y(lv.s)), left: `calc(60% + ${i * 4}px)`, width: "calc(40% - 3px)", ["--c" as string]: color(lv.tm.client_id, "var(--rose)") }} title={`${name(lv.tm.client_id)} timer running`}>
                    <b>Now</b><small>{name(lv.tm.client_id)}</small>
                  </div>
                ))}
                {drag?.mode === "create" && drag.date === c.d && (
                  <div className="cg-b ghost" style={{ top: y(drag.s), height: Math.max(12, y(drag.e) - y(drag.s) - 2) }}><small>{fmtClock(drag.s)}–{fmtClock(drag.e)}</small></div>
                )}
                {c.d === t && <i className="cg-now" style={{ top: y(nowM) }} />}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="legend">
        <span><i className="lg plan" />Usual client hours</span>
        <span><i className="lg ev" />Blocked time</span>
        <span><i className="lg meet" />Meetings</span>
        <span><i className="lg wk" />Hours you logged</span>
        <span>Drag on empty space to block time. Drag a block to move it, or pull its bottom edge to resize.</span>
      </div>
      {form?.kind === "ev" && <EventForm ev={form.draft} clients={clients} onClose={() => setForm(null)} onSaved={reloadEvents} tz={tz} />}
      {form?.kind === "card" && <EventCard o={form.o} clients={clients} tz={tz} onClose={() => setForm(null)} onEdit={(ev) => setForm({ kind: "ev", draft: ev })} onChanged={reloadEvents} />}
      {form?.kind === "wk" && <TimeForm entry={form.draft} clients={clients} onClose={() => setForm(null)} onSaved={reloadEntries} tz={tz} />}
    </>
  );
}

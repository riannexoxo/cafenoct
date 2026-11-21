"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/use-rows";
import { ymd } from "@/lib/dates";
import { deviceTz, tzShort } from "@/lib/tz";
import { freeSlots, icsHref, type BookingInfo } from "@/lib/booking";
import Nocti from "@/components/nocti";
import Icon from "@/components/icon";

export type { BookingInfo };
const noop = () => () => {};
const dayName = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const timeOf = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

// Pick a day, pick a time, say who you are. Times show in the visitor's own zone.
export default function BookingPage({ slug, initial }: { slug: string; initial: BookingInfo }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="pb-skel" aria-busy="true"><div className="skel" /><div className="skel" /></div>;
  return <Picker slug={slug} initial={initial} />;
}

function Picker({ slug, initial }: { slug: string; initial: BookingInfo }) {
  const [info, setInfo] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ start: number; end: number } | null>(null);
  const [gone, setGone] = useState(false);

  const byDay = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const s of freeSlots(info, now)) { const d = ymd(new Date(s)); m.set(d, [...(m.get(d) ?? []), s]); }
    return m;
  }, [info, now]);
  const days = [...byDay.keys()];
  const pick = day && byDay.has(day) ? day : days[0] ?? null;
  const here = deviceTz(), owner = info.owner || "your host";

  async function refresh() {
    const { data } = await supabase().rpc("booking_info", { p_slug: slug });
    if (data) setInfo(data as BookingInfo); else setGone(true);
    setNow(Date.now());
  }
  async function book(e: React.FormEvent) {
    e.preventDefault();
    if (slot == null) return;
    if (!name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr("Please add your name and a working email.");
    setBusy(true); setErr("");
    const { data, error } = await supabase().rpc("booking_create", { p_slug: slug, p_start: new Date(slot).toISOString(), p_name: name.trim(), p_email: email.trim(), p_note: note.trim() });
    setBusy(false);
    if (!error) {
      const r = data as { starts_at: string; ends_at: string } | null;
      return setDone({ start: r ? Date.parse(r.starts_at) : slot, end: r ? Date.parse(r.ends_at) : slot + info.duration_min * 60000 });
    }
    const timeGone = error.code === "23P01" || (error.code === "22023" && /time/i.test(error.message));
    if (timeGone) { setSlot(null); await refresh(); }
    setErr(
      error.code === "23P01" ? "Someone just took that time. Here are the times still open."
        : timeGone ? "That time isn't open anymore. Please pick another."
        : error.code === "22023" ? "Please check your name and email."
        : error.code === "54000" ? "Lots of bookings right now. Please try again in a few minutes."
        : error.code === "P0002" ? "This booking page was just closed."
        : "Could not book that. Check your connection and try again.",
    );
  }

  if (gone) return (
    <div className="pt-calm"><Nocti size={96} /><h1>This booking page is resting</h1><p className="muted">It was paused a moment ago. Ask for a fresh link and you&apos;ll be all set.</p></div>
  );
  if (done) return (
    <div className="pt-calm pb-done" role="status">
      <Nocti mood="awake" state="happy" size={112} />
      <h1>You&apos;re booked!</h1>
      <p><b>{dayName(done.start)}</b><br />{timeOf(done.start)} – {timeOf(done.end)} ({tzShort(here)})</p>
      <p className="muted">{info.owner ? `${info.owner} has it` : "It's"} on the calendar. See you then.</p>
      <a className="btn big" href={icsHref(`${info.title}${info.owner ? ` with ${info.owner}` : ""}`, done.start, done.end, `${done.start}-${slug}@cafenoct`)} download="booking.ics">
        <Icon name="today" />Add to my calendar
      </a>
    </div>
  );

  return (
    <>
      <div className="pt-ask">
        {info.owner && <div className="eyebrow">{info.owner}</div>}
        <h1>{info.title}</h1>
        <p className="muted pb-facts"><Icon name="schedule" size={15} />{info.duration_min} min</p>
        {info.intro && <p className="pb-intro">{info.intro}</p>}
      </div>

      {err && <div className="pb-err" role="alert">{err}</div>}

      {slot == null ? (
        <section className="card pb-step" aria-label="Pick a time">
          {days.length === 0 ? (
            <div className="empty"><Nocti size={72} /><b>No open times right now.</b><span>Please check back soon.</span></div>
          ) : (
            <>
              <h2 className="pb-h">Pick a day</h2>
              <div className="pb-daylist" role="group" aria-label="Days with open times">
                {days.map((d) => {
                  const first = byDay.get(d)![0], dt = new Date(first);
                  return (
                    <button key={d} type="button" className={d === pick ? "on" : ""} aria-pressed={d === pick} onClick={() => setDay(d)} aria-label={`${dayName(first)}, ${byDay.get(d)!.length} times`}>
                      <small>{dt.toLocaleDateString(undefined, { weekday: "short" })}</small>
                      <b>{dt.getDate()}</b>
                      <small>{dt.toLocaleDateString(undefined, { month: "short" })}</small>
                    </button>
                  );
                })}
              </div>
              {pick && (
                <>
                  <h2 className="pb-h">{dayName(byDay.get(pick)![0])}</h2>
                  <div className="pb-slots" key={pick}>
                    {byDay.get(pick)!.map((s) => <button key={s} type="button" className="btn" onClick={() => { setSlot(s); setErr(""); }}>{timeOf(s)}</button>)}
                  </div>
                </>
              )}
              <p className="small muted pb-zone">
                <Icon name="today" size={14} />Times are in your time zone ({tzShort(here)}).{here !== info.tz && ` ${owner[0].toUpperCase() + owner.slice(1)} works in ${tzShort(info.tz)}.`}
              </p>
            </>
          )}
        </section>
      ) : (
        <section className="card pb-step" aria-label="Your details">
          <div className="pb-chosen">
            <span className="pb-chosen-ic"><Icon name="schedule" /></span>
            <span><b>{dayName(slot)}</b><br /><span className="muted">{timeOf(slot)} – {timeOf(slot + info.duration_min * 60000)} ({tzShort(here)})</span></span>
            <button type="button" className="btn small ghost" onClick={() => setSlot(null)}>Change</button>
          </div>
          <form className="form pb-form" onSubmit={book}>
            <div className="field full"><label htmlFor="bk-name">Your name</label><input id="bk-name" autoComplete="name" maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="field full"><label htmlFor="bk-email">Email</label><input id="bk-email" type="email" inputMode="email" autoComplete="email" maxLength={254} required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field full"><label htmlFor="bk-note">Anything to share? (optional)</label><textarea id="bk-note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you'd like to talk about" /></div>
            <button type="submit" className="btn solid big full" disabled={busy}>{busy ? "Booking…" : "Book this time"}</button>
          </form>
        </section>
      )}
      <p className="small muted pt-fine">No account needed. Your details go only to {owner}.</p>
    </>
  );
}

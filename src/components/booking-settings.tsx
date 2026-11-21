"use client";

import "@/styles/public.css";
import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import { deviceTz, tzShort } from "@/lib/tz";
import { clientLabel } from "@/lib/types";
import Modal from "./modal";
import Icon from "./icon";
import CopyButton from "./copy-button";

export type Page = {
  id: string; slug: string; title: string; intro: string; duration_min: number; days: number[]; day_start: string; day_end: string;
  tz: string; notice_hours: number; horizon_days: number; client_id: string | null; active: boolean;
};
export type MiniClient = { id: string; name: string; company: string; status: string };
const COLS = "id,slug,title,intro,duration_min,days,day_start,day_end,tz,notice_hours,horizon_days,client_id,active";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const SLUG = /^[a-z0-9][a-z0-9-]{2,39}$/;
const noop = () => () => {};

export const useOrigin = () => useSyncExternalStore(noop, () => location.origin, () => "");
export const useClients = () => useRows<MiniClient>("mini-clients", (s) => s.from("clients").select("id,name,company,status").order("name").limit(500), ["clients"])[0];
export const validTz = (z: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return !!z; } catch { return false; } };
const zones = () => { try { return Intl.supportedValuesOf("timeZone"); } catch { return []; } };

// The link name, checked as you type. Other people's links are only visible through the public lookup.
export function SlugField({ id, value, onChange, original, own, lookup, prefix }: {
  id: string; value: string; onChange: (v: string) => void; original: string; own: string[]; lookup: "booking_info" | "intake_info"; prefix: string;
}) {
  const [found, setFound] = useState<{ slug: string; taken: boolean } | null>(null);
  const ok = SLUG.test(value), mine = value === original, taken = own.includes(value), known = found?.slug === value;
  useEffect(() => {
    if (!ok || mine || taken || known) return;
    const t = setTimeout(async () => {
      const { data, error } = await supabase().rpc(lookup, { p_slug: value });
      if (!error) setFound({ slug: value, taken: data != null });
    }, 350);
    return () => clearTimeout(t);
  }, [value, ok, mine, taken, known, lookup]);
  const state = !value ? "" : !ok ? "bad" : mine ? "free" : taken ? "taken" : known ? (found?.taken ? "taken" : "free") : "checking";
  return (
    <div className="field full">
      <label htmlFor={id}>Link</label>
      <div className="pb-slug">
        <span className="pb-prefix" aria-hidden="true">{prefix}</span>
        <input id={id} value={value} maxLength={40} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby={`${id}-hint`} aria-invalid={state === "bad" || state === "taken"}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))} placeholder="discovery-call" />
      </div>
      <span id={`${id}-hint`} className={`small pb-hint ${state}`} aria-live="polite">
        {state === "bad" ? "3 to 40 letters, numbers or dashes, starting with a letter or number." : state === "taken" ? "That link is taken. Try another." : state === "free" ? "Available" : state === "checking" ? "Checking…" : "Letters, numbers and dashes."}
      </span>
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="pb-switch">
      <button type="button" role="switch" aria-checked={on} className={`sw${on ? " on" : ""}`} onClick={() => onChange(!on)} />
      <span>{label}</span>
    </label>
  );
}

const hm = (t: string) => t.slice(0, 5);
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
const dayText = (d: number[]) => (d.join() === "1,2,3,4,5" ? "Mon–Fri" : d.length === 7 ? "Every day" : [...d].sort((a, b) => a - b).map((x) => DAYS[x - 1]).join(", "));

// Calendly, the CafeNoct way: one or more public pages where people pick a free time on your calendar.
export default function BookingSettings() {
  const [pages, reload] = useRows<Page>("booking-pages", (s) => s.from("booking_pages").select(COLS).order("created_at").limit(50), ["booking_pages"]);
  const clients = useClients();
  const origin = useOrigin();
  const [form, setForm] = useState<Partial<Page> | null>(null);

  async function toggle(p: Page, active: boolean) {
    const { error } = await supabase().from("booking_pages").update({ active }).eq("id", p.id);
    if (error) return toast("Could not save. Try again.");
    toast(active ? "Booking page is on" : "Booking page is paused");
    reload();
  }

  return (
    <div className="card pb-card">
      <h3><span>Booking pages</span><button type="button" className="btn small" onClick={() => setForm({})}><Icon name="plus" />New page</button></h3>
      <p className="small muted" style={{ margin: 0 }}>Share a link and people pick a free time. CafeNoct only offers times when your calendar is clear, and the booking lands on your Calendar.</p>
      {pages === null ? <div className="skel" style={{ height: 56, borderRadius: 14 }} /> : pages.length === 0 ? (
        <button type="button" className="btn solid pb-first" onClick={() => setForm({})}><Icon name="today" />Make your first booking page</button>
      ) : (
        <ul className="pb-list">
          {pages.map((p) => {
            const url = `${origin}/book/${p.slug}`;
            return (
              <li key={p.id} className={p.active ? "" : "off"}>
                <div className="pb-main">
                  <b>{p.title}</b>
                  <span className="small muted">{p.duration_min} min · {dayText(p.days)} · {hm(p.day_start)}–{hm(p.day_end)} {tzShort(p.tz)}</span>
                  <a className="small pb-url" href={url} target="_blank" rel="noopener noreferrer">{url.replace(/^https?:\/\//, "")}</a>
                </div>
                <div className="row pb-actions">
                  <Switch on={p.active} onChange={(v) => toggle(p, v)} label={p.active ? "On" : "Off"} />
                  <CopyButton text={url} label="Copy link" done="Link copied" />
                  <button type="button" className="btn small" onClick={() => setForm(p)}>Edit</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {form && <BookingForm p={form} own={(pages ?? []).map((x) => x.slug)} clients={clients ?? []} onClose={() => setForm(null)} onSaved={reload} />}
    </div>
  );
}

function BookingForm({ p, own, clients, onClose, onSaved }: { p: Partial<Page>; own: string[]; clients: MiniClient[]; onClose: () => void; onSaved: () => void }) {
  const [slug, setSlug] = useState(p.slug ?? "");
  const [title, setTitle] = useState(p.title ?? "Discovery call");
  const [intro, setIntro] = useState(p.intro ?? "");
  const [duration, setDuration] = useState(String(p.duration_min ?? 30));
  const [days, setDays] = useState<number[]>(p.days ?? [1, 2, 3, 4, 5]);
  const [start, setStart] = useState(hm(p.day_start ?? "09:00"));
  const [end, setEnd] = useState(hm(p.day_end ?? "17:00"));
  const [tz, setTz] = useState(p.tz ?? deviceTz());
  const [notice, setNotice] = useState(String(p.notice_hours ?? 12));
  const [horizon, setHorizon] = useState(String(p.horizon_days ?? 30));
  const [clientId, setClientId] = useState(p.client_id ?? "");
  const [active, setActive] = useState(p.active ?? true);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [list] = useState(zones);
  const others = own.filter((s) => s !== p.slug);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const dur = Number(duration), nh = Number(notice), hd = Number(horizon);
    if (!SLUG.test(slug)) return toast("Check the link: 3 to 40 letters, numbers or dashes.");
    if (others.includes(slug)) return toast("You already use that link.");
    if (!title.trim() || title.trim().length > 80) return toast("Give the page a title (up to 80 characters).");
    if (!Number.isInteger(dur) || dur < 15 || dur > 240) return toast("Length is 15 to 240 minutes.");
    if (!days.length) return toast("Pick at least one day.");
    if (!start || !end || toMin(end) - toMin(start) < dur) return toast("The day needs to be at least as long as one meeting.");
    if (!validTz(tz)) return toast("That time zone isn't one we know. Try a name like America/New_York.");
    if (!Number.isInteger(nh) || nh < 0 || nh > 336) return toast("Notice is 0 to 336 hours.");
    if (!Number.isInteger(hd) || hd < 1 || hd > 90) return toast("How far ahead is 1 to 90 days.");
    setBusy(true);
    const row = { slug, title: title.trim(), intro: intro.trim().slice(0, 1000), duration_min: dur, days: [...days].sort((a, b) => a - b), day_start: start, day_end: end, tz, notice_hours: nh, horizon_days: hd, client_id: clientId || null, active };
    const { error } = p.id ? await supabase().from("booking_pages").update(row).eq("id", p.id) : await supabase().from("booking_pages").insert(row);
    setBusy(false);
    if (error) return toast(error.code === "23505" ? "That link is taken. Try another." : "Could not save. Try again.");
    toast(p.id ? "Booking page saved" : "Booking page ready. Copy the link to share it.");
    onSaved();
    onClose();
  }
  async function remove() {
    if (!p.id) return;
    if (!sure) return setSure(true);
    const { error } = await supabase().from("booking_pages").delete().eq("id", p.id);
    if (error) return toast("Could not delete. Try again.");
    toast("Booking page deleted. Bookings already made stay on your calendar.");
    onSaved();
    onClose();
  }

  return (
    <Modal label={p.id ? "Edit booking page" : "New booking page"} onClose={onClose} wide>
      <form onSubmit={save} style={{ display: "contents" }}>
        <h2>{p.id ? "Edit booking page" : "New booking page"}</h2>
        <div className="form">
          <SlugField id="bp-slug" value={slug} onChange={setSlug} original={p.slug ?? ""} own={others} lookup="booking_info" prefix="/book/" />
          <div className="field"><label htmlFor="bp-title">Title</label><input id="bp-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="field"><label htmlFor="bp-dur">Length (minutes)</label><input id="bp-dur" type="number" inputMode="numeric" min={15} max={240} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
          <div className="field full"><label htmlFor="bp-intro">A short hello</label><textarea id="bp-intro" maxLength={1000} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="A quick call to see how I can help. Bring your questions!" style={{ minHeight: 64 }} /></div>
          <div className="field full">
            <span className="pb-flabel" id="bp-days">Days</span>
            <div className="pb-days" role="group" aria-labelledby="bp-days">
              {DAYS.map((d, i) => {
                const on = days.includes(i + 1);
                return <button key={d} type="button" aria-pressed={on} className={on ? "on" : ""} onClick={() => setDays(on ? days.filter((x) => x !== i + 1) : [...days, i + 1])}>{d}</button>;
              })}
            </div>
          </div>
          <div className="field"><label htmlFor="bp-start">From</label><input id="bp-start" type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="field"><label htmlFor="bp-end">Until</label><input id="bp-end" type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <div className="field full">
            <label htmlFor="bp-tz">Time zone</label>
            <input id="bp-tz" list="bp-zones" value={tz} onChange={(e) => setTz(e.target.value.trim())} aria-invalid={!validTz(tz)} autoCapitalize="none" spellCheck={false} />
            <datalist id="bp-zones">{list.map((z) => <option key={z} value={z} />)}</datalist>
            <span className={`small pb-hint ${validTz(tz) ? "" : "bad"}`}>{validTz(tz) ? `Hours are in ${tzShort(tz)}. Visitors see times in their own zone.` : "Pick a time zone from the list."}</span>
          </div>
          <div className="field"><label htmlFor="bp-notice">Notice (hours)</label><input id="bp-notice" type="number" inputMode="numeric" min={0} max={336} value={notice} onChange={(e) => setNotice(e.target.value)} /></div>
          <div className="field"><label htmlFor="bp-hz">Days ahead</label><input id="bp-hz" type="number" inputMode="numeric" min={1} max={90} value={horizon} onChange={(e) => setHorizon(e.target.value)} /></div>
          <div className="field"><label htmlFor="bp-client">Client (optional)</label>
            <select id="bp-client" value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Anyone</option>{clients.filter((c) => c.status !== "Past" || c.id === clientId).map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}</select>
          </div>
          <div className="field pb-active"><Switch on={active} onChange={setActive} label={active ? "Taking bookings" : "Paused"} /></div>
        </div>
        <div className="modal-foot">
          {p.id && <button type="button" className="btn danger left" onClick={remove} onBlur={() => setSure(false)}>{sure ? "Tap again to delete" : "Delete"}</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{busy ? "Saving…" : p.id ? "Save" : "Create page"}</button>
        </div>
      </form>
    </Modal>
  );
}

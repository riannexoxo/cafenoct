"use client";

import { useState } from "react";
import { supabase } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import Icon from "./icon";

const looksRight = (u: string) => /^(https|webcal):\/\/(calendar\.google\.com|p\d+-caldav\.icloud\.com|outlook\.(live|office365|office)\.com)\//i.test(u.trim());

// Shows your Google Calendar on My calendar, using the calendar's private iCal address.
export default function CalendarConnect({ connected: initial }: { connected: boolean }) {
  const [connected, setConnected] = useState(initial);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function check() {
    const from = new Date(), to = new Date(Date.now() + 7 * 864e5);
    const r = await fetch(`/api/gcal?from=${from.toISOString()}&to=${to.toISOString()}`);
    const j = (await r.json()) as { events?: unknown[]; error?: string };
    if (j.error) { setStatus(j.error); return false; }
    setStatus(`Connected. ${j.events?.length ?? 0} event${j.events?.length === 1 ? "" : "s"} in the next 7 days.`);
    return true;
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!looksRight(url)) return toast("Paste the secret address in iCal format from Google Calendar. It starts with https://calendar.google.com/");
    setBusy(true);
    const { data: auth } = await supabase().auth.getSession();
    const { error } = await supabase().from("profiles").update({ gcal_url: url.trim() }).eq("user_id", auth.session?.user.id ?? "");
    if (error) { setBusy(false); return toast("Could not save. Try again."); }
    setUrl("");
    setConnected(true);
    const ok = await check();
    setBusy(false);
    toast(ok ? "Google Calendar connected" : "Saved, but Google didn't answer yet");
  }
  async function disconnect() {
    setBusy(true);
    const { data: auth } = await supabase().auth.getSession();
    const { error } = await supabase().from("profiles").update({ gcal_url: "" }).eq("user_id", auth.session?.user.id ?? "");
    setBusy(false);
    if (error) return toast("Could not disconnect. Try again.");
    setConnected(false);
    setStatus("");
    toast("Google Calendar disconnected");
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h3><span>Google Calendar</span>{connected ? <span className="pill good">Connected</span> : <span className="pill">Not connected</span>}</h3>
      <p className="small muted" style={{ margin: 0 }}>Your Google events show on My calendar next to your client hours, with their meeting links. New events you add in Google appear within a few minutes. This reads your calendar only. It never changes it.</p>
      {connected ? (
        <div className="row">
          <button className="btn" disabled={busy} onClick={async () => { setBusy(true); await check(); setBusy(false); }}><Icon name="repeat" />Check connection</button>
          <button className="btn ghost danger" disabled={busy} onClick={disconnect}>Disconnect</button>
          {status && <span className="small muted" role="status">{status}</span>}
        </div>
      ) : (
        <>
          <ol className="small steps">
            <li>Open <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noopener noreferrer">Google Calendar settings</a> on a computer.</li>
            <li>On the left, under <b>Settings for my calendars</b>, click your calendar.</li>
            <li>Scroll to <b>Integrate calendar</b> and copy the <b>Secret address in iCal format</b>.</li>
            <li>Paste it below. Keep it private: anyone with this address can see your calendar.</li>
          </ol>
          <form className="row" onSubmit={save}>
            <input className="search grow" style={{ minWidth: 220 }} type="password" autoComplete="off" spellCheck={false} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Secret address in iCal format" />
            <button className="btn solid" type="submit" disabled={busy || !url.trim()}>{busy ? "Connecting…" : "Connect"}</button>
          </form>
          {status && <span className="small muted" role="status">{status}</span>}
        </>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { supabase } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import { deviceTz } from "@/lib/tz";
import { isDesktop, notify } from "@/lib/desktop";
import { autoSettings, type AutoSettings, type Nudge } from "@/lib/automations";
import { clientLabel, type Client } from "@/lib/types";
import Icon from "./icon";

const noop = () => () => {};
type Sent = { key: string; title: string; body: string; url: string; sent_at: string };

function Sw({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`sw${on ? " on" : ""}`} onClick={() => onChange(!on)} />;
}

function Pick({ id, value, options, onChange, unit }: { id: string; value: number; options: number[]; onChange: (n: number) => void; unit: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} className="auto-pick">
      {options.map((o) => <option key={o} value={o}>{o} {unit}</option>)}
    </select>
  );
}

// Turns on reminders, picks what they cover, and shows today's plan.
export default function Automations({ clients, saved, google, vapid }: { clients: Client[]; saved: unknown; google: boolean; vapid: string }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  const [s, setS] = useState<AutoSettings>(() => autoSettings(saved));
  const [started, setStarted] = useState(saved != null);

  const save = useCallback(async (next: AutoSettings) => {
    setS(next);
    setStarted(true);
    const { data: auth } = await supabase().auth.getSession();
    const uid = auth.session?.user.id ?? "";
    const { data } = await supabase().from("profiles").select("settings").eq("user_id", uid).maybeSingle<{ settings: Record<string, unknown> }>();
    const { error } = await supabase().from("profiles").update({ settings: { ...(data?.settings ?? {}), automations: { ...next, tz: deviceTz() } } }).eq("user_id", uid);
    if (error) toast("Could not save. Check your connection.");
  }, []);
  const patch = <K extends keyof AutoSettings>(k: K, v: Partial<AutoSettings[K]>) => save({ ...s, [k]: { ...(s[k] as object), ...v } });

  return (
    <div className="auto-grid">
      <div className="auto-col">
        {ready ? <Device vapid={vapid} onFirst={() => { if (!started) save(s); }} /> : <div className="card skel" style={{ height: 150 }} />}

        <div className="card">
          <h3><span>Reminders</span><span className="muted small">in your time ({ready ? deviceTz().split("/").pop()?.replace("_", " ") : ""})</span></h3>

          <div className="auto">
            <div className="ic"><Icon name="file" /></div>
            <div className="grow">
              <b>EOD report due</b>
              <p>Before each shift ends, if you haven&apos;t saved that day&apos;s report. Weekly clients get it on their last work day.</p>
              {s.eod.on && (
                <div className="auto-more">
                  <label htmlFor="a-eod">Remind me</label> <Pick id="a-eod" value={s.eod.before} options={[15, 30, 45, 60]} unit="min before" onChange={(n) => patch("eod", { before: n })} />
                  <div className="auto-chips" role="group" aria-label="Clients">
                    {clients.map((c) => {
                      const on = !s.eod.skip.includes(c.id);
                      return <button key={c.id} type="button" aria-pressed={on} className={`btn small${on ? " solid" : ""}`} onClick={() => patch("eod", { skip: on ? [...s.eod.skip, c.id] : s.eod.skip.filter((x) => x !== c.id) })}>{on && <Icon name="check" size={14} />}{clientLabel(c)}</button>;
                    })}
                  </div>
                </div>
              )}
            </div>
            <Sw on={s.eod.on} label="EOD report reminders" onChange={(v) => patch("eod", { on: v })} />
          </div>

          <div className="auto">
            <div className="ic"><Icon name="tasks" /></div>
            <div className="grow">
              <b>Daily task check-in</b>
              <p>One morning note with what&apos;s due today and anything overdue, repeating tasks included.</p>
              {s.tasks.on && <div className="auto-more"><label htmlFor="a-at">Send at</label> <input id="a-at" type="time" className="auto-pick" value={s.tasks.at} onChange={(e) => e.target.value && patch("tasks", { at: e.target.value })} /></div>}
            </div>
            <Sw on={s.tasks.on} label="Daily task check-in" onChange={(v) => patch("tasks", { on: v })} />
          </div>

          <div className="auto">
            <div className="ic"><Icon name="money" /></div>
            <div className="grow">
              <b>Invoice due and overdue</b>
              <p>For sent invoices: a heads-up before the due date, then every 3 days while it&apos;s unpaid. Sent with your check-in.</p>
              {s.invoices.on && <div className="auto-more"><label htmlFor="a-inv">Heads-up</label> <Pick id="a-inv" value={s.invoices.days} options={[1, 2, 3, 5, 7]} unit="days before" onChange={(n) => patch("invoices", { days: n })} /></div>}
            </div>
            <Sw on={s.invoices.on} label="Invoice reminders" onChange={(v) => patch("invoices", { on: v })} />
          </div>

          <div className="auto">
            <div className="ic"><Icon name="schedule" /></div>
            <div className="grow">
              <b>Meeting heads-up</b>
              <p>Before meetings on your calendar. Tap the reminder to join the call.</p>
              {s.meetings.on && (
                <div className="auto-more">
                  <label htmlFor="a-meet">Remind me</label> <Pick id="a-meet" value={s.meetings.before} options={[5, 10, 15, 30]} unit="min before" onChange={(n) => patch("meetings", { before: n })} />
                  {google && <label className="row small" style={{ gap: 8, marginTop: 8 }}><Sw on={s.meetings.google} label="Include Google Calendar" onChange={(v) => patch("meetings", { google: v })} />Include Google Calendar events</label>}
                </div>
              )}
            </div>
            <Sw on={s.meetings.on} label="Meeting reminders" onChange={(v) => patch("meetings", { on: v })} />
          </div>

          <div className="auto">
            <div className="ic"><Icon name="spark" /></div>
            <div className="grow">
              <b>What&apos;s next, when you finish a task</b>
              <p>Tick a task off and CafeNoct tells you the next one on your list.</p>
            </div>
            <Sw on={s.nextUp.on} label="Show the next task" onChange={(v) => patch("nextUp", { on: v })} />
          </div>
        </div>
      </div>

      <div className="auto-col">
        {ready && started && <Today key={JSON.stringify(s)} />}
        <BackTap />
      </div>
    </div>
  );
}

// Turning on notifications for the device you're holding.
function Device({ vapid, onFirst }: { vapid: string; onFirst: () => void }) {
  const desktop = isDesktop();
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const canPush = "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canPush || desktop) return;
    navigator.serviceWorker.getRegistration("/").then((r) => r?.pushManager.getSubscription()).then((x) => setSub(x ?? null)).catch(() => {});
  }, [canPush, desktop]);

  async function turnOn() {
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") { toast("Notifications are blocked. Allow them in your settings, then try again."); return; }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const raw = Uint8Array.from(atob(vapid.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(vapid.length / 4) * 4, "=")), (ch) => ch.charCodeAt(0));
      const x = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
      const j = x.toJSON();
      const device = ios ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android" : /Mac/.test(navigator.userAgent) ? "Mac browser" : "Computer";
      const { error } = await supabase().from("push_subs").upsert({ endpoint: x.endpoint, p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "", device }, { onConflict: "endpoint" });
      if (error) { await x.unsubscribe(); toast("Could not save this device. Try again."); return; }
      setSub(x);
      onFirst();
      toast("Reminders are on for this device");
    } catch { toast("This browser couldn't turn on reminders."); } finally { setBusy(false); }
  }
  async function turnOff() {
    if (!sub) return;
    await supabase().from("push_subs").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe().catch(() => {});
    setSub(null);
    toast("Reminders are off for this device");
  }
  async function test() {
    if (desktop) { onFirst(); return toast((await notify("CafeNoct reminders are on ☕", "This is how your nudges will look on your Mac.")) ? "Sent. Check the top right of your screen." : "Allow CafeNoct in System Settings › Notifications."); }
    const r = await fetch("/api/automations/test", { method: "POST" }).then((x) => x.json()).catch(() => ({ error: "Check your connection." }));
    toast(r.error ?? "Sent. It should pop up in a few seconds.");
  }

  let body: React.ReactNode;
  if (desktop) body = <><p>The Mac app shows reminders on its own while it&apos;s open. Closing the window keeps it running in the menu bar, so leave it there.</p><button className="btn solid" onClick={test}><Icon name="bell" />Send a test</button></>;
  else if (ios && !standalone) body = <><p>iPhone reminders work from the home-screen app. In Safari tap <b>Share</b> › <b>Add to Home Screen</b>, open CafeNoct from your home screen, then come back to this page.</p></>;
  else if (!canPush || !vapid) body = <p>This browser can&apos;t show reminders. Try Chrome or Safari, or the CafeNoct home-screen app on your phone.</p>;
  else if (sub) body = <><p><span className="pill" style={{ background: "var(--good-tint, var(--tint-strong))" }}><span className="dot-live" />On for this device</span></p><div className="row" style={{ gap: 8 }}><button className="btn solid" onClick={test}><Icon name="bell" />Send a test</button><button className="btn" onClick={turnOff}>Turn off here</button></div></>;
  else body = <><p>Say yes when your {ios ? "iPhone" : "browser"} asks. Do this once on each device you want nudges on.</p><button className="btn solid" disabled={busy} onClick={turnOn}><Icon name="bell" />{busy ? "Turning on…" : "Turn on reminders here"}</button></>;

  return <div className="card auto-device"><h3><span>This device</span>{desktop && <span className="muted small">Mac app</span>}</h3>{body}</div>;
}

// What's planned for today, and what already went out.
function Today() {
  const [d, setD] = useState<{ nudges: Nudge[]; sent: Sent[] } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/automations/due?day=1").then((r) => r.json()).then((j) => { if (alive) setD({ nudges: j.nudges ?? [], sent: j.sent ?? [] }); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const time = (ms: number | string) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sentKeys = new Set(d?.sent.map((x) => x.key));
  return (
    <div className="card">
      <h3><span>Today&apos;s plan</span></h3>
      {!d ? <div className="skel" style={{ height: 90 }} /> : d.nudges.length === 0 ? <p className="muted small">Nothing to nudge you about today. Enjoy it.</p> : (
        <div className="list">
          {d.nudges.map((n) => (
            <div className="li" key={n.key}>
              <span className="num small muted" style={{ width: 64, flex: "none" }}>{time(n.at)}</span>
              <span className="t">{n.title}<small>{n.body}</small></span>
              {sentKeys.has(n.key) && <span className="pill">Sent</span>}
            </div>
          ))}
        </div>
      )}
      {d && d.sent.length > 0 && (
        <details className="auto-sent">
          <summary className="small muted">Recently sent</summary>
          <div className="list">{d.sent.map((x) => <div className="li" key={x.key}><span className="num small muted" style={{ width: 64, flex: "none" }}>{time(x.sent_at)}</span><span className="t">{x.title}<small>{x.body}</small></span></div>)}</div>
        </details>
      )}
    </div>
  );
}

// Setting up the iPhone shortcut: tap the back of the phone to open CafeNoct's quick screen.
function BackTap() {
  return (
    <div className="card">
      <h3><span>iPhone Back Tap shortcut</span><Icon name="apps" size={18} /></h3>
      <p className="small muted" style={{ marginTop: 0 }}>Double-tap the back of your iPhone (the Apple logo) to jump straight to <Link href="/quick" className="linkish">Quick</Link>: your next task, a quick add box and your timers.</p>
      <ol className="steps">
        <li>Open the <b>Shortcuts</b> app and tap <b>+</b>.</li>
        <li>Tap <b>Add Action</b>, search <b>Open URLs</b> and pick it.</li>
        <li>Tap <b>URL</b> and type <code>cafenoct.vercel.app/quick</code></li>
        <li>Tap the name at the top, call it <b>CafeNoct Quick</b>, then <b>Done</b>.</li>
        <li>Open <b>Settings</b> › <b>Accessibility</b> › <b>Touch</b> › <b>Back Tap</b> › <b>Double Tap</b> and choose <b>CafeNoct Quick</b>.</li>
      </ol>
      <p className="small muted">The shortcut opens in Safari, so sign in to CafeNoct there once. You can also add it to your Home Screen or Action button from the same shortcut.</p>
    </div>
  );
}

"use client";

import { useState, useSyncExternalStore } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { addDays, parseYmd, weekStartYmd } from "@/lib/dates";
import { hm, planBlocks } from "@/lib/cal";
import { deviceTz, partsIn, todayIn, tzShort, zonedIso } from "@/lib/tz";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import Seg from "./seg";
import Icon from "./icon";

type Entry = { id: string; started_at: string; minutes: number; note: string; source: string };
type Task = { id: string; title: string; done_at: string | null; due_date: string | null; status: string };
type Report = { id: string; body: string; sent_at: string | null; updated_at: string };
type Kind = "day" | "week";

const noop = () => () => {};

// Daily EOD and weekly summary for one client, built from your time log and to-do list.
export default function EodReport({ client, sender }: { client: Client; sender: string }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="card skel" style={{ height: 420 }} aria-busy="true" />;
  return <Eod client={client} sender={sender} />;
}

function Eod({ client: c, sender }: { client: Client; sender: string }) {
  const [tz] = useState(() => c.timezone || deviceTz());
  const [kind, setKind] = useState<Kind>(c.report_cadence === "Weekly" ? "week" : "day");
  const [day, setDay] = useState(() => todayIn(tz));
  const [edited, setEdited] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "save">("");

  const start = kind === "week" ? weekStartYmd(day) : day;
  const days = kind === "week" ? [...Array(7)].map((_, i) => addDays(start, i)) : [day];
  const end = addDays(start, days.length);
  const from = zonedIso(start, 0, tz), to = zonedIso(end, 0, tz);
  const key = `${c.id}:${kind}:${start}`;

  const [entries] = useRows<Entry>(`eod-time:${key}`, (s) => s.from("time_entries").select("id,started_at,minutes,note,source").eq("client_id", c.id).gte("started_at", from).lt("started_at", to).order("started_at"), ["time_entries"]);
  const [done] = useRows<Task>(`eod-done:${key}`, (s) => s.from("tasks").select("id,title,done_at,due_date,status").eq("client_id", c.id).eq("status", "done").gte("done_at", from).lt("done_at", to).order("done_at"), ["tasks"]);
  const [open] = useRows<Task>(`eod-open:${key}`, (s) => s.from("tasks").select("id,title,done_at,due_date,status").eq("client_id", c.id).neq("status", "done").lte("due_date", addDays(end, 2)).order("due_date").limit(25), ["tasks"]);
  const [saved, reloadSaved] = useRows<Report>(`eod-saved:${key}`, (s) => s.from("reports").select("id,body,sent_at,updated_at").eq("client_id", c.id).eq("kind", kind).eq("period_start", start).limit(1), ["reports"]);

  const loading = !entries || !done;
  const report = saved?.[0];
  const first = (c.name || clientLabel(c)).split(" ")[0];
  const me = sender.split(" ")[0] || "";
  const zone = tzShort(tz);
  const dayName = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" }) => parseYmd(d).toLocaleDateString("en-US", opts);
  const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase();
  const dateOf = (iso: string) => partsIn(iso, tz).date;
  const periodLabel = kind === "week" ? `Week of ${dayName(start, { month: "long", day: "numeric" })} – ${dayName(addDays(end, -1), { month: start.slice(5, 7) === addDays(end, -1).slice(5, 7) ? undefined : "long", day: "numeric" })}` : dayName(day);

  const total = (entries ?? []).reduce((a, e) => a + e.minutes, 0);
  const planned = days.reduce((a, d) => a + planBlocks(d, [c], tz).reduce((x, p) => x + p.e - p.s, 0), 0);
  const notes = (list: Entry[]) => [...new Set(list.map((e) => e.note.trim()).filter(Boolean))];
  const nextUp = (open ?? []).filter((t) => !t.due_date || t.due_date < addDays(end, 2));

  // The report, written from your logged time and tasks. Edit it freely before you send it.
  const draft = (() => {
    const L = [`Hi ${first},`, "", kind === "week" ? `Here's my weekly summary for ${periodLabel.replace("Week of ", "the week of ")}.` : `Here's my EOD for ${periodLabel}.`, "", `Hours worked: ${hm(total)}`];
    if (kind === "week") {
      days.forEach((d) => {
        const es = (entries ?? []).filter((e) => dateOf(e.started_at) === d), ts = (done ?? []).filter((t) => t.done_at && dateOf(t.done_at) === d);
        if (!es.length && !ts.length) return;
        L.push("", `${dayName(d, { weekday: "long" })} (${hm(es.reduce((a, e) => a + e.minutes, 0))})`);
        [...notes(es), ...ts.map((t) => `${t.title} (done)`)].forEach((n) => L.push(`- ${n}`));
      });
    } else {
      const n = notes(entries ?? []);
      if (n.length) L.push("", "What I worked on:", ...n.map((x) => `- ${x}`));
      if (done?.length) L.push("", "Completed:", ...done.map((t) => `- ${t.title}`));
    }
    if (nextUp.length) L.push("", "Next:", ...nextUp.slice(0, 8).map((t) => `- ${t.title}`));
    L.push("", "Thank you!", me);
    return L.join("\n");
  })();

  const text = edited ?? report?.body ?? draft;
  const move = (n: number) => { setEdited(null); setDay(n === 0 ? todayIn(tz) : addDays(day, n * (kind === "week" ? 7 : 1))); };
  const switchKind = (k: Kind) => { setEdited(null); setKind(k); };

  async function save(sent: boolean) {
    setBusy("save");
    const { error } = await supabase().from("reports").upsert({ client_id: c.id, kind, period_start: start, body: text, ...(sent ? { sent_at: new Date().toISOString() } : {}) }, { onConflict: "user_id,client_id,kind,period_start" });
    setBusy("");
    if (error) return toast("Could not save. Check your connection.");
    setEdited(null);
    reloadSaved();
    toast(sent ? "Saved as sent" : "Draft saved");
  }
  async function copy() {
    try { await navigator.clipboard.writeText(text); toast("Copied. Paste it into Slack or email."); } catch { toast("Copy was blocked. Select the text and copy it."); }
  }

  return (
    <>
      <div className="row cal-bar">
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="cal-title">{periodLabel}</b>
          <span className="small muted">{first}&apos;s time ({zone}) · {hm(total)} logged{planned ? ` of ${hm(planned)} usual` : ""}</span>
        </div>
        <Seg label="Report type" options={[["day", "Daily EOD"], ["week", "Weekly"]]} value={kind} onChange={switchKind} />
        <div className="row" style={{ gap: 6 }}>
          <button className="btn" onClick={() => move(-1)} aria-label={kind === "week" ? "Previous week" : "Previous day"}><Icon name="left" /></button>
          <button className="btn" onClick={() => move(0)}>{kind === "week" ? "This week" : "Today"}</button>
          <button className="btn" onClick={() => move(1)} aria-label={kind === "week" ? "Next week" : "Next day"}><Icon name="right" /></button>
        </div>
      </div>
      <div className="grid g2" style={{ gridTemplateColumns: "1.6fr 1fr", alignItems: "start" }}>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3>
            <span>{kind === "week" ? "Weekly summary" : "EOD report"}</span>
            {report?.sent_at ? <span className="pill good">Sent {new Date(report.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> : report ? <span className="pill">Draft saved</span> : edited ? <span className="pill warn">Not saved</span> : null}
          </h3>
          <textarea className="eod" value={loading ? "Gathering your time and tasks…" : text} readOnly={loading} onChange={(e) => setEdited(e.target.value)} aria-label="Report text" />
          <div className="row">
            <button className="btn solid" onClick={copy} disabled={loading}><Icon name="copy" />Copy</button>
            <span className="grow" />
            {(edited !== null || report) && <button className="btn ghost small" onClick={() => setEdited(draft)} disabled={loading}>Start over from my data</button>}
            <button className="btn" onClick={() => save(false)} disabled={loading || busy !== ""}>Save draft</button>
            <button className="btn" onClick={() => save(true)} disabled={loading || busy !== ""}><Icon name="check" />Mark as sent</button>
          </div>
        </div>
        <div className="card">
          <h3><span>What goes in</span><span className="muted num">{hm(total)}</span></h3>
          <div className="small muted" style={{ margin: "0 0 6px" }}>Time you logged</div>
          {entries?.length ? (
            <div className="list">{entries.map((e) => (
              <div className="li" key={e.id}><span className="t">{e.note || "No note"}<small>{kind === "week" ? `${dayName(dateOf(e.started_at), { weekday: "short" })} ` : ""}{clock(e.started_at)} {zone}</small></span><span className="num small">{hm(e.minutes)}</span></div>
            ))}</div>
          ) : <p className="small muted" style={{ margin: "4px 0 10px" }}>No time logged yet. Notes on your timers and time entries become the report&apos;s bullet points.</p>}
          <div className="small muted" style={{ margin: "12px 0 6px" }}>Tasks you finished</div>
          {done?.length ? <div className="list">{done.map((t) => <div className="li" key={t.id}><span className="check on" aria-hidden="true" style={{ width: 16, height: 16 }} /><span className="t">{t.title}</span></div>)}</div>
            : <p className="small muted" style={{ margin: "4px 0 10px" }}>Nothing ticked off yet for this {kind === "week" ? "week" : "day"}.</p>}
          {nextUp.length > 0 && <>
            <div className="small muted" style={{ margin: "12px 0 6px" }}>Open and coming up</div>
            <div className="list">{nextUp.slice(0, 8).map((t) => <div className="li" key={t.id}><span className="t">{t.title}</span></div>)}</div>
          </>}
        </div>
      </div>
    </>
  );
}

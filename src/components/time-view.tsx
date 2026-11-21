"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRows } from "@/lib/use-rows";
import { addDays, parseYmd, today, weekStartYmd, ymd } from "@/lib/dates";
import { hm, isoAt, localParts, type TimeEntry } from "@/lib/cal";
import { money } from "@/lib/format";
import { hoursDraft } from "@/lib/invoices";
import { clientLabel, type Client } from "@/lib/types";
import Timers from "./timers";
import TimerButton from "./timer-button";
import TimeForm, { type TimeDraft } from "./time-form";
import InvoiceForm, { type InvoiceDraft } from "./invoice-form";
import CopyButton from "./copy-button";
import Seg from "./seg";
import Icon from "./icon";
import Nocti from "./nocti";
import "@/styles/time.css";

const noop = () => () => {};
type Range = "week" | "month" | "custom" | "all";
type Entry = TimeEntry & { date: string };
type TaskRef = { id: string; title: string; project_id: string | null };
type ProjectRef = { id: string; name: string; client_id: string | null };
const COLS = "id,client_id,task_id,invoice_id,started_at,minutes,note,source";
const PAGE = 50;
const short = (d: string) => parseYmd(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const monthEnd = (d: string) => { const x = parseYmd(d.slice(0, 8) + "01"); x.setMonth(x.getMonth() + 1); x.setDate(0); return ymd(x); };

// Where your hours go: running timers, the chosen range by day, totals by client and project, and every entry.
export default function TimeView({ clients }: { clients: Client[] }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  const t = today(), ws = weekStartYmd(t);
  const [form, setForm] = useState<TimeDraft | null>(null);
  const [bill, setBill] = useState<InvoiceDraft | null>(null);
  const [range, setRange] = useState<Range>("week");
  const [from, setFrom] = useState(() => addDays(t, -29));
  const [to, setTo] = useState(t);
  const [clientF, setClientF] = useState("");
  const [projectF, setProjectF] = useState("");
  const [billF, setBillF] = useState<"all" | "yes" | "no">("all");
  const [shown, setShown] = useState(PAGE);

  const [lo, hi] = range === "week" ? [ws, addDays(ws, 6)] : range === "month" ? [t.slice(0, 8) + "01", monthEnd(t)] : range === "custom" ? [from < to ? from : to, from < to ? to : from] : ["", ""];
  // shortcut: totals read up to 5000 entries per range; switch to a summing RPC if anyone logs more than that.
  const [rows, reload] = useRows<TimeEntry>(`time:${lo}:${hi}`, (s) => {
    let q = s.from("time_entries").select(COLS).order("started_at", { ascending: false }).limit(5000);
    if (lo) q = q.gte("started_at", isoAt(lo, 0));
    if (hi) q = q.lt("started_at", isoAt(addDays(hi, 1), 0));
    return q;
  }, ["time_entries"]);
  const [week] = useRows<TimeEntry>(`time:week:${ws}`, (s) => s.from("time_entries").select(COLS).gte("started_at", isoAt(ws, 0)).lt("started_at", isoAt(addDays(ws, 7), 0)).limit(2000), ["time_entries"]);
  const [tasks] = useRows<TaskRef>("time:tasks", (s) => s.from("tasks").select("id,title,project_id").limit(5000), ["tasks"]);
  const [projects] = useRows<ProjectRef>("time:projects", (s) => s.from("projects").select("id,name,client_id").order("name").limit(500), ["projects"]);

  const reset = <T,>(f: (v: T) => void) => (v: T) => { f(v); setShown(PAGE); };
  const pickClient = (v: string) => { setClientF(v); setProjectF(""); setShown(PAGE); };

  const head = (
    <div className="head">
      <div>
        <h1>Time</h1>
        <p>Start a timer while you work, or log time after.</p>
      </div>
      <button className="btn solid time-log" onClick={() => setForm({})}><Icon name="plus" />Log time by hand</button>
    </div>
  );
  const shownProjects = (projects ?? []).filter((p) => !clientF || p.client_id === (clientF === "none" ? null : clientF));
  const filters = (
    <div className="card time-filters">
      <Seg label="Time range" options={[["week", "Week"], ["month", "Month"], ["custom", "Dates"], ["all", "All"]]} value={range} onChange={reset(setRange)} />
      {range === "custom" && (
        <div className="row time-dates">
          <div className="field"><label htmlFor="tv-from">From</label><input id="tv-from" type="date" value={from} max={to} onChange={(e) => { if (e.target.value) reset(setFrom)(e.target.value); }} /></div>
          <div className="field"><label htmlFor="tv-to">To</label><input id="tv-to" type="date" value={to} min={from} onChange={(e) => { if (e.target.value) reset(setTo)(e.target.value); }} /></div>
        </div>
      )}
      <div className="row time-selects">
        <select className="search" aria-label="Client" value={clientF} onChange={(e) => pickClient(e.target.value)}>
          <option value="">All clients</option><option value="none">No client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
        </select>
        <select className="search" aria-label="Project" value={projectF} onChange={(e) => reset(setProjectF)(e.target.value)}>
          <option value="">All projects</option><option value="none">No project</option>
          {shownProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="search" aria-label="Billable" value={billF} onChange={(e) => reset(setBillF)(e.target.value as "all" | "yes" | "no")}>
          <option value="all">Billable and not</option><option value="yes">Billable only</option><option value="no">Not billable</option>
        </select>
      </div>
    </div>
  );
  const body = !ready || !rows || !tasks || !projects ? <div className="grid g2">{[0, 1].map((i) => <div className="card skel" key={i} style={{ height: 240 }} />)}</div>
    : <Body rows={rows} week={week ?? []} tasks={tasks} projects={projects} clients={clients} range={range} lo={lo} hi={hi} clientF={clientF} projectF={projectF} billF={billF} shown={shown} more={() => setShown((n) => n + PAGE)} open={setForm} bill={setBill} />;

  return (
    <>
      {head}
      <Timers clients={clients} />
      {filters}
      {body}
      {form && <TimeForm entry={form} clients={clients} onClose={() => setForm(null)} onSaved={reload} />}
      {bill && <BillForm draft={bill} clients={clients} onClose={() => setBill(null)} />}
    </>
  );
}

type BodyProps = {
  rows: TimeEntry[]; week: TimeEntry[]; tasks: TaskRef[]; projects: ProjectRef[]; clients: Client[]; range: Range; lo: string; hi: string;
  clientF: string; projectF: string; billF: "all" | "yes" | "no"; shown: number; more: () => void; open: (e: TimeDraft) => void; bill: (d: InvoiceDraft) => void;
};

function Body({ rows, week, tasks, projects, clients, range, lo, hi, clientF, projectF, billF, shown, more, open, bill }: BodyProps) {
  const client = (id: string | null) => clients.find((c) => c.id === id);
  const name = (id: string | null) => { const c = client(id); return c ? clientLabel(c) : "No client"; };
  const color = (id: string | null) => client(id)?.color ?? "var(--muted)";
  const taskOf = new Map(tasks.map((x) => [x.id, x]));
  const projOf = (e: TimeEntry) => (e.task_id ? taskOf.get(e.task_id)?.project_id ?? null : null);
  const billable = (id: string | null) => { const c = client(id); return !!c && c.rate_type !== "Unpaid"; };
  // Same value the app has always shown: hours times the rate, for hourly clients only.
  const worth = (id: string | null, m: number) => { const c = client(id); return c?.rate_type === "Hourly" && c.rate ? money((m / 60) * c.rate, c.currency) : ""; };

  const list: Entry[] = rows.map((e) => ({ ...e, date: localParts(e.started_at).date })).filter((e) =>
    (!clientF || (clientF === "none" ? !e.client_id : e.client_id === clientF))
    && (!projectF || (projectF === "none" ? !projOf(e) : projOf(e) === projectF))
    && (billF === "all" || (billF === "yes") === billable(e.client_id)));
  const total = list.reduce((a, e) => a + e.minutes, 0);

  const byClient = new Map<string, Entry[]>();
  list.forEach((e) => byClient.set(e.client_id ?? "", [...(byClient.get(e.client_id ?? "") ?? []), e]));
  const ranked = [...byClient.entries()].map(([id, es]) => ({ id, es, m: es.reduce((a, e) => a + e.minutes, 0) })).sort((a, b) => b.m - a.m);
  const max = Math.max(1, ...ranked.map((r) => r.m));

  const byProject = new Map<string, number>();
  list.forEach((e) => { const p = projOf(e) ?? ""; byProject.set(p, (byProject.get(p) ?? 0) + e.minutes); });
  const projRanked = [...byProject.entries()].sort((a, b) => b[1] - a[1]);
  const project = (id: string) => projects.find((p) => p.id === id);
  const hasProjects = projRanked.some(([id]) => id);

  // Bars for the chosen range: by day up to a month, by week up to six months, then by month.
  const start = lo || list.reduce((m, e) => (e.date < m ? e.date : m), today()), end = hi || today();
  const span = Math.round((parseYmd(end).getTime() - parseYmd(start).getTime()) / 864e5) + 1;
  const buckets: { from: string; to: string; label: string; title: string }[] = [];
  if (span <= 31) for (let d = start; d <= end; d = addDays(d, 1)) buckets.push({ from: d, to: d, label: span <= 7 ? parseYmd(d).toLocaleDateString("en-US", { weekday: "narrow" }) : String(parseYmd(d).getDate()), title: short(d) });
  else if (span <= 183) for (let d = weekStartYmd(start); d <= end; d = addDays(d, 7)) buckets.push({ from: d, to: addDays(d, 6), label: short(d), title: `Week of ${short(d)}` });
  else for (let d = start.slice(0, 8) + "01"; d <= end; d = addDays(monthEnd(d), 1)) buckets.push({ from: d, to: monthEnd(d), label: parseYmd(d).toLocaleDateString("en-US", { month: "short" }), title: parseYmd(d).toLocaleDateString("en-US", { month: "long", year: "numeric" }) });
  const rangeText = range === "week" ? "This week" : range === "month" ? "This month" : range === "all" ? "All time" : `${short(start)} – ${short(end)}`;
  const empty = (line: string) => <div className="empty"><Nocti size={64} /><b>{line}</b><button className="btn solid small" onClick={() => open({})}><Icon name="plus" />Log time</button></div>;

  return (
    <>
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <h3><span>{rangeText}</span><span className="muted num">{hm(total)}</span></h3>
          {list.length ? (
            <>
              <RangeChart buckets={buckets} entries={list} name={name} color={color} />
              <div className="legend">{ranked.map((r) => <span key={r.id}><span className="cdot" style={{ background: color(r.id || null) }} />{name(r.id || null)}</span>)}</div>
            </>
          ) : empty("No time in this range")}
        </div>
        <div className="card">
          <h3><span>By client</span><span className="muted num">{hm(total)}</span></h3>
          {ranked.length ? (
            <div className="list">
              {ranked.map(({ id, es, m }) => {
                const c = client(id || null), v = worth(id || null, m);
                const unbilled = es.filter((e) => !e.invoice_id), um = unbilled.reduce((a, e) => a + e.minutes, 0);
                return (
                  <div key={id || "none"} className="li time-client">
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <span className="cdot" style={{ background: color(id || null) }} />
                      {c ? <Link href={`/clients/${c.id}`} className="grow time-name">{name(c.id)}</Link> : <span className="grow time-name">{name(null)}</span>}
                      <span className="num small" style={{ textAlign: "right" }}>{hm(m)}{v ? ` · ${v}` : ""}</span>
                    </div>
                    <div className="bar"><i style={{ width: `${(m / max) * 100}%`, background: color(id || null) }} /></div>
                    {c && !c.personal && (
                      <div className="row time-client-acts">
                        <TimerButton clientId={c.id} label={clientLabel(c)} small />
                        {um > 0 && c.rate_type !== "Unpaid" && <button className="btn small" onClick={() => bill(hoursDraft(c, unbilled.map((e) => ({ id: e.id, minutes: e.minutes, date: e.date }))))}><Icon name="file" />Invoice {hm(um)} unbilled</button>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : empty("No time logged here yet")}
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: "start", ...(hasProjects ? {} : { gridTemplateColumns: "1fr" }) }}>
        {hasProjects && (
          <div className="card">
            <h3><span>By project</span></h3>
            <div className="list">
              {projRanked.map(([id, m]) => {
                const p = project(id), v = p ? worth(p.client_id, m) : "";
                return (
                  <div key={id || "none"} className="li">
                    <span className="t">{p?.name ?? (id ? "A deleted project" : "No project")}<small>{p ? name(p.client_id) : "Time not linked to a project's task"}</small></span>
                    <span className="num small" style={{ textAlign: "right" }}>{hm(m)}{v ? ` · ${v}` : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <WeekReport entries={week} name={name} worth={worth} />
      </div>

      <div className="card">
        <h3><span>Entries</span><span className="muted">{list.length}</span></h3>
        {list.length ? (
          <div className="table-wrap">
            <table className="time-table">
              <thead><tr><th>Date</th><th>Client</th><th>Task</th><th>Note</th><th>Source</th><th className="r">Time</th></tr></thead>
              <tbody>
                {list.slice(0, shown).map((e) => (
                  <tr key={e.id} className="click" tabIndex={0} onClick={() => open(e)} onKeyDown={(k) => { if (k.key === "Enter" || k.key === " ") { k.preventDefault(); open(e); } }} aria-label={`Edit ${hm(e.minutes)} on ${short(e.date)}`}>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>{short(e.date)} · {new Date(e.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</td>
                    <td style={{ whiteSpace: "nowrap" }}><span className="cdot" style={{ background: color(e.client_id) }} /> {name(e.client_id)}</td>
                    <td className="muted">{e.task_id ? taskOf.get(e.task_id)?.title ?? "" : ""}</td>
                    <td>{e.note}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{e.source === "focus" ? <span className="pill blush">Focus</span> : <span className="pill">{e.source === "timer" ? "Timer" : "Manual"}</span>}{e.invoice_id && <span className="pill good time-billed">Billed</span>}</td>
                    <td className="r num">{hm(e.minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length > shown && <button className="btn small time-more" onClick={more}>Load more ({list.length - shown} left)</button>}
          </div>
        ) : empty("Nothing here yet")}
      </div>
    </>
  );
}

// This week by day and by client, ready to paste into a message.
function WeekReport({ entries, name, worth }: { entries: TimeEntry[]; name: (id: string | null) => string; worth: (id: string | null, m: number) => string }) {
  const ws = weekStartYmd(today()), days = [...Array(7)].map((_, i) => addDays(ws, i));
  const dated = entries.map((e) => ({ ...e, date: localParts(e.started_at).date }));
  const perDay = days.map((d) => ({ d, m: dated.filter((e) => e.date === d).reduce((a, e) => a + e.minutes, 0) }));
  const perClient = new Map<string, number>();
  dated.forEach((e) => perClient.set(e.client_id ?? "", (perClient.get(e.client_id ?? "") ?? 0) + e.minutes));
  const clientsRanked = [...perClient.entries()].sort((a, b) => b[1] - a[1]);
  const total = perDay.reduce((a, x) => a + x.m, 0);
  const dayName = (d: string) => parseYmd(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const text = [
    `Time report, week of ${short(ws)} – ${short(days[6])}`, `Total: ${hm(total)}`, "", "By day",
    ...perDay.filter((x) => x.m).map((x) => `${dayName(x.d)}: ${hm(x.m)}`), "", "By client",
    ...clientsRanked.map(([id, m]) => { const v = worth(id || null, m); return `${name(id || null)}: ${hm(m)}${v ? ` (${v})` : ""}`; }),
  ].join("\n");
  return (
    <div className="card week-report">
      <h3><span>Weekly report</span>{total > 0 && <CopyButton text={text} label="Copy as text" />}</h3>
      {total ? (
        <div className="grid g2 week-report-cols">
          <div className="list">{perDay.map((x) => <div className="li" key={x.d}><span className="t">{dayName(x.d)}</span><span className={`num small${x.m ? "" : " muted"}`}>{x.m ? hm(x.m) : "–"}</span></div>)}</div>
          <div className="list">
            {clientsRanked.map(([id, m]) => { const v = worth(id || null, m); return <div className="li" key={id || "none"}><span className="t">{name(id || null)}{v && <small>{v}</small>}</span><span className="num small">{hm(m)}</span></div>; })}
            <div className="li"><span className="t"><b>Total</b></span><span className="num small"><b>{hm(total)}</b></span></div>
          </div>
        </div>
      ) : <div className="empty"><Nocti size={56} /><b>No hours this week yet</b><span>Start a timer above and your week fills in here.</span></div>}
    </div>
  );
}

// An invoice for unbilled hours. Loads the invoice numbers and your name, then opens the usual invoice form,
// which marks those hours as billed when you save.
function BillForm({ draft, clients, onClose }: { draft: InvoiceDraft; clients: Client[]; onClose: () => void }) {
  const [nums] = useRows<{ number: string }>("time:inv-nums", (s) => s.from("invoices").select("number").limit(5000), []);
  const [prof] = useRows<{ name: string; business: string; invoice_email: string }>("time:profile", (s) => s.from("profiles").select("name,business,invoice_email").limit(1), []);
  if (!nums || !prof) return null;
  const p = prof[0];
  return <InvoiceForm inv={draft} mode="invoice" clients={clients} existing={nums} from={{ name: p?.business || p?.name || "", email: p?.invoice_email || "" }} onClose={onClose} />;
}

// Hours per bar, stacked by client color.
function RangeChart({ buckets, entries, name, color }: { buckets: { from: string; to: string; label: string; title: string }[]; entries: Entry[]; name: (id: string | null) => string; color: (id: string | null) => string }) {
  const W = 520, H = 190, P = { l: 30, r: 8, t: 10, b: 24 }, t = today();
  const data = buckets.map((b) => {
    const segs = new Map<string, number>();
    entries.filter((e) => e.date >= b.from && e.date <= b.to).forEach((e) => segs.set(e.client_id ?? "", (segs.get(e.client_id ?? "") ?? 0) + e.minutes));
    return { ...b, segs: [...segs.entries()], tot: [...segs.values()].reduce((a, x) => a + x, 0) };
  });
  const maxH = Math.max(4, Math.ceil(Math.max(0, ...data.map((x) => x.tot)) / 60));
  const step = maxH > 40 ? 20 : maxH > 16 ? 8 : maxH > 8 ? 4 : 2, top = Math.ceil(maxH / step) * step;
  const y = (h: number) => P.t + (H - P.t - P.b) * (1 - h / top);
  const bw = (W - P.l - P.r) / Math.max(1, data.length), every = Math.ceil(data.length / 12);
  return (
    <svg className="chart week-chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Hours per ${data.length && data[0].from === data[0].to ? "day" : "period"}: ${data.filter((x) => x.tot).map((x) => `${x.title} ${hm(x.tot)}`).join(", ") || "none"}`}>
      {[...Array(top / step + 1)].map((_, i) => { const h = i * step; return <g key={h}><line className="gl" x1={P.l} x2={W - P.r} y1={y(h)} y2={y(h)} /><text x={P.l - 6} y={y(h) + 3} textAnchor="end">{h}h</text></g>; })}
      {data.map((x, i) => {
        const cx = P.l + i * bw + bw * 0.22, w = bw * 0.56;
        let acc = 0;
        return (
          <g key={x.from} style={{ ["--i" as string]: Math.min(i, 20) }}>
            {x.segs.map(([id, m]) => {
              const h0 = acc / 60, h1 = (acc + m) / 60;
              acc += m;
              return <rect key={id} className="bv" x={cx} y={y(h1)} width={w} height={Math.max(0, y(h0) - y(h1))} rx={Math.min(3, w / 3)} fill={color(id || null)}><title>{`${x.title}, ${name(id || null)}: ${hm(m)}`}</title></rect>;
            })}
            {i % every === 0 && <text x={cx + w / 2} y={H - 6} textAnchor="middle" style={t >= x.from && t <= x.to ? { fill: "var(--ink)" } : undefined}>{x.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

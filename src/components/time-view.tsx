"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRows } from "@/lib/use-rows";
import { addDays, parseYmd, today, weekStartYmd } from "@/lib/dates";
import { hm, localParts, type TimeEntry } from "@/lib/cal";
import { money } from "@/lib/format";
import { clientLabel, type Client } from "@/lib/types";
import Timers from "./timers";
import TimeForm, { type TimeDraft } from "./time-form";
import Seg from "./seg";
import Icon from "./icon";

const noop = () => () => {};
type Range = "week" | "month" | "all";

// Where your hours go: running timers, this week by day, totals by client, and every entry.
export default function TimeView({ clients }: { clients: Client[] }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  const [form, setForm] = useState<TimeDraft | null>(null);
  const [range, setRange] = useState<Range>("week");
  const [rows, reload] = useRows<TimeEntry>("time:all", (s) => s.from("time_entries").select("id,client_id,started_at,minutes,note,source").order("started_at", { ascending: false }).limit(2000), ["time_entries"]);

  const head = (
    <div className="head">
      <div>
        <div className="eyebrow">Where your hours go</div>
        <h1>Time</h1>
        <p>Start a timer while you work, or log time after.</p>
      </div>
      <button className="btn solid" onClick={() => setForm({})}><Icon name="plus" />Log time</button>
    </div>
  );
  const body = !ready || !rows ? <div className="grid g2">{[0, 1].map((i) => <div className="card skel" key={i} style={{ height: 240 }} />)}</div> : <Body rows={rows} clients={clients} range={range} setRange={setRange} open={setForm} />;

  return (
    <>
      {head}
      <Timers clients={clients} />
      {body}
      {form && <TimeForm entry={form} clients={clients} onClose={() => setForm(null)} onSaved={reload} />}
    </>
  );
}

function Body({ rows, clients, range, setRange, open }: { rows: TimeEntry[]; clients: Client[]; range: Range; setRange: (r: Range) => void; open: (e: TimeDraft) => void }) {
  const t = today(), ws = weekStartYmd(t);
  const from = range === "week" ? ws : range === "month" ? t.slice(0, 8) + "01" : "0000";
  const dated = rows.map((e) => ({ ...e, date: localParts(e.started_at).date }));
  const inRange = dated.filter((e) => e.date >= from);
  const client = (id: string | null) => clients.find((c) => c.id === id);
  const name = (id: string | null) => { const c = client(id); return c ? clientLabel(c) : "No client"; };
  const color = (id: string | null) => client(id)?.color ?? "var(--muted)";

  const byClient = new Map<string, number>();
  inRange.forEach((e) => byClient.set(e.client_id ?? "", (byClient.get(e.client_id ?? "") ?? 0) + e.minutes));
  const ranked = [...byClient.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...byClient.values());
  const total = inRange.reduce((a, e) => a + e.minutes, 0);
  const week = [...Array(7)].map((_, i) => addDays(ws, i));
  const weekMin = dated.filter((e) => e.date >= ws && e.date <= week[6]).reduce((a, e) => a + e.minutes, 0);

  return (
    <>
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <h3><span>This week</span><span className="muted num">{hm(weekMin)}</span></h3>
          <WeekChart days={week} entries={dated} name={name} color={color} />
          <div className="legend">{[...new Set(dated.filter((e) => e.date >= ws).map((e) => e.client_id ?? ""))].map((id) => <span key={id}><span className="cdot" style={{ background: color(id || null) }} />{name(id || null)}</span>)}</div>
        </div>
        <div className="card">
          <h3><span>By client</span><Seg label="Time range" options={[["week", "Week"], ["month", "Month"], ["all", "All"]]} value={range} onChange={setRange} /></h3>
          {ranked.length ? (
            <>
              <div className="list">
                {ranked.map(([id, m]) => {
                  const c = client(id || null);
                  const worth = c?.rate_type === "Hourly" && c.rate ? money((m / 60) * c.rate, c.currency) : "";
                  const row = (
                    <>
                      <div className="row" style={{ flexWrap: "nowrap" }}>
                        <span className="cdot" style={{ background: color(id || null) }} />
                        <span className="grow" style={{ minWidth: 0, overflowWrap: "anywhere" }}>{name(id || null)}</span>
                        <span className="num small" style={{ textAlign: "right" }}>{hm(m)}{worth ? ` · worth ${worth}` : ""}</span>
                      </div>
                      <div className="bar"><i style={{ width: `${(m / max) * 100}%`, background: color(id || null) }} /></div>
                    </>
                  );
                  const style = { flexDirection: "column", alignItems: "stretch", gap: 6 } as const;
                  return c ? <Link key={id} href={`/clients/${c.id}`} className="li click" style={style}>{row}</Link> : <div key={id || "none"} className="li" style={style}>{row}</div>;
                })}
              </div>
              <p className="small muted" style={{ margin: "10px 0 0" }}>Total {hm(total)}</p>
            </>
          ) : <div className="empty"><b>No time logged {range === "week" ? "this week" : range === "month" ? "this month" : "yet"}</b><span>Start a timer above or log time after you work.</span></div>}
        </div>
      </div>
      <div className="card">
        <h3><span>Entries</span><span className="muted">{inRange.length}</span></h3>
        {inRange.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Client</th><th>Note</th><th>Source</th><th className="r">Time</th></tr></thead>
              <tbody>
                {inRange.slice(0, 150).map((e) => (
                  <tr key={e.id} className="click" tabIndex={0} onClick={() => open(e)} onKeyDown={(k) => { if (k.key === "Enter") open(e); }}>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>{parseYmd(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {new Date(e.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</td>
                    <td style={{ whiteSpace: "nowrap" }}><span className="cdot" style={{ background: color(e.client_id) }} /> {name(e.client_id)}</td>
                    <td>{e.note}</td>
                    <td>{e.source === "focus" ? <span className="pill blush">Focus</span> : <span className="pill">{e.source === "timer" ? "Timer" : "Manual"}</span>}</td>
                    <td className="r num">{hm(e.minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {inRange.length > 150 && <p className="small muted" style={{ margin: "10px 4px 0" }}>Showing the latest 150 entries.</p>}
          </div>
        ) : <div className="empty"><b>Nothing here yet</b><span>Your logged time will list here.</span></div>}
      </div>
    </>
  );
}

// Hours per day, stacked by client color.
function WeekChart({ days, entries, name, color }: { days: string[]; entries: (TimeEntry & { date: string })[]; name: (id: string | null) => string; color: (id: string | null) => string }) {
  const W = 520, H = 190, P = { l: 30, r: 8, t: 10, b: 24 }, t = today();
  const data = days.map((d) => {
    const segs = new Map<string, number>();
    entries.filter((e) => e.date === d).forEach((e) => segs.set(e.client_id ?? "", (segs.get(e.client_id ?? "") ?? 0) + e.minutes));
    return { d, segs: [...segs.entries()], tot: [...segs.values()].reduce((a, b) => a + b, 0) };
  });
  const maxH = Math.max(4, Math.ceil(Math.max(...data.map((x) => x.tot)) / 60));
  const step = maxH > 8 ? 4 : 2, top = Math.ceil(maxH / step) * step;
  const y = (h: number) => P.t + (H - P.t - P.b) * (1 - h / top);
  const bw = (W - P.l - P.r) / 7;
  return (
    <svg className="chart week-chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Hours per day this week">
      {[...Array(top / step + 1)].map((_, i) => { const h = i * step; return <g key={h}><line className="gl" x1={P.l} x2={W - P.r} y1={y(h)} y2={y(h)} /><text x={P.l - 6} y={y(h) + 3} textAnchor="end">{h}h</text></g>; })}
      {data.map((x, i) => {
        const cx = P.l + i * bw + bw * 0.22, w = bw * 0.56;
        let acc = 0;
        return (
          <g key={x.d} style={{ ["--i" as string]: i }}>
            {x.segs.map(([id, m]) => {
              const h0 = acc / 60, h1 = (acc + m) / 60;
              acc += m;
              return <rect key={id} className="bv" x={cx} y={y(h1)} width={w} height={Math.max(0, y(h0) - y(h1))} rx={3} fill={color(id || null)}><title>{`${name(id || null)}: ${hm(m)}`}</title></rect>;
            })}
            <text x={cx + w / 2} y={H - 6} textAnchor="middle" style={x.d === t ? { fill: "var(--ink)" } : undefined}>{parseYmd(x.d).toLocaleDateString("en-US", { weekday: "narrow" })}</text>
          </g>
        );
      })}
    </svg>
  );
}

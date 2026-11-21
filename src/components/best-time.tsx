"use client";

import "@/styles/social.css";
import { useRows } from "@/lib/use-rows";
import { addDays, today, weekday } from "@/lib/dates";
import { hasStats, pct, rate, totals, type Post } from "@/lib/posts";
import Nocti from "./nocti";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Three-hour slots through the day; the label is the middle of the slot.
const SLOTS = [{ from: 6, to: 9, at: "7am" }, { from: 9, to: 12, at: "10am" }, { from: 12, to: 15, at: "1pm" }, { from: 15, to: 18, at: "4pm" }, { from: 18, to: 21, at: "7pm" }, { from: 21, to: 30, at: "10pm" }];
const slotOf = (h: number) => SLOTS.findIndex((s) => (h < 6 ? h + 24 : h) >= s.from && (h < 6 ? h + 24 : h) < s.to);
const MIN = 8;
type Row = Pick<Post, "id" | "publish_on" | "publish_at" | "stats" | "platforms" | "client_id">;

// Average engagement rate per group, and the best group when it has at least two posts.
function avg(groups: number[][]) {
  const a = groups.map((g) => (g.length ? g.reduce((x, y) => x + y, 0) / g.length : 0));
  let best = -1;
  a.forEach((v, i) => { if (groups[i].length >= 2 && (best < 0 || v > a[best])) best = i; });
  return { a, best, max: Math.max(...a, 0) };
}

// Best time to post: from your posted posts that have numbers, by weekday and time of day.
export default function BestTime({ clientId, platform }: { clientId?: string; platform?: string }) {
  const from = addDays(today(), -365);
  const [rows] = useRows<Row>(`best-time:${clientId || "all"}:${from}`, (s) => {
    let q = s.from("posts").select("id,publish_on,publish_at,stats,platforms,client_id").eq("status", "Posted").gte("publish_on", from).order("publish_on", { ascending: false }).limit(500);
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  }, ["posts"]);
  if (rows === null) return <div className="card skel" style={{ height: 150 }} aria-busy="true" />;

  const done = rows.filter((p) => p.publish_on && (!platform || p.platforms?.includes(platform)) && hasStats(p))
    .map((p) => ({ day: weekday(p.publish_on!) - 1, slot: p.publish_at ? slotOf(Number(p.publish_at.slice(0, 2))) : -1, r: rate(totals(p, platform || undefined)) }))
    .filter((x) => x.r > 0);
  const where = platform ? ` on ${platform}` : "";

  if (done.length < MIN) return (
    <div className="card best-time">
      <h3><span>Best time to post</span></h3>
      <div className="bt-empty">
        <Nocti mood="sleepy" size={64} />
        <p className="small muted">{done.length ? `${done.length} posted post${done.length === 1 ? "" : "s"}${where} with results so far.` : `No posted posts${where} with results yet.`} After {MIN}, Nocti can spot your best day and time. Until then any guess would be just a guess.</p>
      </div>
    </div>
  );

  const byDay = avg(DAYS.map((_, i) => done.filter((x) => x.day === i).map((x) => x.r)));
  const bySlot = avg(SLOTS.map((_, i) => done.filter((x) => x.slot === i).map((x) => x.r)));
  const day = byDay.best >= 0 ? DAYS[byDay.best] : "", slot = bySlot.best >= 0 ? SLOTS[bySlot.best].at : "";
  const line = day && slot ? `Your best slot: ${day} around ${slot}.` : day ? `Your best day: ${day}. Add post times to find the best hour.` : "Not one clear winner yet. Keep posting at different times.";
  const heat = (v: number, max: number) => ({ ["--h" as string]: max ? Math.round((v / max) * 100) : 0 });

  return (
    <div className="card best-time">
      <h3><span>Best time to post</span><span className="small muted">{done.length} posts{where}, last 12 months</span></h3>
      <p className="bt-line">{line}</p>
      <div className="bt-strip" role="list" aria-label="Average engagement rate by weekday">
        {DAYS.map((d, i) => <div key={d} role="listitem" className={`bt-cell${i === byDay.best ? " best" : ""}`} style={heat(byDay.a[i], byDay.max)} title={`${d}: ${byDay.a[i] ? pct(byDay.a[i]) : "no posts"}`}><b>{d}</b><span>{byDay.a[i] ? pct(byDay.a[i]) : "–"}</span></div>)}
      </div>
      <div className="bt-strip six" role="list" aria-label="Average engagement rate by time of day">
        {SLOTS.map((s, i) => <div key={s.at} role="listitem" className={`bt-cell${i === bySlot.best ? " best" : ""}`} style={heat(bySlot.a[i], bySlot.max)} title={`Around ${s.at}: ${bySlot.a[i] ? pct(bySlot.a[i]) : "no posts"}`}><b>{s.at}</b><span>{bySlot.a[i] ? pct(bySlot.a[i]) : "–"}</span></div>)}
      </div>
      <p className="small muted" style={{ margin: 0 }}>Average engagement rate (likes, comments, shares and saves per view or reach). A slot needs 2 posts to count.</p>
    </div>
  );
}

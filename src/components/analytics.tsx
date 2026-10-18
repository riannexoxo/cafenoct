"use client";

import { useState, useSyncExternalStore } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { addDays, parseYmd, today, weekStartYmd } from "@/lib/dates";
import { FORMAT_TONES, METRICS, PLATFORMS, POST_COLS, compact, engagements, formatTone, hasStats, pct, platform, rate, totals, type Post, type Stats } from "@/lib/posts";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import PostForm, { type PostDraft } from "./post-form";
import MediaThumb from "./media-thumb";
import Seg from "./seg";

const noop = () => () => {};
type Range = "30" | "90" | "year";
type Row = { label: string; color: string; posts: number; views: number; eng: number; base: number };
const add = (m: Map<string, Row>, key: string, color: string, s: Stats) => {
  const r = m.get(key) ?? { label: key, color, posts: 0, views: 0, eng: 0, base: 0 };
  r.posts += 1; r.views += s.views || 0; r.eng += engagements(s); r.base += s.reach || s.views || 0;
  m.set(key, r);
};

// How posts are doing, from the numbers you enter after posting.
export default function Analytics({ clients, clientId }: { clients: Client[]; clientId?: string }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="card skel" style={{ height: 420 }} aria-busy="true" />;
  return <Inner clients={clients} clientId={clientId} />;
}

function Inner({ clients, clientId }: { clients: Client[]; clientId?: string }) {
  const [range, setRange] = useState<Range>("30");
  const [only, setOnly] = useState("");
  const [who, setWho] = useState(clientId ?? "");
  const [sort, setSort] = useState<"rate" | "views">("rate");
  const [form, setForm] = useState<PostDraft | null>(null);
  const [touched, setTouched] = useState<string[]>([]); // rows you're filling in stay put until you leave
  const t = today();
  const from = range === "30" ? addDays(t, -30) : range === "90" ? addDays(t, -90) : `${t.slice(0, 4)}-01-01`;
  const [posts, reload, setPosts] = useRows<Post>(`analytics:${clientId ?? "all"}:${from}`, (s) => {
    let q = s.from("posts").select(POST_COLS).eq("status", "Posted").gte("publish_on", from).lte("publish_on", t).order("publish_on", { ascending: false });
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  }, ["posts"]);

  const smm = clients.filter((c) => c.status !== "Past" && c.roles?.some((r) => ["smm", "design", "video"].includes(r)));
  const all = (posts ?? []).filter((p) => (!who || p.client_id === who) && (!only || p.platforms?.includes(only)));
  const withStats = all.filter(hasStats), missing = all.filter((p) => !hasStats(p));
  const sheet = all.filter((p) => !hasStats(p) || touched.includes(p.id));
  const sum = withStats.reduce((a, p) => { const s = totals(p, only || undefined); a.views += s.views || 0; a.eng += engagements(s); a.base += s.reach || s.views || 0; return a; }, { views: 0, eng: 0, base: 0 });

  const byPlatform = new Map<string, Row>(), byFormat = new Map<string, Row>(), byPillar = new Map<string, Row>();
  withStats.forEach((p) => {
    Object.keys(p.stats ?? {}).filter((pl) => !only || pl === only).forEach((pl) => add(byPlatform, pl, platform(pl)?.color ?? "var(--accent)", totals(p, pl)));
    const s = totals(p, only || undefined);
    add(byFormat, p.format || "Post", formatTone(p.format), s);
    if (p.pillar) add(byPillar, p.pillar, "var(--accent)", s);
  });
  const rows = (m: Map<string, Row>) => [...m.values()].sort((a, b) => (b.base ? b.eng / b.base : 0) - (a.base ? a.eng / a.base : 0));
  const best = rows(byFormat)[0];

  // Views over time, stacked by platform.
  const buckets = range === "year"
    ? [...Array(Number(t.slice(5, 7)))].map((_, i) => { const m = `${t.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`; return { key: m, label: parseYmd(`${m}-01`).toLocaleDateString("en-US", { month: "short" }), from: `${m}-01`, to: `${m}-31` }; })
    : (() => { const out = []; for (let w = weekStartYmd(from); w <= t; w = addDays(w, 7)) out.push({ key: w, label: parseYmd(w).toLocaleDateString("en-US", { month: "short", day: "numeric" }), from: w, to: addDays(w, 6) }); return out; })();
  const series = buckets.map((b) => {
    const segs = new Map<string, number>();
    withStats.filter((p) => p.publish_on! >= b.from && p.publish_on! <= b.to).forEach((p) => Object.entries(p.stats ?? {}).forEach(([pl, s]) => { if (!only || pl === only) segs.set(pl, (segs.get(pl) ?? 0) + (s?.views || 0)); }));
    return { ...b, segs: [...segs.entries()], tot: [...segs.values()].reduce((a, v) => a + v, 0) };
  });

  const top = [...withStats].sort((a, b) => (sort === "rate" ? rate(totals(b, only || undefined)) - rate(totals(a, only || undefined)) : (totals(b, only || undefined).views || 0) - (totals(a, only || undefined).views || 0))).slice(0, 8);
  const client = (id: string | null) => clients.find((c) => c.id === id);

  async function saveStats(p: Post, pl: string, k: string, v: string) {
    const next = { ...(p.stats ?? {}), [pl]: { ...(p.stats?.[pl] ?? {}), [k]: v === "" ? 0 : Math.max(0, Number(v) || 0) } };
    setTouched((t) => (t.includes(p.id) ? t : [...t, p.id]));
    setPosts((r) => (r ?? []).map((x) => (x.id === p.id ? { ...x, stats: next } : x)));
    const { error } = await supabase().from("posts").update({ stats: next }).eq("id", p.id);
    if (error) { toast("Could not save that number."); reload(); }
  }

  const bars = (list: Row[], empty: string) => list.length ? (
    <div className="list">{list.map((r) => {
      const er = r.base ? r.eng / r.base : 0, max = Math.max(...list.map((x) => (x.base ? x.eng / x.base : 0)), 0.0001);
      return (
        <div key={r.label} className="li" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
          <div className="row" style={{ flexWrap: "nowrap" }}><i className="fmtl" style={{ background: r.color, flex: "none" }} /><span className="grow">{r.label}</span><span className="num small muted">{r.posts} post{r.posts === 1 ? "" : "s"} · {compact(r.views)} views · </span><b className="num small" style={{ fontWeight: 500 }}>{pct(er)}</b></div>
          <div className="bar"><i style={{ width: `${(er / max) * 100}%`, background: r.color }} /></div>
        </div>
      );
    })}</div>
  ) : <p className="small muted" style={{ margin: 0 }}>{empty}</p>;

  return (
    <>
      <div className="row cal-bar">
        <div className="grow"><b className="cal-title">Results</b><span className="small muted">From the numbers you add to posted posts. Engagement rate = likes, comments, shares and saves ÷ reach (or views).</span></div>
        <Seg label="Range" options={[["30", "30 days"], ["90", "90 days"], ["year", "This year"]]} value={range} onChange={setRange} />
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button className={`plat${!only ? " on" : ""}`} style={{ ["--p" as string]: "var(--accent)" }} onClick={() => setOnly("")}>All platforms</button>
        {PLATFORMS.filter((p) => (posts ?? []).some((x) => x.platforms?.includes(p.name))).map((p) => <button key={p.name} className={`plat${only === p.name ? " on" : ""}`} style={{ ["--p" as string]: p.color }} onClick={() => setOnly(only === p.name ? "" : p.name)}><i>{p.short}</i>{p.name}</button>)}
        {!clientId && smm.length > 1 && <select className="search" style={{ width: "auto", marginLeft: "auto" }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Client"><option value="">All clients</option>{smm.map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}</select>}
      </div>

      <div className="stats">
        <div className="stat"><span className="k">Posts published</span><span className="v">{all.length}</span><span className="s">{missing.length ? `${missing.length} still need numbers` : "all have numbers"}</span></div>
        <div className="stat"><span className="k">Views</span><span className="v">{compact(sum.views)}</span><span className="s">{withStats.length ? `${compact(sum.views / withStats.length)} per post` : "—"}</span></div>
        <div className="stat"><span className="k">Engagements</span><span className="v">{compact(sum.eng)}</span><span className="s">likes, comments, shares, saves</span></div>
        <div className="stat"><span className="k">Engagement rate</span><span className="v">{sum.base ? pct(sum.eng / sum.base) : "—"}</span><span className="s">{best ? `${best.label} does best` : "add numbers to see"}</span></div>
      </div>

      <div className="card">
        <h3><span>Views over time</span><span className="muted num">{compact(sum.views)}</span></h3>
        <Trend data={series} />
        <div className="legend">{PLATFORMS.filter((p) => series.some((s) => s.segs.some(([pl]) => pl === p.name))).map((p) => <span key={p.name}><i className="fmtl" style={{ background: p.color }} />{p.name}</span>)}</div>
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card"><h3><span>By platform</span></h3>{bars(rows(byPlatform), "Add results to posted posts to compare platforms.")}</div>
        <div className="card"><h3><span>By format</span></h3>{bars(rows(byFormat), "See whether reels, carousels or single images work best.")}<div className="legend">{Object.entries(FORMAT_TONES).filter(([f]) => byFormat.has(f)).map(([f, c]) => <span key={f}><i className="fmtl" style={{ background: c }} />{f}</span>)}</div></div>
      </div>
      {byPillar.size > 0 && <div className="card"><h3><span>By content pillar</span></h3>{bars(rows(byPillar), "")}</div>}

      <div className="card">
        <h3><span>Top posts</span><Seg label="Sort" options={[["rate", "Engagement"], ["views", "Views"]]} value={sort} onChange={setSort} /></h3>
        {top.length ? <div className="top-posts">{top.map((p, i) => {
          const s = totals(p, only || undefined), c = client(p.client_id);
          return (
            <button key={p.id} className="top-post" onClick={() => setForm(p)}>
              <span className="tp-rank">{i + 1}</span>
              <span className="tp-thumb" style={{ ["--c" as string]: formatTone(p.format) }}>{p.media?.[0] ? <MediaThumb src={p.media[0]} /> : <i>{p.format?.[0] ?? "P"}</i>}</span>
              <span className="t" style={{ minWidth: 0 }}>{p.title || p.hook || "Untitled post"}<small>{parseYmd(p.publish_on!).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {p.format}{!clientId && c ? ` · ${clientLabel(c)}` : ""}</small></span>
              <span className="pc-plats">{p.platforms.map((n) => <i key={n} style={{ background: platform(n)?.color }}>{platform(n)?.short}</i>)}</span>
              <span className="num small" style={{ textAlign: "right" }}>{compact(s.views || 0)} views<br /><b style={{ fontWeight: 500 }}>{pct(rate(s))}</b></span>
            </button>
          );
        })}</div> : <p className="small muted" style={{ margin: 0 }}>Your best posts show here once they have numbers.</p>}
      </div>

      {sheet.length > 0 && (
        <div className="card">
          <h3><span>Add numbers</span><span className="muted">{missing.length} posted without results</span></h3>
          <p className="small muted" style={{ margin: "0 0 10px" }}>Open each app&apos;s insights and type the numbers here. They save as you go.</p>
          <div className="table-wrap">
            <table className="sheet">
              <thead><tr><th>Post</th><th>Platform</th>{METRICS.map((m) => <th key={m.key} className="r">{m.label}</th>)}</tr></thead>
              <tbody>{sheet.slice(0, 40).flatMap((p) => (p.platforms?.length ? p.platforms : ["Instagram"]).filter((pl) => !only || pl === only).map((pl) => (
                <tr key={`${p.id}-${pl}`}>
                  <td style={{ maxWidth: 220 }}><button className="linkish" onClick={() => setForm(p)}>{p.title || p.hook || "Untitled"}</button><small className="muted" style={{ display: "block" }}>{parseYmd(p.publish_on!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small></td>
                  <td><span className="plat on" style={{ ["--p" as string]: platform(pl)?.color }}><i>{platform(pl)?.short}</i></span></td>
                  {METRICS.map((m) => <td key={m.key} className="ed r"><input type="number" min={0} inputMode="numeric" aria-label={`${pl} ${m.label}`} defaultValue={p.stats?.[pl]?.[m.key] || ""} onBlur={(e) => { if (e.target.value !== String(p.stats?.[pl]?.[m.key] || "")) saveStats(p, pl, m.key, e.target.value); }} style={{ width: 80, textAlign: "right" }} /></td>)}
                </tr>
              )))}</tbody>
            </table>
          </div>
        </div>
      )}
      {form && <PostForm post={form} clients={clients} pillars={[...new Set((posts ?? []).map((p) => p.pillar).filter(Boolean))]} onClose={() => setForm(null)} onSaved={reload} />}
    </>
  );
}

function Trend({ data }: { data: { key: string; label: string; segs: [string, number][]; tot: number }[] }) {
  const W = 680, H = 200, P = { l: 44, r: 8, t: 12, b: 26 };
  const max = Math.max(...data.map((x) => x.tot), 1);
  const step = [10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1e6].find((s) => max / s <= 5) ?? 5e6;
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => P.t + (H - P.t - P.b) * (1 - v / top);
  const bw = (W - P.l - P.r) / Math.max(data.length, 1);
  return (
    <svg className="chart week-chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Views over time">
      {[...Array(Math.round(top / step) + 1)].map((_, i) => <g key={i}><line className="gl" x1={P.l} x2={W - P.r} y1={y(i * step)} y2={y(i * step)} /><text x={P.l - 6} y={y(i * step) + 3} textAnchor="end">{compact(i * step)}</text></g>)}
      {data.map((x, i) => {
        const cx = P.l + i * bw + bw * 0.2, w = bw * 0.6;
        let acc = 0;
        return (
          <g key={x.key} style={{ ["--i" as string]: i }}>
            {x.segs.map(([pl, v]) => { const a = acc; acc += v; return <rect key={pl} className="bv" x={cx} y={y(acc)} width={w} height={Math.max(0, y(a) - y(acc))} rx={3} fill={platform(pl)?.color ?? "var(--accent)"}><title>{`${pl}: ${compact(v)} views`}</title></rect>; })}
            {(data.length <= 14 || i % 2 === 0) && <text x={cx + w / 2} y={H - 8} textAnchor="middle">{x.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

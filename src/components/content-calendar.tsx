"use client";

import { useState, useSyncExternalStore } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { addDays, parseYmd, today, weekStartYmd } from "@/lib/dates";
import { FORMAT_TONES, POST_COLS, PLATFORMS, STATUSES, formatTone, hashtags, limits, platform, statusTone, type Post } from "@/lib/posts";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import PostForm, { type PostDraft } from "./post-form";
import Seg from "./seg";
import Icon from "./icon";
import MediaThumb from "./media-thumb";

const noop = () => () => {};
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// The social media calendar: every planned and posted piece of content, by day.
export default function ContentCalendar({ clients, clientId }: { clients: Client[]; clientId?: string }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="card skel" style={{ height: 520 }} aria-busy="true" />;
  return <Cal clients={clients} clientId={clientId} />;
}

function Cal({ clients, clientId }: { clients: Client[]; clientId?: string }) {
  const [view, setView] = useState<"month" | "list" | "platforms">(() => (window.innerWidth < 760 ? "list" : "month"));
  const [wk, setWk] = useState(() => weekStartYmd(today()));
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [only, setOnly] = useState("");
  const [who, setWho] = useState(clientId ?? "");
  const [form, setForm] = useState<PostDraft | null>(null);
  const [dragOver, setDragOver] = useState("");

  const first = `${month}-01`, start = weekStartYmd(first), days = [...Array(42)].map((_, i) => addDays(start, i));
  const end = addDays(start, 42);
  // The platform view shows one week at a time; the others show the whole month grid.
  const [qs, qe] = view === "platforms" ? [wk, addDays(wk, 7)] : [start, end];
  const week = [...Array(7)].map((_, i) => addDays(wk, i));
  const [posts, reload, setPosts] = useRows<Post>(`posts:${clientId ?? "all"}:${qs}:${qe}`, (s) => {
    let q = s.from("posts").select(POST_COLS).gte("publish_on", qs).lt("publish_on", qe).order("publish_at", { nullsFirst: true });
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  }, ["posts"]);
  const [ideas, reloadIdeas] = useRows<Post>(`post-ideas:${clientId ?? "all"}`, (s) => {
    let q = s.from("posts").select(POST_COLS).is("publish_on", null).order("created_at", { ascending: false }).limit(40);
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  }, ["posts"]);

  const t = today();
  const client = (id: string | null) => clients.find((c) => c.id === id);
  const shown = (posts ?? []).filter((p) => (!only || p.platforms?.includes(only)) && (!who || p.client_id === who));
  const onDay = (d: string) => shown.filter((p) => p.publish_on === d);
  const inMonth = shown.filter((p) => p.publish_on?.startsWith(month));
  const pillars = [...new Set([...(posts ?? []), ...(ideas ?? [])].filter((p) => !clientId || p.client_id === clientId).map((p) => p.pillar).filter(Boolean))];
  const smm = clients.filter((c) => c.status !== "Past" && c.roles?.some((r) => ["smm", "design", "video"].includes(r)));
  const inRange = view === "platforms" ? shown.filter((p) => p.publish_on && p.publish_on >= wk && p.publish_on < addDays(wk, 7)) : inMonth;
  const perPlatform = (n: string) => inRange.filter((p) => p.platforms?.includes(n)).length;
  const lanes = PLATFORMS.filter((p, i) => i < 3 || p.name === "Threads" || inRange.some((x) => x.platforms?.includes(p.name)));
  const shift = (n: number) => { if (view === "platforms") return setWk(addDays(wk, n * 7)); const d = parseYmd(first); d.setMonth(d.getMonth() + n); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };
  const newPost = (date?: string) => setForm({ client_id: clientId ?? (who || smm[0]?.id || null), publish_on: date ?? (t.startsWith(month) ? t : first) });

  async function moveTo(id: string, date: string) {
    const p = (posts ?? []).find((x) => x.id === id) ?? (ideas ?? []).find((x) => x.id === id);
    if (!p || p.publish_on === date) return;
    setPosts((r) => [...(r ?? []).filter((x) => x.id !== id), { ...p, publish_on: date }]);
    const { error } = await supabase().from("posts").update({ publish_on: date }).eq("id", id);
    if (error) { reload(); return toast("Could not move it. Try again."); }
    toast(`Moved to ${parseYmd(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`);
  }

  const card = (p: Post, compact = false) => {
    const c = client(p.client_id), tags = hashtags(p), lim = limits(p.platforms ?? []), over = tags.length > lim.tags;
    const text = (p.hook || p.caption).trim(), cover = p.media?.[0];
    return (
      <div key={p.id} className={`pcard${p.status === "Posted" ? " posted" : ""}`} style={{ ["--c" as string]: formatTone(p.format) }} draggable
        onDragStart={(e) => { e.dataTransfer.setData("text/post", p.id); e.dataTransfer.effectAllowed = "move"; }}
        onClick={(e) => { e.stopPropagation(); setForm(p); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setForm(p); }}
        title={`${p.title || p.hook || "Post"} · ${p.status}`}>
        <div className="pc-top">
          <span className="pc-plats">{(p.platforms?.length ? p.platforms : ["Instagram"]).map((n) => <i key={n} style={{ background: platform(n)?.color }}>{platform(n)?.short}</i>)}</span>
          <span className="pc-time">{p.publish_at ? new Date(`2000-01-01T${p.publish_at}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase() : ""}</span>
        </div>
        {cover && (
          <div className="pc-media">
            <MediaThumb src={cover} />
            {(p.media?.length ?? 0) > 1 && <span className="pc-count" title={`${p.media.length} slides`}>❐ {p.media.length}</span>}
          </div>
        )}
        <span className="pc-format"><i />{p.format || "Post"}</span>
        <b>{p.title || p.hook || "Untitled post"}</b>
        {!compact && text && text !== p.title && <span className="pc-cap">{text}</span>}
        <div className="pc-foot">
          <span className="pc-status"><i style={{ background: statusTone(p.status) }} />{p.status}</span>
          {tags.length > 0 && <span className={`pc-tags${over ? " over" : ""}`} title={`${tags.length} hashtags, ${lim.tags} max for ${lim.by}`}>#{tags.length}{over ? `/${lim.tags}` : ""}</span>}
        </div>
        {!clientId && c && <span className="pc-client"><i style={{ background: c.color }} />{clientLabel(c)}</span>}
      </div>
    );
  };

  const counts = STATUSES.map((s) => [s.name, inMonth.filter((p) => p.status === s.name).length] as const);
  return (
    <>
      <div className="row cal-bar">
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="cal-title">{view === "platforms" ? `${parseYmd(wk).toLocaleDateString("en-US", { month: "long", day: "numeric" })} – ${parseYmd(addDays(wk, 6)).toLocaleDateString("en-US", { month: wk.slice(5, 7) === addDays(wk, 6).slice(5, 7) ? undefined : "long", day: "numeric" })}` : parseYmd(first).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</b>
          <span className="small muted">{inRange.length} post{inRange.length === 1 ? "" : "s"} planned{(view === "platforms" ? STATUSES.map((x) => [x.name, inRange.filter((p) => p.status === x.name).length] as const) : counts).filter(([, n]) => n).map(([s, n]) => ` · ${n} ${s.toLowerCase()}`).join("")}</span>
        </div>
        <Seg label="View" options={[["month", "Month"], ["platforms", "Platforms"], ["list", "List"]]} value={view} onChange={setView} />
        <div className="row" style={{ gap: 6 }}>
          <button className="btn" onClick={() => shift(-1)} aria-label={view === "platforms" ? "Previous week" : "Previous month"}><Icon name="left" /></button>
          <button className="btn" onClick={() => { setMonth(today().slice(0, 7)); setWk(weekStartYmd(today())); }}>Today</button>
          <button className="btn" onClick={() => shift(1)} aria-label={view === "platforms" ? "Next week" : "Next month"}><Icon name="right" /></button>
        </div>
        <button className="btn solid" onClick={() => newPost()}><Icon name="plus" />Plan a post</button>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button className={`plat${!only ? " on" : ""}`} style={{ ["--p" as string]: "var(--accent)" }} onClick={() => setOnly("")}>All platforms</button>
        {lanes.map((p) => (
          <button key={p.name} className={`plat${only === p.name ? " on" : ""}`} style={{ ["--p" as string]: p.color }} onClick={() => setOnly(only === p.name ? "" : p.name)}><i>{p.short}</i>{p.name}<b className="plat-n">{perPlatform(p.name)}</b></button>
        ))}
        {!clientId && smm.length > 1 && (
          <select className="search" style={{ width: "auto", marginLeft: "auto" }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Client">
            <option value="">All clients</option>
            {smm.map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
          </select>
        )}
      </div>

      {view === "platforms" ? (
        <div className="lanes-wrap">
          <div className="lanes" style={{ gridTemplateColumns: `112px repeat(7, minmax(150px, 1fr))` }}>
            <div className="lane-corner" />
            {week.map((d) => <div key={d} className={`lane-day${d === t ? " today" : ""}`}><span>{parseYmd(d).toLocaleDateString("en-US", { weekday: "short" })}</span><b>{+d.slice(8)}</b></div>)}
            {lanes.filter((p) => !only || p.name === only).map((pl) => (
              <div key={pl.name} style={{ display: "contents" }}>
                <div className="lane-h" style={{ ["--p" as string]: pl.color }}><i>{pl.short}</i><span>{pl.name}<small>{perPlatform(pl.name)} this week</small></span></div>
                {week.map((d) => {
                  const key = `${pl.name}|${d}`, xs = onDay(d).filter((p) => p.platforms?.includes(pl.name));
                  return (
                    <div key={key} className={`lane-cell${d === t ? " today" : ""}${dragOver === key ? " drop" : ""}`} style={{ ["--p" as string]: pl.color }}
                      onClick={() => setForm({ client_id: clientId ?? (who || smm[0]?.id || null), publish_on: d, platforms: [pl.name] })}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(key); }} onDragLeave={() => setDragOver((x) => (x === key ? "" : x))}
                      onDrop={(e) => { e.preventDefault(); setDragOver(""); const id = e.dataTransfer.getData("text/post"); if (id) moveTo(id, d); }}>
                      {xs.map((p) => card(p, true))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : view === "month" ? (
        <div className="cal ccal">
          {WD.map((d) => <div key={d} className="dow">{d}</div>)}
          {days.map((d) => (
            <div key={d} className={`day${d.slice(0, 7) !== month ? " out" : ""}${d === t ? " today" : ""}${dragOver === d ? " drop" : ""}`}
              onClick={() => newPost(d)} onDragOver={(e) => { e.preventDefault(); setDragOver(d); }} onDragLeave={() => setDragOver((x) => (x === d ? "" : x))}
              onDrop={(e) => { e.preventDefault(); setDragOver(""); const id = e.dataTransfer.getData("text/post"); if (id) moveTo(id, d); }}>
              <span className="dn">{+d.slice(8)}</span>
              {onDay(d).map((p) => card(p, true))}
            </div>
          ))}
        </div>
      ) : (
        <div className="clist">
          {days.filter((d) => d.slice(0, 7) === month && (onDay(d).length || d === t)).map((d) => (
            <div key={d} className={`clist-day${d === t ? " today" : ""}`}>
              <div className="clist-h"><b>{parseYmd(d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</b><button className="btn small ghost" onClick={() => newPost(d)}><Icon name="plus" />Add</button></div>
              {onDay(d).length ? <div className="clist-cards">{onDay(d).map((p) => card(p))}</div> : <span className="small muted">Nothing planned today.</span>}
            </div>
          ))}
          {!inMonth.length && <div className="card empty"><b>Nothing planned this month</b><span>Plan your first post, or drop ideas below and give them a date later.</span><button className="btn small" onClick={() => newPost()}><Icon name="plus" />Plan a post</button></div>}
        </div>
      )}

      <div className="card">
        <h3><span>Ideas without a date</span><button className="btn small" onClick={() => setForm({ client_id: clientId ?? (who || smm[0]?.id || null), publish_on: null, status: "Idea" })}><Icon name="plus" />Add idea</button></h3>
        {(ideas ?? []).filter((p) => !who || p.client_id === who).length ? (
          <div className="clist-cards">{(ideas ?? []).filter((p) => !who || p.client_id === who).map((p) => card(p))}</div>
        ) : <p className="small muted" style={{ margin: 0 }}>Jot down post ideas here. In month view, drag one onto a day to schedule it.</p>}
      </div>
      <div className="legend">
        {Object.entries(FORMAT_TONES).map(([f, c]) => <span key={f}><i className="fmtl" style={{ background: c }} />{f}</span>)}
        {STATUSES.map((s) => <span key={s.name}><i className="cdot" style={{ background: s.tone }} />{s.name}</span>)}
        <span>Drag a post to another day to move it. #12 is the number of hashtags.</span>
      </div>

      {form && <PostForm post={form} clients={clients} pillars={pillars} onClose={() => setForm(null)} onSaved={() => { reload(); reloadIdeas(); }} />}
    </>
  );
}

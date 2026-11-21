"use client";

import "@/styles/social.css";
import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { addDays, parseYmd, today, weekStartYmd } from "@/lib/dates";
import { FORMAT_TONES, POST_COLS, PLATFORMS, STATUSES, byDate, formatTone, hashtags, isVideo, limits, platform, stage, statusTone, type Post } from "@/lib/posts";
import { useFlip } from "@/lib/flip";
import { useAccounts } from "@/lib/publish";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import PostForm, { type PostDraft } from "./post-form";
import Seg from "./seg";
import Icon from "./icon";
import MediaThumb from "./media-thumb";
import IgGrid from "./ig-grid";
import PostQueue from "./post-queue";
import Nocti from "./nocti";

const noop = () => () => {};
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type View = "month" | "week" | "platforms" | "list" | "grid" | "queue";
const VIEWS: [View, string][] = [["month", "Month"], ["week", "Week"], ["platforms", "Platforms"], ["list", "List"], ["grid", "Grid"], ["queue", "Queue"]];

// The social media calendar: every planned and posted piece of content, by day.
export default function ContentCalendar({ clients, clientId }: { clients: Client[]; clientId?: string }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="card skel" style={{ height: 520 }} aria-busy="true" />;
  return <Cal clients={clients} clientId={clientId} />;
}

function Cal({ clients, clientId }: { clients: Client[]; clientId?: string }) {
  const [view, setView] = useState<View>(() => (window.innerWidth < 760 ? "list" : "month"));
  const [wk, setWk] = useState(() => weekStartYmd(today()));
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [only, setOnly] = useState("");
  const [who, setWho] = useState(clientId ?? "");
  const [form, setForm] = useState<PostDraft | null>(null);
  const [dragOver, setDragOver] = useState("");

  const first = `${month}-01`, start = weekStartYmd(first), days = [...Array(42)].map((_, i) => addDays(start, i));
  const end = addDays(start, 42);
  // Week and Platforms show one week at a time; the others show the whole month grid.
  const weekly = view === "week" || view === "platforms";
  const [qs, qe] = weekly ? [wk, addDays(wk, 7)] : [start, end];
  const week = [...Array(7)].map((_, i) => addDays(wk, i));
  const [posts, reload, setPosts] = useRows<Post>(`posts:${clientId ?? "all"}:${qs}:${qe}`, (s) => {
    let q = s.from("posts").select(POST_COLS).gte("publish_on", qs).lt("publish_on", qe).order("publish_on").order("publish_at", { nullsFirst: true }).limit(600);
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  }, ["posts"]);
  const [ideas, reloadIdeas, setIdeas] = useRows<Post>(`post-ideas:${clientId ?? "all"}`, (s) => {
    let q = s.from("posts").select(POST_COLS).is("publish_on", null).order("created_at", { ascending: false }).limit(40);
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  }, ["posts"]);

  const t = today();
  const client = (id: string | null) => clients.find((c) => c.id === id);
  // Always in date order, so a post you move sits in its right place on the new day.
  const shown = [...(posts ?? [])].sort(byDate).filter((p) => (!only || p.platforms?.includes(only)) && (!who || p.client_id === who));
  const onDay = (d: string) => shown.filter((p) => p.publish_on === d);
  const inMonth = shown.filter((p) => p.publish_on?.startsWith(month));
  const pillars = [...new Set([...(posts ?? []), ...(ideas ?? [])].filter((p) => !clientId || p.client_id === clientId).map((p) => p.pillar).filter(Boolean))];
  const smm = clients.filter((c) => c.status !== "Past" && c.roles?.some((r) => ["smm", "design", "video"].includes(r)));
  const inRange = weekly ? shown.filter((p) => p.publish_on && p.publish_on >= wk && p.publish_on < addDays(wk, 7)) : inMonth;
  const perPlatform = (n: string) => inRange.filter((p) => p.platforms?.includes(n)).length;
  const lanes = PLATFORMS.filter((p, i) => i < 3 || p.name === "Threads" || inRange.some((x) => x.platforms?.includes(p.name)));
  const shift = (n: number) => { if (weekly) return setWk(addDays(wk, n * 7)); const d = parseYmd(first); d.setMonth(d.getMonth() + n); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };
  const newPost = (date?: string) => setForm({ client_id: clientId ?? (who || smm[0]?.id || null), publish_on: date ?? (t.startsWith(month) ? t : first) });

  const accounts = useAccounts();
  const [board, capture] = useFlip<HTMLDivElement>();
  // Opens the post a link points at (/content?post=<id>, used by the command palette).
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("post");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    supabase().from("posts").select(POST_COLS).eq("id", id).maybeSingle<Post>().then(({ data }) => { if (data) setForm(data); });
  }, []);

  async function moveTo(id: string, date: string) {
    const p = (posts ?? []).find((x) => x.id === id) ?? (ideas ?? []).find((x) => x.id === id);
    if (!p || p.publish_on === date) return;
    capture();
    setPosts((r) => [...(r ?? []).filter((x) => x.id !== id), { ...p, publish_on: date }]);
    setIdeas((r) => (r ?? []).filter((x) => x.id !== id));
    const { error } = await supabase().from("posts").update({ publish_on: date }).eq("id", id);
    if (error) { reload(); reloadIdeas(); return toast("Could not move it. Try again."); }
    toast(`Moved to ${parseYmd(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`);
  }
  // Keyboard: Alt + ← / → moves a post a day, Alt + ↑ / ↓ a week. Focus follows the post.
  function keyMove(e: React.KeyboardEvent, p: Post) {
    const n = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!e.altKey || !n || !p.publish_on) return;
    e.preventDefault();
    const d = addDays(p.publish_on, n);
    if (d < qs || d >= qe) { if (weekly) setWk(weekStartYmd(d)); else setMonth(d.slice(0, 7)); }
    moveTo(p.id, d);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-post="${p.id}"]`)?.focus());
  }

  const card = (p: Post, compact = false, lane = "") => {
    const c = client(p.client_id), tags = hashtags(p), lim = limits(p.platforms ?? []), over = tags.length > lim.tags;
    const text = (p.hook || p.caption).trim(), cover = p.media?.[0], st = stage(p);
    return (
      <div key={p.id} data-flip-id={`${lane}${p.id}`} data-post={p.id} className={`pcard${p.status === "Posted" ? " posted" : ""}${cover ? " has-cover" : ""}${st === "Failed" ? " failed" : ""}`} style={{ ["--c" as string]: formatTone(p.format) }} draggable
        onDragStart={(e) => { e.dataTransfer.setData("text/post", p.id); e.dataTransfer.effectAllowed = "move"; e.currentTarget.classList.add("dragging"); }}
        onDragEnd={(e) => e.currentTarget.classList.remove("dragging")}
        onClick={(e) => { e.stopPropagation(); setForm(p); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setForm(p); else keyMove(e, p); }}
        aria-label={`${p.title || p.hook || "Post"}, ${st}${p.publish_on ? ". Alt and arrow keys move it" : ""}`}
        title={`${p.title || p.hook || "Post"} · ${st}`}>
        <div className="pc-top">
          <span className="pc-plats">{(p.platforms?.length ? p.platforms : ["Instagram"]).map((n) => <i key={n} style={{ background: platform(n)?.color }}>{platform(n)?.short}</i>)}</span>
          <span className="pc-time">{p.publish_at ? new Date(`2000-01-01T${p.publish_at}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase() : ""}</span>
        </div>
        {cover && (
          <div className="pc-media">
            <MediaThumb src={cover} />
            {(p.media?.length ?? 0) > 1 ? <span className="pc-count" title={`${p.media.length} slides`}>❐ {p.media.length}</span>
              : isVideo(cover) || p.format === "Reel" || p.format === "Video" ? <span className="pc-count" title="Video">▶</span> : null}
          </div>
        )}
        <span className="pc-format"><i />{p.format || "Post"}</span>
        <b>{p.title || p.hook || "Untitled post"}</b>
        {!compact && text && text !== p.title && <span className="pc-cap">{text}</span>}
        <div className="pc-foot">
          <span className="pc-status"><i style={{ background: st === "Failed" ? "var(--plum)" : statusTone(p.status) }} />{st === "Failed" ? "Failed" : p.status}</span>
          {tags.length > 0 && <span className={`pc-tags${over ? " over" : ""}`} title={`${tags.length} hashtags, ${lim.tags} max for ${lim.by}`}>#{tags.length}{over ? `/${lim.tags}` : ""}</span>}
        </div>
        {!clientId && c && <span className="pc-client"><i style={{ background: c.color }} />{clientLabel(c)}</span>}
      </div>
    );
  };

  // The grid is per account, so it needs one client: the one you picked, or your first social client.
  const gridClient = clientId ?? (who || smm[0]?.id || null);
  const counts = STATUSES.map((s) => [s.name, inMonth.filter((p) => p.status === s.name).length] as const);
  return (
    <>
      <div className="row cal-bar">
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="cal-title">{view === "grid" ? "Instagram grid" : view === "queue" ? "Posting queue" : weekly ? `${parseYmd(wk).toLocaleDateString("en-US", { month: "long", day: "numeric" })} – ${parseYmd(addDays(wk, 6)).toLocaleDateString("en-US", { month: wk.slice(5, 7) === addDays(wk, 6).slice(5, 7) ? undefined : "long", day: "numeric" })}` : parseYmd(first).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</b>
          <span className="small muted" hidden={view === "grid" || view === "queue"}>{inRange.length} post{inRange.length === 1 ? "" : "s"} planned{(weekly ? STATUSES.map((x) => [x.name, inRange.filter((p) => p.status === x.name).length] as const) : counts).filter(([, n]) => n).map(([s, n]) => ` · ${n} ${s.toLowerCase()}`).join("")}</span>
        </div>
        <Seg label="View" options={VIEWS} value={view} onChange={setView} />
        <div className="row" style={{ gap: 6 }} hidden={view === "grid" || view === "queue"}>
          <button className="btn" onClick={() => shift(-1)} aria-label={weekly ? "Previous week" : "Previous month"}><Icon name="left" /></button>
          <button className="btn" onClick={() => { setMonth(today().slice(0, 7)); setWk(weekStartYmd(today())); }}>Today</button>
          <button className="btn" onClick={() => shift(1)} aria-label={weekly ? "Next week" : "Next month"}><Icon name="right" /></button>
        </div>
        <button className="btn solid" onClick={() => newPost()}><Icon name="plus" />Plan a post</button>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {view !== "grid" && <button className={`plat${!only ? " on" : ""}`} style={{ ["--p" as string]: "var(--accent)" }} onClick={() => setOnly("")}>All platforms</button>}
        {view !== "grid" && lanes.map((p) => (
          <button key={p.name} className={`plat${only === p.name ? " on" : ""}`} style={{ ["--p" as string]: p.color }} onClick={() => setOnly(only === p.name ? "" : p.name)}><i>{p.short}</i>{p.name}<b className="plat-n">{perPlatform(p.name)}</b></button>
        ))}
        {!clientId && smm.length > 1 && (
          <select className="search" style={{ width: "auto", marginLeft: "auto" }} value={view === "grid" ? gridClient ?? "" : who} onChange={(e) => setWho(e.target.value)} aria-label="Client">
            {view !== "grid" && <option value="">All clients</option>}
            {smm.map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
          </select>
        )}
      </div>

      <div ref={board} className="cal-board">
      {view === "grid" ? (
        <IgGrid key={gridClient ?? "own"} clientId={gridClient} label={client(gridClient) ? clientLabel(client(gridClient)!) : gridClient ? "This client" : "Your own"} onOpen={setForm}
          onAdd={() => setForm({ client_id: gridClient, platforms: ["Instagram"], publish_on: null, status: "Drafting" })} />
      ) : view === "queue" ? (
        <PostQueue clients={clients} clientId={clientId ?? who} platformOnly={only} accounts={accounts} onOpen={setForm} onAdd={() => newPost()} />
      ) : view === "week" ? (
        <div className="wk-board">
          {week.map((d) => (
            <div key={d} className={`wk-col${d === t ? " today" : ""}${dragOver === `w|${d}` ? " drop" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(`w|${d}`); }} onDragLeave={() => setDragOver((x) => (x === `w|${d}` ? "" : x))}
              onDrop={(e) => { e.preventDefault(); setDragOver(""); const id = e.dataTransfer.getData("text/post"); if (id) moveTo(id, d); }}>
              <div className="wk-h"><span>{parseYmd(d).toLocaleDateString("en-US", { weekday: "short" })}</span><b>{+d.slice(8)}</b>
                <button className="btn small ghost" onClick={() => newPost(d)} aria-label={`Plan a post on ${parseYmd(d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`}><Icon name="plus" /></button>
              </div>
              {onDay(d).map((p) => card(p, true))}
            </div>
          ))}
        </div>
      ) : view === "platforms" ? (
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
                      {xs.map((p) => card(p, true, `${pl.name}:`))}
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
          {!inMonth.length && <div className="card empty social-empty"><Nocti mood="sleepy" size={72} /><b>Nothing planned this month</b><span>Plan your first post, or drop ideas below and give them a date later.</span><button className="btn solid" onClick={() => newPost()}><Icon name="plus" />Plan a post</button></div>}
        </div>
      )}
      </div>

      <div className="card" hidden={view === "grid" || view === "queue"}>
        <h3><span>Ideas without a date</span><button className="btn small" onClick={() => setForm({ client_id: clientId ?? (who || smm[0]?.id || null), publish_on: null, status: "Idea" })}><Icon name="plus" />Add idea</button></h3>
        {(ideas ?? []).filter((p) => !who || p.client_id === who).length ? (
          <div className="clist-cards">{(ideas ?? []).filter((p) => !who || p.client_id === who).map((p) => card(p))}</div>
        ) : <p className="small muted" style={{ margin: 0 }}>Jot down post ideas here. Drag one onto a day to schedule it.</p>}
      </div>
      <div className="legend" hidden={view === "grid" || view === "queue"}>
        {Object.entries(FORMAT_TONES).map(([f, c]) => <span key={f}><i className="fmtl" style={{ background: c }} />{f}</span>)}
        {STATUSES.map((s) => <span key={s.name}><i className="cdot" style={{ background: s.tone }} />{s.name}</span>)}
        <span>Drag a post to another day to move it, or focus it and press Alt + ← / →. #12 is the number of hashtags.</span>
      </div>

      {form && <PostForm post={form} clients={clients} pillars={pillars} onClose={() => setForm(null)} onSaved={() => { reload(); reloadIdeas(); }} />}
    </>
  );
}

"use client";

import "@/styles/social.css";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import { supabase, useRows } from "@/lib/use-rows";
import { addDays, pad, parseYmd, today } from "@/lib/dates";
import { POST_COLS, byDate, isVideo, stage, type Post, type Stage } from "@/lib/posts";
import { useFlip } from "@/lib/flip";
import { toast } from "@/lib/toast";
import MediaThumb from "./media-thumb";
import Nocti from "./nocti";
import Icon from "./icon";

gsap.registerPlugin(Draggable);

const PILL: Record<Stage, string> = { Draft: "draft", "For approval": "approval", Scheduled: "scheduled", Posted: "posted", Failed: "failed" };
// Feed order, newest first: everything still to come (by date), then what's already posted.
const feed = (a: Post, b: Post) => Number(a.status === "Posted") - Number(b.status === "Posted") || byDate(b, a);
// One minute later (same day), so a dropped draft lands just before the tile it was dropped on.
const later = (t: string | null) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number), n = Math.min(h * 60 + m + 1, 23 * 60 + 59);
  return `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
};
const day = (d: string) => parseYmd(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
type Slot = Pick<Post, "publish_on" | "publish_at">;

// Instagram grid planner: see the feed before it's posted, drag tiles to change the order (their dates swap).
export default function IgGrid({ clientId, label, onOpen, onAdd }: { clientId: string | null; label: string; onOpen: (p: Post) => void; onAdd: () => void }) {
  const [hidePosted, setHidePosted] = useState(false);
  const [rows, reload, setRows] = useRows<Post>(`ig-grid:${clientId ?? "own"}`, (s) => {
    const q = s.from("posts").select(POST_COLS).contains("platforms", ["Instagram"]).order("publish_on", { ascending: false, nullsFirst: true }).limit(150);
    return clientId ? q.eq("client_id", clientId) : q.is("client_id", null);
  }, ["posts"]);
  const [box, capture] = useFlip<HTMLDivElement>();
  const all = (rows ?? []).filter((p) => p.format !== "Story"); // stories don't show on the grid
  const grid = all.filter((p) => p.publish_on && (!hidePosted || p.status !== "Posted")).sort(feed);
  const tray = all.filter((p) => !p.publish_on && p.status !== "Posted");
  const upcoming = grid.filter((p) => p.status !== "Posted");
  const nextDay = addDays([today(), ...upcoming.map((p) => p.publish_on!)].sort().at(-1)!, 1);

  // Saves new dates for one or two posts, after moving them on screen right away.
  async function place(moves: [Post, Slot][], el?: HTMLElement) {
    capture();
    if (el) gsap.set(el, { x: 0, y: 0 });
    flushSync(() => setRows((r) => (r ?? []).map((p) => { const m = moves.find(([x]) => x.id === p.id); return m ? { ...p, ...m[1] } : p; })));
    const res = await Promise.all(moves.map(([p, s]) => supabase().from("posts").update(s).eq("id", p.id)));
    if (res.some((r) => r.error)) { reload(); toast("Could not save the new order. Try again."); return; }
    toast(moves.length > 1 ? "Swapped. Their post dates swapped too." : `Planned for ${day(moves[0][1].publish_on!)}`);
  }
  function drop(dragId: string, target: string, el?: HTMLElement) {
    const a = all.find((p) => p.id === dragId);
    if (!a) return;
    if (target === "next") return place([[a, { publish_on: nextDay, publish_at: a.publish_on ? a.publish_at : null }]], el);
    const b = grid.find((p) => p.id === target);
    if (!b || b.id === a.id || b.status === "Posted") { if (el) gsap.to(el, { x: 0, y: 0, duration: 0.3, ease: "power3.out" }); return; }
    if (!a.publish_on) return place([[a, { publish_on: b.publish_on, publish_at: later(b.publish_at) }]], el);
    if (a.publish_on === b.publish_on && a.publish_at === b.publish_at) { if (el) gsap.set(el, { x: 0, y: 0 }); return toast("Those two share a day and time. Give one a different time first."); }
    place([[a, { publish_on: b.publish_on, publish_at: b.publish_at }], [b, { publish_on: a.publish_on, publish_at: a.publish_at }]], el);
  }
  const act = useRef(drop);
  useEffect(() => { act.current = drop; });

  // Drag by the grip (so the page still scrolls on phones). Rebuilt whenever the tiles change.
  const order = [...grid, ...tray].map((p) => `${p.id}${p.publish_on}`).join();
  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const drops = () => [...root.querySelectorAll<HTMLElement>(".ig-tile.movable, .ig-next")];
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let over: HTMLElement | null = null;
    const ds = [...root.querySelectorAll<HTMLElement>(".ig-tile.movable, .ig-tray-item")].map((el) => Draggable.create(el, {
      trigger: el.querySelector(".ig-grip"), zIndexBoost: true, dragClickables: true,
      onPress() { el.classList.add("lifting"); },
      onDrag() {
        const hit = drops().find((t) => t !== el && this.hitTest(t, "30%")) ?? null;
        if (hit !== over) { over?.classList.remove("drop"); hit?.classList.add("drop"); over = hit; }
      },
      onRelease() {
        el.classList.remove("lifting");
        const t = over; over?.classList.remove("drop"); over = null;
        if (t) act.current(el.dataset.flipId!, t.dataset.flipId ?? "next", el);
        else if (still) gsap.set(el, { x: 0, y: 0 });
        else gsap.to(el, { x: 0, y: 0, duration: 0.35, ease: "power3.out" });
      },
    })[0]);
    return () => ds.forEach((d) => d.kill());
  }, [order, box]);

  // Keyboard: Alt + arrow keys move a tile one place earlier or later in the feed.
  const key = (e: React.KeyboardEvent, p: Post, i: number) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); return onOpen(p); }
    if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const n = grid[i + (e.key === "ArrowLeft" ? -1 : 1)];
    if (!n || n.status === "Posted" || p.status === "Posted") return;
    drop(p.id, n.id);
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>(`[data-flip-id="${p.id}"]`)?.focus());
  };

  const cover = (p: Post) => {
    const m = p.media?.[0];
    return (
      <>
        {m ? <MediaThumb src={m} /> : <span className="ig-blank">{p.title || p.hook || "No cover yet"}</span>}
        {(p.media?.length ?? 0) > 1 ? <span className="ig-badge" title={`${p.media.length} slides`}>❐ {p.media.length}</span>
          : m && (isVideo(m) || p.format === "Reel") ? <span className="ig-badge" title="Video">▶</span> : null}
      </>
    );
  };

  if (rows === null) return <div className="card skel" style={{ height: 520 }} aria-busy="true" />;
  if (!grid.length && !tray.length) return (
    <div className="card empty social-empty">
      <Nocti mood="sleepy" size={80} />
      <b>No Instagram posts for {label} yet</b>
      <span>Plan one and it shows up here as a tile, so you can see the feed before it goes live.</span>
      <button className="btn solid" onClick={onAdd}><Icon name="plus" />Plan an Instagram post</button>
    </div>
  );

  return (
    <div className="ig-wrap" ref={box}>
      <div className="ig-bar">
        <div>
          <b>{label}&apos;s feed</b>
          <span className="small muted">Newest first. Drag a tile by its grip, or focus it and press Alt + ← / →. Their dates swap.</span>
        </div>
        <label className="ig-toggle"><input type="checkbox" checked={hidePosted} onChange={(e) => setHidePosted(e.target.checked)} />Hide posted</label>
      </div>
      <div className="ig-grid" role="list" aria-label={`${label} Instagram grid`}>
        {tray.length > 0 && (
          <div className="ig-next" data-flip-id="next" role="listitem">
            <Icon name="plus" /><span>Drop a draft here to post it next</span><small>{day(nextDay)}</small>
          </div>
        )}
        {grid.map((p, i) => {
          const st = stage(p), movable = p.status !== "Posted";
          return (
            <div key={p.id} data-flip-id={p.id} role="listitem" className={`ig-tile${movable ? " movable" : ""}`}>
              <div className="ig-face" role="button" tabIndex={0} aria-label={`${p.title || "Post"}, ${st}, ${day(p.publish_on!)}`}
                onClick={() => onOpen(p)} onKeyDown={(e) => key(e, p, i)}>
                {cover(p)}
                <span className={`ig-pill ${PILL[st]}`}>{st}</span>
                <span className="ig-date">{day(p.publish_on!)}</span>
              </div>
              {movable && <span className="ig-grip" aria-hidden="true" title="Drag to reorder"><i /><i /><i /></span>}
            </div>
          );
        })}
      </div>
      {tray.length > 0 && (
        <div className="ig-tray">
          <h3><span>Drafts without a date</span><span className="small muted">Drag one into the grid</span></h3>
          <div className="ig-tray-row">
            {tray.map((p) => (
              <div key={p.id} data-flip-id={p.id} className="ig-tray-item">
                <div className="ig-face" role="button" tabIndex={0} aria-label={`${p.title || "Draft"}, no date`} onClick={() => onOpen(p)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(p); }}>
                  {cover(p)}
                  <span className={`ig-pill ${PILL[stage(p)]}`}>{stage(p)}</span>
                </div>
                <span className="ig-grip" aria-hidden="true" title="Drag into the grid"><i /><i /><i /></span>
                <button type="button" className="btn small ghost" onClick={() => drop(p.id, "next")}>Post next</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

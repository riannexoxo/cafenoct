"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { COLUMNS, colOf } from "@/lib/work";
import TaskCard from "./task-card";
import type { CardCtx, Lane, VTask } from "./shared";

gsap.registerPlugin(Flip);

// Kanban by status. Drag a card to another column, or focus it and press Shift + left/right.
// Grouping by client or project gives one swimlane per group.
export default function BoardView({ lanes, ctx, onMove }: { lanes: Lane[]; ctx: CardCtx; onMove: (id: string, status: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const flip = useRef<Flip.FlipState | null>(null);
  const focusId = useRef("");
  const tween = useRef<gsap.core.Timeline | null>(null);
  const [over, setOver] = useState("");

  function move(x: VTask, status: string, keepFocus = false) {
    if (colOf(x.status) === status) return;
    if (box.current && window.matchMedia("(prefers-reduced-motion: no-preference)").matches) flip.current = Flip.getState(box.current.querySelectorAll(".vcard"));
    if (keepFocus) focusId.current = x.id;
    onMove(x.id, status);
  }
  // After the optimistic move renders: cards glide to their new spots, and keyboard focus follows the card.
  useLayoutEffect(() => {
    if (flip.current && box.current) {
      tween.current = Flip.from(flip.current, { targets: box.current.querySelectorAll(".vcard"), duration: 0.42, ease: "power3.inOut", zIndex: 5, toggleClass: "flip-lift" });
      flip.current = null;
    }
    if (focusId.current) { box.current?.querySelector<HTMLElement>(`[data-flip-id="${focusId.current}"]`)?.focus(); focusId.current = ""; }
  });
  useEffect(() => () => { tween.current?.kill(); }, []);

  const key = (x: VTask) => (e: React.KeyboardEvent) => {
    if (!e.shiftKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const i = COLUMNS.findIndex((c) => c.key === colOf(x.status)) + (e.key === "ArrowRight" ? 1 : -1);
    if (i >= 0 && i < COLUMNS.length) move(x, COLUMNS[i].key, true);
  };

  return (
    <div ref={box} className="vlanes">
      {lanes.map((lane) => (
        <section key={lane.key} className="vlane">
          {lanes.length > 1 && <h3 className="vlane-h"><i style={{ background: lane.color ?? "var(--line-strong)" }} />{lane.label}<span className="muted small">{lane.rows.length}</span></h3>}
          <div className="kanban">
            {COLUMNS.map((col) => {
              const id = `${lane.key}:${col.key}`, xs = lane.rows.filter((x) => colOf(x.status) === col.key);
              return (
                <div key={col.key} className={`board-col${over === id ? " drop" : ""}`} style={{ ["--t" as string]: col.tone }} aria-label={`${col.label}, ${xs.length}`} role="group"
                  onDragOver={(e) => { e.preventDefault(); setOver(id); }} onDragLeave={() => setOver((o) => (o === id ? "" : o))}
                  onDrop={(e) => { e.preventDefault(); setOver(""); const t = lane.rows.find((r) => r.id === e.dataTransfer.getData("text/task")) ?? ctx.find(e.dataTransfer.getData("text/task")); if (t) move(t, col.key); }}>
                  <div className="board-h"><span><i />{col.label}</span><span className="muted">{xs.length}</span></div>
                  {xs.map((x) => (
                    <TaskCard key={x.id} x={x} {...ctx.props(x)} onKey={key(x)}
                      onDragStart={(e) => { e.dataTransfer.setData("text/task", x.id); e.dataTransfer.effectAllowed = "move"; }} />
                  ))}
                  {!xs.length && <div className="idea-empty">{col.key === "waiting" ? "Waiting on a reply or approval? Drop it here." : col.key === "done" ? "Finished work lands here." : "Nothing here"}</div>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { addDays, parseYmd, weekStartYmd } from "@/lib/dates";
import type { Client } from "@/lib/types";
import Icon from "@/components/icon";
import type { VTask } from "./shared";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// A month of tasks by due date. Drag a task to another day, or focus it and press Shift + arrows (a day, or a week).
export default function CalendarView({ rows, clients, today: t, setDue, open }: {
  rows: VTask[]; clients: Client[]; today: string; setDue: (id: string, due: string | null) => void; open: (x: VTask) => void;
}) {
  const [month, setMonth] = useState(t.slice(0, 7));
  const [over, setOver] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const focusId = useRef("");
  useLayoutEffect(() => { if (focusId.current) { box.current?.querySelector<HTMLElement>(`[data-id="${focusId.current}"]`)?.focus(); focusId.current = ""; } });
  const first = `${month}-01`, start = weekStartYmd(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weeks = days[35].slice(0, 7) === month ? 6 : 5;
  const shift = (n: number) => { const d = parseYmd(first); d.setMonth(d.getMonth() + n); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };
  const color = (x: VTask) => clients.find((c) => c.id === x.client_id)?.color ?? "var(--line-strong)";
  const undated = rows.filter((x) => !x.due_date && x.status !== "done");

  const chip = (x: VTask) => (
    <button key={x.id} data-id={x.id} type="button" className={`chip vchip${x.status === "done" ? " done" : ""}${x.milestone ? " ms" : ""}`} style={{ ["--c" as string]: color(x) }} draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/task", x.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={(e) => { e.stopPropagation(); open(x); }} aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown"
      onKeyDown={(e) => {
        const n = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
        if (!e.shiftKey || !n) return;
        e.preventDefault();
        const due = addDays(x.due_date ?? t, n);
        focusId.current = x.id;
        if (due.slice(0, 7) !== month) setMonth(due.slice(0, 7));
        setDue(x.id, due);
      }}>
      {x.milestone && <span className="vdia" role="img" aria-label="Milestone" />}{x.title}
    </button>
  );
  const drop = (day: string | null) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(day ?? "none"); },
    onDragLeave: () => setOver((o) => (o === (day ?? "none") ? "" : o)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(""); const id = e.dataTransfer.getData("text/task"); if (id) setDue(id, day); },
  });

  return (
    <div className="card vcal" ref={box}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b className="cal-title">{parseYmd(first).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</b>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn small ghost" onClick={() => shift(-1)} aria-label="Previous month"><Icon name="left" /></button>
          <button className="btn small" onClick={() => setMonth(t.slice(0, 7))}>Today</button>
          <button className="btn small ghost" onClick={() => shift(1)} aria-label="Next month"><Icon name="right" /></button>
        </div>
      </div>
      <div className="cal" aria-label="Tasks by due date" role="group">
        {DOW.map((d) => <div key={d} className="dow" aria-hidden="true">{d}</div>)}
        {days.slice(0, weeks * 7).map((d) => {
          const xs = rows.filter((x) => x.due_date === d);
          return (
            <div key={d} role="group" aria-label={parseYmd(d).toDateString()} className={`day${d.slice(0, 7) !== month ? " out" : ""}${d === t ? " today" : ""}${over === d ? " vdrop" : ""}`} {...drop(d)}>
              <span className="dn">{Number(d.slice(8))}</span>
              {xs.slice(0, 4).map(chip)}
              {xs.length > 4 && <span className="small muted">+{xs.length - 4} more</span>}
            </div>
          );
        })}
      </div>
      {undated.length > 0 && (
        <div className={`vtray${over === "none" ? " vdrop" : ""}`} {...drop(null)}>
          <span className="small muted">No due date · drag onto a day</span>
          <div className="row" style={{ gap: 6 }}>{undated.slice(0, 30).map(chip)}</div>
        </div>
      )}
    </div>
  );
}

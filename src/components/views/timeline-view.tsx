"use client";

import { useState } from "react";
import { addDays, parseYmd, weekStartYmd } from "@/lib/dates";
import type { Project } from "@/lib/work";
import type { Client } from "@/lib/types";
import Icon from "@/components/icon";
import type { VTask } from "./shared";

const SPAN = 42; // six weeks on screen
const dayN = (a: string, b: string) => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 864e5);

// Six weeks of work as bars from start to due date, grouped by project. Milestones are diamonds.
export default function TimelineView({ rows, projects, clients, today: t, open }: {
  rows: VTask[]; projects: Project[]; clients: Client[]; today: string; open: (x: VTask) => void;
}) {
  const [from, setFrom] = useState(() => addDays(weekStartYmd(t), -7));
  const to = addDays(from, SPAN - 1);
  const days = Array.from({ length: SPAN }, (_, i) => addDays(from, i));
  const inView = rows.filter((x) => x.due_date && (x.start_date ?? x.due_date) <= to && x.due_date >= from);
  const groups = [...projects.map((p) => ({ key: p.id, name: p.name, xs: inView.filter((x) => x.project_id === p.id) })), { key: "none", name: "No project", xs: inView.filter((x) => !x.project_id || !projects.some((p) => p.id === x.project_id)) }].filter((g) => g.xs.length);
  const color = (x: VTask) => clients.find((c) => c.id === x.client_id)?.color ?? "var(--accent)";
  const col = (d: string) => Math.max(0, Math.min(SPAN - 1, dayN(from, d))) + 2; // grid column (1 is the label)
  let line = 2;

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <b className="cal-title">{parseYmd(from).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {parseYmd(to).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</b>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn small ghost" onClick={() => setFrom(addDays(from, -14))} aria-label="Earlier"><Icon name="left" /></button>
          <button className="btn small" onClick={() => setFrom(addDays(weekStartYmd(t), -7))}>Today</button>
          <button className="btn small ghost" onClick={() => setFrom(addDays(from, 14))} aria-label="Later"><Icon name="right" /></button>
        </div>
      </div>
      {!groups.length ? <p className="small muted" style={{ textAlign: "center", padding: 24 }}>Nothing with a due date in these six weeks. Add a start and due date to see it here.</p> : (
        <div className="table-wrap">
          <div className="tl vtl" style={{ gridTemplateColumns: `170px repeat(${SPAN}, minmax(20px, 1fr))` }}>
            <div className="tl-h" style={{ gridColumn: 1, gridRow: 1 }} />
            {days.map((d, i) => {
              const dow = parseYmd(d).getDay();
              return <div key={d} className={`tl-h${dow === 0 || dow === 6 ? " we" : ""}${d === t ? " now" : ""}`} style={{ gridColumn: i + 2, gridRow: 1 }}>{d.endsWith("-01") || i === 0 ? <b>{parseYmd(d).toLocaleDateString("en-US", { month: "short" })}</b> : null}{Number(d.slice(8))}</div>;
            })}
            {days.includes(t) && <div className="vtl-now" style={{ gridColumn: col(t), gridRow: `1 / span ${1 + groups.reduce((a, g) => a + g.xs.length + 1, 0)}` }} aria-hidden="true" />}
            {groups.map((g) => {
              const gl = line++;
              return [
                <div key={g.key} className="tl-g" style={{ gridColumn: `1 / span ${SPAN + 1}`, gridRow: gl }}>{g.name} · {g.xs.length}</div>,
                ...g.xs.map((x) => {
                  const r = line++, a = col(x.start_date && x.start_date < x.due_date! ? x.start_date : x.due_date!), b = col(x.due_date!);
                  const label = `${x.title}, ${x.start_date && x.start_date !== x.due_date ? `${x.start_date} to ` : ""}${x.due_date}`;
                  return [
                    <div key={`${x.id}-l`} className="tl-l" style={{ gridColumn: 1, gridRow: r }} title={x.title}>{x.title}</div>,
                    x.milestone
                      ? <button key={x.id} type="button" className="vtl-ms" style={{ gridColumn: b, gridRow: r, ["--c" as string]: color(x) }} onClick={() => open(x)} aria-label={`Milestone: ${label}`}><i /></button>
                      : <button key={x.id} type="button" className={`tl-bar vtl-bar${x.status === "done" ? " done" : ""}`} style={{ gridColumn: `${a} / ${b + 1}`, gridRow: r, ["--c" as string]: color(x) }} onClick={() => open(x)} aria-label={label} />,
                  ];
                }),
              ];
            })}
          </div>
        </div>
      )}
    </div>
  );
}

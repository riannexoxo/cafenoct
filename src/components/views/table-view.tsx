"use client";

import { COLUMNS, type Project } from "@/lib/work";
import { rel } from "@/lib/dates";
import { clientLabel, type Client } from "@/lib/types";
import Sheet, { type SheetCol, type Val } from "./sheet";
import { Labels, StatusPill } from "./task-card";
import type { Lane, VTask } from "./shared";

// Every task as a spreadsheet: edit the title, status, priority, client, project, dates and labels in place.
export default function TableView({ lanes, clients, projects, today: t, save, open }: {
  lanes: Lane[]; clients: Client[]; projects: Project[]; today: string;
  save: (x: VTask, key: string, v: Val) => Promise<{ error: unknown }>; open: (x: VTask) => void;
}) {
  const rows = lanes.flatMap((l) => l.rows);
  const label = new Map(lanes.flatMap((l) => l.rows.map((r) => [r.id, l.label] as const)));
  const cname = (id: string | null) => { const c = clients.find((x) => x.id === id); return c ? clientLabel(c) : "Personal"; };
  const cols: SheetCol<VTask>[] = [
    { key: "title", label: "Task", type: "text", get: (x) => x.title, width: 220, show: (x, v) => <span className={x.milestone ? "vms" : ""}>{x.milestone && <span className="vdia" role="img" aria-label="Milestone" />}{v}</span> },
    { key: "status", label: "Status", type: "select", get: (x) => x.status, options: COLUMNS.map((c) => [c.key, c.label]), show: (_, v) => <StatusPill status={String(v)} /> },
    { key: "priority", label: "Priority", type: "select", get: (x) => x.priority, options: [["low", "Low"], ["med", "Normal"], ["high", "High"]], show: (_, v) => (v === "high" ? <span className="pill bad">High</span> : v === "low" ? "Low" : "Normal") },
    { key: "client_id", label: "Client", type: "select", get: (x) => x.client_id ?? "", options: [["", "Personal"], ...clients.filter((c) => c.status !== "Past").map((c) => [c.id, clientLabel(c)] as [string, string])], show: (_, v) => cname((v as string) || null) },
    { key: "project_id", label: "Project", type: "select", get: (x) => x.project_id ?? "", options: [["", "No project"], ...projects.map((p) => [p.id, p.name] as [string, string])], show: (_, v) => projects.find((p) => p.id === v)?.name ?? <span className="muted">—</span> },
    { key: "start_date", label: "Starts", type: "date", get: (x) => x.start_date },
    { key: "due_date", label: "Due", type: "date", get: (x) => x.due_date, show: (x, v) => (v ? <span className={x.status !== "done" && String(v) < t ? "bad-t" : ""}>{rel(String(v))}</span> : <span className="muted">—</span>) },
    { key: "labels", label: "Labels", type: "text", get: (x) => (x.labels ?? []).join(", "), width: 160, show: (x) => (x.labels?.length ? <Labels labels={x.labels} /> : <span className="muted">—</span>) },
    { key: "checklist", label: "Checklist", type: "text", edit: false, get: (x) => (x.subtasks?.length ? `${x.subtasks.filter((s) => s.done).length}/${x.subtasks.length}` : null) },
  ];
  return <Sheet label="Tasks" rows={rows} cols={cols} save={save} open={open} group={lanes.length > 1 ? (r) => label.get(r.id) ?? "" : undefined} />;
}

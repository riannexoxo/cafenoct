"use client";

import { rel } from "@/lib/dates";
import { COLUMNS, colOf, type Project } from "@/lib/work";
import { clientLabel, type Client } from "@/lib/types";
import Icon from "@/components/icon";
import { isImage, labelTone, type VTask } from "./shared";

export const StatusPill = ({ status }: { status: string }) => {
  const c = COLUMNS.find((x) => x.key === colOf(status))!;
  return <span className="vstat" style={{ ["--t" as string]: c.tone }}><i />{c.label}</span>;
};

export const Labels = ({ labels }: { labels: string[] }) => (labels.length ? <span className="vlabels">{labels.map((l) => <span key={l} className={`vlab ${labelTone(l)}`}>{l}</span>)}</span> : null);

type Props = {
  x: VTask; client?: Client; project?: Project; comments: number; showClient: boolean; today: string; cover?: string;
  onOpen: () => void; onKey?: (e: React.KeyboardEvent) => void; onDragStart?: (e: React.DragEvent) => void;
};

// One task card: cover, title, client and project, labels, due chip, checklist, comments, milestone.
export default function TaskCard({ x, client: c, project: p, comments, showClient, today: t, cover: fileCover, onOpen, onKey, onDragStart }: Props) {
  const subs = x.subtasks ?? [], done = subs.filter((s) => s.done).length;
  const cover = (x.links ?? []).find((l) => isImage(l.url))?.url ?? fileCover;
  const due = x.due_date && x.status !== "done" ? (x.due_date < t ? "bad" : x.due_date === t ? "honey" : "") : null;
  return (
    <div className={`wcardt vcard${x.status === "done" ? " done" : ""}`} data-flip-id={x.id} draggable={!!onDragStart} onDragStart={onDragStart}
      onClick={onOpen} role="button" tabIndex={0} aria-keyshortcuts={onKey ? "Shift+ArrowLeft Shift+ArrowRight" : undefined}
      title={onKey ? "Shift + arrow keys move it between columns" : undefined}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } else onKey?.(e); }}
      style={{ ["--c" as string]: c?.color ?? "var(--line-strong)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- any image link the user saved, not a Next asset */}
      {cover && <img className="vcover" src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} />}
      <b>{x.milestone && <span className="vdia" role="img" aria-label="Milestone" />}{x.title}</b>
      {(showClient || p) && (
        <div className="wt-meta">
          {showClient && <span className="wt-client"><i />{c ? clientLabel(c) : "Personal"}</span>}
          {p && <span className="wt-proj"><Icon name="projects" size={11} />{p.name}</span>}
        </div>
      )}
      <Labels labels={x.labels ?? []} />
      <div className="wt-foot">
        {due !== null && <span className={`pill ${due}`}>{rel(x.due_date!)}</span>}
        {x.priority === "high" && <span className="pill bad">High</span>}
        {subs.length > 0 && <span className="small muted vcheck" aria-label={`Checklist ${done} of ${subs.length}`}><Icon name="sub" size={12} /> {done}/{subs.length}<span className="bar"><i style={{ transform: `scaleX(${done / subs.length})` }} /></span></span>}
        {comments > 0 && <span className="small muted" aria-label={`${comments} comments`}><Icon name="chat" size={12} /> {comments}</span>}
        {(x.links ?? []).length > 0 && <span className="small muted" aria-label={`${x.links.length} links`}><Icon name="link" size={12} /> {x.links.length}</span>}
        {Array.isArray(x.files) && x.files.length > 0 && <span className="small muted" aria-label={`${x.files.length} files`}><Icon name="file" size={12} /> {x.files.length}</span>}
        {x.repeat && x.repeat !== "none" && <span className="small muted" aria-label="Repeats"><Icon name="repeat" size={12} /></span>}
      </div>
    </div>
  );
}

"use client";

// Shared bits for the task views: the fuller task row, label colors, filters, and the sleepy empty state.
import { TASK_COLS, type Project, type Task } from "@/lib/work";
import type { Client } from "@/lib/types";
import Nocti from "@/components/nocti";

export type VTask = Task & { labels: string[]; milestone: boolean; start_date: string | null; created_at: string; updated_at: string };
export const VTASK_COLS = `${TASK_COLS},start_date,created_at,updated_at`;

// A group of tasks (one swimlane or one block of table rows), and what a card needs to draw itself.
export type Lane = { key: string; label: string; color?: string; rows: VTask[] };
export type CardCtx = {
  find: (id: string) => VTask | undefined;
  props: (x: VTask) => { client?: Client; project?: Project; comments: number; showClient: boolean; today: string; cover?: string; onOpen: () => void };
};

export type ViewKind = "board" | "table" | "calendar" | "timeline";
export type GroupBy = "status" | "client" | "project";
export type ViewConfig = { view: ViewKind; who: string; proj: string; label: string; status: string; q: string; group: GroupBy };

// Same label, same soft color, everywhere.
export const labelTone = (s: string) => { let h = 0; for (const ch of s.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `lab-${h % 6}`; };
export const isImage = (u: string) => /^https:\/\/\S+\.(png|jpe?g|gif|webp|avif)(\?\S*)?$/i.test(u);

export function Empty({ line, action, onAction }: { line: string; action?: string; onAction?: () => void }) {
  return (
    <div className="empty v-empty">
      <Nocti mood="sleepy" size={72} />
      <b>{line}</b>
      {action && onAction && <button className="btn solid small" onClick={onAction}>{action}</button>}
    </div>
  );
}

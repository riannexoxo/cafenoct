// What a client sees: the shapes returned by portal_data / share_view, and plain words for every status.
// Shared by server pages and client components, so nothing here may import server-only code.
import type { Item } from "@/lib/invoices";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TOKEN = /^[0-9a-f]{48}$/;

export type PFile = { path: string; name: string; type: string; size: number; w?: number; h?: number };
export type PComment = { id?: string; entity?: string; entity_id?: string; author: "me" | "client"; author_name: string; body: string; created_at: string };
export type PDeliverable = {
  id: string; kind: string; title: string; type: string; size: string; length: string; status: string; brief: string;
  links: { ref?: string; work?: string; final?: string } | null; files: PFile[] | null; due_date: string | null;
  delivered_at?: string | null; revisions?: number; max_revisions?: number;
};
export type PPost = {
  id: string; title: string; caption: string; hashtags: string; platforms: string[] | null; format: string;
  publish_on: string | null; publish_at: string | null; status: string; media: string[] | null; post_urls?: Record<string, string> | null;
};
export type PProject = {
  id: string; name: string; status: string; start_date: string | null; due_date: string | null; description: string;
  tasks_total: number; tasks_done: number; milestones: { title: string; due_date: string | null; done: boolean }[];
  update: { state: "on_track" | "at_risk" | "off_track"; body: string; created_at: string } | null;
};
export type PInvoice = { id: string; number: string; issue_date: string; due_date: string | null; currency: string; status: "sent" | "paid"; items: Item[]; paid_date: string | null };
export type PClient = { id: string; name: string; company: string; color: string; logo_url: string };
export type PortalData = {
  client: PClient; owner: string | null; projects: PProject[]; deliverables: PDeliverable[]; posts: PPost[]; invoices: PInvoice[]; comments: PComment[];
};
export type ShareData = {
  entity: "deliverable" | "post"; decision: "" | "approved" | "changes"; decided_at: string | null; expires_at: string;
  owner: string | null; client: string | null; item: (PDeliverable & PPost) | null; comments: PComment[];
};

export const DLV_WORDS: Record<string, string> = {
  brief: "Planned", making: "Being made", review: "Ready for your review", revisions: "Making your changes", approved: "Approved", delivered: "Delivered",
};
export const DLV_TONE: Record<string, string> = { review: "acc", revisions: "warn", approved: "good", delivered: "good" };
export const POST_WORDS: Record<string, string> = { "For approval": "Needs your OK", Scheduled: "Scheduled", Posted: "Posted" };
export const POST_TONE: Record<string, string> = { "For approval": "acc", Scheduled: "", Posted: "good" };
export const UPDATE_WORDS: Record<string, [string, string]> = { on_track: ["On track", "good"], at_risk: ["At risk", "warn"], off_track: ["Off track", "bad"] };

// Only these two can be approved or sent back by the client.
export const needsDeliverable = (d: Pick<PDeliverable, "status">) => d.status === "review";
export const needsPost = (p: Pick<PPost, "status">) => p.status === "For approval";

// Dates arrive as YYYY-MM-DD (no time zone) or full timestamps.
export function niceDate(s: string | null | undefined, year = false) {
  if (!s) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`) : new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: year ? undefined : "short", month: "short", day: "numeric", year: year ? "numeric" : undefined });
}
export const niceTime = (t: string | null | undefined) => {
  const m = /^(\d{2}):(\d{2})/.exec(t ?? "");
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
};

// Links typed by the VA: only plain web links ever become clickable.
export function safeHref(u: string | null | undefined) {
  const s = (u ?? "").trim();
  if (!s) return "";
  try { const x = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); return x.protocol === "https:" || x.protocol === "http:" ? x.href : ""; } catch { return ""; }
}
export const fileKind = (type: string) => (type.startsWith("image/") && type !== "image/tiff" ? "image" : type.startsWith("video/") ? "video" : "file");

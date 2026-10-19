// Design and video requests (one queue each), data entry batches, and the specs cheat sheets.
import type { WorkFile } from "@/lib/work-files";

export type Kind = "design" | "video";
export type Deliverable = {
  id: string; client_id: string | null; kind: Kind; title: string; type: string; size: string; length: string; status: string;
  brief: string; links: { ref?: string; work?: string; final?: string }; revisions: number; max_revisions: number;
  due_date: string | null; delivered_at: string | null; position: number; created_at: string;
  files: WorkFile[]; canva: CanvaLink;
};
export type CanvaLink = { id?: string; title?: string; thumb?: string; w?: number; h?: number; pages?: number };
export const DELIVERABLE_COLS = "id,client_id,kind,title,type,size,length,status,brief,links,revisions,max_revisions,due_date,delivered_at,position,created_at,files,canva";

type Stage = { key: string; tone: string };
export const STAGE_KEYS = ["brief", "making", "review", "revisions", "approved", "delivered"] as const;
const TONES: Record<string, string> = { brief: "var(--muted)", making: "var(--rose)", review: "var(--lilac)", revisions: "var(--warn)", approved: "var(--good)", delivered: "var(--good)" };

export const QUEUE: Record<Kind, {
  title: string; one: string; stages: (Stage & { label: string })[]; types: string[]; sizes: string[]; workLabel: string; empty: string;
}> = {
  design: {
    title: "Design queue", one: "design", workLabel: "Canva / Figma link",
    stages: [["brief", "Brief in"], ["making", "Designing"], ["review", "With client"], ["revisions", "Revisions"], ["approved", "Approved"], ["delivered", "Delivered"]].map(([key, label]) => ({ key, label, tone: TONES[key] })),
    types: ["Social post", "Carousel", "Story", "Reel cover", "Logo", "Flyer", "Banner", "Thumbnail", "Presentation", "Other"],
    sizes: ["1080×1080 square post", "1080×1350 portrait post", "1080×1920 story / reel cover", "1280×720 YouTube thumbnail", "1500×500 X header", "1584×396 LinkedIn banner", "820×312 Facebook cover", "A4 flyer", "Letter flyer"],
    empty: "Add a request when a client asks for a design.",
  },
  video: {
    title: "Edit queue", one: "edit", workLabel: "Project or footage folder",
    stages: [["brief", "Footage in"], ["making", "Editing"], ["review", "With client"], ["revisions", "Revisions"], ["approved", "Approved"], ["delivered", "Delivered"]].map(([key, label]) => ({ key, label, tone: TONES[key] })),
    types: ["Reel", "TikTok", "YouTube Short", "YouTube video", "Podcast clip", "Ad", "Testimonial", "Other"],
    sizes: ["9:16 vertical (1080×1920)", "16:9 wide (1920×1080)", "1:1 square (1080×1080)", "4:5 portrait (1080×1350)"],
    empty: "Add a request when new footage comes in.",
  },
};
export const stageOf = (kind: Kind, s: string) => QUEUE[kind].stages.find((x) => x.key === s) ?? QUEUE[kind].stages[0];

// Export settings per platform, for a quick check before delivering.
export const VIDEO_SPECS: [string, string, string, string][] = [
  ["Instagram Reels", "9:16 · 1080×1920", "Up to 3 min (90s still best)", "Keep text out of the bottom 20% and top 14%."],
  ["TikTok", "9:16 · 1080×1920", "Up to 10 min", "Captions and key text in the middle; avoid the right-side buttons."],
  ["YouTube Shorts", "9:16 · 1080×1920", "Up to 3 min", "Hook in the first 2 seconds."],
  ["YouTube", "16:9 · 1920×1080 (or 4K)", "Any", "Add chapters and a 1280×720 thumbnail."],
  ["Facebook feed", "4:5 · 1080×1350", "Up to 4 min recommended", "Burn in captions; most watch on mute."],
  ["LinkedIn", "1:1 or 4:5", "Up to 10 min (30–90s best)", "Upload an SRT caption file."],
];
export const DESIGN_SPECS: [string, string, string][] = [
  ["Instagram post", "1080×1350 (4:5)", "Square 1080×1080 also works; portrait gets more space."],
  ["Instagram / FB story", "1080×1920 (9:16)", "Keep text 250px away from top and bottom."],
  ["Carousel", "1080×1350 each", "Same size on every slide; up to 20 slides."],
  ["YouTube thumbnail", "1280×720", "Under 2 MB; big face, 3–5 words."],
  ["Facebook cover", "820×312 (851×315)", "Phones crop the sides; keep things centered."],
  ["LinkedIn banner", "1584×396", "The profile photo covers the bottom left."],
  ["Pinterest pin", "1000×1500 (2:3)", "Text overlay helps saves."],
];

// ---------- Data entry ----------

export type Batch = {
  id: string; client_id: string | null; title: string; source: string; target: string; link: string; total: number; done: number;
  errors: number; checked: number; minutes: number; status: "todo" | "doing" | "qa" | "delivered"; due_date: string | null; notes: string;
  delivered_at: string | null; created_at: string;
};
export const BATCH_COLS = "id,client_id,title,source,target,link,total,done,errors,checked,minutes,status,due_date,notes,delivered_at,created_at";
export const BATCH_STATUS: { key: Batch["status"]; label: string; tone: string }[] = [
  { key: "todo", label: "To do", tone: "var(--muted)" }, { key: "doing", label: "Entering", tone: "var(--rose)" },
  { key: "qa", label: "Checking", tone: "var(--lilac)" }, { key: "delivered", label: "Delivered", tone: "var(--good)" },
];
export const progress = (b: Pick<Batch, "done" | "total">) => (b.total > 0 ? Math.min(1, b.done / b.total) : 0);
// Accuracy from the records you checked: 1 − mistakes found ÷ records checked.
export const accuracy = (b: Pick<Batch, "errors" | "checked">) => (b.checked > 0 ? Math.max(0, 1 - b.errors / b.checked) : null);
export const perHour = (b: Pick<Batch, "done" | "minutes">) => (b.minutes > 0 ? (b.done / b.minutes) * 60 : null);

// The usual checks before a batch goes back to the client.
export const QA_CHECKLIST = [
  "Spot-check at least 1 in 10 records against the source",
  "Names, emails and phone numbers in one consistent format",
  "No duplicates (sort and scan, or use Remove duplicates)",
  "Required fields all filled; blanks marked the agreed way",
  "Dates in the client's format (e.g. MM/DD/YYYY)",
  "Totals and counts match the source",
  "File named and saved where the client expects it",
];

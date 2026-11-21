// Content calendar: posts, platforms and their limits.
export type Post = {
  id: string; client_id: string | null; title: string; publish_on: string | null; publish_at: string | null;
  status: Status; format: string; caption: string; hashtags: string; hook: string; pillar: string;
  platforms: string[]; post_urls: Record<string, string>; stats: Record<string, Record<string, number>>; asset_url: string; notes: string; media: string[];
  publish_error?: string; published_at?: string | null;
};
export type Status = "Idea" | "Drafting" | "For approval" | "Scheduled" | "Posted";
export const POST_COLS = "id,client_id,title,publish_on,publish_at,status,format,caption,hashtags,hook,pillar,platforms,post_urls,stats,asset_url,notes,media,publish_error,published_at";

export const PLATFORMS: { name: string; short: string; color: string; caption: number; tags: number; tagHint: string }[] = [
  { name: "Instagram", short: "IG", color: "#D6457A", caption: 2200, tags: 30, tagHint: "Up to 30. 3–5 focused ones usually work best." },
  { name: "Facebook", short: "FB", color: "#3B6FD8", caption: 63206, tags: 10, tagHint: "1–3 is plenty on Facebook." },
  { name: "TikTok", short: "TT", color: "#1F1F1F", caption: 4000, tags: 10, tagHint: "3–5 that match the video's topic." },
  { name: "YouTube", short: "YT", color: "#D93A2B", caption: 5000, tags: 15, tagHint: "Up to 15; the first 3 show above the title." },
  { name: "LinkedIn", short: "IN", color: "#2867B2", caption: 3000, tags: 5, tagHint: "3–5 professional ones." },
  { name: "Threads", short: "TH", color: "#555555", caption: 500, tags: 1, tagHint: "Threads allows one topic tag." },
  { name: "Pinterest", short: "PI", color: "#C8232C", caption: 500, tags: 20, tagHint: "Keywords matter more than hashtags." },
];
export const platform = (n: string) => PLATFORMS.find((p) => p.name === n);
// Each format has its own color, so the mix of reels, carousels and so on shows at a glance.
export const FORMAT_TONES: Record<string, string> = { Reel: "#C46A7A", Carousel: "#8E7CA0", "Single image": "#C39A78", Story: "#D9956B", Video: "#5E8F8A", Text: "#7F8FA6", Live: "#C8553D" };
export const FORMATS = Object.keys(FORMAT_TONES);
export const formatTone = (f: string) => FORMAT_TONES[f] ?? "var(--accent)";
export const isVideo = (url: string) => /\.(mp4|mov|webm)(\?|$)/i.test(url);
export const STATUSES: { name: Status; tone: string }[] = [
  { name: "Idea", tone: "var(--muted)" }, { name: "Drafting", tone: "var(--warn)" }, { name: "For approval", tone: "var(--lilac)" },
  { name: "Scheduled", tone: "var(--accent)" }, { name: "Posted", tone: "var(--good)" },
];
export const statusTone = (s: string) => STATUSES.find((x) => x.name === s)?.tone ?? "var(--muted)";
// "Failed" isn't a database status: it's any post whose last publish attempt left an error.
export const failed = (p: Pick<Post, "publish_error">) => !!p.publish_error?.trim();
export type Stage = "Draft" | "For approval" | "Scheduled" | "Posted" | "Failed";
export const stage = (p: Pick<Post, "status" | "publish_error">): Stage =>
  failed(p) && p.status !== "Posted" ? "Failed" : p.status === "Idea" || p.status === "Drafting" ? "Draft" : p.status;
// Calendar order: by day, then time (no time first), then name, so a moved post lands in its right place.
export const byDate = (a: Post, b: Post) => (a.publish_on ?? "").localeCompare(b.publish_on ?? "") || (a.publish_at ?? "").localeCompare(b.publish_at ?? "") || a.id.localeCompare(b.id);
// Platforms CafeNoct can post to for you (Instagram and Facebook Pages, through Meta).
export const AUTO_PLATFORMS = ["Instagram", "Facebook"];

// All the hashtags in the caption and hashtag box, without repeats.
export const hashtags = (p: Pick<Post, "caption" | "hashtags">) => [...new Set(`${p.caption} ${p.hashtags}`.match(/#[\p{L}\p{N}_]+/gu)?.map((t) => t.toLowerCase()) ?? [])];
// The tightest limits among the chosen platforms.
export function limits(platforms: string[]) {
  const ps = platforms.map(platform).filter(Boolean) as (typeof PLATFORMS)[number][];
  if (!ps.length) return { caption: 2200, tags: 30, by: "Instagram" };
  const cap = ps.reduce((a, b) => (b.caption < a.caption ? b : a)), tag = ps.reduce((a, b) => (b.tags < a.tags ? b : a));
  return { caption: cap.caption, tags: tag.tags, by: tag.name, capBy: cap.name };
}
// Ready to paste: hook (if the caption doesn't already open with it), caption, then hashtags.
export const fullCaption = (p: Pick<Post, "caption" | "hashtags" | "hook">) => {
  const hook = p.hook.trim(), cap = p.caption.trim();
  return [hook && !cap.startsWith(hook) ? hook : "", cap, p.hashtags.trim()].filter(Boolean).join("\n\n");
};

// Results you type in after a post goes live, per platform.
export const METRICS: { key: string; label: string }[] = [
  { key: "views", label: "Views" }, { key: "reach", label: "Reach" }, { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" }, { key: "shares", label: "Shares" }, { key: "saves", label: "Saves" },
];
export type Stats = Record<string, number>;
export const engagements = (s: Stats = {}) => (s.likes || 0) + (s.comments || 0) + (s.shares || 0) + (s.saves || 0);
// Engagement rate: engagements divided by reach (or views when reach isn't known).
export const rate = (s: Stats = {}) => { const base = s.reach || s.views || 0; return base ? engagements(s) / base : 0; };
export const hasStats = (p: Pick<Post, "stats">) => Object.values(p.stats ?? {}).some((s) => Object.values(s ?? {}).some((v) => Number(v) > 0));
// One post's numbers added up across its platforms (or for one platform).
export function totals(p: Pick<Post, "stats">, only?: string): Stats {
  const out: Stats = {};
  Object.entries(p.stats ?? {}).forEach(([pl, s]) => { if (only && pl !== only) return; Object.entries(s ?? {}).forEach(([k, v]) => { out[k] = (out[k] || 0) + (Number(v) || 0); }); });
  return out;
}
export const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(Math.round(n)));
export const pct = (r: number) => `${(r * 100).toFixed(r >= 0.1 ? 0 : 1)}%`;

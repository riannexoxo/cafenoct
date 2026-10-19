// Real social analytics: connecting Facebook Pages, Instagram and TikTok, and pulling each post's numbers
// into posts.stats (the same place the manual Analytics page reads from). Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { partsIn } from "@/lib/tz";
import type { Stats } from "@/lib/posts";

export const APP_URL = "https://cafenoct.vercel.app";
const GRAPH = "https://graph.facebook.com/v25.0";
const TT = "https://open.tiktokapis.com/v2";

export const metaReady = () => !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
export const tiktokReady = () => !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
export const redirectUri = (p: "meta" | "tiktok") => `${APP_URL}/api/social/${p}/callback`;

export type Platform = "Facebook" | "Instagram" | "TikTok";
export type Account = { id: string; user_id: string; client_id: string | null; platform: Platform; external_id: string; name: string; import: boolean };
type Token = { access_token: string; refresh_token: string; expires_at: string | null; refresh_expires_at: string | null };
// One post as the platform sees it.
type Item = { id: string; url: string; at: string; caption: string; format: string; stats: Stats };

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000) });
  const j = await res.json().catch(() => ({}));
  const err = j?.error?.message ?? (j?.error?.code && j.error.code !== "ok" ? j.error.message || j.error.code : null);
  if (!res.ok || err) throw new Error(String(err ?? `HTTP ${res.status}`));
  return j;
}

// ---------- Meta (Facebook Pages + the Instagram accounts linked to them) ----------

export function metaAuthUrl(state: string) {
  const q = new URLSearchParams({ client_id: process.env.META_APP_ID!, redirect_uri: redirectUri("meta"), state, response_type: "code" });
  // Business apps use a Facebook Login for Business configuration; otherwise ask for the permissions directly.
  if (process.env.META_CONFIG_ID) q.set("config_id", process.env.META_CONFIG_ID);
  else q.set("scope", "pages_show_list,pages_read_engagement,read_insights,instagram_basic,instagram_manage_insights,business_management");
  return `https://www.facebook.com/v25.0/dialog/oauth?${q}`;
}

// Trades the sign-in code for a 60-day token, then lists your Pages and their Instagram accounts.
// Page tokens made from a 60-day token don't expire.
export async function metaAccounts(code: string) {
  const id = process.env.META_APP_ID!, secret = process.env.META_APP_SECRET!;
  const short = await getJson(`${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: redirectUri("meta"), code })}`);
  const long = await getJson(`${GRAPH}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: short.access_token })}`);
  const out: { platform: Platform; external_id: string; name: string; avatar: string; token: string }[] = [];
  let next: string | null = `${GRAPH}/me/accounts?${new URLSearchParams({ fields: "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}", limit: "100", access_token: long.access_token })}`;
  for (let i = 0; next && i < 5; i++) {
    const page: { data?: { id: string; name: string; access_token: string; picture?: { data?: { url?: string } }; instagram_business_account?: { id: string; username?: string; profile_picture_url?: string } }[]; paging?: { next?: string } } = await getJson(next);
    for (const p of page.data ?? []) {
      out.push({ platform: "Facebook", external_id: p.id, name: p.name, avatar: p.picture?.data?.url ?? "", token: p.access_token });
      const ig = p.instagram_business_account;
      if (ig) out.push({ platform: "Instagram", external_id: ig.id, name: ig.username ? `@${ig.username}` : p.name, avatar: ig.profile_picture_url ?? "", token: p.access_token });
    }
    next = page.paging?.next ?? null;
  }
  return out;
}

const IG_FORMAT: Record<string, string> = { REELS: "Reel", CAROUSEL_ALBUM: "Carousel", IMAGE: "Single image", VIDEO: "Video", STORY: "Story" };

async function instagramItems(igId: string, token: string): Promise<Item[]> {
  const list = await getJson(`${GRAPH}/${igId}/media?${new URLSearchParams({ fields: "id,permalink,timestamp,caption,media_type,media_product_type,like_count,comments_count", limit: "40", access_token: token })}`);
  const items: Item[] = [];
  for (const m of (list.data ?? []) as { id: string; permalink: string; timestamp: string; caption?: string; media_type: string; media_product_type?: string; like_count?: number; comments_count?: number }[]) {
    const stats: Stats = { likes: m.like_count ?? 0, comments: m.comments_count ?? 0 };
    try {
      const ins = await getJson(`${GRAPH}/${m.id}/insights?${new URLSearchParams({ metric: "views,reach,saved,shares", access_token: token })}`);
      for (const x of (ins.data ?? []) as { name: string; values?: { value: number }[]; total_value?: { value: number } }[]) {
        const v = x.total_value?.value ?? x.values?.[0]?.value ?? 0;
        stats[x.name === "saved" ? "saves" : x.name] = Number(v) || 0;
      }
    } catch { /* some posts (old ones, some stories) have no insights; keep likes and comments */ }
    items.push({ id: m.id, url: m.permalink, at: m.timestamp, caption: m.caption ?? "", format: IG_FORMAT[m.media_product_type === "REELS" ? "REELS" : m.media_type] ?? "Single image", stats });
  }
  return items;
}

async function facebookItems(pageId: string, token: string): Promise<Item[]> {
  const list = await getJson(`${GRAPH}/${pageId}/posts?${new URLSearchParams({ fields: "id,permalink_url,created_time,message,status_type,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)", limit: "40", access_token: token })}`);
  const items: Item[] = [];
  for (const p of (list.data ?? []) as { id: string; permalink_url: string; created_time: string; message?: string; status_type?: string; shares?: { count: number }; reactions?: { summary?: { total_count: number } }; comments?: { summary?: { total_count: number } } }[]) {
    const stats: Stats = { likes: p.reactions?.summary?.total_count ?? 0, comments: p.comments?.summary?.total_count ?? 0, shares: p.shares?.count ?? 0 };
    try {
      const ins = await getJson(`${GRAPH}/${p.id}/insights?${new URLSearchParams({ metric: "post_media_view,post_total_media_view_unique", access_token: token })}`);
      for (const x of (ins.data ?? []) as { name: string; values?: { value: number }[] }[]) {
        const v = Number(x.values?.[0]?.value) || 0;
        if (x.name === "post_media_view") stats.views = v; else stats.reach = v;
      }
    } catch { /* views need read_insights; keep the rest */ }
    const fmt = p.status_type === "added_video" ? "Video" : p.status_type === "added_photos" ? "Single image" : "Text";
    items.push({ id: p.id, url: p.permalink_url, at: p.created_time, caption: p.message ?? "", format: fmt, stats });
  }
  return items;
}

// ---------- TikTok ----------

export function tiktokAuthUrl(state: string) {
  const q = new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY!, response_type: "code", scope: "user.info.basic,video.list", redirect_uri: redirectUri("tiktok"), state });
  return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
}

const ttToken = (body: Record<string, string>) => getJson(`${TT}/oauth/token/`, {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY!, client_secret: process.env.TIKTOK_CLIENT_SECRET!, ...body }),
});
const later = (sec: number) => new Date(Date.now() + (Number(sec) || 0) * 1000).toISOString();

export async function tiktokAccount(code: string) {
  const t = await ttToken({ code, grant_type: "authorization_code", redirect_uri: redirectUri("tiktok") });
  const u = await getJson(`${TT}/user/info/?fields=open_id,display_name,avatar_url,username`, { headers: { Authorization: `Bearer ${t.access_token}` } });
  const me = u.data?.user ?? {};
  return {
    platform: "TikTok" as Platform, external_id: String(me.open_id ?? t.open_id), name: me.username ? `@${me.username}` : me.display_name ?? "TikTok", avatar: me.avatar_url ?? "",
    token: { access_token: t.access_token, refresh_token: t.refresh_token ?? "", expires_at: later(t.expires_in), refresh_expires_at: later(t.refresh_expires_in) },
  };
}

async function tiktokItems(sb: SupabaseClient, acc: Account, tok: Token): Promise<Item[]> {
  let access = tok.access_token;
  // TikTok sign-ins last a day; the refresh token keeps them going for a year.
  if (!tok.expires_at || Date.parse(tok.expires_at) < Date.now() + 5 * 60000) {
    const t = await ttToken({ grant_type: "refresh_token", refresh_token: tok.refresh_token });
    access = t.access_token;
    await sb.from("social_tokens").update({ access_token: t.access_token, refresh_token: t.refresh_token ?? tok.refresh_token, expires_at: later(t.expires_in), refresh_expires_at: later(t.refresh_expires_in), updated_at: new Date().toISOString() }).eq("account_id", acc.id);
  }
  const items: Item[] = [];
  let cursor: number | undefined;
  for (let i = 0; i < 2; i++) {
    const j = await getJson(`${TT}/video/list/?fields=id,create_time,title,video_description,share_url,view_count,like_count,comment_count,share_count`, {
      method: "POST", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" }, body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }),
    });
    for (const v of (j.data?.videos ?? []) as { id: string; create_time: number; title?: string; video_description?: string; share_url?: string; view_count?: number; like_count?: number; comment_count?: number; share_count?: number }[]) {
      items.push({ id: v.id, url: v.share_url ?? "", at: new Date(v.create_time * 1000).toISOString(), caption: v.video_description || v.title || "", format: "Video", stats: { views: v.view_count ?? 0, likes: v.like_count ?? 0, comments: v.comment_count ?? 0, shares: v.share_count ?? 0 } });
    }
    if (!j.data?.has_more) break;
    cursor = j.data.cursor;
  }
  return items;
}

// ---------- Matching posts and saving numbers ----------

// The part of a post link that identifies it: Instagram's short code, TikTok's video number, or the cleaned link.
export function linkKey(url: string) {
  const u = (url || "").trim().toLowerCase();
  const ig = u.match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/);
  if (ig) return `ig:${ig[1]}`;
  const tt = u.match(/tiktok\.com\/.*video\/(\d+)/);
  if (tt) return `tt:${tt[1]}`;
  return u.replace(/^https?:\/\/(www\.|m\.|web\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
}

type PostRow = { id: string; client_id: string | null; post_urls: Record<string, string>; post_refs: Record<string, string>; stats: Record<string, Stats>; platforms: string[] };

// Pulls one account's recent posts and writes their numbers. Returns how many posts were updated and added.
export async function syncAccount(sb: SupabaseClient, acc: Account, tz = "Asia/Manila") {
  const { data: tok } = await sb.from("social_tokens").select("access_token,refresh_token,expires_at,refresh_expires_at").eq("account_id", acc.id).maybeSingle<Token>();
  if (!tok) throw new Error("Please connect this account again.");
  const items = acc.platform === "Instagram" ? await instagramItems(acc.external_id, tok.access_token)
    : acc.platform === "Facebook" ? await facebookItems(acc.external_id, tok.access_token)
    : await tiktokItems(sb, acc, tok);

  const { data } = await sb.from("posts").select("id,client_id,post_urls,post_refs,stats,platforms").eq("user_id", acc.user_id).gte("publish_on", new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10)).limit(3000);
  const posts = (data ?? []) as PostRow[];
  const pl = acc.platform;
  let updated = 0, added = 0;
  for (const it of items) {
    const key = linkKey(it.url);
    const match = posts.find((p) => p.post_refs?.[pl] === it.id) ?? posts.find((p) => p.post_urls?.[pl] && linkKey(p.post_urls[pl]) === key)
      ?? posts.find((p) => Object.values(p.post_urls ?? {}).some((u) => u && linkKey(u) === key));
    if (match) {
      const { error } = await sb.from("posts").update({
        stats: { ...match.stats, [pl]: { ...(match.stats?.[pl] ?? {}), ...it.stats } },
        post_refs: { ...match.post_refs, [pl]: it.id },
        post_urls: { ...match.post_urls, [pl]: match.post_urls?.[pl] || it.url },
        platforms: match.platforms?.includes(pl) ? match.platforms : [...(match.platforms ?? []), pl],
      }).eq("id", match.id);
      if (!error) updated++;
      continue;
    }
    // Posts you didn't log yet go on the content calendar as Posted, for the client this account belongs to.
    if (!acc.import || !acc.client_id || Date.parse(it.at) < Date.now() - 90 * 864e5) continue;
    const first = it.caption.split("\n").find((l) => l.trim())?.trim() ?? "";
    const { error } = await sb.from("posts").insert({
      user_id: acc.user_id, client_id: acc.client_id, title: first.slice(0, 70) || `${pl} ${it.format.toLowerCase()}`, status: "Posted",
      publish_on: partsIn(it.at, tz).date, publish_at: it.at, format: it.format, caption: it.caption.slice(0, 5000),
      platforms: [pl], post_urls: { [pl]: it.url }, post_refs: { [pl]: it.id }, stats: { [pl]: it.stats },
    });
    if (!error) added++;
  }
  await sb.from("social_accounts").update({ last_synced_at: new Date().toISOString(), last_error: "" }).eq("id", acc.id);
  return { updated, added, seen: items.length };
}

// Syncs every account of one person (or everyone's that are due), noting any errors on the account.
export async function syncMany(sb: SupabaseClient, accounts: Account[], tzOf: (uid: string) => string) {
  let updated = 0, added = 0;
  const errors: string[] = [];
  for (const acc of accounts) {
    try {
      const r = await syncAccount(sb, acc, tzOf(acc.user_id));
      updated += r.updated; added += r.added;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${acc.name}: ${msg}`);
      await sb.from("social_accounts").update({ last_error: msg.slice(0, 300), last_synced_at: new Date().toISOString() }).eq("id", acc.id);
    }
  }
  return { updated, added, errors };
}

// Saves connected accounts (new ones start without a client) and their tokens.
export async function saveAccounts(sb: SupabaseClient, userId: string, list: { platform: Platform; external_id: string; name: string; avatar: string; token: string | Token }[]) {
  let n = 0;
  for (const a of list) {
    const { data, error } = await sb.from("social_accounts")
      .upsert({ user_id: userId, platform: a.platform, external_id: a.external_id, name: a.name, avatar: a.avatar, last_error: "" }, { onConflict: "user_id,platform,external_id" })
      .select("id").single();
    if (error || !data) continue;
    const t = typeof a.token === "string" ? { access_token: a.token, refresh_token: "", expires_at: null, refresh_expires_at: null } : a.token;
    await sb.from("social_tokens").upsert({ account_id: data.id, user_id: userId, ...t, updated_at: new Date().toISOString() });
    n++;
  }
  return n;
}

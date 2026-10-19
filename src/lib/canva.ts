// Canva Connect: sign in with Canva, list your designs, open one in Canva, and save it as full-quality PNGs. Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_URL } from "@/lib/social";

const API = "https://api.canva.com/rest/v1";
export const CANVA_SCOPES = "design:meta:read design:content:read profile:read";
export const canvaReady = () => !!(process.env.CANVA_CLIENT_ID && process.env.CANVA_CLIENT_SECRET);
export const canvaRedirect = `${APP_URL}/api/canva/callback`;

const b64url = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString("base64url");

// PKCE: a random verifier kept in a cookie, and its SHA-256 hash sent to Canva.
export async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

export function canvaAuthUrl(state: string, challenge: string) {
  const q = new URLSearchParams({ code_challenge: challenge, code_challenge_method: "S256", scope: CANVA_SCOPES, response_type: "code", client_id: process.env.CANVA_CLIENT_ID!, state, redirect_uri: canvaRedirect });
  return `https://www.canva.com/api/oauth/authorize?${q}`;
}

async function call(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(20000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || j?.error_description || j?.error || `Canva said ${res.status}`);
  return j;
}

const tokenCall = (body: Record<string, string>) => call(`${API}/oauth/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString("base64")}` },
  body: new URLSearchParams(body),
});

// Trades the sign-in code for tokens and saves them with the person's Canva name.
export async function canvaConnect(admin: SupabaseClient, userId: string, code: string, verifier: string) {
  const t = await tokenCall({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: canvaRedirect });
  await saveTokens(admin, userId, t);
  const headers = { Authorization: `Bearer ${t.access_token}` };
  const [me, profile] = await Promise.all([call(`${API}/users/me`, { headers }).catch(() => ({})), call(`${API}/users/me/profile`, { headers }).catch(() => ({}))]);
  await admin.from("canva_connections").upsert({ user_id: userId, canva_user: me?.team_user?.user_id ?? "", name: profile?.profile?.display_name ?? "", connected_at: new Date().toISOString() });
}

const saveTokens = (admin: SupabaseClient, userId: string, t: { access_token: string; refresh_token: string; expires_in: number }) =>
  admin.from("canva_tokens").upsert({ user_id: userId, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000).toISOString(), updated_at: new Date().toISOString() });

// A working access token, refreshed when it's about to expire (each refresh token works once).
export async function canvaToken(admin: SupabaseClient, userId: string) {
  const { data } = await admin.from("canva_tokens").select("access_token,refresh_token,expires_at").eq("user_id", userId).maybeSingle<{ access_token: string; refresh_token: string; expires_at: string }>();
  if (!data) return null;
  if (Date.parse(data.expires_at) > Date.now() + 2 * 60000) return data.access_token;
  try {
    const t = await tokenCall({ grant_type: "refresh_token", refresh_token: data.refresh_token });
    await saveTokens(admin, userId, t);
    return t.access_token as string;
  } catch {
    return null; // sign-in was revoked or expired: ask to connect again
  }
}

export type CanvaDesign = { id: string; title: string; thumb: string; w: number; h: number; edit: string; updated: number; pages: number };
const toDesign = (d: { id: string; title?: string; thumbnail?: { url: string; width: number; height: number }; urls: { edit_url: string }; updated_at: number; page_count?: number }): CanvaDesign =>
  ({ id: d.id, title: d.title || "Untitled design", thumb: d.thumbnail?.url ?? "", w: d.thumbnail?.width ?? 0, h: d.thumbnail?.height ?? 0, edit: d.urls.edit_url, updated: d.updated_at, pages: d.page_count ?? 1 });

export async function canvaDesigns(token: string, query = "", continuation = "") {
  const q = new URLSearchParams({ sort_by: query ? "relevance" : "modified_descending", limit: "24" });
  if (query) q.set("query", query.slice(0, 255));
  if (continuation) q.set("continuation", continuation);
  const j = await call(`${API}/designs?${q}`, { headers: { Authorization: `Bearer ${token}` } });
  return { items: (j.items ?? []).map(toDesign) as CanvaDesign[], next: (j.continuation as string | undefined) ?? "" };
}

export async function canvaDesign(token: string, id: string) {
  const j = await call(`${API}/designs/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
  return toDesign(j.design);
}

// Exports every page as a lossless PNG at the design's full size, and waits for the files (up to ~45s).
export async function canvaExportPng(token: string, id: string) {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const start = await call(`${API}/exports`, { method: "POST", headers, body: JSON.stringify({ design_id: id, format: { type: "png", lossless: true } }) });
  const jobId = start.job?.id;
  for (let i = 0; i < 22 && jobId; i++) {
    const j = await call(`${API}/exports/${jobId}`, { headers });
    if (j.job?.status === "success") return (j.job.urls ?? []) as string[];
    if (j.job?.status === "failed") throw new Error(j.job.error?.message || "Canva couldn't export that design.");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Canva is still exporting. Try again in a minute.");
}

// PNG width and height straight from the file header.
export const pngSize = (b: Uint8Array) => (b.length > 24 && b[1] === 0x50 ? { w: new DataView(b.buffer, b.byteOffset).getUint32(16), h: new DataView(b.buffer, b.byteOffset).getUint32(20) } : {});

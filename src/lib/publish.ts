"use client";

import { useRows } from "@/lib/use-rows";
import { AUTO_PLATFORMS, type Post } from "@/lib/posts";
import { toast } from "@/lib/toast";

export type SocialAcc = { id: string; client_id: string | null; platform: string };

// Your connected accounts (no tokens: those never leave the server).
export function useAccounts() {
  const [rows] = useRows<SocialAcc>("social-accounts:lite", (s) => s.from("social_accounts").select("id,client_id,platform").limit(200), ["social_accounts"]);
  return rows ?? [];
}

// Whether "Publish now" can work for this post, and a plain reason when it can't.
export function publishCheck(p: Pick<Post, "status" | "platforms" | "post_urls" | "client_id" | "media">, accs: SocialAcc[]) {
  if (p.status === "Posted") return { ok: false, why: "This post is already posted." };
  const todo = (p.platforms ?? []).filter((pl) => AUTO_PLATFORMS.includes(pl) && !p.post_urls?.[pl]);
  if (!todo.length) return { ok: false, why: (p.platforms ?? []).includes("TikTok")
    ? "TikTok posting is parked until TikTok approves a Direct Post app. Post it in TikTok, then paste the link."
    : "CafeNoct can post to Instagram and Facebook for you. Post this one by hand." };
  const linked = todo.filter((pl) => accs.some((a) => a.platform === pl && a.client_id === (p.client_id ?? null)));
  if (!linked.length) return { ok: false, why: `Connect a ${todo.join(" or ")} account for this client in Analytics first.` };
  if (linked.length === 1 && linked[0] === "Instagram" && !p.media?.length) return { ok: false, why: "Instagram needs an image or video. Upload one first." };
  return { ok: true, why: `Posts to ${linked.join(" and ")} now.` };
}

// Asks the server to post it. The server checks it's yours, uses the stored token and records the result.
export async function publishNow(postId: string) {
  try {
    const res = await fetch("/api/social/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ postId }) });
    const j: { posted?: string[]; error?: string; note?: string } = await res.json().catch(() => ({}));
    const posted = j.posted ?? [];
    toast([posted.length ? `Posted on ${posted.join(" and ")}.` : "", j.error || (!posted.length ? "Could not publish. Try again." : ""), j.note ?? ""].filter(Boolean).join(" "));
    return { ok: posted.length > 0 && !j.error, error: j.error ?? "" };
  } catch {
    toast("Could not reach CafeNoct. Check your connection.");
    return { ok: false, error: "" };
  }
}

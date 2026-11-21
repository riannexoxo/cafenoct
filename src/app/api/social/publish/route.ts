import { adminClient } from "@/lib/automations-server";
import { AUTO_PLATFORMS, fullCaption, isVideo } from "@/lib/posts";
import { publishFacebook, publishInstagram, publishProblem } from "@/lib/social";
import { signedInUser } from "@/lib/social-route";
import { supabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIKTOK = "TikTok posting is parked: it needs a TikTok app that passed TikTok's audit for Direct Post. Post it in the TikTok app, then paste the link here.";
type Row = {
  id: string; user_id: string; client_id: string | null; title: string; status: string; format: string; caption: string; hashtags: string; hook: string;
  platforms: string[] | null; post_urls: Record<string, string> | null; post_refs: Record<string, string> | null; media: string[] | null;
};
type Acc = { id: string; platform: string; external_id: string; client_id: string | null };

// "Publish now": posts one of your posts to its Instagram and Facebook accounts. Tokens stay on the server.
export async function POST(request: Request) {
  const uid = await signedInUser();
  if (!uid) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const postId = typeof body?.postId === "string" ? body.postId : "";
  if (!UUID.test(postId)) return Response.json({ error: "That post wasn't found." }, { status: 400 });

  const sb = await createClient();
  const { data: p } = await sb.from("posts").select("id,user_id,client_id,title,status,format,caption,hashtags,hook,platforms,post_urls,post_refs,media")
    .eq("id", postId).eq("user_id", uid).maybeSingle<Row>();
  if (!p) return Response.json({ error: "That post wasn't found." }, { status: 404 });
  if (p.status === "Posted") return Response.json({ error: "This post is already posted." }, { status: 409 });

  const platforms = p.platforms ?? [], urls = { ...(p.post_urls ?? {}) }, refs = { ...(p.post_refs ?? {}) };
  const targets = platforms.filter((pl) => AUTO_PLATFORMS.includes(pl) && !urls[pl]);
  if (!targets.length) {
    const msg = platforms.includes("TikTok") ? TIKTOK : "CafeNoct can post to Instagram and Facebook for you. Post this one by hand, then add its link.";
    return Response.json({ error: msg }, { status: 400 });
  }

  // Only files uploaded to CafeNoct's public post-media folder, so Meta fetches exactly what you planned.
  const media = (p.media ?? []).slice(0, 10);
  if (media.some((u) => typeof u !== "string" || u.includes("..") || !u.startsWith(`${supabaseUrl}/storage/v1/object/public/post-media/${uid}/`)))
    return Response.json({ error: "Upload the images and videos in CafeNoct first, so Meta can fetch them." }, { status: 400 });
  const caption = fullCaption({ hook: p.hook ?? "", caption: p.caption ?? "", hashtags: p.hashtags ?? "" });

  const { data: accs } = await sb.from("social_accounts").select("id,platform,external_id,client_id").eq("user_id", uid).in("platform", targets).limit(50);
  const admin = adminClient();
  const problems: string[] = [], posted: string[] = [];
  for (const pl of targets as ("Instagram" | "Facebook")[]) {
    const acc = ((accs ?? []) as Acc[]).find((a) => a.platform === pl && a.client_id === p.client_id);
    if (!acc) { problems.push(`Link a ${pl} account to this client in Analytics, Connections.`); continue; }
    if (pl === "Instagram") {
      if (!media.length) { problems.push("Instagram needs at least one image or video."); continue; }
      if (media.some((u) => !isVideo(u) && !/\.jpe?g(\?|$)/i.test(u))) { problems.push("Instagram only takes JPEG images from apps. Upload a .jpg version."); continue; }
      if (caption.length > 2200) { problems.push("The caption is over Instagram's 2,200 characters."); continue; }
    }
    const { data: tok } = await admin.from("social_tokens").select("access_token").eq("account_id", acc.id).eq("user_id", uid).maybeSingle<{ access_token: string }>();
    if (!tok?.access_token) { problems.push(`Reconnect your ${pl} account in Analytics, Connections.`); continue; }
    try {
      const input = { externalId: acc.external_id, token: tok.access_token, caption, media, format: p.format };
      const r = pl === "Instagram" ? await publishInstagram(input) : await publishFacebook(input);
      urls[pl] = r.url || (pl === "Instagram" ? "https://www.instagram.com/" : `https://www.facebook.com/${r.id}`);
      refs[pl] = r.id;
      posted.push(pl);
    } catch (e) {
      problems.push(publishProblem(pl, e));
    }
  }

  const error = problems.join(" ").slice(0, 500);
  const now = new Date().toISOString();
  const allLive = platforms.every((pl) => urls[pl]);
  const { error: saveErr } = await sb.from("posts").update({
    post_urls: urls, post_refs: refs, publish_error: error,
    ...(posted.length ? { published_at: now } : {}),
    ...(allLive && !error ? { status: "Posted" } : {}),
  }).eq("id", p.id);
  if (error) {
    await sb.from("notifications").insert({
      kind: "post_failed", title: `"${(p.title || "A post").slice(0, 80)}" didn't publish`, body: error, href: "/content",
      entity: "post", entity_id: p.id, client_id: p.client_id,
    });
  }
  if (saveErr && posted.length) return Response.json({ posted, error: "It went live, but CafeNoct couldn't save the link. Refresh to check." }, { status: 500 });
  const waiting = platforms.filter((pl) => !urls[pl]);
  const note = !error && waiting.length ? `${waiting.join(", ")} still needs posting by hand.${waiting.includes("TikTok") ? ` ${TIKTOK}` : ""}` : "";
  return Response.json({ posted, error, note }, { status: error && !posted.length ? 422 : 200 });
}

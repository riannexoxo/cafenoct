import { generateText } from "ai";
import { createClient } from "@/lib/supabase/server";

// Drafts hooks, captions, calls to action, hashtag sets, post ideas or pillars for a client, in their voice.
const MODEL = process.env.AI_GATEWAY_MODEL || "anthropic/claude-sonnet-5.5";
export const maxDuration = 60;

const ASK: Record<string, string> = {
  hook: "scroll-stopping hooks (first lines or on-screen text), each under 15 words",
  caption: "ready-to-post captions with a hook first line, short paragraphs and a call to action at the end, no hashtags",
  cta: "calls to action, each one sentence",
  hashtags: "hashtag sets, each a mix of 5 to 8 relevant hashtags from broad to niche, written as '#tag #tag'",
  idea: "post ideas, each with a one-line description of the post and the best format (Reel, Carousel, Story, Single image, Live)",
  pillar: "content pillars, each with a one-sentence description of what posts in it cover",
};
type Body = { kind: string; client: string; services?: string; topic?: string; platform?: string; pillars?: string[]; voice?: string; count?: number };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const b = (await request.json()) as Body;
  const ask = ASK[b?.kind];
  if (!ask) return Response.json({ error: "Pick what to write." }, { status: 400 });
  const n = Math.min(Math.max(Number(b.count) || 6, 1), 12);

  try {
    const { text } = await generateText({
      model: MODEL,
      instructions: [
        "You are a sharp, practical social media strategist helping a virtual assistant who manages a small business's social media.",
        "Write in the brand's voice. Be specific to the business, its audience and the topic. Avoid clichés, hype and emoji spam (one emoji at most per item).",
        "Never invent facts like prices, results, dates or testimonials. Use [brackets] where a real detail is needed.",
        `Reply with only a JSON array of ${n} objects like {"title": "2-4 word label", "body": "the text"}. No markdown, no extra text.`,
      ].join("\n"),
      prompt: [
        `Write ${n} ${ask}.`,
        `Business: ${b.client}${b.services ? ` (${b.services})` : ""}`,
        b.platform ? `Platform: ${b.platform}` : "",
        b.topic ? `Topic or angle: ${b.topic}` : "",
        b.pillars?.length ? `Content pillars: ${b.pillars.slice(0, 8).join("; ")}` : "",
        b.voice ? `Brand voice notes: ${b.voice.slice(0, 2000)}` : "",
      ].filter(Boolean).join("\n"),
      maxOutputTokens: 2500,
    });
    const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
    const items = (JSON.parse(json) as { title?: string; body?: string }[]).filter((x) => x?.body).slice(0, n).map((x) => ({ title: String(x.title ?? "").slice(0, 80), body: String(x.body).slice(0, 3000) }));
    if (!items.length) throw new Error("empty");
    return Response.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    console.error("smm ai error", msg);
    const friendly = /credit|budget|payment|quota/i.test(msg) ? "AI writing is out of credits on Vercel." : /auth|unauthor|oidc|token/i.test(msg) ? "AI writing isn't connected on Vercel yet." : "AI didn't come back with ideas. Try again.";
    return Response.json({ error: friendly }, { status: 502 });
  }
}

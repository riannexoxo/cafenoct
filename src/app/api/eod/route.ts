import { generateText } from "ai";
import { createClient } from "@/lib/supabase/server";

// Writes a client-ready EOD or weekly report from the facts the page gathered.
// Runs through Vercel AI Gateway, which signs in with the deployment's own identity, so no API key is stored.
const MODEL = process.env.AI_GATEWAY_MODEL || "anthropic/claude-sonnet-5.5";

export const maxDuration = 60;

type Body = { kind: "day" | "week"; client: string; contact: string; sender: string; period: string; facts: string; draft?: string };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const b = (await request.json()) as Body;
  if (!b?.facts || b.facts.length > 40000) return Response.json({ error: "There's nothing to write from yet." }, { status: 400 });

  try {
    const { text } = await generateText({
      model: MODEL,
      instructions: [
        "You write end-of-day and weekly reports that a virtual assistant sends to a client over Slack or email.",
        "Write in first person as the assistant. Warm, professional and concise. Plain text only: no markdown headings, no bold, no tables.",
        "Use short sections with a label line followed by '- ' bullets. Group related items. Turn rough notes into clear, specific outcomes.",
        "Only report work that appears in the facts. Never invent tasks, numbers, results or hours. Keep hours exactly as given.",
        "If there are open or upcoming tasks, end with a short 'Next' section. Close with a one-line sign-off and the sender's first name.",
        b.kind === "week" ? "This is a weekly summary: lead with the week's total hours and highlights, then a short day-by-day recap." : "This is a daily EOD: lead with the date and hours worked.",
      ].join("\n"),
      prompt: `Client: ${b.client}\nAddress the report to: ${b.contact || b.client}\nSender: ${b.sender || "Your VA"}\nPeriod: ${b.period}\n\nFacts gathered from the assistant's time log and to-do list:\n${b.facts}${b.draft ? `\n\nThe assistant's current draft (keep any personal touches it has):\n${b.draft}` : ""}`,
      maxOutputTokens: 1500,
    });
    return Response.json({ text: text.trim() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const friendly = /credit|budget|payment|quota/i.test(msg) ? "AI writing is out of credits on Vercel. The plain draft still works."
      : /auth|unauthor|oidc|token/i.test(msg) ? "AI writing isn't connected on Vercel yet. The plain draft still works."
      : "AI writing didn't respond. Try again in a moment.";
    console.error("eod ai error", msg);
    return Response.json({ error: friendly }, { status: 502 });
  }
}

// The toolkit and idea bank: saved hooks, captions, calls to action, hashtag sets, pillars, brand voice, ideas and resources.
export type Kind = "hook" | "caption" | "cta" | "hashtags" | "pillar" | "voice" | "idea" | "resource";
export type BankItem = { id: string; client_id: string | null; kind: Kind; title: string; body: string; url: string; tags: string[]; status: string; starred: boolean; used: number; position: number };
export const BANK_COLS = "id,client_id,kind,title,body,url,tags,status,starred,used,position";

export const KINDS: { key: Kind; label: string; one: string; hint: string }[] = [
  { key: "pillar", label: "Content pillars", one: "Pillar", hint: "The 3–5 themes every post fits into." },
  { key: "voice", label: "Brand voice", one: "Voice note", hint: "Tone, words to use, words to avoid, who they talk to." },
  { key: "hook", label: "Hooks", one: "Hook", hint: "First lines and on-screen text that stop the scroll." },
  { key: "caption", label: "Caption templates", one: "Caption template", hint: "Reusable caption structures. Fill in the [brackets]." },
  { key: "cta", label: "Calls to action", one: "Call to action", hint: "How each post asks people to act." },
  { key: "hashtags", label: "Hashtag sets", one: "Hashtag set", hint: "Groups of hashtags you can paste in one go." },
  { key: "idea", label: "Post ideas", one: "Post idea", hint: "Ideas waiting for a date on the calendar." },
  { key: "resource", label: "Resources", one: "Resource", hint: "Tools, guides and inspiration." },
];
export const kindOf = (k: string) => KINDS.find((x) => x.key === k);

export const IDEA_STAGES = ["Spark", "Exploring", "Building", "Shipped", "Parked"] as const;

type Starter = { kind: Kind; title: string; body: string; url?: string; tags?: string[] };
// A starter library to save from. Fill in the [brackets] for each client.
export const STARTER: Starter[] = [
  // Hooks
  { kind: "hook", title: "Mistake", body: "Stop doing this if you want [result].", tags: ["education"] },
  { kind: "hook", title: "Myths", body: "3 [topic] myths you probably still believe.", tags: ["education"] },
  { kind: "hook", title: "Secret", body: "The [topic] tip nobody told me until year [number].", tags: ["story"] },
  { kind: "hook", title: "POV", body: "POV: you finally found a [service] that gets your [problem].", tags: ["relatable"] },
  { kind: "hook", title: "Before and after", body: "Same [thing], 30 days apart. Here's what changed.", tags: ["proof"] },
  { kind: "hook", title: "Save this", body: "Save this for the next time your [problem] acts up.", tags: ["education"] },
  { kind: "hook", title: "Question", body: "Is your [habit] secretly making your [problem] worse?", tags: ["curiosity"] },
  { kind: "hook", title: "Do this, not that", body: "Do this, not that: [topic] edition.", tags: ["education"] },
  { kind: "hook", title: "Behind the scenes", body: "What a day of [job] actually looks like.", tags: ["bts"] },
  { kind: "hook", title: "Client win", body: "My client came in with [problem]. Here's what we did.", tags: ["proof"] },
  { kind: "hook", title: "Unpopular opinion", body: "Unpopular opinion: you don't need [common product] for [result].", tags: ["opinion"] },
  { kind: "hook", title: "Number list", body: "5 things I'd never do as a [profession].", tags: ["authority"] },
  // Caption frameworks
  { kind: "caption", title: "Hook, value, call to action", body: "[Hook that names the problem]\n\nHere's what helps:\n1. [Tip one]\n2. [Tip two]\n3. [Tip three]\n\n[One-line takeaway]\n\n[Call to action]" },
  { kind: "caption", title: "Problem, agitate, solve", body: "[The problem in their words]\n\n[Why it keeps happening and what it costs them]\n\n[How you or the product solve it]\n\n[Call to action]" },
  { kind: "caption", title: "Mini story", body: "[Where it started: a moment or a quote]\n\n[What went wrong or what changed]\n\n[What they learned]\n\n[What it means for the reader] [Call to action]" },
  { kind: "caption", title: "Testimonial", body: "\"[Client's words]\" – [first name]\n\n[What they came in with] → [the result]\n\n[What made the difference]\n\n[Booking or shop call to action]" },
  { kind: "caption", title: "Announcement or offer", body: "[Big news in one line]\n\n[What it is, who it's for]\n[Key detail: date, price or limit]\n\n[Exactly how to get it]" },
  { kind: "caption", title: "Engagement question", body: "[A quick opinion or this-or-that question]\n\n[Your own answer in one or two lines]\n\nTell me yours below ⬇️" },
  // Calls to action
  { kind: "cta", title: "Save", body: "Save this so you have it for later." },
  { kind: "cta", title: "Share", body: "Send this to the friend who needs to hear it." },
  { kind: "cta", title: "Comment keyword", body: "Comment \"[KEYWORD]\" and I'll send you the [freebie or link]." },
  { kind: "cta", title: "Book", body: "Ready for [result]? Book through the link in bio." },
  { kind: "cta", title: "Shop", body: "Tap the link in bio to shop [product]." },
  { kind: "cta", title: "Follow", body: "Follow for more [topic] tips every week." },
  { kind: "cta", title: "DM", body: "DM us \"[word]\" for [offer]." },
  // Pillars
  { kind: "pillar", title: "Education", body: "Tips, how-tos, myths and mistakes. Builds trust and saves." },
  { kind: "pillar", title: "Proof", body: "Results, reviews, before-and-afters, client stories. Builds belief." },
  { kind: "pillar", title: "Behind the scenes", body: "The people, the process, a day in the life. Builds connection." },
  { kind: "pillar", title: "Community", body: "Questions, polls, trends, reposts of customers. Builds engagement." },
  { kind: "pillar", title: "Offer", body: "Products, services, launches and promos. Turns followers into clients." },
  // Resources
  { kind: "resource", title: "Meta Business Suite", body: "Schedule Facebook and Instagram posts and see their numbers.", url: "https://business.facebook.com/latest/home" },
  { kind: "resource", title: "TikTok Creative Center", body: "Trending sounds, hashtags and top ads on TikTok.", url: "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en" },
  { kind: "resource", title: "Meta Ad Library", body: "See the ads any brand is running on Facebook and Instagram.", url: "https://www.facebook.com/ads/library/" },
  { kind: "resource", title: "Canva", body: "Designs, carousels and short videos with brand kits.", url: "https://www.canva.com/" },
  { kind: "resource", title: "CapCut", body: "Edit reels and TikToks with captions and templates.", url: "https://www.capcut.com/" },
  { kind: "resource", title: "Google Trends", body: "Check what people are searching for right now.", url: "https://trends.google.com/" },
  { kind: "resource", title: "AnswerThePublic", body: "Questions people ask about a topic, for post ideas.", url: "https://answerthepublic.com/" },
  { kind: "resource", title: "Pinterest Trends", body: "What's rising on Pinterest by season.", url: "https://trends.pinterest.com/" },
  { kind: "resource", title: "Instagram Professional Dashboard", body: "Your Instagram insights, tips and account health.", url: "https://www.instagram.com/accounts/professional_dashboard/" },
];

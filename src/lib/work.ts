// Tasks, projects and the ready-made project templates for each role.
import { supabase } from "@/lib/use-rows";
import { addDays, today } from "@/lib/dates";
import { nextDue } from "@/lib/cal";
import type { Client } from "@/lib/types";

export type Sub = { id: string; title: string; done: boolean };
export type TLink = { id: string; url: string; label: string };
export type Task = {
  id: string; client_id: string | null; project_id: string | null; title: string; notes: string; status: string; priority: string;
  due_date: string | null; repeat: string; done_at: string | null; subtasks: Sub[]; links: TLink[]; position: number;
};
export const TASK_COLS = "id,client_id,project_id,title,notes,status,priority,due_date,repeat,done_at,subtasks,links,position";
export type Project = { id: string; client_id: string | null; name: string; status: "Active" | "On hold" | "Done"; start_date: string | null; due_date: string | null; description: string };
export const PROJECT_COLS = "id,client_id,name,status,start_date,due_date,description";

export const COLUMNS: { key: string; label: string; tone: string }[] = [
  { key: "todo", label: "To do", tone: "var(--muted)" },
  { key: "doing", label: "Doing", tone: "var(--rose)" },
  { key: "waiting", label: "Waiting on client", tone: "var(--lilac)" },
  { key: "done", label: "Done", tone: "var(--good)" },
];
export const colOf = (s: string) => (COLUMNS.some((c) => c.key === s) ? s : "todo");
export const uid = () => Math.random().toString(36).slice(2, 10);

// Moves a task. Finishing a repeating task books its next one on the client's next work day.
export async function setStatus(t: Task, status: string, client?: Client) {
  const done = status === "done";
  const patch = { status, done_at: done ? new Date().toISOString() : null };
  const { error } = await supabase().from("tasks").update(patch).eq("id", t.id);
  if (error || !done || !t.repeat || t.repeat === "none" || t.status === "done") return { error, next: null };
  const base = t.due_date && t.due_date > today() ? t.due_date : today();
  const next = nextDue(t.repeat, base, client);
  await supabase().from("tasks").insert({ title: t.title, client_id: t.client_id, project_id: t.project_id, priority: t.priority, repeat: t.repeat, notes: t.notes, due_date: next, subtasks: t.subtasks.map((s) => ({ ...s, done: false })) });
  return { error: null, next };
}

// Ready-made projects so you always know the next step. Days are counted from the project's start.
type Step = { title: string; day: number; subtasks?: string[] };
export const TEMPLATES: { key: string; role: string; name: string; blurb: string; days: number; steps: Step[] }[] = [
  {
    key: "smm-month", role: "smm", name: "Monthly content cycle", blurb: "Plan, create, schedule and report a month of posts.", days: 30,
    steps: [
      { title: "Review last month's numbers and top posts", day: 0 },
      { title: "Pick this month's themes, promos and key dates", day: 1, subtasks: ["Holidays and awareness days", "Launches or offers", "Content pillars mix"] },
      { title: "Plan the posts on the content calendar", day: 2 },
      { title: "Write hooks and captions", day: 4 },
      { title: "Create designs and edit videos", day: 6 },
      { title: "Send the batch for client approval", day: 9 },
      { title: "Make the changes and schedule everything", day: 11 },
      { title: "Engage daily: comments, DMs, stories", day: 12 },
      { title: "Mid-month check: what's working", day: 15 },
      { title: "Month-end report to the client", day: 29 },
    ],
  },
  {
    key: "web-launch", role: "web", name: "Website build and launch", blurb: "From brief to a live, tested site.", days: 28,
    steps: [
      { title: "Get the brief: goals, pages, examples they like", day: 0 },
      { title: "Collect logo, brand colors, fonts, photos and copy", day: 2 },
      { title: "Sitemap and page outline", day: 3 },
      { title: "Design the homepage", day: 6 },
      { title: "Client review of the homepage", day: 8 },
      { title: "Build the remaining pages", day: 12 },
      { title: "Set up domain, email, forms and analytics", day: 18 },
      { title: "Test on phone, tablet and computer", day: 20, subtasks: ["Links and buttons", "Forms send", "Page speed", "Spelling"] },
      { title: "SEO basics: titles, descriptions, image alt text", day: 22 },
      { title: "Launch", day: 25 },
      { title: "Send login details and a short how-to", day: 27 },
    ],
  },
  {
    key: "ea-onboard", role: "ea", name: "New client onboarding", blurb: "Get set up properly in the first week.", days: 7,
    steps: [
      { title: "Kickoff call: priorities, tools, how they like updates", day: 0 },
      { title: "Get access to email, calendar, drive and tools", day: 1 },
      { title: "Write down their recurring tasks", day: 2 },
      { title: "Set up the EOD or weekly report format", day: 2 },
      { title: "Create SOP docs for each recurring task", day: 4 },
      { title: "First-week check-in", day: 6 },
    ],
  },
  {
    key: "live-show", role: "live", name: "Live selling show", blurb: "Everything for one live show.", days: 3,
    steps: [
      { title: "Get the product list, prices and stock", day: 0 },
      { title: "Prepare saved replies and FAQs", day: 1 },
      { title: "Announce the live on socials", day: 1 },
      { title: "Moderate the live: comments, orders, claims", day: 2 },
      { title: "Send the order and claims summary", day: 2 },
      { title: "Follow up on unpaid orders", day: 3 },
    ],
  },
  {
    key: "code-build", role: "code", name: "Vibe coding build", blurb: "Take an idea from prompt to shipped.", days: 14,
    steps: [
      { title: "Write the idea in one paragraph: who it's for, what it does", day: 0 },
      { title: "List the must-have features for version one", day: 1 },
      { title: "Sketch the screens", day: 2 },
      { title: "Build the first working version", day: 5 },
      { title: "Test it yourself and fix the rough edges", day: 8 },
      { title: "Share with one person for feedback", day: 10 },
      { title: "Publish it", day: 13 },
    ],
  },
  {
    key: "design-set", role: "design", name: "Design set for a launch", blurb: "Brief, drafts, revisions and final files for a set of designs.", days: 10,
    steps: [
      { title: "Get the brief: sizes, copy, deadline, references", day: 0, subtasks: ["Where each design will be posted", "Text for every design", "Examples they like"] },
      { title: "Check the brand kit: colors, fonts, logo", day: 0 },
      { title: "First drafts", day: 2 },
      { title: "Send drafts for feedback", day: 3 },
      { title: "Revision round 1", day: 5 },
      { title: "Revision round 2 (if needed)", day: 7 },
      { title: "Export final files in every size", day: 8 },
      { title: "Deliver and file everything in the client folder", day: 9 },
    ],
  },
  {
    key: "video-month", role: "video", name: "Monthly video batch", blurb: "A month of short videos, from footage to scheduled.", days: 30,
    steps: [
      { title: "Collect footage and the list of videos for the month", day: 0 },
      { title: "Pick hooks and music for each video", day: 2 },
      { title: "Rough cuts of the first half", day: 5 },
      { title: "Captions, text and color", day: 7 },
      { title: "Send the first half for review", day: 8 },
      { title: "Revisions and exports for the first half", day: 10 },
      { title: "Rough cuts of the second half", day: 15 },
      { title: "Send the second half for review", day: 18 },
      { title: "Revisions, exports and handover", day: 21 },
    ],
  },
  {
    key: "data-project", role: "data", name: "Data entry project", blurb: "Set up, enter, check and deliver a batch of records.", days: 7,
    steps: [
      { title: "Get the instructions, sample and output format", day: 0, subtasks: ["Which columns and in what order", "Date and phone formats", "What to do with missing info"] },
      { title: "Do 20 records and send them for a quick OK", day: 1 },
      { title: "Enter the rest", day: 2 },
      { title: "QA: check 1 in 10 records and fix mistakes", day: 5 },
      { title: "Remove duplicates and check the totals", day: 5 },
      { title: "Deliver and note the counts in the EOD", day: 6 },
    ],
  },
];

// Creates a project from a template, with each step as a task due on its day.
export async function createFromTemplate(key: string, clientId: string | null, start = today(), name?: string) {
  const t = TEMPLATES.find((x) => x.key === key);
  if (!t) return { error: "Unknown template" };
  const { data, error } = await supabase().from("projects").insert({ client_id: clientId, name: name || t.name, status: "Active", start_date: start, due_date: addDays(start, t.days), description: t.blurb }).select("id").single();
  if (error || !data) return { error: error?.message ?? "Could not create the project" };
  const rows = t.steps.map((s, i) => ({ client_id: clientId, project_id: data.id, title: s.title, due_date: addDays(start, s.day), status: "todo", position: i, subtasks: (s.subtasks ?? []).map((x) => ({ id: uid(), title: x, done: false })) }));
  const res = await supabase().from("tasks").insert(rows);
  return { error: res.error?.message ?? null, id: data.id };
}

// The task to do next: what you're already doing, then overdue or due today, then by priority and date.
const PRI: Record<string, number> = { high: 0, med: 1, low: 2 };
export function nextUp<T extends Pick<Task, "id" | "status" | "due_date" | "priority">>(tasks: T[], skip?: string, on = today()) {
  const urgent = (x: T) => (x.status === "doing" ? 0 : x.due_date && x.due_date <= on ? 1 : 2);
  return tasks
    .filter((x) => x.id !== skip && x.status !== "done" && x.status !== "waiting")
    .sort((a, b) => urgent(a) - urgent(b) || (PRI[a.priority] ?? 1) - (PRI[b.priority] ?? 1) || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))[0];
}

// Whether "What's next" is on in Automations (on unless you turned it off). Read once per visit.
let nextUpOn: Promise<boolean> | null = null;
export function wantsNextUp() {
  nextUpOn ??= (async () => {
    const { data } = await supabase().from("profiles").select("settings").maybeSingle<{ settings: { automations?: { nextUp?: { on?: boolean } } } | null }>();
    return data?.settings?.automations?.nextUp?.on !== false;
  })().catch(() => true);
  return nextUpOn;
}

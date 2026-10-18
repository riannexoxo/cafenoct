// What you do for a client. Each role switches on the tools that role uses, so a portal only shows what you need.
import type { IconName } from "@/components/icon";
import type { Client } from "@/lib/types";

export type Role = "smm" | "web" | "ea" | "design" | "video" | "live" | "code";
export const ROLES: { key: Role; label: string; hint: string }[] = [
  { key: "smm", label: "Social media manager", hint: "Content calendar, captions, hashtags, posting" },
  { key: "ea", label: "Virtual assistant", hint: "Inbox, admin, scheduling, EOD reports" },
  { key: "web", label: "Website builder", hint: "Pages, launch checklists, site notes" },
  { key: "design", label: "Graphic designer", hint: "Designs and brand assets on the content calendar" },
  { key: "video", label: "Video editor", hint: "Reels and videos on the content calendar" },
  { key: "live", label: "Live selling moderator", hint: "Live shows on the calendar" },
  { key: "code", label: "Vibe coding", hint: "Idea bank and builds" },
];
export const roleLabel = (r: string) => ROLES.find((x) => x.key === r)?.label ?? r;
export const hasRole = (c: Pick<Client, "roles">, ...r: Role[]) => r.some((x) => c.roles?.includes(x));

// The portal menu for a client, based on their roles. Every portal keeps the basics.
export function portalTabs(c: Pick<Client, "roles" | "personal">): [string, string, IconName][] {
  const tabs: [string, string, IconName][] = [["", "Overview", "today"]];
  if (hasRole(c, "smm", "design", "video")) tabs.push(["/content", "Content calendar", "content"]);
  tabs.push(["/calendar", "Calendar", "schedule"], ["/work", "Work", "tasks"], ["/projects", "Projects", "projects"], ["/docs", "Docs", "docs"]);
  if (!c.personal) tabs.push(["/reports", "EOD reports", "chat"], ["/invoices", "Invoices", "money"]);
  return tabs;
}

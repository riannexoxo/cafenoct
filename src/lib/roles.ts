// What you do for a client. Each role switches on the tools that role uses, so a portal only shows what you need.
import type { IconName } from "@/components/icon";
import type { Client } from "@/lib/types";

export type Role = "smm" | "web" | "ea" | "design" | "video" | "data" | "live" | "code";
export const ROLES: { key: Role; label: string; hint: string }[] = [
  { key: "smm", label: "Social media manager", hint: "Content calendar, captions, hashtags, posting" },
  { key: "ea", label: "Virtual assistant", hint: "Inbox, admin, scheduling, EOD reports" },
  { key: "web", label: "Website builder", hint: "Pages, launch checklists, site notes" },
  { key: "design", label: "Graphic designer", hint: "Design queue, revision rounds, brand kit" },
  { key: "video", label: "Video editor", hint: "Edit queue, revision rounds, export sizes" },
  { key: "data", label: "Data entry", hint: "Batches, accuracy, speed and QA checks" },
  { key: "live", label: "Live selling moderator", hint: "Live shows on the calendar" },
  { key: "code", label: "Vibe coding", hint: "Idea bank and builds" },
];
export const roleLabel = (r: string) => ROLES.find((x) => x.key === r)?.label ?? r;
export const hasRole = (c: Pick<Client, "roles">, ...r: Role[]) => r.some((x) => c.roles?.includes(x));

// The portal menu for a client, based on their roles. Every portal keeps the basics.
export function portalTabs(c: Pick<Client, "roles" | "personal">): [string, string, IconName][] {
  const tabs: [string, string, IconName][] = [["", "Overview", "today"]];
  if (hasRole(c, "smm", "design", "video")) tabs.push(["/content", "Content calendar", "content"]);
  if (hasRole(c, "smm")) tabs.push(["/toolkit", "Toolkit", "spark"], ["/analytics", "Analytics", "time"]);
  if (hasRole(c, "design")) tabs.push(["/designs", "Design queue", "content"]);
  if (hasRole(c, "video")) tabs.push(["/edits", "Edit queue", "play"]);
  if (hasRole(c, "design", "video")) tabs.push(["/brand", "Brand kit", "spark"]);
  if (hasRole(c, "data")) tabs.push(["/batches", "Batches", "tasks"]);
  if (hasRole(c, "code") || c.personal) tabs.push(["/ideas", "Idea bank", "auto"]);
  tabs.push(["/calendar", "Calendar", "schedule"], ["/work", "Work", "tasks"], ["/projects", "Projects", "projects"], ["/docs", "Docs", "docs"]);
  if (!c.personal) tabs.push(["/reports", "EOD reports", "chat"], ["/invoices", "Invoices", "money"]);
  return tabs;
}

// Workspace pages that only show when at least one active client has the role.
export const ROLE_PAGES: [Role, string, string, IconName][] = [
  ["design", "/designs", "Design queue", "content"],
  ["video", "/edits", "Edit queue", "play"],
  ["data", "/batches", "Batches", "tasks"],
];
export const rolePages = (clients: Pick<Client, "roles" | "status">[]) =>
  ROLE_PAGES.filter(([r]) => clients.some((c) => c.status === "Active" && c.roles?.includes(r))).map(([, href, label, icon]) => [href, label, icon] as [string, string, IconName]);

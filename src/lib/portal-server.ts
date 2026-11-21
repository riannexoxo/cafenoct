// Server only: short-lived links to private work files a client is allowed to see.
// Two guards: callers pass only paths that came back from portal_data or share_view (which checked access), and
// every path must sit in the item owner's own storage folder ("<owner id>/..."). A deliverable's file list is
// written by its owner, so without the folder check someone could list another account's file and get it signed.
import { adminClient } from "@/lib/automations-server";

export async function signFiles(paths: unknown[], ownerId: string | null | undefined): Promise<Record<string, string>> {
  if (!ownerId) return {};
  const list = [...new Set(paths.filter((p): p is string => typeof p === "string" && p.startsWith(`${ownerId}/`) && !p.includes("..") && p.length < 400))].slice(0, 200);
  if (!list.length) return {};
  try {
    const { data } = await adminClient().storage.from("work-files").createSignedUrls(list, 3600);
    return Object.fromEntries((data ?? []).filter((d) => d.path && d.signedUrl).map((d) => [d.path as string, d.signedUrl as string]));
  } catch {
    return {}; // previews are a nicety; the page still works without them
  }
}

// Whose portal this is, for a signed-in client account that portal_data already let in.
export async function portalOwner(clientId: string, memberId: string | undefined) {
  if (!memberId) return null;
  const { data } = await adminClient().from("portal_access").select("user_id").eq("client_id", clientId).eq("member_id", memberId).eq("status", "active").limit(1).maybeSingle<{ user_id: string }>();
  return data?.user_id ?? null;
}

// Whose approval link this is (share_view already checked it's valid and unexpired).
export async function linkOwner(token: string) {
  const { data } = await adminClient().from("share_links").select("user_id").eq("token", token).maybeSingle<{ user_id: string }>();
  return data?.user_id ?? null;
}

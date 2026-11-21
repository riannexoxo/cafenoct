import { randomInt } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/automations-server";
import { UUID } from "@/lib/portal";

// Inviting a client to their portal. You copy the sign-up link and send it yourself (no email is sent from here).
// Your own signed-in client does every portal_access read and write (RLS: only your clients);
// the admin client is used only for the invites table, which has no user policies.
const bad = (error: string, status = 400) => Response.json({ error }, { status });
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const MAX_OPEN = 10;

async function signedIn() {
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  return { sb, uid: (data?.claims?.sub as string | undefined) ?? null };
}

export async function POST(request: Request) {
  const b = await request.json().catch(() => ({}));
  const clientId = String(b.clientId ?? ""), email = String(b.email ?? "").trim().toLowerCase();
  if (!UUID.test(clientId)) return bad("Pick a client.");
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Enter a valid email.");
  const { sb, uid } = await signedIn();
  if (!uid) return bad("Please sign in again.", 401);

  const { data: c } = await sb.from("clients").select("id,name,company").eq("id", clientId).maybeSingle<{ id: string; name: string; company: string }>();
  if (!c) return bad("That client wasn't found.", 404);

  const { data: rows } = await sb.from("portal_access").select("id,email,status,invite_code").eq("client_id", clientId).neq("status", "revoked").limit(50);
  const mine = (rows ?? []) as { email: string; status: string; invite_code: string | null }[];
  const same = mine.find((r) => r.email === email);
  if (same?.status === "active") return bad("That person already has access.");
  const origin = new URL(request.url).origin;
  if (same?.invite_code) return Response.json({ link: `${origin}/login?invite=${same.invite_code}` });
  if (mine.filter((r) => r.status === "invited").length >= MAX_OPEN) return bad("This client already has 10 open invites. Revoke one first.");
  // Each invite code can create an account, so open invites are also capped across all your clients.
  const { count: open } = await sb.from("portal_access").select("id", { count: "exact", head: true }).eq("status", "invited");
  if ((open ?? 0) >= 25) return bad("You have 25 open portal invites. Revoke some unused ones first.");

  const code = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const admin = adminClient();
  const { error: e1 } = await admin.from("invites").insert({ code, note: `Portal: ${c.company || c.name}`.slice(0, 200) });
  if (e1) return bad("Couldn't make the invite. Try again.", 500);
  const { error: e2 } = await sb.from("portal_access").insert({ user_id: uid, client_id: clientId, email, invite_code: code, status: "invited" });
  if (e2) {
    await admin.from("invites").delete().eq("code", code).is("used_by", null);
    return bad("Couldn't make the invite. Try again.", 500);
  }
  return Response.json({ link: `${origin}/login?invite=${code}` });
}

// Revoking: access ends at once. An unused invite code is deleted and unlinked, so it can't be used to sign up later.
export async function DELETE(request: Request) {
  const b = await request.json().catch(() => ({}));
  const id = String(b.id ?? "");
  if (!UUID.test(id)) return bad("Bad request.");
  const { sb, uid } = await signedIn();
  if (!uid) return bad("Please sign in again.", 401);
  const { data: row } = await sb.from("portal_access").select("id,invite_code,member_id").eq("id", id).maybeSingle<{ id: string; invite_code: string | null; member_id: string | null }>();
  if (!row) return bad("Not found.", 404);
  const { error } = await sb.from("portal_access").update({ status: "revoked", ...(row.member_id ? {} : { invite_code: null }) }).eq("id", id);
  if (error) return bad("Couldn't revoke. Try again.", 500);
  if (!row.member_id && row.invite_code) await adminClient().from("invites").delete().eq("code", row.invite_code).is("used_by", null);
  return Response.json({ ok: true });
}

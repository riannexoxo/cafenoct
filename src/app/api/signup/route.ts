import { adminClient } from "@/lib/automations-server";
import { verifyTurnstile } from "@/lib/turnstile-server";
import { newPasswordProblem } from "@/lib/auth-ui";

// Creating an account with an invite code. The account is ready right away, no confirmation email to wait for.
// The database checks the code again and marks it used, so a code can never make two accounts.
// A client-portal invite uses the same codes: the new account is linked to that client's portal.
const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const b = await request.json().catch(() => ({}));
  const invite = String(b.invite ?? "").trim().toUpperCase().slice(0, 40), name = String(b.name ?? "").trim().slice(0, 80);
  const email = String(b.email ?? "").trim().toLowerCase().slice(0, 254), password = String(b.password ?? "");
  if (!invite) return bad("Enter your invite code.");
  if (!name) return bad("Enter your name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Enter a valid email.");
  const pw = newPasswordProblem(password, email);
  if (pw) return bad(pw);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  if (!(await verifyTurnstile(b.captcha, ip))) return bad("Please finish the quick check, then try again.");

  const sb = adminClient();
  const { data: inv } = await sb.from("invites").select("code,used_by").eq("code", invite).maybeSingle();
  // One message for unknown and used codes, so codes can't be probed one by one.
  if (!inv || inv.used_by) return bad("That invite code isn't valid or was already used. Ask for a new one.");

  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { invite, name } });
  if (error || !data.user) {
    const msg = error?.message ?? "";
    if (/already|registered|exists/i.test(msg)) return bad("There's already an account with that email. Sign in instead.");
    if (/password/i.test(msg)) return bad("That password is too easy to guess. Try a longer one, like a short sentence.");
    return bad("Couldn't create the account. Try again.");
  }
  await sb.from("profiles").upsert({ user_id: data.user.id, name, invoice_email: email }, { onConflict: "user_id" });
  // Client-portal invite: link the new account to the portal it was sent for.
  await sb.from("portal_access").update({ member_id: data.user.id, status: "active" }).eq("invite_code", invite).is("member_id", null);
  return Response.json({ ok: true });
}

import { adminClient } from "@/lib/automations-server";

// Creating an account with an invite code. The account is ready right away, no confirmation email to wait for.
// The database checks the code again and marks it used, so a code can never make two accounts.
export async function POST(request: Request) {
  const b = await request.json().catch(() => ({}));
  const invite = String(b.invite ?? "").trim().toUpperCase(), name = String(b.name ?? "").trim().slice(0, 80);
  const email = String(b.email ?? "").trim().toLowerCase(), password = String(b.password ?? "");
  if (!invite) return Response.json({ error: "Enter your invite code." }, { status: 400 });
  if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Enter a valid email." }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "Use a password of at least 8 characters." }, { status: 400 });

  const sb = adminClient();
  const { data: inv } = await sb.from("invites").select("code,used_by").eq("code", invite).maybeSingle();
  if (!inv) return Response.json({ error: "That invite code doesn't exist. Check it with the person who sent it." }, { status: 400 });
  if (inv.used_by) return Response.json({ error: "That invite code was already used. Ask for a new one." }, { status: 400 });

  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { invite, name } });
  if (error || !data.user) {
    const msg = error?.message ?? "";
    return Response.json({ error: /already|registered|exists/i.test(msg) ? "There's already an account with that email. Sign in instead." : "Couldn't create the account. Try again." }, { status: 400 });
  }
  await sb.from("profiles").upsert({ user_id: data.user.id, name, invoice_email: email }, { onConflict: "user_id" });
  return Response.json({ ok: true });
}

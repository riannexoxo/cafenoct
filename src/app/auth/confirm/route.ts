import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth-ui";

// Where email links land (password reset, and any future email links).
// Works with both link styles: ?token_hash=…&type=… (works in any browser) and ?code=… (same browser only).
const TYPES: EmailOtpType[] = ["recovery", "email", "signup", "invite", "magiclink", "email_change"];

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const next = safeNext(q.get("next"), "/");
  const tokenHash = q.get("token_hash"), type = q.get("type") as EmailOtpType | null, code = q.get("code");
  const supabase = await createClient();
  let ok = false;
  if (tokenHash && type && TYPES.includes(type) && tokenHash.length < 512) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  } else if (code && code.length < 512) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }
  const url = request.nextUrl.clone();
  url.search = "";
  if (ok) { url.pathname = next.split("?")[0]; return NextResponse.redirect(url); }
  url.pathname = "/login";
  url.searchParams.set("notice", "link");
  return NextResponse.redirect(url);
}

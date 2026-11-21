import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Older email links land here. It finishes signing you in, then opens your homepage.
// A bad or used link goes back to sign in with a friendly note instead of failing silently.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const ok = !!code && code.length < 512 && !(await (await createClient()).auth.exchangeCodeForSession(code)).error;
  return NextResponse.redirect(new URL(ok ? "/" : "/login?notice=link", request.url));
}

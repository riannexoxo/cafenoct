// Shared bits for the connect and callback routes.
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/social";

const COOKIE = "cafenoct_social_state";

export async function signedInUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims?.sub as string | undefined) ?? null;
}

// A one-time code that proves the sign-in came back to the same browser that started it.
export async function newState() {
  const state = crypto.randomUUID();
  (await cookies()).set(COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/social", maxAge: 600 });
  return state;
}

export async function checkState(got: string | null) {
  const jar = await cookies();
  const want = jar.get(COOKIE)?.value;
  jar.delete({ name: COOKIE, path: "/api/social" });
  return !!want && want === got;
}

export const back = (msg: Record<string, string>) => Response.redirect(`${APP_URL}/analytics?${new URLSearchParams(msg)}#connections`, 303);

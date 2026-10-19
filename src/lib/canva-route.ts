// Shared bits for the Canva routes.
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/automations-server";
import { canvaToken } from "@/lib/canva";

export async function me() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, uid: (data?.claims?.sub as string | undefined) ?? null };
}

// The signed-in person's Canva token, or an error response to send back.
export async function withCanva() {
  const { supabase, uid } = await me();
  if (!uid) return { error: Response.json({ error: "Please sign in again." }, { status: 401 }) };
  const admin = adminClient();
  const token = await canvaToken(admin, uid);
  if (!token) return { error: Response.json({ error: "Connect Canva again.", reconnect: true }, { status: 401 }) };
  return { supabase, uid, token, admin };
}

const OPTS = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/api/canva", maxAge: 600 };
export async function remember(v: Record<string, string>) { const jar = await cookies(); Object.entries(v).forEach(([k, x]) => jar.set(`canva_${k}`, x, OPTS)); }
export async function recall(keys: string[]) {
  const jar = await cookies();
  const out = Object.fromEntries(keys.map((k) => [k, jar.get(`canva_${k}`)?.value ?? ""]));
  keys.forEach((k) => jar.delete({ name: `canva_${k}`, path: "/api/canva" }));
  return out;
}
// Only paths inside CafeNoct, never another site.
export const safeBack = (p: string | null) => (p && /^\/[\w\-/]*$/.test(p) ? p : "/designs");

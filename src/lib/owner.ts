// The app owner (Rianne): the only person who can see sign-ups, invites and feedback. Server only.
import { cache } from "react";
import { adminClient } from "@/lib/automations-server";
import { createClient } from "@/lib/supabase/server";

export const ownerId = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub as string | undefined;
  if (!uid) return null;
  try {
    const { data: row } = await adminClient().from("app_owners").select("user_id").eq("user_id", uid).maybeSingle();
    return row ? uid : null;
  } catch { return null; }
});

// Easy to read aloud and type: no 0/O or 1/I.
export function newCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => A[b % A.length]).join("");
  return `CAFE-${pick(4)}-${pick(4)}`;
}

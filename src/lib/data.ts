import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Client, Profile } from "@/lib/types";

// Shared per page load: the sidebar and the page ask once, Supabase is called once.
export const getClients = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").order("company").returns<Client[]>();
  return data ?? [];
});

export const getProfile = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("user_id,name,currency,weekly_goal").maybeSingle<Profile>();
  return data;
});

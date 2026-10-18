import { createBrowserClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "./env";

// For components that run in the browser (timers, drag and drop, live updates).
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseKey);
}

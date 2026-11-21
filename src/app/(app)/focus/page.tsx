import { createClient } from "@/lib/supabase/server";
import { getClients } from "@/lib/data";
import FocusView from "@/components/focus-view";

export const metadata = { title: "Focus" };

export default async function Focus() {
  const supabase = await createClient();
  const [clients, { data }] = await Promise.all([getClients(), supabase.from("profiles").select("settings").maybeSingle<{ settings: { focus?: Record<string, number> } }>()]);
  return (
    <>
      <div className="head">
        <div>
          <h1>Focus</h1>
          <p>Pick one task, press start and stay with it. Each finished session is logged to the client.</p>
        </div>
      </div>
      <FocusView clients={clients} saved={data?.settings?.focus ?? {}} />
    </>
  );
}

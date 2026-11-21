import { createClient } from "@/lib/supabase/server";
import { getClients } from "@/lib/data";
import Automations from "@/components/automations";
import Rules from "@/components/rules";

export const metadata = { title: "Automations" };

export default async function AutomationsPage() {
  const supabase = await createClient();
  const [clients, { data }] = await Promise.all([getClients(), supabase.from("profiles").select("settings,gcal_url").maybeSingle<{ settings: { automations?: unknown } | null; gcal_url: string | null }>()]);
  return (
    <>
      <div className="head">
        <div>
          <h1>Automations</h1>
          <p>Gentle nudges for EODs, today&apos;s tasks, invoices and meetings. CafeNoct checks every 5 minutes, even when it&apos;s closed.</p>
        </div>
      </div>
      <Rules />
      <Automations
        clients={clients.filter((c) => c.status === "Active" && !c.personal && c.hours_per_day && c.work_days.length)}
        saved={data?.settings?.automations ?? null}
        google={!!data?.gcal_url}
        vapid={process.env.VAPID_PUBLIC_KEY ?? ""}
      />
    </>
  );
}

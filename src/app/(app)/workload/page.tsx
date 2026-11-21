import { getClients, getProfile } from "@/lib/data";
import Workload from "@/components/workload";

export const metadata = { title: "Workload" };

export default async function WorkloadPage() {
  const [clients, profile] = await Promise.all([getClients(), getProfile()]);
  return (
    <>
      <div className="head"><div><h1>Workload</h1><p>Your week at a glance: what&apos;s planned for each client and what you&apos;ve logged.</p></div></div>
      <Workload clients={clients.filter((c) => c.status === "Active")} goal={profile?.weekly_goal ?? 0} />
    </>
  );
}

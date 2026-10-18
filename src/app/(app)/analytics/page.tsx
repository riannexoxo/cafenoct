import { getClients } from "@/lib/data";
import Analytics from "@/components/analytics";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const clients = await getClients();
  return (
    <>
      <div className="head"><div><div className="eyebrow">Social media</div><h1>Analytics</h1><p>How every client&apos;s posts are doing, by platform, format and pillar.</p></div></div>
      <Analytics clients={clients} />
    </>
  );
}

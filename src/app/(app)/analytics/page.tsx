import { getClients } from "@/lib/data";
import { metaReady, tiktokReady } from "@/lib/social";
import Analytics from "@/components/analytics";
import SocialConnect from "@/components/social-connect";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const clients = await getClients();
  return (
    <>
      <div className="head"><div><h1>Analytics</h1><p>How every client&apos;s posts are doing, by platform, format and pillar.</p></div></div>
      <Analytics clients={clients} />
      <div style={{ marginTop: 16 }}><SocialConnect clients={clients.filter((c) => c.status !== "Past")} meta={metaReady()} tiktok={tiktokReady()} /></div>
    </>
  );
}

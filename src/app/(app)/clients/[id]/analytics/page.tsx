import { notFound } from "next/navigation";
import { getClients } from "@/lib/data";
import PortalHead from "@/components/portal-head";
import Analytics from "@/components/analytics";

export const metadata = { title: "Analytics" };

export default async function ClientAnalytics({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clients = await getClients();
  const c = clients.find((x) => x.id === id);
  if (!c) notFound();
  return (
    <>
      <PortalHead c={c} section="Analytics" blurb="Views, engagement and what's working, from the numbers on posted posts." />
      <Analytics clients={clients} clientId={c.id} />
    </>
  );
}

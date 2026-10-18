import { notFound } from "next/navigation";
import { getClients } from "@/lib/data";
import PortalHead from "@/components/portal-head";
import Docs from "@/components/docs";

export const metadata = { title: "Docs" };

export default async function ClientDocs({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clients = await getClients();
  const c = clients.find((x) => x.id === id);
  if (!c) notFound();
  return (
    <>
      <PortalHead c={c} section="Docs" blurb="SOPs, brand kit, meeting notes and briefs for this client." />
      <Docs clients={clients} clientId={c.id} />
    </>
  );
}

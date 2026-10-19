import { notFound } from "next/navigation";
import { getClients } from "@/lib/data";
import PortalHead from "@/components/portal-head";
import Deliverables from "@/components/deliverables";

export const metadata = { title: "Edit queue" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clients = await getClients();
  const c = clients.find((x) => x.id === id);
  if (!c) notFound();
  return (
    <>
      <PortalHead c={c} section="Edit queue" blurb="Their videos from footage to delivered. Drag a card to move it along." />
      <Deliverables kind="video" clients={clients} clientId={c.id} />
    </>
  );
}

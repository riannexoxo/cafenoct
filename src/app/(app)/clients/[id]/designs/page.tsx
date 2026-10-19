import { notFound } from "next/navigation";
import { getClients } from "@/lib/data";
import PortalHead from "@/components/portal-head";
import Deliverables from "@/components/deliverables";
import { canvaReady } from "@/lib/canva";

export const metadata = { title: "Design queue" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clients = await getClients();
  const c = clients.find((x) => x.id === id);
  if (!c) notFound();
  return (
    <>
      <PortalHead c={c} section="Design queue" blurb="Their design requests from brief to delivered. Drag a card to move it along." />
      <Deliverables kind="design" clients={clients} clientId={c.id} canva={canvaReady()} />
    </>
  );
}

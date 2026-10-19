import { notFound } from "next/navigation";
import { getClients } from "@/lib/data";
import PortalHead from "@/components/portal-head";
import Batches from "@/components/batches";

export const metadata = { title: "Batches" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clients = await getClients();
  const c = clients.find((x) => x.id === id);
  if (!c) notFound();
  return (
    <>
      <PortalHead c={c} section="Data entry" blurb="Their batches of records, with progress, accuracy and speed." />
      <Batches clients={clients} clientId={c.id} />
    </>
  );
}

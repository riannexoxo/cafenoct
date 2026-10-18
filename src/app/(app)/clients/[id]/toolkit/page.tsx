import { notFound } from "next/navigation";
import { getClients } from "@/lib/data";
import PortalHead from "@/components/portal-head";
import Toolkit from "@/components/toolkit";

export const metadata = { title: "Toolkit" };

export default async function ClientToolkit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clients = await getClients();
  const c = clients.find((x) => x.id === id);
  if (!c) notFound();
  return (
    <>
      <PortalHead c={c} section="Social media toolkit" blurb="Pillars, brand voice, hooks, captions, calls to action, hashtag sets, post ideas and resources, ready to copy." />
      <Toolkit client={c} clients={clients} />
    </>
  );
}

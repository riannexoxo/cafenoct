import { notFound } from "next/navigation";
import { getClients } from "@/lib/data";
import PortalHead from "@/components/portal-head";
import IdeaBoard from "@/components/idea-board";

export const metadata = { title: "Idea bank" };

export default async function ClientIdeas({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clients = await getClients();
  const c = clients.find((x) => x.id === id);
  if (!c) notFound();
  return (
    <>
      <PortalHead c={c} section="Idea bank" blurb="Catch every idea, then move it along from a spark to shipped." />
      <IdeaBoard client={c} />
    </>
  );
}

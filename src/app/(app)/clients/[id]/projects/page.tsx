import { notFound } from "next/navigation";
import { getClients } from "@/lib/data";
import PortalHead from "@/components/portal-head";
import Projects from "@/components/projects";

export const metadata = { title: "Projects" };

export default async function ClientProjects({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clients = await getClients();
  const c = clients.find((x) => x.id === id);
  if (!c) notFound();
  return (
    <>
      <PortalHead c={c} section="Projects" blurb="Projects for this client, each with its steps on the Work board." />
      <Projects clients={clients} clientId={c.id} />
    </>
  );
}

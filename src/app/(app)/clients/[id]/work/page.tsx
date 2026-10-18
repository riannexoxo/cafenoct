import { notFound } from "next/navigation";
import { getClients } from "@/lib/data";
import PortalHead from "@/components/portal-head";
import WorkBoard from "@/components/work-board";

export const metadata = { title: "Work" };

export default async function ClientWorkBoard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ project?: string }> }) {
  const [{ id }, { project }] = await Promise.all([params, searchParams]);
  const clients = await getClients();
  const c = clients.find((x) => x.id === id);
  if (!c) notFound();
  return (
    <>
      <PortalHead c={c} section="Work" blurb="Tasks for this client, from to do to done." />
      <WorkBoard clients={clients} clientId={c.id} projectId={project} />
    </>
  );
}

import { getClients } from "@/lib/data";
import WorkBoard from "@/components/work-board";

export const metadata = { title: "Work" };

export default async function Work({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const [{ project }, clients] = await Promise.all([searchParams, getClients()]);
  return (
    <>
      <div className="head"><div><div className="eyebrow">Workspace</div><h1>Work</h1><p>Every task for every client in one place. Drag cards between columns as they move along.</p></div></div>
      <WorkBoard clients={clients} projectId={project} />
    </>
  );
}

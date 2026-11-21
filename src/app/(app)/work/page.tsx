import { getClients } from "@/lib/data";
import WorkBoard from "@/components/work-board";

export const metadata = { title: "Work" };

type Search = { project?: string; task?: string; q?: string; new?: string };
const one = (v: string | undefined, max: number) => (typeof v === "string" && v.length <= max ? v : undefined);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Work({ searchParams }: { searchParams: Promise<Search> }) {
  const [sp, clients] = await Promise.all([searchParams, getClients()]);
  const project = one(sp.project, 36), task = one(sp.task, 36);
  return (
    <>
      <div className="head"><div><div className="eyebrow">Workspace</div><h1>Work</h1><p>Every task for every client in one place. See it as a board, a table, a calendar or a timeline.</p></div></div>
      <WorkBoard clients={clients} projectId={project && UUID.test(project) ? project : undefined} taskId={task && UUID.test(task) ? task : undefined} q={one(sp.q, 200)} openNew={sp.new === "1"} />
    </>
  );
}

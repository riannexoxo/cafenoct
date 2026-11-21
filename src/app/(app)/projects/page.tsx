import { getClients } from "@/lib/data";
import Projects from "@/components/projects";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const clients = await getClients();
  return (
    <>
      <div className="head"><div><h1>Projects</h1><p>Start from a template for the role and every step lands on your Work board with a due date.</p></div></div>
      <Projects clients={clients} />
    </>
  );
}

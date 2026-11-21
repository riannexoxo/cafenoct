import { getClients } from "@/lib/data";
import Deliverables from "@/components/deliverables";
import { canvaReady } from "@/lib/canva";

export const metadata = { title: "Design queue" };

export default async function Page() {
  const clients = await getClients();
  return (
    <>
      <div className="head"><div><h1>Design queue</h1><p>Every design request across clients, from brief to delivered, with revision rounds counted.</p></div></div>
      <Deliverables kind="design" clients={clients} canva={canvaReady()} />
    </>
  );
}

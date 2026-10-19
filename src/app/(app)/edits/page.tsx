import { getClients } from "@/lib/data";
import Deliverables from "@/components/deliverables";

export const metadata = { title: "Edit queue" };

export default async function Page() {
  const clients = await getClients();
  return (
    <>
      <div className="head"><div><div className="eyebrow">Video editing</div><h1>Edit queue</h1><p>Every video across clients, from footage to delivered, with revision rounds counted.</p></div></div>
      <Deliverables kind="video" clients={clients} />
    </>
  );
}

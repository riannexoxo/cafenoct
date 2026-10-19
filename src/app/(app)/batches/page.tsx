import { getClients } from "@/lib/data";
import Batches from "@/components/batches";

export const metadata = { title: "Batches" };

export default async function Page() {
  const clients = await getClients();
  return (
    <>
      <div className="head"><div><div className="eyebrow">Data entry</div><h1>Batches</h1><p>Each batch of records: how far along, how accurate and how fast.</p></div></div>
      <Batches clients={clients} />
    </>
  );
}

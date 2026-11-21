import { getClients } from "@/lib/data";
import Docs from "@/components/docs";

export const metadata = { title: "Docs" };

export default async function DocsPage() {
  const clients = await getClients();
  return (
    <>
      <div className="head"><div><h1>Docs</h1><p>SOPs, brand kits, meeting notes and briefs for every client.</p></div></div>
      <Docs clients={clients} />
    </>
  );
}

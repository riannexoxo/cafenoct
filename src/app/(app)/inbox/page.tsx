import { getClients } from "@/lib/data";
import Inbox from "@/components/inbox";

export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const clients = await getClients();
  return (
    <>
      <div className="head">
        <div><h1>Inbox</h1><p className="muted">Everything that needs you, in one place.</p></div>
      </div>
      <Inbox clients={clients} />
    </>
  );
}

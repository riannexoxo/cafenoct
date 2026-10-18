import Link from "next/link";
import { notFound } from "next/navigation";
import { clientLabel } from "@/lib/types";
import { getClients } from "@/lib/data";
import Calendar from "@/components/calendar";
import ClientAvatar from "@/components/client-avatar";
import { TheirTime } from "@/components/client-clocks";

export const metadata = { title: "Calendar" };

export default async function ClientCalendar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clients = await getClients();
  const c = clients.find((x) => x.id === id);
  if (!c) notFound();
  return (
    <>
      <div className="head portal-band" style={{ ["--c" as string]: c.color }}>
        <div className="row" style={{ flexWrap: "nowrap", gap: 16, minWidth: 0 }}>
          <ClientAvatar c={c} />
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Client portal · Calendar</div>
            <h1 style={{ overflowWrap: "anywhere" }}>{clientLabel(c)}</h1>
            <p>Usual hours, blocked time and logged hours, shown in {c.name.split(" ")[0]}&apos;s time.</p>
            {c.timezone && <div style={{ marginTop: 8 }}><TheirTime tz={c.timezone} name={c.name.split(" ")[0]} /></div>}
          </div>
        </div>
        <Link className="btn" href={`/clients/${c.id}`}>Overview</Link>
      </div>
      <Calendar clients={clients} clientId={c.id} tz={c.timezone || undefined} />
    </>
  );
}

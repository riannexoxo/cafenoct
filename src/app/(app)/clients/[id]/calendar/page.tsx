import Link from "next/link";
import { notFound } from "next/navigation";
import { clientLabel } from "@/lib/types";
import { getClients } from "@/lib/data";
import Calendar from "@/components/calendar";

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
          <span className="avatar" style={{ background: c.color }}>{clientLabel(c)[0].toUpperCase()}</span>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Client portal · Calendar</div>
            <h1 style={{ overflowWrap: "anywhere" }}>{clientLabel(c)}</h1>
            <p>Usual hours, blocked time and logged hours for this client.</p>
          </div>
        </div>
        <Link className="btn" href={`/clients/${c.id}`}>Overview</Link>
      </div>
      <Calendar clients={clients} clientId={c.id} />
    </>
  );
}

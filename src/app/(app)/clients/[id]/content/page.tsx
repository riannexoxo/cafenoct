import Link from "next/link";
import { notFound } from "next/navigation";
import { clientLabel } from "@/lib/types";
import { getClients } from "@/lib/data";
import ClientAvatar from "@/components/client-avatar";
import ContentCalendar from "@/components/content-calendar";

export const metadata = { title: "Content calendar" };

export default async function ClientContent({ params }: { params: Promise<{ id: string }> }) {
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
            <div className="eyebrow">Client portal · Content calendar</div>
            <h1 style={{ overflowWrap: "anywhere" }}>{clientLabel(c)}</h1>
            <p>Plan, write and track every post: hooks, captions, hashtags and where it went live.</p>
          </div>
        </div>
        <Link className="btn" href={`/clients/${c.id}`}>Overview</Link>
      </div>
      <ContentCalendar clients={clients} clientId={c.id} />
    </>
  );
}

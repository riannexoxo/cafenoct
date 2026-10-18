import Link from "next/link";
import { notFound } from "next/navigation";
import { clientLabel } from "@/lib/types";
import { getClients, getProfile } from "@/lib/data";
import ClientAvatar from "@/components/client-avatar";
import EodReport from "@/components/eod-report";

export const metadata = { title: "EOD reports" };

export default async function ClientReports({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [clients, profile] = await Promise.all([getClients(), getProfile()]);
  const c = clients.find((x) => x.id === id);
  if (!c) notFound();
  return (
    <>
      <div className="head portal-band" style={{ ["--c" as string]: c.color }}>
        <div className="row" style={{ flexWrap: "nowrap", gap: 16, minWidth: 0 }}>
          <ClientAvatar c={c} />
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Client portal · Reports</div>
            <h1 style={{ overflowWrap: "anywhere" }}>{clientLabel(c)}</h1>
            <p>Built from the time you log and the tasks you tick off. Let AI polish it, then copy it into Slack or email.</p>
          </div>
        </div>
        <Link className="btn" href={`/clients/${c.id}`}>Overview</Link>
      </div>
      <EodReport client={c} sender={profile?.name || ""} />
    </>
  );
}

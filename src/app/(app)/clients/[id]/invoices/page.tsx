import Link from "next/link";
import { notFound } from "next/navigation";
import { clientLabel } from "@/lib/types";
import { getClients, getProfile } from "@/lib/data";
import { rateText } from "@/lib/format";
import ClientAvatar from "@/components/client-avatar";
import ClientInvoices from "@/components/client-invoices";

export const metadata = { title: "Invoices" };

export default async function ClientInvoicesPage({ params }: { params: Promise<{ id: string }> }) {
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
            <div className="eyebrow">Client portal · Invoices · {rateText(c)}</div>
            <h1 style={{ overflowWrap: "anywhere" }}>{clientLabel(c)}</h1>
            <p>Bill your logged hours, track what&apos;s sent and mark it paid. Paid invoices show up in your Wallet.</p>
          </div>
        </div>
        <Link className="btn" href="/wallet">Wallet</Link>
      </div>
      <ClientInvoices client={c} clients={clients} from={{ name: profile?.business || profile?.name || "", email: profile?.invoice_email || "" }} />
    </>
  );
}

import { getClients, getProfile } from "@/lib/data";
import { getRates } from "@/lib/invoices";
import AllInvoices from "@/components/all-invoices";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const [clients, profile] = await Promise.all([getClients(), getProfile()]);
  const base = profile?.currency || "USD";
  const { rates } = await getRates(base);
  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">Getting paid</div>
          <h1>Invoices</h1>
          <p>Every client&apos;s invoices in one place: what&apos;s ready to bill, what you&apos;re waiting on, and what&apos;s paid.</p>
        </div>
      </div>
      <AllInvoices clients={clients} base={base} rates={rates} from={{ name: profile?.business || profile?.name || "", email: profile?.invoice_email || "" }} />
    </>
  );
}

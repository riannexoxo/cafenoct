import { getClients, getProfile } from "@/lib/data";
import { getRates } from "@/lib/invoices";
import Wallet from "@/components/wallet";

export const metadata = { title: "Wallet" };

export default async function WalletPage() {
  const [clients, profile] = await Promise.all([getClients(), getProfile()]);
  const base = profile?.currency || "USD";
  const { rates } = await getRates(base);
  return (
    <>
      <div className="head">
        <div>
          <h1>Wallet</h1>
          <p>Everything that comes in from your clients, in dollars and pesos.</p>
        </div>
      </div>
      <Wallet clients={clients} base={base} rates={rates} from={{ name: profile?.business || profile?.name || "", email: profile?.invoice_email || "" }} />
    </>
  );
}

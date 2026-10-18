import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/data";
import { money } from "@/lib/format";
import { parseYmd } from "@/lib/dates";
import { INVOICE_COLS, total, type Invoice } from "@/lib/invoices";
import PrintButton from "./print-button";

export const metadata = { title: "Invoice" };
const long = (d: string | null) => (d ? parseYmd(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");

// A clean, printable invoice. "Save as PDF" in the print dialog makes a file to send.
export default async function InvoicePrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: inv }, profile] = await Promise.all([supabase.from("invoices").select(INVOICE_COLS).eq("id", id).maybeSingle<Invoice>(), getProfile()]);
  if (!inv) notFound();
  const { data: c } = inv.client_id ? await supabase.from("clients").select("name,company,email").eq("id", inv.client_id).maybeSingle<{ name: string; company: string; email: string }>() : { data: null };
  const sum = total(inv);
  return (
    <main className="inv-page">
      <div className="inv-tools"><PrintButton /></div>
      <article className="inv-doc">
        <header className="inv-top">
          <div>
            <div className="inv-from">{profile?.business || profile?.name}</div>
            {profile?.business && profile?.name && <div className="muted">{profile.name}</div>}
            {profile?.invoice_email && <div className="muted">{profile.invoice_email}</div>}
          </div>
          <div className="inv-title">
            <h1>Invoice</h1>
            <div className="num">{inv.number}</div>
            {inv.status === "paid" && <span className="inv-paid">Paid</span>}
          </div>
        </header>
        <section className="inv-meta">
          <div><span className="k">Billed to</span><b>{c?.company || c?.name || "Client"}</b>{c?.company && c?.name && <div>{c.name}</div>}{c?.email && <div className="muted">{c.email}</div>}</div>
          <div><span className="k">Issued</span><b>{long(inv.issue_date)}</b>{inv.due_date && <><span className="k" style={{ marginTop: 10 }}>Due</span><b>{long(inv.due_date)}</b></>}</div>
          <div><span className="k">Amount due</span><b className="inv-big num">{inv.status === "paid" ? money(0, inv.currency) : money(sum, inv.currency)}</b><div className="muted">{inv.currency}</div></div>
        </section>
        <table className="inv-items">
          <thead><tr><th>Description</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Amount</th></tr></thead>
          <tbody>{inv.items.map((i, n) => (
            <tr key={n}><td>{i.desc}</td><td className="r num">{i.qty}</td><td className="r num">{money(Number(i.rate), inv.currency)}</td><td className="r num">{money(Number(i.qty) * Number(i.rate), inv.currency)}</td></tr>
          ))}</tbody>
          <tfoot><tr><td colSpan={3} className="r">Total</td><td className="r num">{money(sum, inv.currency)}</td></tr></tfoot>
        </table>
        {inv.status === "paid" && <p className="inv-note">Paid in full on {long(inv.paid_date ?? inv.issue_date)}{inv.method ? ` via ${inv.method}` : ""}. Thank you!</p>}
        {inv.notes && <p className="inv-note" style={{ whiteSpace: "pre-wrap" }}>{inv.notes}</p>}
      </article>
    </main>
  );
}

// Invoices and money received. An invoice is "paid" once the money is in your account.
import { money } from "@/lib/format";
import { parseYmd } from "@/lib/dates";
import { clientLabel, type Client } from "@/lib/types";

export type Item = { desc: string; qty: number; rate: number };
export type Invoice = {
  id: string; client_id: string | null; number: string; issue_date: string; due_date: string | null; currency: string;
  status: "draft" | "sent" | "paid"; items: Item[]; paid_date: string | null; paid_amount: number | null; method: string; notes: string;
};
export const INVOICE_COLS = "id,client_id,number,issue_date,due_date,currency,status,items,paid_date,paid_amount,method,notes";
export const METHODS = ["PayPal", "Wise", "Payoneer", "Bank transfer", "GCash", "Stripe", "Upwork", "Other"];

export const total = (inv: Pick<Invoice, "items">) => Math.round((inv.items ?? []).reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0) * 100) / 100;
// What actually landed, after fees when you've entered it.
export const received = (inv: Invoice) => (inv.paid_amount != null ? Number(inv.paid_amount) : total(inv));
export const isOverdue = (inv: Invoice, today: string) => inv.status === "sent" && !!inv.due_date && inv.due_date < today;

// INV-001, INV-002… continuing from the highest number used so far. Payments without an invoice use PAY-001.
export function nextNumber(list: Pick<Invoice, "number">[], prefix = "INV") {
  const max = list.filter((i) => i.number.startsWith(prefix)).reduce((m, i) => Math.max(m, Number(i.number.match(/(\d+)\s*$/)?.[1] ?? 0)), 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

// Convert between currencies with rates against a base currency (1 base = rates[x] of x).
export function convert(amount: number, from: string, to: string, base: string, rates: Record<string, number>) {
  if (from === to) return amount;
  const toBase = from === base ? amount : rates[from] ? amount / rates[from] : amount;
  return to === base ? toBase : rates[to] ? toBase * rates[to] : toBase;
}

const fmtDate = (d: string | null) => (d ? parseYmd(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");

// A plain-text invoice for pasting into an email or chat.
export function invoiceText(inv: Invoice, c: Client | undefined, from: { name: string; email: string }) {
  const L = [`INVOICE ${inv.number}`, "", `From: ${from.name}${from.email ? ` <${from.email}>` : ""}`, `To: ${c ? clientLabel(c) : "Client"}${c?.company && c.name ? ` (${c.name})` : ""}`, `Date: ${fmtDate(inv.issue_date)}`];
  if (inv.due_date) L.push(`Due: ${fmtDate(inv.due_date)}`);
  L.push("");
  inv.items.forEach((i) => L.push(`- ${i.desc}: ${i.qty} × ${money(Number(i.rate), inv.currency)} = ${money(Number(i.qty) * Number(i.rate), inv.currency)}`));
  L.push("", `Total: ${money(total(inv), inv.currency)} ${inv.currency}`);
  if (inv.notes) L.push("", inv.notes);
  return L.join("\n");
}

// Today's exchange rates (European Central Bank, via Frankfurter), cached for 12 hours. Server only.
export async function getRates(base = "USD"): Promise<{ date: string; rates: Record<string, number> }> {
  try {
    const r = await fetch(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}`, { next: { revalidate: 43200 } });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { date: string; rates: Record<string, number> };
    return { date: j.date, rates: j.rates ?? {} };
  } catch {
    return { date: "", rates: {} };
  }
}

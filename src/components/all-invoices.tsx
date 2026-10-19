"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRows } from "@/lib/use-rows";
import { parseYmd, today } from "@/lib/dates";
import { hm, localParts } from "@/lib/cal";
import { money } from "@/lib/format";
import { toast } from "@/lib/toast";
import { INVOICE_COLS, convert, hoursDraft, invoiceText, isOverdue, received, total, type Invoice } from "@/lib/invoices";
import { clientLabel, type Client } from "@/lib/types";
import InvoiceForm, { type InvoiceDraft } from "./invoice-form";
import { StatusPill } from "./client-invoices";
import ClientAvatar from "./client-avatar";
import Seg from "./seg";
import Icon from "./icon";

type Entry = { id: string; client_id: string | null; started_at: string; minutes: number };
type Show = "open" | "overdue" | "draft" | "paid" | "all";
const noop = () => () => {};
const short = (d: string) => parseYmd(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const daysFrom = (a: string, b: string) => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 864e5);

// All invoices across clients, with hours ready to bill and quick actions.
export default function AllInvoices(props: { clients: Client[]; base: string; rates: Record<string, number>; from: { name: string; email: string } }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="card skel" style={{ height: 360 }} aria-busy="true" />;
  return <Inner {...props} />;
}

function Inner({ clients, base, rates, from }: { clients: Client[]; base: string; rates: Record<string, number>; from: { name: string; email: string } }) {
  const [invoices, reload] = useRows<Invoice>("all-inv", (s) => s.from("invoices").select(INVOICE_COLS).order("issue_date", { ascending: false }).order("number", { ascending: false }), ["invoices"]);
  const [unbilled, reloadHours] = useRows<Entry>("all-unbilled", (s) => s.from("time_entries").select("id,client_id,started_at,minutes").is("invoice_id", null), ["time_entries"]);
  const [form, setForm] = useState<{ inv: InvoiceDraft; mode: "invoice" | "payment" } | null>(null);
  const [show, setShow] = useState<Show>("open");
  const [who, setWho] = useState("");
  const [q, setQ] = useState("");

  const t = today(), year = t.slice(0, 4);
  const list = invoices ?? [];
  const client = (id: string | null) => clients.find((c) => c.id === id);
  const toBase = (amt: number, cur: string) => convert(amt, cur, base, base, rates);
  const sumBase = (xs: Invoice[], f: (i: Invoice) => number) => xs.reduce((a, i) => a + toBase(f(i), i.currency), 0);

  const sent = list.filter((i) => i.status === "sent"), late = sent.filter((i) => isOverdue(i, t));
  const paidYear = list.filter((i) => i.status === "paid" && (i.paid_date ?? i.issue_date).startsWith(year));

  // Unbilled hours, per hourly client.
  const toBill = clients
    .filter((c) => c.status !== "Past" && !c.personal && c.rate_type === "Hourly" && c.rate)
    .map((c) => { const es = (unbilled ?? []).filter((e) => e.client_id === c.id); const min = es.reduce((a, e) => a + e.minutes, 0); return { c, es, min, worth: (min / 60) * (c.rate ?? 0) }; })
    .filter((x) => x.min >= 15)
    .sort((a, b) => toBase(b.worth, b.c.currency) - toBase(a.worth, a.c.currency));
  const readyWorth = toBill.reduce((a, x) => a + toBase(x.worth, x.c.currency), 0);

  const shown = list.filter((i) => {
    if (who && i.client_id !== who) return false;
    if (show === "open" && i.status === "paid") return false;
    if (show === "overdue" && !isOverdue(i, t)) return false;
    if (show === "draft" && i.status !== "draft") return false;
    if (show === "paid" && i.status !== "paid") return false;
    if (q) { const c = client(i.client_id); if (!`${i.number} ${c ? clientLabel(c) : ""} ${i.items.map((x) => x.desc).join(" ")}`.toLowerCase().includes(q.toLowerCase())) return false; }
    return true;
  });
  // Overdue first, then by due date, when looking at what's open.
  if (show === "open" || show === "overdue") shown.sort((a, b) => (a.status === "draft" ? 1 : 0) - (b.status === "draft" ? 1 : 0) || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));

  const open = (i: Invoice) => setForm({ mode: i.number.startsWith("PAY") ? "payment" : "invoice", inv: i });
  async function copy(i: Invoice) {
    try { await navigator.clipboard.writeText(invoiceText(i, client(i.client_id), from)); toast(`${i.number} copied. Paste it into an email or chat.`); }
    catch { toast("Couldn't copy here. Open the invoice instead."); }
  }
  const dueText = (i: Invoice) => {
    if (i.status === "paid") return i.paid_date ? `Paid ${short(i.paid_date)}` : "Paid";
    if (!i.due_date) return "No due date";
    const d = daysFrom(t, i.due_date);
    return d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : d > 0 ? `Due in ${d} days` : `${-d} day${d === -1 ? "" : "s"} late`;
  };

  return (
    <>
      <div className="stats">
        <div className="stat"><span className="k">Ready to bill</span><span className="v">{money(readyWorth, base)}</span><span className="s">{toBill.length ? `${hm(toBill.reduce((a, x) => a + x.min, 0))} unbilled` : "all hours billed"}</span></div>
        <div className="stat"><span className="k">Waiting on</span><span className="v">{money(sumBase(sent, total), base)}</span><span className="s">{sent.length} sent, not paid yet</span></div>
        <div className="stat"><span className="k">Overdue</span><span className="v" style={late.length ? { color: "var(--bad)" } : undefined}>{money(sumBase(late, total), base)}</span><span className="s">{late.length ? `${late.length} past the due date` : "nothing late"}</span></div>
        <div className="stat"><span className="k">Paid in {year}</span><span className="v">{money(sumBase(paidYear, received), base)}</span><span className="s">after fees</span></div>
      </div>

      {toBill.length > 0 && (
        <div className="card">
          <h3><span>Ready to bill</span><span className="muted small hide-sm">logged hours not on an invoice yet</span></h3>
          <div className="bill-grid">
            {toBill.map(({ c, es, min, worth }) => (
              <div className="bill" key={c.id}>
                <ClientAvatar c={c} size={34} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="ellipsis">{clientLabel(c)}</div>
                  <div className="small muted num">{hm(min)} · {money(worth, c.currency)}</div>
                </div>
                <button className="btn small solid" onClick={() => setForm({ mode: "invoice", inv: hoursDraft(c, es.map((e) => ({ id: e.id, minutes: e.minutes, date: localParts(e.started_at).date }))) })}>Invoice</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row inv-bar">
        <Seg label="Show" value={show} onChange={setShow} options={[["open", "Open"], ["overdue", `Overdue${late.length ? ` ${late.length}` : ""}`], ["draft", "Drafts"], ["paid", "Paid"], ["all", "All"]]} />
        <select className="auto-pick" aria-label="Client" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">All clients</option>
          {clients.filter((c) => !c.personal).map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
        </select>
        <input className="auto-pick inv-search" type="search" placeholder="Search number or client" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search invoices" />
        <span className="grow" />
        <button className="btn" onClick={() => setForm({ mode: "payment", inv: { client_id: who || undefined } })}><Icon name="coin" />Record a payment</button>
        <button className="btn solid" onClick={() => setForm({ mode: "invoice", inv: { client_id: who || undefined, currency: client(who || null)?.currency } })}><Icon name="plus" />New invoice</button>
      </div>

      <div className="card">
        {invoices == null ? <div className="skel" style={{ height: 160 }} /> : shown.length ? (
          <div className="table-wrap inv-wide">
            <table className="inv-table">
              <thead><tr><th>Number</th><th>Client</th><th>Issued</th><th>When</th><th>Status</th><th className="r">Amount</th><th /></tr></thead>
              <tbody>
                {shown.map((i) => {
                  const c = client(i.client_id), late = isOverdue(i, t);
                  return (
                    <tr key={i.id} className="click" tabIndex={0} onClick={() => open(i)} onKeyDown={(k) => { if (k.key === "Enter") open(i); }}>
                      <td className="num">{i.number}</td>
                      <td><span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>{c && <ClientAvatar c={c} size={22} />}<span className="ellipsis">{c ? clientLabel(c) : "Other income"}</span></span></td>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>{short(i.issue_date)}</td>
                      <td className="small" style={{ whiteSpace: "nowrap", color: late ? "var(--bad)" : "var(--muted)" }}>{dueText(i)}</td>
                      <td style={{ whiteSpace: "nowrap" }}><StatusPill inv={i} t={t} />{i.status === "paid" && i.method ? <span className="small muted"> · {i.method}</span> : null}</td>
                      <td className="r num" style={{ whiteSpace: "nowrap" }}>
                        {money(i.status === "paid" ? received(i) : total(i), i.currency)}
                        {i.currency !== base && rates[i.currency] ? <div className="small muted">≈ {money(toBase(i.status === "paid" ? received(i) : total(i), i.currency), base)}</div> : null}
                      </td>
                      <td className="r" style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                        {i.status !== "paid" && <button className="btn small" onClick={() => setForm({ mode: "invoice", inv: { ...i, status: "paid", markPaid: true } })}>Mark paid</button>}
                        {!i.number.startsWith("PAY") && <>
                          <button className="btn small" aria-label={`Copy ${i.number} as text`} title="Copy as text" onClick={() => copy(i)}><Icon name="copy" /></button>
                          <Link className="btn small" href={`/invoice/${i.id}`} target="_blank" aria-label={`Print or save ${i.number} as PDF`} title="Print or PDF"><Icon name="file" /></Link>
                        </>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {invoices != null && shown.length > 0 && (
          <div className="list inv-phone">
            {shown.map((i) => {
              const c = client(i.client_id);
              return (
                <button type="button" className="li" key={i.id} onClick={() => open(i)}>
                  {c ? <ClientAvatar c={c} size={30} /> : <span className="avatar" style={{ width: 30, height: 30 }} />}
                  <span className="t">{c ? clientLabel(c) : "Other income"}<small className="num">{i.number} · <span style={isOverdue(i, t) ? { color: "var(--bad)" } : undefined}>{dueText(i)}</span></small></span>
                  <span className="inv-phone-r"><span className="num">{money(i.status === "paid" ? received(i) : total(i), i.currency)}</span><StatusPill inv={i} t={t} /></span>
                </button>
              );
            })}
          </div>
        )}
        {invoices != null && !shown.length && (
          <div className="empty">
            <b>{list.length ? (show === "overdue" ? "Nothing overdue" : show === "open" ? "Nothing open. Everything's paid." : "No invoices here") : "No invoices yet"}</b>
            <span>{list.length ? "Try another filter or client." : "Bill your logged hours above, or start a new invoice."}</span>
          </div>
        )}
      </div>

      {form && <InvoiceForm inv={form.inv} mode={form.mode} clients={clients} existing={list} from={from} onClose={() => setForm(null)} onSaved={() => { reload(); reloadHours(); }} />}
    </>
  );
}

"use client";

import { useState, useSyncExternalStore } from "react";
import { useRows } from "@/lib/use-rows";
import { parseYmd, today } from "@/lib/dates";
import { hm, localParts } from "@/lib/cal";
import { money } from "@/lib/format";
import { INVOICE_COLS, isOverdue, received, total, type Invoice } from "@/lib/invoices";
import type { Client } from "@/lib/types";
import InvoiceForm, { type InvoiceDraft } from "./invoice-form";
import Icon from "./icon";

type Entry = { id: string; started_at: string; minutes: number; note: string };
const noop = () => () => {};
const short = (d: string) => parseYmd(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function StatusPill({ inv, t }: { inv: Invoice; t: string }) {
  if (inv.status === "paid") return <span className="pill good">Paid</span>;
  if (isOverdue(inv, t)) return <span className="pill bad">Overdue</span>;
  if (inv.status === "sent") return <span className="pill warn">Sent</span>;
  return <span className="pill">Draft</span>;
}

// A client's invoices: unbilled hours ready to bill, what's outstanding, and what's been paid.
export default function ClientInvoices({ client, clients, from }: { client: Client; clients: Client[]; from: { name: string; email: string } }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  const [form, setForm] = useState<{ inv: InvoiceDraft; mode: "invoice" | "payment" } | null>(null);
  const [showHours, setShowHours] = useState(false);
  const [invoices, reload] = useRows<Invoice>(`inv:${client.id}`, (s) => s.from("invoices").select(INVOICE_COLS).eq("client_id", client.id).order("issue_date", { ascending: false }), ["invoices"]);
  const [all] = useRows<Pick<Invoice, "number">>("inv-numbers", (s) => s.from("invoices").select("number"), ["invoices"]);
  const [unbilled, reloadHours] = useRows<Entry>(`unbilled:${client.id}`, (s) => s.from("time_entries").select("id,started_at,minutes,note").eq("client_id", client.id).is("invoice_id", null).order("started_at"), ["time_entries"]);
  if (!ready) return <div className="card skel" style={{ height: 300 }} aria-busy="true" />;

  const t = today(), year = t.slice(0, 4);
  const list = invoices ?? [], hours = unbilled ?? [];
  const cur = client.currency || "USD";
  const hourly = client.rate_type === "Hourly" && !!client.rate;
  const unbilledMin = hours.reduce((a, e) => a + e.minutes, 0);
  const unbilledWorth = hourly ? (unbilledMin / 60) * (client.rate ?? 0) : 0;
  const waiting = list.filter((i) => i.status === "sent").reduce((a, i) => a + total(i), 0);
  const paidYear = list.filter((i) => i.status === "paid" && (i.paid_date ?? i.issue_date).startsWith(year)).reduce((a, i) => a + received(i), 0);
  const paidAll = list.filter((i) => i.status === "paid").reduce((a, i) => a + received(i), 0);

  function billHours() {
    const dates = hours.map((e) => localParts(e.started_at).date).sort();
    const range = dates.length ? (dates[0] === dates[dates.length - 1] ? short(dates[0]) : `${short(dates[0])} – ${short(dates[dates.length - 1])}`) : "";
    setForm({ mode: "invoice", inv: { client_id: client.id, currency: cur, entryIds: hours.map((e) => e.id), items: [{ desc: `${client.services || "Virtual assistant services"}${range ? `, ${range}` : ""}`, qty: Math.round((unbilledMin / 60) * 100) / 100, rate: client.rate ?? 0 }] } });
  }

  return (
    <>
      <div className="stats">
        <div className="stat"><span className="k">Ready to bill</span><span className="v">{hourly ? money(unbilledWorth, cur) : hm(unbilledMin)}</span><span className="s">{hourly ? `${hm(unbilledMin)} unbilled` : "unbilled hours"}</span></div>
        <div className="stat"><span className="k">Waiting on</span><span className="v">{money(waiting, cur)}</span><span className="s">{list.filter((i) => i.status === "sent").length} sent, not paid yet</span></div>
        <div className="stat"><span className="k">Paid in {year}</span><span className="v">{money(paidYear, cur)}</span><span className="s">after fees</span></div>
        <div className="stat"><span className="k">All time</span><span className="v">{money(paidAll, cur)}</span><span className="s">{client.rate ? `at ${money(client.rate, cur)}${client.rate_type === "Hourly" ? "/h" : ""}` : client.rate_type}</span></div>
      </div>
      <div className="row">
        {hours.length > 0 && <button className="btn solid" onClick={billHours}><Icon name="file" />Invoice {hm(unbilledMin)} of unbilled time</button>}
        <button className={`btn${hours.length ? "" : " solid"}`} onClick={() => setForm({ mode: "invoice", inv: { client_id: client.id, currency: cur } })}><Icon name="plus" />New invoice</button>
        <button className="btn" onClick={() => setForm({ mode: "payment", inv: { client_id: client.id, currency: cur } })}><Icon name="coin" />Record a payment</button>
      </div>
      <div className="card">
        <h3><span>Invoices</span><span className="muted">{list.length}</span></h3>
        {list.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Number</th><th>Issued</th><th>Due</th><th>Status</th><th className="r">Amount</th><th /></tr></thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.id} className="click" tabIndex={0} onClick={() => setForm({ mode: i.number.startsWith("PAY") ? "payment" : "invoice", inv: i })} onKeyDown={(k) => { if (k.key === "Enter") setForm({ mode: i.number.startsWith("PAY") ? "payment" : "invoice", inv: i }); }}>
                    <td className="num">{i.number}</td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>{short(i.issue_date)}</td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>{i.due_date ? short(i.due_date) : "—"}</td>
                    <td><StatusPill inv={i} t={t} />{i.status === "paid" && i.method ? <span className="small muted"> · {i.method}</span> : null}</td>
                    <td className="r num">{money(total(i), i.currency)}</td>
                    <td className="r">{i.status !== "paid" && <button className="btn small" onClick={(e) => { e.stopPropagation(); setForm({ mode: "invoice", inv: { ...i, status: "paid", markPaid: true } }); }}>Mark paid</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty"><b>No invoices yet</b><span>{hourly ? "Log your hours, then invoice them here in one click at your hourly rate." : "Create an invoice or record a payment when they pay you."}</span></div>}
      </div>
      {hours.length > 0 && (
        <div className="card">
          <button className="grp" style={{ fontSize: 13 }} aria-expanded={showHours} onClick={() => setShowHours(!showHours)}>
            <span className="chev" style={{ transform: `rotate(${showHours ? 90 : 0}deg)` }}><Icon name="right" size={13} /></span>Unbilled time ({hours.length} entries, {hm(unbilledMin)})
          </button>
          {showHours && <div className="list" style={{ marginTop: 8 }}>{hours.map((e) => (
            <div className="li" key={e.id}><span className="t">{e.note || "No note"}<small>{short(localParts(e.started_at).date)}</small></span><span className="num small">{hm(e.minutes)}</span></div>
          ))}</div>}
        </div>
      )}
      {form && <InvoiceForm inv={form.inv} mode={form.mode} clients={clients} existing={all ?? []} from={from} onClose={() => setForm(null)} onSaved={() => { reload(); reloadHours(); }} />}
    </>
  );
}

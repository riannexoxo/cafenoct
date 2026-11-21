"use client";

import { useState } from "react";
import { supabase } from "@/lib/use-rows";
import { addDays, today } from "@/lib/dates";
import { money } from "@/lib/format";
import { METHODS, invoiceText, nextNumber, total, type Invoice, type Item } from "@/lib/invoices";
import { toast } from "@/lib/toast";
import { celebrate } from "@/lib/celebrate";
import { clientLabel, type Client } from "@/lib/types";
import Modal from "./modal";
import Icon from "./icon";

export type InvoiceDraft = Partial<Invoice> & { entryIds?: string[]; markPaid?: boolean };
export const CURRENCIES = ["USD", "PHP", "AUD", "CAD", "GBP", "EUR", "NZD", "SGD"];

// Create or edit an invoice. "payment" mode is a quick way to record money received without an invoice.
export default function InvoiceForm({ inv = {}, mode = "invoice", clients, existing, from, onClose, onSaved }: {
  inv?: InvoiceDraft; mode?: "invoice" | "payment"; clients: Client[]; existing: Pick<Invoice, "number">[];
  from: { name: string; email: string }; onClose: () => void; onSaved?: () => void;
}) {
  const pay = mode === "payment";
  const [clientId, setClientId] = useState(inv.client_id ?? "");
  const client = clients.find((c) => c.id === clientId);
  const [number, setNumber] = useState(inv.number ?? nextNumber(existing, pay ? "PAY" : "INV"));
  const [issue, setIssue] = useState(inv.issue_date ?? today());
  const [due, setDue] = useState(inv.due_date ?? (pay ? "" : addDays(today(), 7)));
  const [currency, setCurrency] = useState(inv.currency ?? client?.currency ?? "USD");
  const [status, setStatus] = useState<Invoice["status"]>(inv.status ?? (pay ? "paid" : "draft"));
  const [items, setItems] = useState<Item[]>(inv.items?.length ? inv.items : [{ desc: pay ? "Payment received" : "", qty: 1, rate: client?.rate ?? 0 }]);
  const [paidDate, setPaidDate] = useState(inv.paid_date ?? today());
  const [paidAmount, setPaidAmount] = useState(inv.paid_amount != null ? String(inv.paid_amount) : "");
  const [method, setMethod] = useState(inv.method ?? "");
  const [notes, setNotes] = useState(inv.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);

  const sum = total({ items });
  const setItem = (i: number, k: keyof Item, v: string) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: k === "desc" ? v : (v as unknown as number) } : x)));
  const pickClient = (id: string) => {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (c && !inv.id) { setCurrency(c.currency || "USD"); if (!pay && c.rate && items.length === 1 && !items[0].desc) setItems([{ desc: "", qty: 1, rate: c.rate }]); }
  };
  const row = (): Omit<Invoice, "id"> => ({
    client_id: clientId || null, number: number.trim() || nextNumber(existing, pay ? "PAY" : "INV"), issue_date: pay ? paidDate : issue, due_date: due || null, currency, status,
    items: items.filter((i) => i.desc.trim() || Number(i.qty) * Number(i.rate)).map((i) => ({ desc: i.desc.trim(), qty: Number(i.qty) || 0, rate: Number(i.rate) || 0 })),
    paid_date: status === "paid" ? paidDate : null, paid_amount: status === "paid" && paidAmount !== "" ? Number(paidAmount) : null, method: status === "paid" ? method : "", notes: notes.trim(),
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = row();
    if (!r.items.length || !total(r)) return toast(pay ? "Enter how much you received." : "Add at least one line with an amount.");
    setBusy(true);
    const res = inv.id
      ? await supabase().from("invoices").update(r).eq("id", inv.id).select("id").single()
      : await supabase().from("invoices").insert(r).select("id").single();
    if (res.error || !res.data) { setBusy(false); return toast(/unique|duplicate/i.test(res.error?.message ?? "") ? "That invoice number is already used." : "Could not save. Check your connection."); }
    // Hours that went into this invoice are marked as billed so they aren't invoiced twice.
    if (inv.entryIds?.length) {
      const marked = await supabase().from("time_entries").update({ invoice_id: res.data.id }).in("id", inv.entryIds);
      if (marked.error) { setBusy(false); toast("Invoice saved, but its hours still show as unbilled. Check your connection."); onSaved?.(); return onClose(); }
    }
    setBusy(false);
    // Money just landed: play the little wallet animation instead of a plain message.
    if (status === "paid" && (!inv.id || inv.markPaid || inv.status !== "paid")) {
      celebrate({ amount: r.paid_amount ?? total(r), currency, title: client ? `From ${clientLabel(client)}` : "Money received", detail: [r.number, r.method && `via ${r.method}`].filter(Boolean).join(" · ") });
      onSaved?.();
      return onClose();
    }
    toast(pay ? `Recorded ${money(r.paid_amount ?? total(r), currency)} received` : status === "paid" ? `${r.number} saved as paid` : `${r.number} saved`);
    onSaved?.();
    onClose();
  }
  async function remove() {
    if (!inv.id) return;
    if (!sure) return setSure(true);
    setBusy(true);
    await supabase().from("time_entries").update({ invoice_id: null }).eq("invoice_id", inv.id);
    const { error } = await supabase().from("invoices").delete().eq("id", inv.id);
    setBusy(false);
    if (error) return toast("Could not delete. Try again.");
    toast("Deleted. Its hours are unbilled again.");
    onSaved?.();
    onClose();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(invoiceText({ id: inv.id ?? "", ...row() }, client, from)); toast("Invoice copied. Paste it into an email."); }
    catch { toast("Copy was blocked here."); }
  }

  const title = pay ? (inv.id ? "Edit payment" : "Record money received") : inv.id ? `Invoice ${inv.number}` : "New invoice";
  return (
    <Modal label={title} onClose={onClose} wide={!pay}>
      <form onSubmit={save} style={{ display: "contents" }}>
        <h2>{title}</h2>
        <div className="form">
          <div className="field"><label htmlFor="iv-client">Client</label>
            <select id="iv-client" value={clientId} onChange={(e) => pickClient(e.target.value)}>
              <option value="">{pay ? "Other income" : "Choose a client"}</option>
              {clients.filter((c) => c.status !== "Past" || c.id === clientId).map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
            </select>
          </div>
          {pay ? (
            <>
              <div className="field"><label htmlFor="iv-amt">Amount ({currency})</label><input id="iv-amt" type="number" step="0.01" min="0" required value={items[0]?.rate || ""} onChange={(e) => setItems([{ desc: items[0]?.desc || "Payment received", qty: 1, rate: e.target.value as unknown as number }])} /></div>
              <div className="field"><label htmlFor="iv-pd">Received on</label><input id="iv-pd" type="date" required value={paidDate} onChange={(e) => setPaidDate(e.target.value)} /></div>
              <div className="field"><label htmlFor="iv-m">Paid via</label><select id="iv-m" value={method} onChange={(e) => setMethod(e.target.value)}><option value="">—</option>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
              <div className="field"><label htmlFor="iv-fee">Landed after fees (optional)</label><input id="iv-fee" type="number" step="0.01" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder={String(sum || "")} /></div>
              <div className="field"><label htmlFor="iv-cur">Currency</label><select id="iv-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div className="field full"><label htmlFor="iv-desc">What it was for</label><input id="iv-desc" value={items[0]?.desc ?? ""} onChange={(e) => setItem(0, "desc", e.target.value)} placeholder="Live stream support, October" /></div>
            </>
          ) : (
            <>
              <div className="field"><label htmlFor="iv-no">Invoice number</label><input id="iv-no" value={number} onChange={(e) => setNumber(e.target.value)} /></div>
              <div className="field"><label htmlFor="iv-issue">Issue date</label><input id="iv-issue" type="date" value={issue} onChange={(e) => setIssue(e.target.value)} /></div>
              <div className="field"><label htmlFor="iv-due">Due date</label><input id="iv-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
              <div className="field"><label htmlFor="iv-cur">Currency</label><select id="iv-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div className="field"><label htmlFor="iv-status">Status</label><select id="iv-status" value={status} onChange={(e) => setStatus(e.target.value as Invoice["status"])}><option value="draft">Draft</option><option value="sent">Sent</option><option value="paid">Paid</option></select></div>
              <div className="field full"><label>Line items</label>
                <div className="items">
                  <div className="item-row small muted"><span>Description</span><span>{client?.rate_type === "Hourly" ? "Hours" : "Qty"}</span><span>Rate</span><span /></div>
                  {items.map((it, i) => (
                    <div className="item-row" key={i}>
                      <input aria-label="Description" placeholder="Virtual assistant services" value={it.desc} onChange={(e) => setItem(i, "desc", e.target.value)} />
                      <input aria-label="Quantity" type="number" step="0.01" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} />
                      <input aria-label="Rate" type="number" step="0.01" value={it.rate} onChange={(e) => setItem(i, "rate", e.target.value)} />
                      <button type="button" className="btn small ghost" style={{ padding: 4 }} aria-label="Remove line" onClick={() => setItems((xs) => (xs.length > 1 ? xs.filter((_, j) => j !== i) : xs))}><Icon name="x" /></button>
                    </div>
                  ))}
                </div>
                <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
                  <button type="button" className="btn small" onClick={() => setItems((xs) => [...xs, { desc: "", qty: 1, rate: client?.rate ?? 0 }])}><Icon name="plus" />Add line</button>
                  <span className="num" style={{ fontSize: 18 }}>Total {money(sum, currency)}</span>
                </div>
              </div>
              {status === "paid" && (
                <>
                  <div className="field"><label htmlFor="iv-pd">Paid on</label><input id="iv-pd" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} /></div>
                  <div className="field"><label htmlFor="iv-fee">Landed after fees</label><input id="iv-fee" type="number" step="0.01" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder={String(sum)} /></div>
                  <div className="field full"><label htmlFor="iv-m">Paid via</label><select id="iv-m" value={method} onChange={(e) => setMethod(e.target.value)}><option value="">—</option>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
                </>
              )}
              <div className="field full"><label htmlFor="iv-notes">Notes on the invoice</label><textarea id="iv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment details, thank-you note…" style={{ minHeight: 64 }} /></div>
            </>
          )}
        </div>
        <div className="modal-foot">
          {inv.id && <button type="button" className="btn danger left" disabled={busy} onClick={remove}>{sure ? "Tap again to delete" : "Delete"}</button>}
          {!pay && <button type="button" className="btn" onClick={copy}><Icon name="copy" />Copy as text</button>}
          {!pay && inv.id && <a className="btn" href={`/invoice/${inv.id}`} target="_blank" rel="noopener noreferrer"><Icon name="file" />Print or PDF</a>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { supabase } from "@/lib/use-rows";
import { today } from "@/lib/dates";
import { money } from "@/lib/format";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import { CURRENCIES } from "./invoice-form";
import Modal from "./modal";
import Icon from "./icon";

export type Expense = { id: string; spent_on: string; amount: number; currency: string; category: string; vendor: string; note: string; client_id: string | null; receipt_path: string };
export const EXPENSE_COLS = "id,spent_on,amount,currency,category,vendor,note,client_id,receipt_path";
export const CATEGORIES = ["Software", "Equipment", "Internet and phone", "Ads", "Fees", "Learning", "Contractors", "Office", "Travel", "Other"];
const BUCKET = "receipts";
const MAX = 10 * 1024 * 1024;
// The receipts bucket only accepts these types; the extension comes from the type, not the file name.
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };
const typeOf = (f: File) => f.type || (/\.(heic|heif)$/i.test(f.name) ? "image/heic" : "");

// Open a receipt in a new tab with a link that works for 60 seconds.
export async function openReceipt(path: string) {
  const w = window.open("about:blank", "_blank");
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data) { w?.close(); return toast("Could not open the receipt. Try again."); }
  if (w) { w.opener = null; w.location.href = data.signedUrl; } else window.location.assign(data.signedUrl);
}

export default function ExpenseForm({ expense, clients, base, onClose, onSaved }: { expense: Partial<Expense>; clients: Client[]; base: string; onClose: () => void; onSaved: () => void }) {
  const known = !expense.category || CATEGORIES.includes(expense.category);
  const [date, setDate] = useState(expense.spent_on ?? today());
  const [amount, setAmount] = useState(expense.amount != null ? String(expense.amount) : "");
  const [currency, setCurrency] = useState(expense.currency ?? base);
  const [category, setCategory] = useState(known ? expense.category ?? "Software" : "custom");
  const [custom, setCustom] = useState(known ? "" : expense.category ?? "");
  const [vendor, setVendor] = useState(expense.vendor ?? "");
  const [note, setNote] = useState(expense.note ?? "");
  const [clientId, setClientId] = useState(expense.client_id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [dropOld, setDropOld] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const old = expense.receipt_path ?? "";

  function pick(f: File | undefined) {
    setMsg("");
    if (!f) return setFile(null);
    if (!TYPES[typeOf(f)]) { setFile(null); return setMsg("Choose a PNG, JPG, WebP, HEIC or PDF file."); }
    if (f.size > MAX) { setFile(null); return setMsg("That file is over 10 MB. Try a smaller one."); }
    setFile(f);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const a = Math.round(Number(amount) * 100) / 100;
    if (!(a > 0)) return toast("Enter an amount above zero.");
    const cat = (category === "custom" ? custom : category).trim().slice(0, 40);
    if (!cat) return toast("Name the category.");
    setBusy(true);
    let path = dropOld ? "" : old;
    if (file) {
      const { data: auth } = await supabase().auth.getSession();
      const uid = auth.session?.user.id;
      if (!uid) { setBusy(false); return toast("Sign in again to upload receipts."); }
      const type = typeOf(file);
      path = `${uid}/${crypto.randomUUID()}.${TYPES[type]}`;
      const up = await supabase().storage.from(BUCKET).upload(path, file, { contentType: type });
      if (up.error) { setBusy(false); return toast("Could not upload the receipt. Check your connection."); }
    }
    const row = { spent_on: date, amount: a, currency, category: cat, vendor: vendor.trim().slice(0, 120), note: note.trim().slice(0, 1000), client_id: clientId || null, receipt_path: path };
    const { error } = expense.id ? await supabase().from("expenses").update(row).eq("id", expense.id) : await supabase().from("expenses").insert(row);
    if (error) {
      if (file) await supabase().storage.from(BUCKET).remove([path]);
      setBusy(false);
      return toast("Could not save. Check your connection.");
    }
    // The old file goes only once the row no longer points at it.
    if (old && path !== old) await supabase().storage.from(BUCKET).remove([old]);
    setBusy(false);
    toast(expense.id ? "Expense saved" : `Logged ${money(a, currency)} for ${cat}`);
    onSaved();
    onClose();
  }

  async function remove() {
    if (!expense.id) return;
    if (!sure) return setSure(true);
    setBusy(true);
    const { error } = await supabase().from("expenses").delete().eq("id", expense.id);
    if (!error && old) await supabase().storage.from(BUCKET).remove([old]);
    setBusy(false);
    if (error) return toast("Could not delete. Try again.");
    toast("Expense deleted");
    onSaved();
    onClose();
  }

  return (
    <Modal label={expense.id ? "Edit expense" : "Add expense"} onClose={onClose}>
      <form onSubmit={save} style={{ display: "contents" }}>
        <h2>{expense.id ? "Edit expense" : "Add expense"}</h2>
        <div className="form">
          <div className="field"><label htmlFor="ex-amt">Amount</label><input id="ex-amt" type="number" step="0.01" min="0.01" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="field"><label htmlFor="ex-cur">Currency</label><select id="ex-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>{[...new Set([...CURRENCIES, currency])].map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label htmlFor="ex-date">Date</label><input id="ex-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="ex-cat">Category</label>
            <select id="ex-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              <option value="custom">Something else…</option>
            </select>
          </div>
          {category === "custom" && <div className="field full"><label htmlFor="ex-custom">Category name</label><input id="ex-custom" maxLength={40} required value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Coworking" /></div>}
          <div className="field"><label htmlFor="ex-vendor">Paid to</label><input id="ex-vendor" maxLength={120} value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Canva, Globe, Upwork…" /></div>
          <div className="field"><label htmlFor="ex-client">For a client (optional)</label>
            <select id="ex-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Not for a client</option>
              {clients.filter((c) => c.status !== "Past" || c.id === clientId).map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
            </select>
          </div>
          <div className="field full"><label htmlFor="ex-note">Note</label><input id="ex-note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Yearly plan" /></div>
          <div className="field full">
            <label htmlFor="ex-file">Receipt (PNG, JPG, WebP, HEIC or PDF, up to 10 MB)</label>
            {old && !dropOld && !file ? (
              <div className="row receipt-row">
                <button type="button" className="btn small" onClick={() => openReceipt(old)}><Icon name="file" />View receipt</button>
                <button type="button" className="btn small ghost" onClick={() => setDropOld(true)}>Remove</button>
              </div>
            ) : (
              <input id="ex-file" type="file" accept="image/png,image/jpeg,image/webp,image/heic,.heic,application/pdf" onChange={(e) => pick(e.target.files?.[0])} />
            )}
            {dropOld && !file && <small className="muted">The receipt is removed when you save.</small>}
            {msg && <small className="bad-t" role="alert">{msg}</small>}
          </div>
        </div>
        <div className="modal-foot">
          {expense.id && <button type="button" className="btn danger left" disabled={busy} onClick={remove}>{sure ? "Tap again to delete" : "Delete"}</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

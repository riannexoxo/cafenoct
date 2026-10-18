import { createClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/env";
import { readPaymentEmail } from "@/lib/payment-email";

// Called by the Google Apps Script in your Gmail with one PayPal or Wise email at a time.
// The private key from Settings says whose wallet it is; the database checks it (record_email_payment).
type Body = { id?: string; from?: string; subject?: string; date?: string; day?: string; body?: string };

export async function POST(request: Request) {
  const key = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (key.length < 32 || key.length > 200) return Response.json({ error: "Missing or invalid key." }, { status: 401 });
  const raw = await request.text();
  if (raw.length > 120_000) return Response.json({ error: "Email too large." }, { status: 413 });
  let b: Body;
  try { b = JSON.parse(raw) as Body; } catch { return Response.json({ error: "Bad request." }, { status: 400 }); }
  if (!b.id || !b.from) return Response.json({ error: "Bad request." }, { status: 400 });

  const p = readPaymentEmail(b.from, b.subject ?? "", b.body ?? "");
  if (!p) return Response.json({ ignored: true });

  // The script sends the email's date in your Gmail's time zone; fall back to the UTC date.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.day ?? "") ? b.day! : new Date(b.date && !isNaN(Date.parse(b.date)) ? b.date : Date.now()).toISOString().slice(0, 10);
  const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("record_email_payment", {
    p_key: key, p_ref: `${p.source.toLowerCase()}:${b.id}`, p_source: p.source, p_amount: p.amount, p_currency: p.currency,
    p_payer: p.payer, p_payer_email: p.payerEmail, p_date: date, p_note: p.payer ? `${p.source} payment from ${p.payer}` : `${p.source} payment`,
  });
  if (error) { console.error("inbox rpc", error.message); return Response.json({ error: "Could not record it. It will try again." }, { status: 500 }); }
  const r = data as { error?: string } | null;
  if (r?.error === "unknown key") return Response.json({ error: "This key isn't connected to a CafeNoct account. Make a new one in Settings." }, { status: 401 });
  return Response.json({ ok: true, ...r, amount: p.amount, currency: p.currency, payer: p.payer });
}

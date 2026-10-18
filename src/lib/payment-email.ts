// Reads a PayPal or Wise email and finds money you received: how much, which currency and who sent it.
// Returns null for anything else (money you sent, receipts, requests, marketing).

export type Payment = { source: "PayPal" | "Wise"; amount: number; currency: string; payer: string; payerEmail: string };

const CODES = "USD|PHP|EUR|GBP|AUD|CAD|SGD|NZD|HKD|JPY|CHF|AED";
const SYMBOL: Record<string, string> = { $: "USD", "₱": "PHP", "€": "EUR", "£": "GBP" };
// "$280.00 USD", "280 USD", "USD 280.00", "₱1,500.00"
const AMT = `(?:(${CODES})\\s?)?([$₱€£])?\\s?(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)\\s?(${CODES})?\\b`;
const NAME = `([A-Za-z][\\w.'&-]*(?:[ \\t]+[A-Za-z&][\\w.'&-]*){0,5})`;

const OUTGOING = /\b(you sent|you paid|you've sent|you have sent|your payment to|receipt for your payment|you('ve| have)? (requested|sent a request)|requested money|money request|is on its way to|your transfer to|you('re| are) sending|payment (was )?sent|refund(ed)? to|invoice from|payment reminder|unclaimed)\b/i;

const PATTERNS: { re: RegExp; amt: number; name?: number; nameFirst?: boolean }[] = [
  // "Debbie Williams sent you $280.00 USD" / "Debbie paid you 280 USD"
  { re: new RegExp(`${NAME}\\s+(?:has\\s+)?(?:sent you|paid you)\\s*${AMT}`, "i"), amt: 2, name: 1, nameFirst: true },
  // "You received a payment of $280.00 USD from Debbie Williams" / "You've received 280 USD from DEBBIE WILLIAMS"
  { re: new RegExp(`you(?:'ve| have)?\\s+(?:just\\s+)?(?:got|received)\\s+(?:a payment of\\s+|money[:\\s]+|a transfer of\\s+)?${AMT}(?:\\s+(?:from|by)\\s+${NAME})?`, "i"), amt: 1, name: 5 },
  // "Loretta Dawn paid your invoice INV-003 … Amount received: $280.00 USD"
  { re: new RegExp(`amount received:?\\s*${AMT}`, "i"), amt: 1 },
];

function cleanName(s: string | undefined) {
  if (!s) return "";
  let n = s.replace(/\s+/g, " ").trim().replace(/[.,;:!]+$/, "").replace(/\b(via|on|at|to|for|has|have|and|the)\b.*$/i, "").trim();
  if (/^(you|your|we|paypal|wise|hi|hello|dear)$/i.test(n)) return "";
  if (n === n.toUpperCase()) n = n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return n.slice(0, 80);
}

export function readPaymentEmail(from: string, subject: string, body: string): Payment | null {
  const f = from.toLowerCase();
  const source = /paypal\./.test(f) ? "PayPal" : /wise\.com|transferwise/.test(f) ? "Wise" : null;
  if (!source) return null;
  const text = `${subject}\n${body}`.replace(/ /g, " ").replace(/[ \t]+/g, " ");
  if (OUTGOING.test(subject) || (OUTGOING.test(text.slice(0, 600)) && !/sent you|you('ve| have)? (got|received)/i.test(text.slice(0, 600)))) return null;

  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (!m) continue;
    const g = m.slice(p.nameFirst ? 2 : 1);
    const [code1, sym, num, code2] = [g[0], g[1], g[2], g[3]];
    const amount = Number(num?.replace(/,/g, ""));
    if (!(amount > 0)) continue;
    const currency = (code1 || code2 || (sym ? SYMBOL[sym] : "") || "USD").toUpperCase();
    let payer = cleanName(p.name ? m[p.name] : "");
    if (!payer) payer = cleanName(text.match(new RegExp(`${NAME}\\s+(?:has\\s+)?paid your invoice`, "i"))?.[1]);
    if (!payer) payer = cleanName(text.match(new RegExp(`\\bfrom:?\\s+${NAME}`, "i"))?.[1]);
    const payerEmail = (text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []).find((e) => !/paypal|wise\.com|transferwise|noreply|no-reply/i.test(e)) ?? "";
    return { source, amount, currency, payer, payerEmail: payerEmail.toLowerCase() };
  }
  return null;
}

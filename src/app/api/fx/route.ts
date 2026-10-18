// Live exchange rate, e.g. USD to PHP. Tries Wise's live mid-market rate (what wise.com shows), then Coinbase,
// then the daily European Central Bank rate. Each answer is cached for a minute. With ?amount=, also returns
// what Wise and PayPal would pay out after their fees.
const CODE = /^[A-Z]{3}$/;

async function json(url: string) {
  const r = await fetch(url, { next: { revalidate: 60 }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const from = (q.get("from") ?? "USD").toUpperCase(), to = (q.get("to") ?? "PHP").toUpperCase();
  if (!CODE.test(from) || !CODE.test(to)) return Response.json({ error: "Use 3-letter currency codes." }, { status: 400 });

  let live: { rate: number; source: string; time: number } | null = null;
  try {
    const j = (await json(`https://wise.com/rates/live?source=${from}&target=${to}`)) as { value?: number; time?: number };
    if (j.value) live = { rate: j.value, source: "Wise", time: j.time ?? Date.now() };
  } catch {}
  if (!live) {
    try {
      const j = (await json(`https://api.coinbase.com/v2/exchange-rates?currency=${from}`)) as { data?: { rates?: Record<string, string> } };
      const v = Number(j.data?.rates?.[to]);
      if (v) live = { rate: v, source: "Coinbase", time: Date.now() };
    } catch {}
  }

  // 30 days of daily rates for the trend line (and the fallback if nothing live answered).
  let history: { date: string; rate: number }[] = [];
  try {
    const start = new Date(Date.now() - 31 * 864e5).toISOString().slice(0, 10);
    const r = await fetch(`https://api.frankfurter.dev/v1/${start}..?base=${from}&symbols=${to}`, { next: { revalidate: 21600 }, signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const j = (await r.json()) as { rates?: Record<string, Record<string, number>> };
      history = Object.entries(j.rates ?? {}).map(([date, v]) => ({ date, rate: v[to] })).filter((x) => x.rate);
    }
  } catch {}
  if (!live && history.length) { const last = history[history.length - 1]; live = { rate: last.rate, source: "European Central Bank (daily)", time: Date.parse(last.date) }; }
  if (!live) return Response.json({ error: "Exchange rates aren't available right now." }, { status: 502 });

  // What Wise and PayPal would actually give for an amount, fees included (Wise's public price comparison).
  const amount = Number(q.get("amount"));
  let quotes: { name: string; rate: number; fee: number; receive: number; time: string }[] = [];
  if (amount > 0 && amount <= 1_000_000) {
    try {
      const r = await fetch(`https://api.wise.com/v4/comparisons/?sourceCurrency=${from}&targetCurrency=${to}&sendAmount=${Math.round(amount * 100) / 100}`, { next: { revalidate: 600 }, signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const j = (await r.json()) as { providers?: { alias: string; name: string; quotes?: { rate: number; fee: number; receivedAmount: number; dateCollected: string }[] }[] };
        quotes = (j.providers ?? []).filter((p) => p.alias === "wise" || p.alias === "paypal").flatMap((p) => {
          const x = p.quotes?.[0];
          return x ? [{ name: p.name, rate: x.rate, fee: x.fee, receive: x.receivedAmount, time: x.dateCollected }] : [];
        });
      }
    } catch {}
  }
  return Response.json({ from, to, ...live, history, quotes });
}

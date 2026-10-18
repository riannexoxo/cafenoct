"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { supabase, useRows } from "@/lib/use-rows";
import { parseYmd, today } from "@/lib/dates";
import { money } from "@/lib/format";
import { INVOICE_COLS, METHODS, convert, isOverdue, received, total, type Invoice } from "@/lib/invoices";
import { celebrate } from "@/lib/celebrate";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import InvoiceForm, { type InvoiceDraft } from "./invoice-form";
import ClientAvatar from "./client-avatar";
import Modal from "./modal";
import Icon from "./icon";

type Move = { id: string; kind: "convert" | "withdraw"; moved_on: string; from_currency: string; from_amount: number; to_currency: string | null; to_amount: number | null; method: string; note: string };
type Fx = { rate: number; source: string; time: number; history: { date: string; rate: number }[]; quotes: { name: string; rate: number; fee: number; receive: number }[] };
type Unbilled = { client_id: string | null; minutes: number };
const noop = () => () => {};
const FLAGS: Record<string, string> = { USD: "🇺🇸", PHP: "🇵🇭", AUD: "🇦🇺", CAD: "🇨🇦", GBP: "🇬🇧", EUR: "🇪🇺", NZD: "🇳🇿", SGD: "🇸🇬" };
const NAMES: Record<string, string> = { USD: "US dollar", PHP: "Philippine peso" };
const monthKey = (d: string) => d.slice(0, 7);
const shortDate = (d: string) => parseYmd(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// Your personal wallet: what's come in from every client, in dollars and pesos.
export default function Wallet({ clients, base, rates, from }: { clients: Client[]; base: string; rates: Record<string, number>; from: { name: string; email: string } }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="grid g2">{[0, 1].map((i) => <div key={i} className="card skel" style={{ height: 220 }} />)}</div>;
  return <WalletInner clients={clients} base={base} rates={rates} from={from} />;
}

function WalletInner({ clients, base, rates, from }: { clients: Client[]; base: string; rates: Record<string, number>; from: { name: string; email: string } }) {
  const [invoices, reloadInv] = useRows<Invoice>("wallet-inv", (s) => s.from("invoices").select(INVOICE_COLS).order("issue_date", { ascending: false }), ["invoices"]);
  const [moves, reloadMoves] = useRows<Move>("wallet-moves", (s) => s.from("wallet_moves").select("id,kind,moved_on,from_currency,from_amount,to_currency,to_amount,method,note").order("moved_on", { ascending: false }), ["wallet_moves"]);
  const [unbilled] = useRows<Unbilled>("wallet-unbilled", (s) => s.from("time_entries").select("client_id,minutes").is("invoice_id", null), ["time_entries"]);
  const [form, setForm] = useState<{ inv: InvoiceDraft; mode: "invoice" | "payment" } | null>(null);
  const [move, setMove] = useState<Partial<Move> | null>(null);
  const [fx, setFx] = useState<Fx | null>(null);
  const [amount, setAmount] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const t = today(), year = t.slice(0, 4), month = monthKey(t);
  const inv = invoices ?? [], mv = moves ?? [];
  const paid = inv.filter((i) => i.status === "paid");
  const toBase = (amt: number, cur: string) => convert(amt, cur, base, base, rates);
  const client = (id: string | null) => clients.find((c) => c.id === id);
  const label = (id: string | null) => { const c = client(id); return c ? clientLabel(c) : "Other income"; };
  const color = (id: string | null) => client(id)?.color ?? "var(--accent-soft)";

  // Balances per currency: money received, plus conversions in, minus conversions and withdrawals out.
  const bal: Record<string, number> = { USD: 0, PHP: 0 };
  paid.forEach((i) => { bal[i.currency] = (bal[i.currency] ?? 0) + received(i); });
  mv.forEach((m) => {
    bal[m.from_currency] = (bal[m.from_currency] ?? 0) - Number(m.from_amount);
    if (m.kind === "convert" && m.to_currency && m.to_amount) bal[m.to_currency] = (bal[m.to_currency] ?? 0) + Number(m.to_amount);
  });
  const wallets = Object.keys(bal).filter((c) => c === "USD" || c === "PHP" || Math.abs(bal[c]) > 0.004);

  const paidOn = (i: Invoice) => i.paid_date ?? i.issue_date;
  const inMonth = paid.filter((i) => monthKey(paidOn(i)) === month).reduce((a, i) => a + toBase(received(i), i.currency), 0);
  const prevMonth = (() => { const d = parseYmd(`${month}-01`); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
  const lastMonth = paid.filter((i) => monthKey(paidOn(i)) === prevMonth).reduce((a, i) => a + toBase(received(i), i.currency), 0);
  const inYear = paid.filter((i) => paidOn(i).startsWith(year)).reduce((a, i) => a + toBase(received(i), i.currency), 0);
  const waitingList = inv.filter((i) => i.status === "sent");
  const waiting = waitingList.reduce((a, i) => a + toBase(total(i), i.currency), 0);
  const unbilledWorth = (unbilled ?? []).reduce((a, e) => { const c = client(e.client_id); return a + (c?.rate_type === "Hourly" && c.rate ? toBase((e.minutes / 60) * c.rate, c.currency) : 0); }, 0);

  // Live rate (and Wise vs PayPal) for the converter, refreshed every minute.
  const amt = Number(amount) || Math.max(100, Math.round(bal.USD > 0 ? bal.USD : 1000));
  useEffect(() => {
    let alive = true;
    const load = () => fetch(`/api/fx?from=USD&to=PHP&amount=${amt}`).then((r) => (r.ok ? r.json() : null)).then((j: Fx | null) => { if (alive && j?.rate) setFx(j); }).catch(() => {});
    const first = setTimeout(load, 350);
    const i = setInterval(load, 60000);
    return () => { alive = false; clearTimeout(first); clearInterval(i); };
  }, [amt]);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(i); }, []);
  const php = fx?.rate ?? rates.PHP ?? 0;
  const ago = fx ? Math.max(0, Math.round((now - fx.time) / 1000)) : 0;
  const agoText = !fx ? "" : ago < 90 ? "just now" : ago < 3600 ? `${Math.round(ago / 60)} min ago` : ago < 172800 ? `${Math.round(ago / 3600)}h ago` : "a few days ago";

  // Last 12 months, stacked by client, in your base currency.
  const months = [...Array(12)].map((_, i) => { const d = parseYmd(`${month}-01`); d.setMonth(d.getMonth() - 11 + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const byMonth = months.map((m) => {
    const segs = new Map<string, number>();
    paid.filter((i) => monthKey(paidOn(i)) === m).forEach((i) => segs.set(i.client_id ?? "", (segs.get(i.client_id ?? "") ?? 0) + toBase(received(i), i.currency)));
    return { m, segs: [...segs.entries()], tot: [...segs.values()].reduce((a, b) => a + b, 0) };
  });
  const byClient = new Map<string, number>();
  paid.filter((i) => paidOn(i).startsWith(year)).forEach((i) => byClient.set(i.client_id ?? "", (byClient.get(i.client_id ?? "") ?? 0) + toBase(received(i), i.currency)));
  const ranked = [...byClient.entries()].sort((a, b) => b[1] - a[1]);

  // Everything that happened, newest first.
  type Act = { key: string; date: string; kind: "in" | "wait" | "move"; title: string; detail: string; amount: string; tone: string; open: () => void; clientId?: string | null };
  const acts: Act[] = [
    ...paid.map((i): Act => ({ key: i.id, date: paidOn(i), kind: "in", title: label(i.client_id), detail: [i.number, i.method && `via ${i.method}`].filter(Boolean).join(" · "), amount: `+${money(received(i), i.currency)}`, tone: "good", clientId: i.client_id, open: () => setForm({ mode: i.number.startsWith("PAY") ? "payment" : "invoice", inv: i }) })),
    ...waitingList.map((i): Act => ({ key: i.id, date: i.issue_date, kind: "wait", title: label(i.client_id), detail: `${i.number} · ${isOverdue(i, t) ? "overdue" : i.due_date ? `due ${shortDate(i.due_date)}` : "sent"}`, amount: money(total(i), i.currency), tone: isOverdue(i, t) ? "bad" : "warn", clientId: i.client_id, open: () => setForm({ mode: "invoice", inv: i }) })),
    ...mv.map((m): Act => ({ key: m.id, date: m.moved_on, kind: "move", title: m.kind === "convert" ? `Converted to ${m.to_currency}` : "Withdrew", detail: [m.method, m.note].filter(Boolean).join(" · "), amount: m.kind === "convert" ? `${money(Number(m.from_amount), m.from_currency)} → ${money(Number(m.to_amount), m.to_currency ?? "PHP")}` : `−${money(Number(m.from_amount), m.from_currency)}`, tone: "", open: () => setMove(m) })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25);

  const loading = !invoices || !moves;
  const change = lastMonth ? Math.round(((inMonth - lastMonth) / lastMonth) * 100) : null;

  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: -8 }}>
        <button className="btn" onClick={() => setMove({ kind: "convert", from_currency: "USD", to_currency: "PHP" })}><Icon name="repeat" />Convert</button>
        <button className="btn" onClick={() => setForm({ mode: "invoice", inv: {} })}><Icon name="file" />New invoice</button>
        <button className="btn solid" onClick={() => setForm({ mode: "payment", inv: {} })}><Icon name="plus" />Money received</button>
      </div>

      <div className="wallets">
        {wallets.map((cur, n) => (
          <div key={cur} className={`wcard${n === 0 ? " main" : ""}`}>
            <div className="wcard-top"><span className="wflag" aria-hidden="true">{FLAGS[cur] ?? "💱"}</span><span>{cur} wallet<small>{NAMES[cur] ?? cur}</small></span></div>
            <div className="wbal num">{loading ? "…" : money(bal[cur] ?? 0, cur)}</div>
            <div className="wsub">
              {cur === "USD" && php ? <>≈ {money((bal.USD ?? 0) * php, "PHP")} at today&apos;s rate</> : cur === "PHP" && php ? <>≈ {money((bal.PHP ?? 0) / php, "USD")}</> : null}
            </div>
            <div className="row" style={{ gap: 6 }}>
              {cur !== "PHP" && <button className="btn small" onClick={() => setMove({ kind: "convert", from_currency: cur, to_currency: "PHP" })}><Icon name="repeat" />To PHP</button>}
              <button className="btn small ghost" onClick={() => setMove({ kind: "withdraw", from_currency: cur })}>Withdraw</button>
            </div>
          </div>
        ))}
        <div className="wcard rate">
          <div className="wcard-top"><span className="wflag" aria-hidden="true">💱</span><span>USD to PHP<small>{fx ? `${fx.source} · ${agoText}` : "Getting the live rate…"}</small></span></div>
          <div className="wbal num">{php ? `₱${php.toFixed(2)}` : "…"}</div>
          <Spark history={fx?.history ?? []} live={php} />
        </div>
      </div>

      <div className="stats">
        <div className="stat"><span className="k">Received in {parseYmd(`${month}-01`).toLocaleDateString("en-US", { month: "long" })}</span><span className="v">{money(inMonth, base)}</span><span className="s">{change === null ? "this month" : `${change >= 0 ? "+" : ""}${change}% vs last month`}</span></div>
        <div className="stat"><span className="k">This year</span><span className="v">{money(inYear, base)}</span><span className="s">≈ {money(inYear * php, "PHP")}</span></div>
        <div className="stat"><span className="k">Waiting on</span><span className="v">{money(waiting, base)}</span><span className="s">{waitingList.length} invoice{waitingList.length === 1 ? "" : "s"} sent</span></div>
        <div className="stat"><span className="k">Ready to bill</span><span className="v">{money(unbilledWorth, base)}</span><span className="s">unbilled hours</span></div>
      </div>

      <div className="grid g2" style={{ gridTemplateColumns: "1.6fr 1fr", alignItems: "start" }}>
        <div className="card">
          <h3><span>Money in, last 12 months</span><span className="muted num">{money(byMonth.reduce((a, x) => a + x.tot, 0), base)}</span></h3>
          <IncomeChart data={byMonth} color={color} label={label} base={base} current={month} />
        </div>
        <div className="card">
          <h3><span>Wise or PayPal?</span></h3>
          <div className="field" style={{ marginBottom: 10 }}>
            <label htmlFor="fx-amt">If you convert</label>
            <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}><input id="fx-amt" className="search" style={{ width: "100%" }} type="number" min="1" inputMode="decimal" placeholder={String(amt)} value={amount} onChange={(e) => setAmount(e.target.value)} /><span className="muted">USD</span></div>
          </div>
          {fx?.quotes?.length ? (
            <div className="list">
              {[...fx.quotes].sort((a, b) => b.receive - a.receive).map((q, i, all) => (
                <div className="li quote" key={q.name}>
                  <span className="t">{q.name}{i === 0 && all.length > 1 && <span className="pill good" style={{ marginLeft: 6 }}>Best</span>}<small>Rate {q.rate.toFixed(2)} · fee {money(q.fee, "USD")}</small></span>
                  <span className="num" style={{ textAlign: "right" }}>{money(q.receive, "PHP")}{i === 0 && all.length > 1 && <small className="good-t">+{money(q.receive - all[all.length - 1].receive, "PHP")} more</small>}</span>
                </div>
              ))}
            </div>
          ) : <p className="small muted">{fx ? "Wise and PayPal prices aren't available right now." : "Checking Wise and PayPal…"}</p>}
          <p className="small muted" style={{ margin: "10px 0 0" }}>What you&apos;d get in pesos after each one&apos;s fees, from Wise&apos;s public price comparison. PayPal shows its send-money price; withdrawals can differ slightly.</p>
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <h3><span>By client in {year}</span></h3>
          {ranked.length ? <div className="list">{ranked.map(([id, v]) => {
            const c = client(id || null);
            const row = (
              <>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  {c ? <ClientAvatar c={c} size={26} /> : <span className="cdot" style={{ background: color(null) }} />}
                  <span className="grow" style={{ minWidth: 0, overflowWrap: "anywhere" }}>{label(id || null)}</span>
                  <span className="num small">{money(v, base)} <span className="muted">· {Math.round((v / inYear) * 100)}%</span></span>
                </div>
                <div className="bar"><i style={{ width: `${(v / ranked[0][1]) * 100}%`, background: color(id || null) }} /></div>
              </>
            );
            const style = { flexDirection: "column", alignItems: "stretch", gap: 6 } as const;
            return c ? <Link key={id} href={`/clients/${c.id}/invoices`} className="li click" style={style}>{row}</Link> : <div key="other" className="li" style={style}>{row}</div>;
          })}</div> : <div className="empty"><b>Nothing received yet this year</b><span>Mark an invoice paid or record money received and it shows up here.</span></div>}
        </div>
        <div className="card">
          <h3><span>Activity</span></h3>
          {acts.length ? <div className="list">{acts.map((a) => (
            <button key={a.key} className="li click act" onClick={a.open}>
              <span className={`act-ico ${a.kind}`} aria-hidden="true">{a.kind === "in" ? <Icon name="plus" size={14} /> : a.kind === "wait" ? <Icon name="schedule" size={14} /> : <Icon name="repeat" size={14} />}</span>
              <span className="t">{a.title}<small>{shortDate(a.date)}{a.detail ? ` · ${a.detail}` : ""}</small></span>
              <span className={`num small ${a.tone ? `${a.tone}-t` : ""}`}>{a.amount}</span>
            </button>
          ))}</div> : <div className="empty"><b>No activity yet</b><span>Payments, invoices waiting to be paid and conversions show here.</span></div>}
        </div>
      </div>

      {form && <InvoiceForm inv={form.inv} mode={form.mode} clients={clients} existing={inv} from={from} onClose={() => setForm(null)} onSaved={reloadInv} />}
      {move && <MoveForm move={move} fx={fx} balances={bal} onClose={() => setMove(null)} onSaved={reloadMoves} />}
    </>
  );
}

function Spark({ history, live }: { history: { date: string; rate: number }[]; live: number }) {
  const pts = [...history.map((h) => h.rate), ...(live ? [live] : [])];
  if (pts.length < 2) return <div style={{ height: 44 }} />;
  const W = 220, H = 44, min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 4 - ((v - min) / span) * (H - 8)]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const diff = pts[pts.length - 1] - pts[0];
  return (
    <div className="spark">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true">
        <path d={`${d} L${W},${H} L0,${H} Z`} className="spark-fill" />
        <path d={d} className="spark-line" pathLength={1} />
        <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="3" className="spark-dot" />
      </svg>
      <small className={diff >= 0 ? "good-t" : "bad-t"}>{diff >= 0 ? "▲" : "▼"} ₱{Math.abs(diff).toFixed(2)} in 30 days</small>
    </div>
  );
}

function IncomeChart({ data, color, label, base, current }: { data: { m: string; segs: [string, number][]; tot: number }[]; color: (id: string | null) => string; label: (id: string | null) => string; base: string; current: string }) {
  const W = 640, H = 220, P = { l: 44, r: 8, t: 12, b: 26 };
  const max = Math.max(...data.map((x) => x.tot), 1);
  const step = [50, 100, 250, 500, 1000, 2500, 5000].find((s) => max / s <= 5) ?? 10000;
  const top = Math.ceil(max / step) * step || step;
  const y = (v: number) => P.t + (H - P.t - P.b) * (1 - v / top);
  const bw = (W - P.l - P.r) / data.length;
  return (
    <svg className="chart week-chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Money received per month">
      {[...Array(Math.round(top / step) + 1)].map((_, i) => <g key={i}><line className="gl" x1={P.l} x2={W - P.r} y1={y(i * step)} y2={y(i * step)} /><text x={P.l - 6} y={y(i * step) + 3} textAnchor="end">{money(i * step, base).replace(".00", "")}</text></g>)}
      {data.map((x, i) => {
        const cx = P.l + i * bw + bw * 0.2, w = bw * 0.6;
        let acc = 0;
        return (
          <g key={x.m} style={{ ["--i" as string]: i }}>
            {x.segs.map(([id, v]) => { const a = acc; acc += v; return <rect key={id} className="bv" x={cx} y={y(acc)} width={w} height={Math.max(0, y(a) - y(acc))} rx={3} fill={color(id || null)}><title>{`${label(id || null)}: ${money(v, base)}`}</title></rect>; })}
            <text x={cx + w / 2} y={H - 8} textAnchor="middle" style={x.m === current ? { fill: "var(--ink)" } : undefined}>{parseYmd(`${x.m}-01`).toLocaleDateString("en-US", { month: "short" })}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Convert between your wallets (USD to PHP) or record a withdrawal.
function MoveForm({ move, fx, balances, onClose, onSaved }: { move: Partial<Move>; fx: Fx | null; balances: Record<string, number>; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<Move["kind"]>(move.kind ?? "convert");
  const [fromCur, setFromCur] = useState(move.from_currency ?? "USD");
  const [fromAmt, setFromAmt] = useState(move.from_amount != null ? String(move.from_amount) : "");
  const [toCur] = useState(move.to_currency ?? "PHP");
  const [toAmt, setToAmt] = useState(move.to_amount != null ? String(move.to_amount) : "");
  const [method, setMethod] = useState(move.method ?? "Wise");
  const [date, setDate] = useState(move.moved_on ?? today());
  const [note, setNote] = useState(move.note ?? "");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);

  // Estimate what lands, using the chosen service's price (fees included) when we have it.
  const q = fx?.quotes?.find((x) => x.name.toLowerCase() === method.toLowerCase());
  const per = q ? q.receive / (q.receive / q.rate + q.fee) : fx?.rate ?? 0;
  const estimate = fromCur === "USD" && toCur === "PHP" && Number(fromAmt) > 0 && per ? Math.round(Number(fromAmt) * per * 100) / 100 : 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const a = Number(fromAmt);
    if (!(a > 0)) return toast("Enter an amount.");
    const got = kind === "convert" ? Number(toAmt || estimate) : null;
    if (kind === "convert" && !(got! > 0)) return toast(`Enter how much ${toCur} you received.`);
    setBusy(true);
    const row = { kind, moved_on: date, from_currency: fromCur, from_amount: a, to_currency: kind === "convert" ? toCur : null, to_amount: got, method, note: note.trim() };
    const { error } = move.id ? await supabase().from("wallet_moves").update(row).eq("id", move.id) : await supabase().from("wallet_moves").insert(row);
    setBusy(false);
    if (error) return toast("Could not save. Check your connection.");
    if (!move.id && kind === "convert") celebrate({ amount: got!, currency: toCur, title: `Added to your ${toCur} wallet`, detail: `${money(a, fromCur)} via ${method}` });
    else toast(move.id ? "Saved" : `Withdrawal of ${money(a, fromCur)} recorded`);
    onSaved();
    onClose();
  }
  async function remove() {
    if (!move.id) return;
    if (!sure) return setSure(true);
    const { error } = await supabase().from("wallet_moves").delete().eq("id", move.id);
    if (error) return toast("Could not delete. Try again.");
    toast("Deleted");
    onSaved();
    onClose();
  }

  return (
    <Modal label={kind === "convert" ? "Convert" : "Withdraw"} onClose={onClose}>
      <form onSubmit={save} style={{ display: "contents" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>{kind === "convert" ? `Convert ${fromCur} to ${toCur}` : `Withdraw ${fromCur}`}</h2>
          {!move.id && <div className="seg" role="group" aria-label="Type"><button type="button" className={kind === "convert" ? "on" : ""} onClick={() => setKind("convert")} style={kind === "convert" ? { background: "var(--card)" } : undefined}>Convert</button><button type="button" className={kind === "withdraw" ? "on" : ""} onClick={() => setKind("withdraw")} style={kind === "withdraw" ? { background: "var(--card)" } : undefined}>Withdraw</button></div>}
        </div>
        <div className="form">
          <div className="field"><label htmlFor="mv-from">From</label><select id="mv-from" value={fromCur} onChange={(e) => setFromCur(e.target.value)}>{Object.keys(balances).map((c) => <option key={c} value={c}>{c} wallet ({money(balances[c], c)})</option>)}</select></div>
          <div className="field"><label htmlFor="mv-amt">Amount ({fromCur})</label><input id="mv-amt" type="number" step="0.01" min="0" required value={fromAmt} onChange={(e) => setFromAmt(e.target.value)} /></div>
          <div className="field"><label htmlFor="mv-method">{kind === "convert" ? "Converted with" : "Withdrew to"}</label><select id="mv-method" value={method} onChange={(e) => setMethod(e.target.value)}>{(kind === "convert" ? ["Wise", "PayPal", "Payoneer", "GCash", "Other"] : [...METHODS, "Bank", "GCash", "Maya"].filter((v, i, a) => a.indexOf(v) === i)).map((m) => <option key={m}>{m}</option>)}</select></div>
          <div className="field"><label htmlFor="mv-date">Date</label><input id="mv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          {kind === "convert" && (
            <div className="field full"><label htmlFor="mv-to">You received ({toCur})</label><input id="mv-to" type="number" step="0.01" min="0" value={toAmt} placeholder={estimate ? String(estimate) : ""} onChange={(e) => setToAmt(e.target.value)} />
              {estimate > 0 && <small className="muted">About {money(estimate, toCur)} with {method} right now. Type the exact amount you got.</small>}
            </div>
          )}
          <div className="field full"><label htmlFor="mv-note">Note</label><input id="mv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "convert" ? "October pay" : "Rent, savings…"} /></div>
        </div>
        <div className="modal-foot">
          {move.id && <button type="button" className="btn danger left" onClick={remove}>{sure ? "Tap again to delete" : "Delete"}</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

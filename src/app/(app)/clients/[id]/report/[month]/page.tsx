/* eslint-disable @next/next/no-img-element -- covers are the original files; next/image would recompress them. */
import "@/styles/portal.css";
import "@/styles/report-cover.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClients, getProfile } from "@/lib/data";
import { clientLabel } from "@/lib/types";
import { money } from "@/lib/format";
import { pad } from "@/lib/dates";
import { total, type Item } from "@/lib/invoices";
import { METRICS, compact, totals, type Stats } from "@/lib/posts";
import { safeHref } from "@/lib/portal";
import { brand } from "@/brand";
import ClientAvatar from "@/components/client-avatar";
import MediaThumb from "@/components/media-thumb";
import Icon from "@/components/icon";
import Nocti from "@/components/nocti";
import { IntroNote, MonthSwitch, SavePdf } from "@/components/report-tools";

export const metadata = { title: "Monthly report" };

type Post = { id: string; title: string; caption: string; publish_on: string; platforms: string[]; media: string[]; stats: Record<string, Stats>; format: string };
type Dlv = { id: string; title: string; type: string; delivered_at: string; files: { path: string; type: string }[] | null; canva: { thumb?: string } | null };
type Inv = { id: string; number: string; issue_date: string; paid_date: string | null; currency: string; status: string; items: Item[] };
const day = (s: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const sumBy = (list: Inv[]) => Object.entries(list.reduce<Record<string, number>>((a, i) => ({ ...a, [i.currency]: (a[i.currency] ?? 0) + total(i) }), {}));

// One printable page for the client: what got done this month, from real records.
export default async function MonthlyReport({ params }: { params: Promise<{ id: string; month: string }> }) {
  const { id, month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  const [clients, profile] = await Promise.all([getClients(), getProfile()]);
  const c = clients.find((x) => x.id === id);
  if (!c) notFound();
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`, next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  const title = new Date(y, m - 1, 15).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  // shortcut: month edges for timestamps are midnight UTC, not the VA's own time zone; fine for a monthly summary.
  const sb = await createClient();
  const [time, tasks, posts, dlv, issued, paid] = await Promise.all([
    sb.from("time_entries").select("minutes").eq("client_id", id).gte("started_at", start).lt("started_at", next).limit(5000),
    sb.from("tasks").select("id,title,done_at").eq("client_id", id).eq("status", "done").gte("done_at", start).lt("done_at", next).order("done_at").limit(300),
    sb.from("posts").select("id,title,caption,publish_on,platforms,media,stats,format").eq("client_id", id).eq("status", "Posted").gte("publish_on", start).lt("publish_on", next).order("publish_on").limit(200),
    sb.from("deliverables").select("id,title,type,delivered_at,files,canva").eq("client_id", id).eq("status", "delivered").gte("delivered_at", start).lt("delivered_at", next).order("delivered_at").limit(100),
    sb.from("invoices").select("id,number,issue_date,paid_date,currency,status,items").eq("client_id", id).neq("status", "draft").gte("issue_date", start).lt("issue_date", next).order("issue_date").limit(100),
    sb.from("invoices").select("id,number,issue_date,paid_date,currency,status,items").eq("client_id", id).eq("status", "paid").gte("paid_date", start).lt("paid_date", next).order("paid_date").limit(100),
  ]);
  const minutes = ((time.data ?? []) as { minutes: number }[]).reduce((a, r) => a + (r.minutes || 0), 0);
  const doneTasks = (tasks.data ?? []) as { id: string; title: string; done_at: string }[];
  const postList = (posts.data ?? []) as Post[];
  const dlvList = (dlv.data ?? []) as Dlv[];
  const issuedList = (issued.data ?? []) as Inv[], paidList = (paid.data ?? []) as Inv[];
  const stat = postList.reduce<Stats>((a, p) => { Object.entries(totals(p)).forEach(([k, v]) => { a[k] = (a[k] || 0) + v; }); return a; }, {});
  const statList = METRICS.filter((x) => stat[x.key] > 0);

  const coverPath = (d: Dlv) => (d.files ?? []).findLast((f) => f.type.startsWith("image/") && f.type !== "image/tiff")?.path ?? d.canva?.thumb ?? "";
  const paths = dlvList.map(coverPath).filter(Boolean);
  const { data: signed } = paths.length ? await sb.storage.from("work-files").createSignedUrls(paths, 3600) : { data: [] };
  const covers = Object.fromEntries((signed ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path as string, s.signedUrl as string]));
  const from = profile?.business || profile?.name || "";
  const hours = (minutes / 60).toFixed(minutes % 60 ? 1 : 0);
  const nothing = !minutes && !doneTasks.length && !postList.length && !dlvList.length && !issuedList.length && !paidList.length;

  return (
    <div className="rpt-page">
      <div className="rpt-tools row">
        <Link href={`/clients/${id}`} className="btn ghost"><Icon name="left" />{clientLabel(c)}</Link>
        <span className="grow" />
        <MonthSwitch clientId={id} month={month} />
        <SavePdf />
      </div>

      <article className="rpt-doc" style={{ ["--c" as string]: c.color || "var(--accent)" }}>
        {/* Cover: prints as its own page, so the report opens like a proper document. */}
        <section className="rpt-front" aria-label="Report cover">
          {from && <div className="rpt-front-from">{from}</div>}
          <ClientAvatar c={c} size={112} />
          <div className="eyebrow">Monthly report</div>
          <h1>{clientLabel(c)}</h1>
          <p className="rpt-front-month">{title}</p>
          <dl className="rpt-front-kpis">
            <div><dt>Hours</dt><dd className="num">{hours}</dd></div>
            <div><dt>Tasks done</dt><dd className="num">{doneTasks.length}</dd></div>
            {postList.length || !dlvList.length
              ? <div><dt>Posts published</dt><dd className="num">{postList.length}</dd></div>
              : <div><dt>Delivered</dt><dd className="num">{dlvList.length}</dd></div>}
          </dl>
        </section>
        <header className="rpt-head">
          <div className="row" style={{ gap: 14, flexWrap: "nowrap", minWidth: 0 }}>
            <ClientAvatar c={c} size={52} />
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow">Monthly report · {title}</div>
              <h1>{clientLabel(c)}</h1>
            </div>
          </div>
          <div className="rpt-from">
            {from && <b>{from}</b>}
            <span className="muted small"><img src={brand.logo} alt="" width={16} height={16} />Made with {brand.name}</span>
          </div>
        </header>

        <IntroNote placeholder={`Here's what we got done together in ${title.split(" ")[0]}. Thank you for another great month!`} />

        <section className="rpt-kpis" aria-label="This month in numbers">
          <div className="note note-blush"><span>Hours</span><b className="num">{hours}</b></div>
          <div className="note note-mint"><span>Tasks done</span><b className="num">{doneTasks.length}</b></div>
          <div className="note note-lav"><span>Posts published</span><b className="num">{postList.length}</b></div>
          <div className="note note-cream"><span>Delivered</span><b className="num">{dlvList.length}</b></div>
          <div className="note note-butter"><span>Invoiced</span><b className="num">{issuedList.length ? sumBy(issuedList).map(([cur, n]) => money(n, cur)).join(" + ") : "None"}</b></div>
        </section>

        {nothing && (
          <div className="empty"><Nocti size={64} /><b>Nothing logged for {title} yet.</b><span>Pick another month above.</span></div>
        )}

        {doneTasks.length > 0 && (
          <section className="rpt-sec">
            <h2>Tasks completed</h2>
            <ul className="rpt-tasks">{doneTasks.map((t) => <li key={t.id}><Icon name="check" size={14} /><span className="grow">{t.title}</span><span className="muted small">{day(t.done_at)}</span></li>)}</ul>
          </section>
        )}

        {postList.length > 0 && (
          <section className="rpt-sec">
            <h2>Posts published</h2>
            {statList.length > 0 && <div className="rpt-stats">{statList.map((x) => <span key={x.key}><b className="num">{compact(stat[x.key])}</b>{x.label}</span>)}</div>}
            <div className="rpt-posts">
              {postList.map((p) => {
                const cover = (p.media ?? []).find((u) => safeHref(u));
                return (
                  <figure key={p.id}>
                    <div className="rpt-cover">{cover ? <MediaThumb src={cover} /> : <Icon name="content" size={22} />}</div>
                    <figcaption><b>{p.title || p.caption?.slice(0, 48) || "Post"}</b><span className="muted">{day(p.publish_on)}{p.platforms?.length ? ` · ${p.platforms.join(", ")}` : ""}</span></figcaption>
                  </figure>
                );
              })}
            </div>
          </section>
        )}

        {dlvList.length > 0 && (
          <section className="rpt-sec">
            <h2>Delivered</h2>
            <div className="rpt-posts">
              {dlvList.map((d) => (
                <figure key={d.id}>
                  <div className="rpt-cover">{covers[coverPath(d)] ? <img src={covers[coverPath(d)]} alt="" /> : <Icon name="file" size={22} />}</div>
                  <figcaption><b>{d.title}</b><span className="muted">{[d.type, day(d.delivered_at)].filter(Boolean).join(" · ")}</span></figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {(issuedList.length > 0 || paidList.length > 0) && (
          <section className="rpt-sec">
            <h2>Invoices</h2>
            <table className="rpt-inv">
              <thead><tr><th>Invoice</th><th>Issued</th><th>Status</th><th className="r">Total</th></tr></thead>
              <tbody>{[...new Map([...issuedList, ...paidList].map((i) => [i.id, i])).values()].map((i) => (
                <tr key={i.id}><td className="num">{i.number}</td><td>{day(i.issue_date)}</td><td>{i.status === "paid" ? `Paid ${i.paid_date ? day(i.paid_date) : ""}` : "Sent"}</td><td className="r num">{money(total(i), i.currency)}</td></tr>
              ))}</tbody>
            </table>
            {paidList.length > 0 && <p className="small muted">Paid this month: {sumBy(paidList).map(([cur, n]) => money(n, cur)).join(" + ")}. Thank you!</p>}
          </section>
        )}

        <footer className="rpt-foot muted small">{from ? `${from} · ` : ""}{title} · {clientLabel(c)}</footer>
      </article>
    </div>
  );
}

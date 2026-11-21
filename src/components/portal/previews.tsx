/* eslint-disable @next/next/no-img-element -- previews are the original files; next/image would recompress them. */
// What a client sees of one item: files, links, a post's media and caption, a read-only invoice, the shared comments.
// Plain components (no hooks), used by the portal and the no-login approval page.
import MediaThumb from "@/components/media-thumb";
import { money } from "@/lib/format";
import { total } from "@/lib/invoices";
import { platform } from "@/lib/posts";
import { fileKind, niceDate, niceTime, safeHref, type PComment, type PDeliverable, type PInvoice, type PPost } from "@/lib/portal";
import Icon from "@/components/icon";

export function Files({ files, urls }: { files: PDeliverable["files"]; urls: Record<string, string> }) {
  const list = (files ?? []).filter((f) => urls[f.path]);
  if (!list.length) return null;
  return (
    <div className="pt-files">
      {list.map((f) => {
        const url = urls[f.path], kind = fileKind(f.type);
        return (
          <figure key={f.path} className={`pt-file ${kind}`}>
            {kind === "image" ? <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${f.name} full size`}><img src={url} alt={f.name} loading="lazy" /></a>
              : kind === "video" ? <video src={url} controls playsInline preload="metadata" aria-label={f.name} />
                : <a className="pt-doc" href={url} target="_blank" rel="noopener noreferrer"><Icon name="file" size={28} /><span>Open</span></a>}
            <figcaption>{f.name}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}

export function LinkButtons({ links }: { links: PDeliverable["links"] }) {
  const all: [string, string][] = [["final", "Open the final files"], ["work", "See the work in progress"], ["ref", "References"]];
  const list = all.map(([k, label]) => [safeHref(links?.[k as "final"]), label] as const).filter(([u]) => u);
  if (!list.length) return null;
  return (
    <div className="row pt-links">
      {list.map(([u, label], i) => <a key={label} className={`btn${i === 0 ? " solid" : ""}`} href={u} target="_blank" rel="noopener noreferrer"><Icon name="link" />{label}</a>)}
    </div>
  );
}

export function DeliverablePreview({ d, urls }: { d: PDeliverable; urls: Record<string, string> }) {
  const meta = [d.type, d.size, d.length].filter(Boolean).join(" · ");
  return (
    <div className="pt-preview">
      {meta && <div className="small muted">{meta}</div>}
      <Files files={d.files} urls={urls} />
      <LinkButtons links={d.links} />
      {d.brief?.trim() && <div className="pt-brief"><b>The brief</b><p>{d.brief}</p></div>}
    </div>
  );
}

export function Platforms({ list }: { list: string[] | null }) {
  if (!list?.length) return null;
  return (
    <div className="row pt-chips">
      {list.map((n) => <span key={n} className="pt-chip" style={{ ["--pc" as string]: platform(n)?.color ?? "var(--muted)" }}><i />{n}</span>)}
    </div>
  );
}

export function PostPreview({ p }: { p: PPost }) {
  const media = (p.media ?? []).filter((u) => safeHref(u));
  const when = [niceDate(p.publish_on), niceTime(p.publish_at)].filter(Boolean).join(" at ");
  return (
    <div className="pt-preview">
      {media.length > 0 && (
        <div className="pt-carousel" role="group" aria-label={media.length > 1 ? `${media.length} photos or videos, swipe to see them all` : "Post media"} tabIndex={0}>
          {media.map((u, i) => <div key={u + i} className="pt-slide"><MediaThumb src={u} /></div>)}
        </div>
      )}
      {media.length > 1 && <div className="small muted pt-swipe">Swipe to see all {media.length}</div>}
      <div className="row" style={{ gap: 8 }}>
        <Platforms list={p.platforms} />
        {p.format && <span className="pill">{p.format}</span>}
        {when && <span className="pill blush"><Icon name="content" size={12} />{when}</span>}
      </div>
      {p.caption?.trim() && <p className="pt-caption">{p.caption}</p>}
      {p.hashtags?.trim() && <p className="pt-tags">{p.hashtags}</p>}
    </div>
  );
}

export function InvoiceView({ inv, from, to }: { inv: PInvoice; from: string; to: string }) {
  const sum = total(inv);
  return (
    <div className="pt-invoice">
      <div className="pt-inv-top">
        <div><span className="k">From</span><b>{from}</b></div>
        <div><span className="k">To</span><b>{to}</b></div>
        <div><span className="k">Issued</span><b>{niceDate(inv.issue_date, true)}</b></div>
        {inv.due_date && <div><span className="k">Due</span><b>{niceDate(inv.due_date, true)}</b></div>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>What</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Amount</th></tr></thead>
          <tbody>{(inv.items ?? []).map((i, n) => (
            <tr key={n}><td>{i.desc}</td><td className="r num">{i.qty}</td><td className="r num">{money(Number(i.rate), inv.currency)}</td><td className="r num">{money(Number(i.qty) * Number(i.rate), inv.currency)}</td></tr>
          ))}</tbody>
          <tfoot><tr><td colSpan={3} className="r">Total</td><td className="r num">{money(sum, inv.currency)}</td></tr></tfoot>
        </table>
      </div>
      {inv.status === "paid" && <p className="pt-paid"><Icon name="check" size={14} />Paid{inv.paid_date ? ` on ${niceDate(inv.paid_date, true)}` : ""}. Thank you!</p>}
    </div>
  );
}

export function Thread({ comments, owner }: { comments: PComment[]; owner: string }) {
  if (!comments.length) return null;
  return (
    <ol className="pt-thread" aria-label="Comments">
      {comments.map((c, i) => (
        <li key={c.id ?? i} className={c.author === "client" ? "you" : "them"}>
          <div className="pt-bubble">
            <div className="pt-who">{c.author === "client" ? c.author_name || "Client" : owner}<span>{niceDate(c.created_at)}</span></div>
            <p>{c.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

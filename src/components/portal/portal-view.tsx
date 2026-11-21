"use client";

/* eslint-disable @next/next/no-img-element -- previews are the original files; next/image would recompress them. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/use-rows";
import { money } from "@/lib/format";
import { total } from "@/lib/invoices";
import { today } from "@/lib/dates";
import {
  DLV_TONE, DLV_WORDS, POST_TONE, POST_WORDS, UPDATE_WORDS, fileKind, needsDeliverable, needsPost, niceDate, safeHref,
  type PDeliverable, type PPost, type PortalData,
} from "@/lib/portal";
import Modal from "@/components/modal";
import Icon from "@/components/icon";
import Nocti from "@/components/nocti";
import MediaThumb from "@/components/media-thumb";
import DecisionBox, { friendly, type Decision } from "./decide";
import { DeliverablePreview, InvoiceView, Platforms, PostPreview, Thread } from "./previews";

type Tab = "overview" | "work" | "posts" | "invoices";
type Open = { kind: "deliverable" | "post"; id: string } | null;

export default function PortalView({ data, urls }: { data: PortalData; urls: Record<string, string> }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [open, setOpen] = useState<Open>(null);
  const owner = data.owner || "Your team", clientName = data.client.company || data.client.name;
  const thread = (id: string) => data.comments.filter((c) => c.entity_id === id);
  const waitD = data.deliverables.filter(needsDeliverable), waitP = data.posts.filter(needsPost);
  const unpaid = data.invoices.filter((i) => i.status === "sent");
  const t = today();

  const send = (entity: "deliverable" | "post", id: string) => async (d: Decision, comment: string) => {
    const { error } = await supabase().rpc("portal_decide", { p_entity: entity, p_id: id, p_decision: d, p_comment: comment });
    return error ? friendly(error.message) : null;
  };

  const tabs: [Tab, string, number][] = [
    ["overview", "Overview", 0], ["work", "Deliverables", waitD.length], ["posts", "Posts", waitP.length], ["invoices", "Invoices", unpaid.length],
  ];

  const dCard = (d: PDeliverable) => {
    const cover = (d.files ?? []).findLast((f) => fileKind(f.type) === "image" && urls[f.path]);
    return (
      <button key={d.id} type="button" className="pt-card" onClick={() => setOpen({ kind: "deliverable", id: d.id })}>
        <span className="pt-cover">{cover ? <img src={urls[cover.path]} alt="" loading="lazy" /> : <Icon name="file" size={28} />}</span>
        <span className="pt-card-body">
          <b>{d.title}</b>
          <span className="small muted">{[d.type, d.due_date && d.status !== "delivered" ? `Due ${niceDate(d.due_date)}` : ""].filter(Boolean).join(" · ")}</span>
          <span className={`pill ${DLV_TONE[d.status] ?? ""}`}>{DLV_WORDS[d.status] ?? d.status}</span>
        </span>
      </button>
    );
  };
  const pCard = (p: PPost) => {
    const m = (p.media ?? []).find((u) => safeHref(u));
    return (
      <button key={p.id} type="button" className="pt-card" onClick={() => setOpen({ kind: "post", id: p.id })}>
        <span className="pt-cover">{m ? <MediaThumb src={m} /> : <Icon name="content" size={28} />}</span>
        <span className="pt-card-body">
          <b>{p.title || p.caption?.slice(0, 60) || "Post"}</b>
          <span className="small muted">{p.publish_on ? niceDate(p.publish_on) : "Date to be set"}</span>
          <Platforms list={p.platforms} />
          <span className={`pill ${POST_TONE[p.status] ?? ""}`}>{POST_WORDS[p.status] ?? p.status}</span>
        </span>
      </button>
    );
  };
  const empty = (line: string, action?: [string, () => void]) => (
    <div className="empty pt-empty"><Nocti size={80} /><b>{line}</b>{action && <button type="button" className="btn solid big" onClick={action[1]}>{action[0]}</button>}</div>
  );
  const group = (title: string, list: React.ReactNode[]) => list.length > 0 && (
    <section className="pt-group"><h3>{title}<span className="muted">{list.length}</span></h3><div className="pt-cards">{list}</div></section>
  );

  const openD = open?.kind === "deliverable" ? data.deliverables.find((x) => x.id === open.id) : undefined;
  const openP = open?.kind === "post" ? data.posts.find((x) => x.id === open.id) : undefined;
  const upcoming = data.posts.filter((p) => !needsPost(p) && p.status !== "Posted");
  const posted = data.posts.filter((p) => p.status === "Posted").reverse();

  return (
    <>
      <div className="pt-tabs" role="tablist" aria-label="Portal sections">
        {tabs.map(([k, label, n]) => (
          <button key={k} type="button" role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls="pt-panel" className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {label}{n > 0 && <i aria-label={`${n} waiting`}>{n}</i>}
          </button>
        ))}
      </div>

      <div id="pt-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} key={tab} className="pt-panel">
        {tab === "overview" && (
          <>
            {(waitD.length > 0 || waitP.length > 0) && (
              <div className="note note-blush pt-wait">
                <h3>Waiting on you</h3>
                <p>{[waitD.length && `${waitD.length} ${waitD.length === 1 ? "deliverable" : "deliverables"}`, waitP.length && `${waitP.length} ${waitP.length === 1 ? "post" : "posts"}`].filter(Boolean).join(" and ")} ready for your OK.</p>
                <div className="row">
                  {waitD.length > 0 && <button type="button" className="btn solid big" onClick={() => setTab("work")}>Review deliverables</button>}
                  {waitP.length > 0 && <button type="button" className={`btn big${waitD.length ? "" : " solid"}`} onClick={() => setTab("posts")}>Review posts</button>}
                </div>
              </div>
            )}
            {data.projects.length === 0 ? empty(`${owner} hasn't shared a project here yet.`, ["Check again", () => router.refresh()]) : (
              <div className="pt-projects">
                {data.projects.map((p) => {
                  const pct = p.tasks_total ? p.tasks_done / p.tasks_total : p.status === "Done" ? 1 : 0;
                  const up = p.update ? UPDATE_WORDS[p.update.state] : null;
                  return (
                    <article key={p.id} className="card pt-project">
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <h3 style={{ margin: 0 }}>{p.name}</h3>
                        <span className={`pill ${p.status === "Done" ? "good" : p.status === "On hold" ? "warn" : "acc"}`}>{p.status === "Active" ? "In progress" : p.status}</span>
                      </div>
                      {p.description && <p className="muted pt-desc">{p.description}</p>}
                      <div className="pt-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label={`${p.name} progress`}>
                        <i style={{ transform: `scaleX(${pct})` }} />
                      </div>
                      <div className="small muted">{p.tasks_total ? `${p.tasks_done} of ${p.tasks_total} steps done` : "No steps yet"}{p.due_date ? ` · Due ${niceDate(p.due_date, true)}` : ""}</div>
                      {p.update && up && (
                        <div className="pt-update">
                          <span className={`pill ${up[1]}`}>{up[0]}</span>
                          <span className="small muted">Update from {owner}, {niceDate(p.update.created_at)}</span>
                          {p.update.body && <p>{p.update.body}</p>}
                        </div>
                      )}
                      {p.milestones.length > 0 && (
                        <ul className="pt-miles" aria-label="Milestones">
                          {p.milestones.map((m, i) => (
                            <li key={i} className={m.done ? "done" : m.due_date && m.due_date < t ? "late" : ""}>
                              <span className="pt-dot" aria-hidden="true">{m.done && <Icon name="check" size={12} />}</span>
                              <span className="grow">{m.title}</span>
                              <span className="small muted">{m.done ? "Done" : niceDate(m.due_date)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === "work" && (data.deliverables.length === 0 ? empty("No deliverables yet. They'll show up here as they're made.", ["Back to overview", () => setTab("overview")]) : (
          <>
            {group("Ready for your review", waitD.map(dCard))}
            {group("In the works", data.deliverables.filter((d) => !needsDeliverable(d) && d.status !== "delivered" && d.status !== "approved").map(dCard))}
            {group("Approved and delivered", data.deliverables.filter((d) => d.status === "delivered" || d.status === "approved").map(dCard))}
          </>
        ))}

        {tab === "posts" && (data.posts.length === 0 ? empty("No posts to show yet.", ["Back to overview", () => setTab("overview")]) : (
          <>
            {group("Needs your OK", waitP.map(pCard))}
            {group("Coming up", upcoming.map(pCard))}
            {group("Recently posted", posted.map(pCard))}
          </>
        ))}

        {tab === "invoices" && (data.invoices.length === 0 ? empty("No invoices yet.", ["Back to overview", () => setTab("overview")]) : (
          <div className="pt-invoices">
            {data.invoices.map((inv) => {
              const late = inv.status === "sent" && !!inv.due_date && inv.due_date < t;
              return (
                <details key={inv.id} className="card pt-inv">
                  <summary>
                    <span className="grow"><b className="num">{inv.number}</b><span className="small muted"> · {niceDate(inv.issue_date, true)}</span></span>
                    <b className="num">{money(total(inv), inv.currency)}</b>
                    <span className={`pill ${inv.status === "paid" ? "good" : late ? "bad" : "warn"}`}>{inv.status === "paid" ? "Paid" : late ? "Overdue" : inv.due_date ? `Due ${niceDate(inv.due_date)}` : "Due"}</span>
                    <Icon name="right" size={16} className="pt-chev" />
                  </summary>
                  <InvoiceView inv={inv} from={owner} to={clientName} />
                </details>
              );
            })}
          </div>
        ))}
      </div>

      {openD && (
        <Modal label={openD.title} onClose={() => setOpen(null)} wide>
          <div className="pt-modal">
            <h2>{openD.title}</h2>
            <span className={`pill ${DLV_TONE[openD.status] ?? ""}`}>{DLV_WORDS[openD.status] ?? openD.status}</span>
            <DeliverablePreview d={openD} urls={urls} />
            <Thread comments={thread(openD.id)} owner={owner} />
            <DecisionBox id={`d-${openD.id}`} canDecide={needsDeliverable(openD)} onSend={send("deliverable", openD.id)} />
            <button type="button" className="btn ghost" onClick={() => setOpen(null)}>Close</button>
          </div>
        </Modal>
      )}
      {openP && (
        <Modal label={openP.title || "Post"} onClose={() => setOpen(null)} wide>
          <div className="pt-modal">
            <h2>{openP.title || "Post"}</h2>
            <span className={`pill ${POST_TONE[openP.status] ?? ""}`}>{POST_WORDS[openP.status] ?? openP.status}</span>
            <PostPreview p={openP} />
            <Thread comments={thread(openP.id)} owner={owner} />
            <DecisionBox id={`p-${openP.id}`} canDecide={needsPost(openP)} onSend={send("post", openP.id)} />
            <button type="button" className="btn ghost" onClick={() => setOpen(null)}>Close</button>
          </div>
        </Modal>
      )}
    </>
  );
}

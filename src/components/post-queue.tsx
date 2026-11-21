"use client";

import "@/styles/social.css";
import { useState } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { addDays, parseYmd, today } from "@/lib/dates";
import { POST_COLS, byDate, platform, stage, type Post, type Stage } from "@/lib/posts";
import { publishCheck, publishNow, type SocialAcc } from "@/lib/publish";
import { useFlip } from "@/lib/flip";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import MediaThumb from "./media-thumb";
import Nocti from "./nocti";
import Icon from "./icon";
import Seg from "./seg";

const TABS: [Stage, string][] = [["Draft", "Draft"], ["For approval", "Needs approval"], ["Scheduled", "Scheduled"], ["Failed", "Failed"], ["Posted", "Posted"]];
const EMPTY: Record<Stage, string> = {
  Draft: "No drafts. Every idea has moved along.", "For approval": "Nothing is waiting on a client.", Scheduled: "Nothing scheduled yet.",
  Failed: "Nothing failed. Every post went out.", Posted: "Nothing posted in the last 60 days.",
};
const when = (p: Post) => p.publish_on
  ? `${parseYmd(p.publish_on).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}${p.publish_at ? ` · ${new Date(`2000-01-01T${p.publish_at}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}`
  : "No date yet";

// Posting queue: every post by where it stands, with the next thing to do right on the row.
export default function PostQueue({ clients, clientId, platformOnly, accounts, onOpen, onAdd }: {
  clients: Client[]; clientId: string; platformOnly: string; accounts: SocialAcc[]; onOpen: (p: Post) => void; onAdd: () => void;
}) {
  const [tab, setTab] = useState<Stage>("Scheduled");
  const [busy, setBusy] = useState("");
  const from = addDays(today(), -60);
  const [rows, reload, setRows] = useRows<Post>(`queue:${clientId || "all"}:${from}`, (s) => {
    let q = s.from("posts").select(POST_COLS).or(`publish_on.is.null,publish_on.gte.${from}`).order("publish_on", { nullsFirst: true }).limit(400);
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  }, ["posts"]);
  const [box, capture] = useFlip<HTMLDivElement>();
  const mine = (rows ?? []).filter((p) => !platformOnly || p.platforms?.includes(platformOnly));
  const count = (s: Stage) => mine.filter((p) => stage(p) === s).length;
  const list = mine.filter((p) => stage(p) === tab).sort((a, b) => (tab === "Posted" ? byDate(b, a) : byDate(a, b)));

  async function move(p: Post, date: string) {
    if (!date || date === p.publish_on) return;
    capture();
    setRows((r) => (r ?? []).map((x) => (x.id === p.id ? { ...x, publish_on: date } : x)));
    const { error } = await supabase().from("posts").update({ publish_on: date }).eq("id", p.id);
    if (error) { reload(); toast("Could not move it. Try again."); }
  }
  async function go(p: Post) {
    setBusy(p.id);
    await publishNow(p.id);
    setBusy("");
    reload();
  }

  return (
    <div className="queue">
      <Seg label="Posting queue" options={TABS.map(([v, l]) => [v, `${l} ${count(v)}`] as [Stage, string])} value={tab} onChange={setTab} />
      {rows === null ? <div className="card skel" style={{ height: 320 }} aria-busy="true" /> : !list.length ? (
        <div className="card empty social-empty">
          <Nocti mood="sleepy" size={64} />
          <b>{EMPTY[tab]}</b>
          <button className="btn solid" onClick={onAdd}><Icon name="plus" />Plan a post</button>
        </div>
      ) : (
        <div className="q-list" ref={box}>
          {list.map((p) => {
            const c = clients.find((x) => x.id === p.client_id), cover = p.media?.[0], chk = publishCheck(p, accounts);
            const live = Object.values(p.post_urls ?? {}).find(Boolean);
            const text = (p.hook || p.caption || "").trim().split("\n")[0];
            return (
              <div key={p.id} data-flip-id={p.id} className={`q-row${stage(p) === "Failed" ? " failed" : ""}`}>
                <button type="button" className="q-cover" onClick={() => onOpen(p)} aria-label={`Open ${p.title || "post"}`}>
                  {cover ? <MediaThumb src={cover} /> : <Icon name="content" />}
                </button>
                <div className="q-main">
                  <button type="button" className="q-title" onClick={() => onOpen(p)}>{p.title || text || "Untitled post"}</button>
                  {text && text !== p.title && <span className="q-cap">{text}</span>}
                  {stage(p) === "Failed" && <span className="q-err">{p.publish_error}</span>}
                  <span className="q-meta">
                    <span className="pc-plats">{(p.platforms?.length ? p.platforms : ["Instagram"]).map((n) => <i key={n} style={{ background: platform(n)?.color }} title={n}>{platform(n)?.short}</i>)}</span>
                    <span>{when(p)}</span>
                    {c && <span className="pc-client"><i style={{ background: c.color }} />{clientLabel(c)}</span>}
                  </span>
                </div>
                <div className="q-acts">
                  {tab !== "Posted" && <input type="date" className="q-date" value={p.publish_on ?? ""} aria-label={`Move ${p.title || "post"} to another day`} onChange={(e) => move(p, e.target.value)} />}
                  {tab === "Posted" ? (live ? <a className="btn small" href={live} target="_blank" rel="noopener noreferrer"><Icon name="link" />View</a> : null)
                    : <button type="button" className={`btn small${tab === "Scheduled" || tab === "Failed" ? " solid" : ""}`} disabled={!chk.ok || busy === p.id} title={chk.why} onClick={() => go(p)}>
                        <Icon name={tab === "Failed" ? "repeat" : "play"} />{busy === p.id ? "Posting…" : tab === "Failed" ? "Retry" : "Publish now"}
                      </button>}
                  {!chk.ok && tab !== "Posted" && <span className="q-why">{chk.why}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { supabase } from "@/lib/use-rows";
import { today } from "@/lib/dates";
import { FORMATS, PLATFORMS, STATUSES, fullCaption, hashtags, limits, platform, statusTone, type Post, type Status } from "@/lib/posts";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import Modal from "./modal";
import Icon from "./icon";

export type PostDraft = Partial<Post>;

// Plan, write and track one post: platforms, hook, caption, hashtags, and where it went live.
export default function PostForm({ post = {}, clients, pillars, onClose, onSaved }: { post?: PostDraft; clients: Client[]; pillars: string[]; onClose: () => void; onSaved: () => void }) {
  const [clientId, setClientId] = useState(post.client_id ?? "");
  const [title, setTitle] = useState(post.title ?? "");
  const [platforms, setPlatforms] = useState<string[]>(post.platforms?.length ? post.platforms : ["Instagram"]);
  const [format, setFormat] = useState(post.format || "Reel");
  const [date, setDate] = useState(post.publish_on === null ? "" : post.publish_on ?? today()); // ideas can have no date yet
  const [time, setTime] = useState(post.publish_at?.slice(0, 5) ?? "");
  const [status, setStatus] = useState<Status>(post.status ?? "Idea");
  const [pillar, setPillar] = useState(post.pillar ?? "");
  const [hook, setHook] = useState(post.hook ?? "");
  const [caption, setCaption] = useState(post.caption ?? "");
  const [tags, setTags] = useState(post.hashtags ?? "");
  const [asset, setAsset] = useState(post.asset_url ?? "");
  const [urls, setUrls] = useState<Record<string, string>>(post.post_urls ?? {});
  const [notes, setNotes] = useState(post.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);

  const lim = limits(platforms);
  const tagList = hashtags({ caption, hashtags: tags });
  const capLen = [hook && !caption.trim().startsWith(hook.trim()) ? hook : "", caption].filter(Boolean).join("\n\n").length;
  const smmClients = clients.filter((c) => c.status !== "Past" && (c.roles?.some((r) => ["smm", "design", "video"].includes(r)) || c.id === clientId));
  const toggle = (n: string) => setPlatforms((ps) => (ps.includes(n) ? (ps.length > 1 ? ps.filter((x) => x !== n) : ps) : [...ps, n]));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() && !hook.trim() && !caption.trim()) return toast("Give the post a name, a hook or a caption.");
    setBusy(true);
    const cleanUrls = Object.fromEntries(Object.entries(urls).filter(([k, v]) => platforms.includes(k) && v.trim()).map(([k, v]) => [k, /^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`]));
    const row = {
      client_id: clientId || null, title: title.trim(), platforms, platform: platforms[0], format, publish_on: date || null, publish_at: time || null, status,
      pillar: pillar.trim(), hook: hook.trim(), caption, hashtags: tags.trim(), asset_url: asset.trim(), post_urls: cleanUrls, notes: notes.trim(),
    };
    const { error } = post.id ? await supabase().from("posts").update(row).eq("id", post.id) : await supabase().from("posts").insert(row);
    setBusy(false);
    if (error) return toast("Could not save. Check your connection.");
    if (status === "Posted" && post.status !== "Posted") toast(`Posted on ${platforms.join(", ")}. Nice work!`);
    else toast(post.id ? "Post saved" : "Post added to the calendar");
    onSaved();
    onClose();
  }
  async function remove() {
    if (!post.id) return;
    if (!sure) return setSure(true);
    const { error } = await supabase().from("posts").delete().eq("id", post.id);
    if (error) return toast("Could not delete. Try again.");
    toast("Post deleted");
    onSaved();
    onClose();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(fullCaption({ hook, caption, hashtags: tags })); toast("Caption and hashtags copied"); }
    catch { toast("Copy was blocked here."); }
  }

  const heading = post.id ? title || "Edit post" : "Plan a post";
  return (
    <Modal label={heading} onClose={onClose} wide>
      <form onSubmit={save} style={{ display: "contents" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ overflowWrap: "anywhere" }}>{heading}</h2>
          <span className="pill" style={{ background: `color-mix(in srgb, ${statusTone(status)} 18%, transparent)`, color: statusTone(status) }}>{status}</span>
        </div>
        <div className="form">
          <div className="field full"><label>Platforms</label>
            <div className="row" style={{ gap: 6 }}>{PLATFORMS.map((p) => {
              const on = platforms.includes(p.name);
              return <button key={p.name} type="button" className={`plat${on ? " on" : ""}`} aria-pressed={on} style={{ ["--p" as string]: p.color }} onClick={() => toggle(p.name)}><i>{p.short}</i>{p.name}</button>;
            })}</div>
          </div>
          <div className="field"><label htmlFor="pf-client">Client</label>
            <select id="pf-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">My own content</option>
              {smmClients.map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="pf-title">Post name</label><input id="pf-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Frizz-free tips reel" /></div>
          <div className="field"><label htmlFor="pf-format">Format</label><select id="pf-format" value={format} onChange={(e) => setFormat(e.target.value)}>{FORMATS.map((f) => <option key={f}>{f}</option>)}</select></div>
          <div className="field"><label htmlFor="pf-status">Status</label><select id="pf-status" value={status} onChange={(e) => setStatus(e.target.value as Status)}>{STATUSES.map((s) => <option key={s.name}>{s.name}</option>)}</select></div>
          <div className="field"><label htmlFor="pf-date">Post on</label><input id="pf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="pf-time">Time (optional)</label><input id="pf-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          <div className="field full"><label htmlFor="pf-pillar">Content pillar</label><input id="pf-pillar" list="pf-pillars" value={pillar} onChange={(e) => setPillar(e.target.value)} placeholder="Education, Behind the scenes, Testimonials…" />
            <datalist id="pf-pillars">{pillars.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
          <div className="field full"><label htmlFor="pf-hook">Hook (first line or on-screen text)</label><input id="pf-hook" value={hook} onChange={(e) => setHook(e.target.value)} placeholder="Stop doing this to your curls…" /></div>
          <div className="field full">
            <label htmlFor="pf-caption" className="row" style={{ justifyContent: "space-between" }}><span>Caption</span><span className={capLen > lim.caption ? "bad-t" : ""}>{capLen.toLocaleString()} / {lim.caption.toLocaleString()}{platforms.length > 1 ? ` (${lim.capBy})` : ""}</span></label>
            <textarea id="pf-caption" value={caption} onChange={(e) => setCaption(e.target.value)} style={{ minHeight: 130 }} placeholder="Write the caption…" />
          </div>
          <div className="field full">
            <label htmlFor="pf-tags" className="row" style={{ justifyContent: "space-between" }}><span>Hashtags</span><span className={tagList.length > lim.tags ? "bad-t" : ""}>{tagList.length} / {lim.tags} for {lim.by}</span></label>
            <textarea id="pf-tags" value={tags} onChange={(e) => setTags(e.target.value)} style={{ minHeight: 60 }} placeholder="#curlyhair #haircare #hairtips" />
            <small className="muted">{platform(lim.by)?.tagHint}</small>
          </div>
          <div className="field full"><label htmlFor="pf-asset">Design or video link</label><input id="pf-asset" value={asset} onChange={(e) => setAsset(e.target.value)} placeholder="Canva, Google Drive or Dropbox link" /></div>
          {(status === "Posted" || Object.keys(urls).length > 0) && (
            <div className="field full"><label>Live links</label>
              <div className="items">{platforms.map((p) => (
                <div key={p} className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
                  <span className="plat on" style={{ ["--p" as string]: platform(p)?.color, flex: "none" }}><i>{platform(p)?.short}</i></span>
                  <input aria-label={`${p} link`} value={urls[p] ?? ""} onChange={(e) => setUrls((u) => ({ ...u, [p]: e.target.value }))} placeholder={`Link to the ${p} post`} style={{ border: "1px solid var(--line-strong)", background: "var(--paper)", borderRadius: 12, padding: "9px 12px", width: "100%" }} />
                </div>
              ))}</div>
            </div>
          )}
          <div className="field full"><label htmlFor="pf-notes">Notes</label><textarea id="pf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 60 }} placeholder="Music, client feedback, ideas for the next one…" /></div>
        </div>
        <div className="modal-foot">
          {post.id && <button type="button" className="btn danger left" onClick={remove}>{sure ? "Tap again to delete" : "Delete"}</button>}
          <button type="button" className="btn" onClick={copy}><Icon name="copy" />Copy caption</button>
          {asset && <a className="btn" href={/^https?:\/\//i.test(asset) ? asset : `https://${asset}`} target="_blank" rel="noopener noreferrer"><Icon name="link" />Open design</a>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

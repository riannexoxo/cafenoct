"use client";

import { useState } from "react";
import { supabase } from "@/lib/use-rows";
import { today } from "@/lib/dates";
import { FORMATS, METRICS, PLATFORMS, STATUSES, engagements, formatTone, pct, rate, fullCaption, hashtags, limits, platform, statusTone, type Post, type Status } from "@/lib/posts";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import Modal from "./modal";
import Icon from "./icon";
import MediaThumb from "./media-thumb";
import ShareLinkButton from "./share-link-button";
import TemplatePicker, { list, str } from "./template-picker";
import RemindButton from "./remind-button";
import { publishCheck, publishNow, useAccounts } from "@/lib/publish";
import "@/styles/social.css";

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
  const [stats, setStats] = useState<Record<string, Record<string, number>>>(post.stats ?? {});
  const setStat = (pl: string, k: string, v: string) => setStats((st) => ({ ...st, [pl]: { ...(st[pl] ?? {}), [k]: v === "" ? 0 : Math.max(0, Number(v) || 0) } }));
  const [notes, setNotes] = useState(post.notes ?? "");
  const [media, setMedia] = useState<string[]>(post.media ?? []);
  const [uploading, setUploading] = useState(0);

  // Images and videos go to your folder in the "post-media" storage bucket. The first one is the cover.
  async function upload(files: FileList | null) {
    const list = [...(files ?? [])].filter((f) => /^(image|video)\//.test(f.type));
    if (!list.length) return;
    if (list.some((f) => f.size > 25 * 1024 * 1024)) return toast("Each file needs to be under 25 MB.");
    const { data: auth } = await supabase().auth.getSession();
    const uid = auth.session?.user.id;
    setUploading(list.length);
    const urls: string[] = [];
    for (const f of list.slice(0, 10)) {
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${uid}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase().storage.from("post-media").upload(path, f, { contentType: f.type });
      if (!error) urls.push(supabase().storage.from("post-media").getPublicUrl(path).data.publicUrl);
      setUploading((n) => n - 1);
    }
    if (urls.length < list.length) toast("Some files didn't upload. Try them again.");
    setMedia((m) => [...m, ...urls].slice(0, 10));
    if (urls.length > 1 && format !== "Carousel") setFormat("Carousel");
  }
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [id, setId] = useState(post.id); // a new post gets its id on the first save
  const [err, setErr] = useState(post.publish_error ?? "");
  const [publishing, setPublishing] = useState(false);
  const accounts = useAccounts();
  const chk = publishCheck({ status, platforms, post_urls: urls, client_id: clientId || null, media }, accounts);

  const lim = limits(platforms);
  const tagList = hashtags({ caption, hashtags: tags });
  const capLen = [hook && !caption.trim().startsWith(hook.trim()) ? hook : "", caption].filter(Boolean).join("\n\n").length;
  const smmClients = clients.filter((c) => c.status !== "Past" && (c.roles?.some((r) => ["smm", "design", "video"].includes(r)) || c.id === clientId));
  const toggle = (n: string) => setPlatforms((ps) => (ps.includes(n) ? (ps.length > 1 ? ps.filter((x) => x !== n) : ps) : [...ps, n]));

  // Saves the form and returns the post's id (or null when it couldn't).
  async function persist() {
    const cleanUrls = Object.fromEntries(Object.entries(urls).filter(([k, v]) => platforms.includes(k) && v.trim()).map(([k, v]) => [k, /^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`]));
    const row = {
      client_id: clientId || null, title: title.trim(), platforms, platform: platforms[0], format, publish_on: date || null, publish_at: time || null, status,
      pillar: pillar.trim(), hook: hook.trim(), caption, hashtags: tags.trim(), asset_url: asset.trim(), post_urls: cleanUrls, notes: notes.trim(), media,
      stats: Object.fromEntries(Object.entries(stats).filter(([k]) => platforms.includes(k))),
      ...(status === "Posted" ? { publish_error: "" } : {}), // posted by hand: the old error no longer applies
    };
    if (id) return (await supabase().from("posts").update(row).eq("id", id)).error ? null : id;
    const { data, error } = await supabase().from("posts").insert(row).select("id").single<{ id: string }>();
    if (error || !data) return null;
    setId(data.id);
    return data.id;
  }
  const empty = () => !title.trim() && !hook.trim() && !caption.trim();
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (empty()) return toast("Give the post a name, a hook or a caption.");
    setBusy(true);
    const saved = await persist();
    setBusy(false);
    if (!saved) return toast("Could not save. Check your connection.");
    if (status === "Posted" && post.status !== "Posted") toast(`Posted on ${platforms.join(", ")}. Nice work!`);
    else toast(post.id ? "Post saved" : "Post added to the calendar");
    onSaved();
    onClose();
  }
  // "Publish now" and "Retry": save what's in the form, then post it for real through the server.
  async function publish() {
    if (empty()) return toast("Give the post a name, a hook or a caption.");
    setPublishing(true);
    const saved = await persist();
    if (!saved) { setPublishing(false); return toast("Could not save. Check your connection."); }
    const r = await publishNow(saved);
    setPublishing(false);
    setErr(r.error);
    onSaved();
    if (r.ok) onClose();
  }
  async function remove() {
    if (!id) return;
    if (!sure) return setSure(true);
    const { error } = await supabase().from("posts").delete().eq("id", id);
    if (error) return toast("Could not delete. Try again.");
    toast("Post deleted");
    onSaved();
    onClose();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(fullCaption({ hook, caption, hashtags: tags })); toast("Caption and hashtags copied"); }
    catch { toast("Copy was blocked here."); }
  }

  // Templates keep the reusable parts only: never dates, status, client or media.
  const tplData = () => ({ format, platforms, title: title.trim(), caption, hashtags: tags.trim(), hook: hook.trim(), pillar: pillar.trim() });
  const applyTpl = (d: Record<string, unknown>) => {
    const ps = list(d.platforms, 20).map((x) => str(x)).filter((x) => PLATFORMS.some((p) => p.name === x));
    if (ps.length) setPlatforms([...new Set(ps)]);
    if (FORMATS.includes(str(d.format))) setFormat(str(d.format));
    if (str(d.title)) setTitle(str(d.title, 300));
    setCaption(str(d.caption, 5000));
    setTags(str(d.hashtags, 2000));
    setHook(str(d.hook, 500));
    setPillar(str(d.pillar, 80));
  };

  const heading = post.id ? title || "Edit post" : "Plan a post";
  return (
    <Modal label={heading} onClose={onClose} wide>
      <form onSubmit={save} style={{ display: "contents" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ overflowWrap: "anywhere" }}>{heading}</h2>
          {err && status !== "Posted" ? <span className="pill pf-failed">Failed</span>
            : <span className="pill" style={{ background: `color-mix(in srgb, ${statusTone(status)} 18%, transparent)`, color: statusTone(status) }}>{status}</span>}
        </div>
        {err && status !== "Posted" && (
          <div className="pub-fail" role="alert">
            <div><b>This post didn&apos;t publish</b><span>{err}</span></div>
            <button type="button" className="btn small" onClick={publish} disabled={publishing || !chk.ok} title={chk.why}><Icon name="repeat" />{publishing ? "Trying…" : "Retry"}</button>
          </div>
        )}
        <TemplatePicker kind="post" pick={!id} data={tplData} onApply={applyTpl} />
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
          <div className="field full"><label>Format</label>
            <div className="row" style={{ gap: 6 }}>{FORMATS.map((f) => (
              <button key={f} type="button" className={`fmt${format === f ? " on" : ""}`} style={{ ["--f" as string]: formatTone(f) }} aria-pressed={format === f} onClick={() => setFormat(f)}><i />{f}</button>
            ))}</div>
          </div>
          <div className="field full"><label>{format === "Carousel" ? `Slides (${media.length}/10)` : "Thumbnail or video"}</label>
            <div className="media-row">
              {media.map((m, i) => (
                <div key={m} className="media-th">
                  <MediaThumb src={m} />
                  {i === 0 ? <span className="media-cover">Cover</span> : <button type="button" className="media-cover btn-ish" onClick={() => setMedia((xs) => [m, ...xs.filter((x) => x !== m)])}>Make cover</button>}
                  <button type="button" className="media-x" aria-label="Remove" onClick={() => setMedia((xs) => xs.filter((x) => x !== m))}><Icon name="x" size={12} /></button>
                </div>
              ))}
              {media.length < 10 && (
                <label className="media-add">
                  <input type="file" accept="image/*,video/mp4,video/quicktime,video/webm" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
                  <Icon name="plus" /><span>{uploading ? `Uploading ${uploading}…` : media.length ? "Add more" : "Upload"}</span>
                </label>
              )}
            </div>
          </div>
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
          {status === "Posted" && (
            <div className="field full"><label>Results <span className="muted">(type the numbers from each app; update them any time)</span></label>
              <div className="stat-grid" style={{ gridTemplateColumns: `90px repeat(${METRICS.length}, minmax(64px, 1fr)) 64px` }}>
                <span />{METRICS.map((m) => <span key={m.key} className="small muted">{m.label}</span>)}<span className="small muted">Rate</span>
                {platforms.map((pl) => (
                  <div key={pl} style={{ display: "contents" }}>
                    <span className="plat on" style={{ ["--p" as string]: platform(pl)?.color }}><i>{platform(pl)?.short}</i>{pl}</span>
                    {METRICS.map((m) => <input key={m.key} type="number" min={0} inputMode="numeric" aria-label={`${pl} ${m.label}`} value={stats[pl]?.[m.key] || ""} onChange={(e) => setStat(pl, m.key, e.target.value)} />)}
                    <span className="num small" title={`${engagements(stats[pl])} engagements`}>{rate(stats[pl]) ? pct(rate(stats[pl])) : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="field full pf-ship"><label>Client approval</label>
            {id ? <ShareLinkButton entity="post" entityId={id} clientId={clientId || null} /> : <small className="muted">Save the post first to get an approval link for your client.</small>}
            {status !== "Posted" && !chk.ok && <small className="muted">Publish now: {chk.why}</small>}
          </div>
          {id && <div className="field full"><label>Reminders</label><RemindButton title={title || hook || "Post"} href={`/content?post=${id}`} entity="post" entityId={id} clientId={clientId || null} /></div>}
          <div className="field full"><label htmlFor="pf-notes">Notes</label><textarea id="pf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 60 }} placeholder="Music, client feedback, ideas for the next one…" /></div>
        </div>
        <div className="modal-foot">
          {id && <button type="button" className="btn danger left" onClick={remove}>{sure ? "Tap again to delete" : "Delete"}</button>}
          <button type="button" className="btn" onClick={copy}><Icon name="copy" />Copy caption</button>
          {asset && <a className="btn" href={/^https?:\/\//i.test(asset) ? asset : `https://${asset}`} target="_blank" rel="noopener noreferrer"><Icon name="link" />Open design</a>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          {status !== "Posted" && <button type="button" className="btn" onClick={publish} disabled={!chk.ok || publishing || busy || uploading > 0} title={chk.why}><Icon name="play" />{publishing ? "Posting…" : "Publish now"}</button>}
          <button type="submit" className="btn solid" disabled={busy || uploading > 0}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

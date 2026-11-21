"use client";

import { useEffect, useState } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import { platform as pinfo } from "@/lib/posts";
import { clientLabel, type Client } from "@/lib/types";
import Icon from "./icon";

type Acc = { id: string; client_id: string | null; platform: string; name: string; avatar: string; import: boolean; last_synced_at: string | null; last_error: string };

const ago = (iso: string | null) => {
  if (!iso) return "Not synced yet";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 2 ? "Synced just now" : m < 60 ? `Synced ${m} min ago` : m < 1440 ? `Synced ${Math.round(m / 60)}h ago` : `Synced ${Math.round(m / 1440)}d ago`;
};

// Connect Facebook Pages, Instagram and TikTok so post numbers fill in by themselves.
export default function SocialConnect({ clients, meta, tiktok }: { clients: Client[]; meta: boolean; tiktok: boolean }) {
  const [rows, reload, setRows] = useRows<Acc>("social-accounts", (s) => s.from("social_accounts").select("id,client_id,platform,name,avatar,import,last_synced_at,last_error").order("platform").order("name"), ["social_accounts"]);
  const [busy, setBusy] = useState("");

  // Messages from the Facebook/TikTok sign-in coming back.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const ok = q.get("connected"), err = q.get("social_error");
    if (ok) toast(`Connected ${ok}. Pick the client for each one below.`);
    if (err) toast(err);
    if (ok || err) history.replaceState(null, "", `${location.pathname}#connections`);
  }, []);

  async function patch(a: Acc, p: Partial<Acc>) {
    setRows((r) => (r ?? []).map((x) => (x.id === a.id ? { ...x, ...p } : x)));
    const { error } = await supabase().from("social_accounts").update(p).eq("id", a.id);
    if (error) { reload(); toast("Could not save. Try again."); }
  }
  async function sync(id?: string) {
    setBusy(id ?? "all");
    const r = await fetch(`/api/social/sync${id ? `?id=${id}` : ""}`, { method: "POST" }).then((x) => x.json()).catch(() => ({ error: "Check your connection." }));
    setBusy("");
    reload();
    if (r.error) return toast(r.error);
    toast(r.errors?.length ? `Some accounts need attention: ${r.errors[0]}` : `Synced. ${r.updated} post${r.updated === 1 ? "" : "s"} updated${r.added ? `, ${r.added} added` : ""}.`);
  }
  async function remove(a: Acc) {
    if (!confirm(`Disconnect ${a.name}? Numbers already saved stay on your posts.`)) return;
    setRows((r) => (r ?? []).filter((x) => x.id !== a.id));
    await supabase().from("social_accounts").delete().eq("id", a.id);
  }

  const list = rows ?? [];
  return (
    <div className="card" id="connections">
      <h3>
        <span>Connected accounts</span>
        {list.length > 0 && <button className="btn small" disabled={!!busy} onClick={() => sync()}><Icon name="repeat" />{busy === "all" ? "Syncing…" : "Sync now"}</button>}
      </h3>
      <p className="small muted" style={{ marginTop: 0 }}>Views, reach, likes, comments, shares and saves fill in by themselves every 6 hours. Posts are matched by their link; ones you didn&apos;t log are added to the client&apos;s content calendar.</p>

      {list.length > 0 && (
        <div className="list" style={{ margin: "8px 0 14px" }}>
          {list.map((a) => {
            const p = pinfo(a.platform);
            return (
              <div className="li soc" key={a.id}>
                <span className="soc-av" style={{ background: p?.color }}>{/* eslint-disable-next-line @next/next/no-img-element -- small profile pictures from Meta/TikTok */}
                  {a.avatar ? <img loading="lazy" decoding="async" src={a.avatar} alt="" referrerPolicy="no-referrer" /> : p?.short}</span>
                <span className="t">{a.name}<small>{a.platform} · {a.last_error ? <span style={{ color: "var(--bad)" }}>{a.last_error}</span> : ago(a.last_synced_at)}</small></span>
                <select aria-label={`Client for ${a.name}`} className="auto-pick" value={a.client_id ?? ""} onChange={(e) => patch(a, { client_id: e.target.value || null })}>
                  <option value="">Pick a client…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
                </select>
                <label className="small soc-imp" title="Add posts you didn't log to the content calendar"><input type="checkbox" checked={a.import} onChange={(e) => patch(a, { import: e.target.checked })} /> Add unlogged posts</label>
                <button className="btn small" disabled={!!busy} onClick={() => sync(a.id)} aria-label={`Sync ${a.name}`}>{busy === a.id ? "…" : <Icon name="repeat" />}</button>
                <button className="btn small" onClick={() => remove(a)} aria-label={`Disconnect ${a.name}`}><Icon name="x" /></button>
              </div>
            );
          })}
        </div>
      )}

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {/* These go to sign-in routes on the server (then Facebook/TikTok), so they're full page loads, not app links. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className={`btn${meta ? " solid" : ""}`} href="/api/social/meta/start" aria-disabled={!meta} onClick={(e) => { if (!meta) { e.preventDefault(); toast("Set up the Facebook app first (steps below)."); } }}><Icon name="link" />Connect Facebook &amp; Instagram</a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className={`btn${tiktok ? " solid" : ""}`} href="/api/social/tiktok/start" aria-disabled={!tiktok} onClick={(e) => { if (!tiktok) { e.preventDefault(); toast("Set up the TikTok app first (steps below)."); } }}><Icon name="link" />Connect TikTok</a>
      </div>

      {(!meta || !tiktok) && (
        <details className="auto-sent" open={!meta && !tiktok}>
          <summary className="small muted">How to set this up (one time)</summary>
          {!meta && (
            <>
              <p className="small" style={{ marginBottom: 4 }}><b>Facebook &amp; Instagram</b></p>
              <ol className="steps">
                <li>Go to <a className="linkish" href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">developers.facebook.com/apps</a> and tap <b>Create app</b>. Name it <b>CafeNoct</b>.</li>
                <li>For use cases, pick <b>Manage everything on your Page</b> and the Instagram one (<b>Manage messaging &amp; content on Instagram</b>). Choose your business portfolio if asked.</li>
                <li>In the app, open <b>Facebook Login for Business › Settings</b> and add this redirect URL: <code>https://cafenoct.vercel.app/api/social/meta/callback</code></li>
                <li>Open <b>App settings › Basic</b>. Copy the <b>App ID</b> and <b>App secret</b> (don&apos;t paste them anywhere but Vercel).</li>
                <li>In Vercel › cafenoct › Settings › Environment Variables, add <code>META_APP_ID</code> and <code>META_APP_SECRET</code>, then redeploy.</li>
              </ol>
            </>
          )}
          {!tiktok && (
            <>
              <p className="small" style={{ marginBottom: 4 }}><b>TikTok</b></p>
              <ol className="steps">
                <li>Go to <a className="linkish" href="https://developers.tiktok.com/apps" target="_blank" rel="noopener noreferrer">developers.tiktok.com</a>, sign in, and tap <b>Connect an app</b>. Name it <b>CafeNoct</b>.</li>
                <li>Add the products <b>Login Kit</b> and <b>Display API</b>. Tick the scopes <code>user.info.basic</code> and <code>video.list</code>.</li>
                <li>Under Login Kit, add the redirect URL <code>https://cafenoct.vercel.app/api/social/tiktok/callback</code></li>
                <li>Turn on <b>Sandbox</b> and add each TikTok account you&apos;ll connect as a <b>target user</b>.</li>
                <li>Copy the <b>Client key</b> and <b>Client secret</b> into Vercel as <code>TIKTOK_CLIENT_KEY</code> and <code>TIKTOK_CLIENT_SECRET</code>, then redeploy.</li>
              </ol>
            </>
          )}
        </details>
      )}
    </div>
  );
}

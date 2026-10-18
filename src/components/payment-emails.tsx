"use client";

import { useState } from "react";
import { supabase } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import Icon from "./icon";

// A random private key. Only its SHA-256 fingerprint is saved; the key itself lives in your Gmail script.
async function makeKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = "cn_" + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { key, hash };
}

const script = (url: string, key: string) => `// CafeNoct: adds PayPal and Wise "money received" emails to your CafeNoct wallet.
// This runs only inside your own Google account. It only looks at emails from PayPal and Wise.
const CAFENOCT_URL = '${url}';
const CAFENOCT_KEY = '${key}'; // private: keep this script to yourself

function checkPayments() {
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty('lastCheck') || 0) || (Date.now() - 3 * 864e5);
  const since = Math.floor(last / 1000) - 900; // a little overlap; CafeNoct ignores repeats
  const threads = GmailApp.search('from:(paypal.com OR wise.com OR transferwise.com) after:' + since, 0, 30);
  let ok = true;
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      if (m.getDate().getTime() / 1000 < since) return;
      const res = UrlFetchApp.fetch(CAFENOCT_URL, {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + CAFENOCT_KEY },
        payload: JSON.stringify({
          id: m.getId(), from: m.getFrom(), subject: m.getSubject(), date: m.getDate().toISOString(),
          day: Utilities.formatDate(m.getDate(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
          body: m.getPlainBody().slice(0, 20000)
        })
      });
      if (res.getResponseCode() >= 500) ok = false;
    });
  });
  if (ok) props.setProperty('lastCheck', String(Date.now()));
}

// Run this once. It checks your email every 5 minutes from then on.
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('checkPayments').timeBased().everyMinutes(5).create();
  checkPayments();
}
`;

export default function PaymentEmails({ connected: initial }: { connected: boolean }) {
  const [connected, setConnected] = useState(initial);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);

  async function saveHash(hash: string) {
    const { data: auth } = await supabase().auth.getSession();
    return supabase().from("profiles").update({ inbox_key_hash: hash }).eq("user_id", auth.session?.user.id ?? "");
  }
  async function create() {
    if (connected && !sure) return setSure(true);
    setBusy(true);
    const { key, hash } = await makeKey();
    const { error } = await saveHash(hash);
    setBusy(false);
    setSure(false);
    if (error) return toast("Could not create the key. Try again.");
    setConnected(true);
    setCode(script(`${window.location.origin}/api/inbox`, key));
  }
  async function turnOff() {
    setBusy(true);
    const { error } = await saveHash("");
    setBusy(false);
    if (error) return toast("Could not turn it off. Try again.");
    setConnected(false);
    setCode("");
    toast("Payment emails turned off. You can delete the script in Google too.");
  }
  async function copy() {
    try { await navigator.clipboard.writeText(code); toast("Script copied"); } catch { toast("Copy was blocked. Select the script and copy it."); }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h3><span>PayPal and Wise payments</span>{connected ? <span className="pill good">On</span> : <span className="pill">Off</span>}</h3>
      <p className="small muted" style={{ margin: 0 }}>When PayPal or Wise emails you that money came in, CafeNoct adds it to your Wallet within about 5 minutes. If it matches an open invoice, that invoice is marked paid. A small script in your own Gmail sends just those emails here. CafeNoct never gets access to your inbox.</p>
      {code ? (
        <>
          <ol className="small steps">
            <li>Open <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener noreferrer">Google Apps Script</a>, signed in to the Gmail that gets your PayPal and Wise emails.</li>
            <li>Delete what&apos;s in the editor, paste the script below, then press <b>Save</b> (the disk icon). Name the project &quot;CafeNoct payments&quot;.</li>
            <li>In the menu next to <b>Run</b>, pick <b>setup</b>, then press <b>Run</b>.</li>
            <li>Google asks for permission. Choose your account. If it says <b>Google hasn&apos;t verified this app</b>, that&apos;s because the script is yours and private: click <b>Advanced</b>, then <b>Go to CafeNoct payments</b>, then <b>Allow</b>.</li>
            <li>That&apos;s it. It checks every 5 minutes, even when your computer is off.</li>
          </ol>
          <div className="code-box">
            <button className="btn small solid" onClick={copy}><Icon name="copy" />Copy script</button>
            <pre aria-label="Gmail script">{code}</pre>
          </div>
          <p className="small muted" style={{ margin: 0 }}>This key is shown only once. Keep the script private. If you lose it, make a new key and paste the new script.</p>
        </>
      ) : null}
      <div className="row">
        <button className={`btn${connected ? "" : " solid"}`} disabled={busy} onClick={create}><Icon name={connected ? "repeat" : "plus"} />{connected ? (sure ? "Make a new key? The old script stops working" : "Make a new key and script") : "Set it up"}</button>
        {connected && <button className="btn ghost danger" disabled={busy} onClick={turnOff}>Turn off</button>}
      </div>
    </div>
  );
}

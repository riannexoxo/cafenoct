"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Nocti from "@/components/nocti";
import Icon from "@/components/icon";

export type Decision = "approve" | "changes" | "comment";
type Send = (decision: Decision, comment: string, name: string) => Promise<string | null>; // returns an error message, or null when it worked

const THANKS: Record<Decision, string> = {
  approve: "Approved. Thank you! It's moving ahead.",
  changes: "Got it. Your changes were sent.",
  comment: "Comment sent.",
};

// Approve / Request changes / Comment, in plain words with big buttons. A comment is required for changes and comments.
export default function DecisionBox({ canDecide, askName = false, onSend, id }: { canDecide: boolean; askName?: boolean; onSend: Send; id: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Decision | null>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Decision | null>(null);
  const [err, setErr] = useState("");

  async function send(d: Decision) {
    if (d !== "approve" && !text.trim()) { setErr(d === "changes" ? "Tell us what to change first." : "Write your comment first."); return; }
    setBusy(true); setErr("");
    const problem = await onSend(d, text.trim(), name.trim()).catch(() => "Something went wrong. Try again.");
    setBusy(false);
    if (problem) { setErr(problem); return; }
    setDone(d); setText(""); setMode(null);
    router.refresh();
  }

  if (done) {
    return (
      <div className="pt-done" role="status">
        <Nocti mood="awake" state={done === "approve" ? "happy" : "idle"} size={64} />
        <div><b>{THANKS[done]}</b><button type="button" className="btn small ghost" onClick={() => setDone(null)}>Add another comment</button></div>
      </div>
    );
  }

  return (
    <div className="pt-decide">
      {askName && (
        <div className="field">
          <label htmlFor={`${id}-name`}>Your name (optional)</label>
          <input id={`${id}-name`} value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} placeholder="So they know who replied" />
        </div>
      )}
      {mode && (
        <div className="field pt-say">
          <label htmlFor={`${id}-text`}>{mode === "changes" ? "What should change?" : "Your comment"}</label>
          <textarea id={`${id}-text`} rows={4} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} autoFocus
            placeholder={mode === "changes" ? "For example: make the logo bigger and use the pink from our brand." : "Write anything you'd like to say."} />
        </div>
      )}
      {err && <div className="pt-err" role="alert"><Nocti mood="awake" state="oops" size={36} />{err}</div>}
      <div className="pt-actions">
        {mode ? (
          <>
            <button type="button" className="btn solid big" disabled={busy} onClick={() => send(mode)}><Icon name={mode === "changes" ? "repeat" : "chat"} />{busy ? "Sending…" : mode === "changes" ? "Send my changes" : "Send comment"}</button>
            <button type="button" className="btn big ghost" disabled={busy} onClick={() => { setMode(null); setErr(""); }}>Cancel</button>
          </>
        ) : (
          <>
            {canDecide && <button type="button" className="btn solid big pt-approve" disabled={busy} onClick={() => send("approve")}><Icon name="check" />{busy ? "Sending…" : "Approve"}</button>}
            {canDecide && <button type="button" className="btn big" disabled={busy} onClick={() => setMode("changes")}><Icon name="repeat" />Request changes</button>}
            <button type="button" className={`btn big${canDecide ? " ghost" : ""}`} disabled={busy} onClick={() => setMode("comment")}><Icon name="chat" />Comment</button>
          </>
        )}
      </div>
    </div>
  );
}

// Database messages written for people (see portal_decide / share_decide); anything else stays generic.
const SAFE = ["Add a comment first", "That comment is too long", "That is too long", "Too many comments in a short time. Please try again later.", "This link has expired", "This link is not valid"];
export const friendly = (msg?: string) => SAFE.find((s) => msg?.includes(s)) ?? (msg?.includes("No access") ? "This isn't open to you anymore." : "Something went wrong. Try again.");

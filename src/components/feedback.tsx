"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import Modal from "./modal";

const EVENT = "cafenoct:feedback";
export const openFeedback = () => window.dispatchEvent(new Event(EVENT));
const MOODS: [string, string][] = [["love", "💖 Love it"], ["idea", "💡 Idea"], ["confused", "🤔 Confusing"], ["bug", "🐞 Something broke"]];

// "Send feedback" from anywhere in the app. Notes go to the app owner along with the page you were on.
export default function Feedback() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState("idea");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return toast("Write a few words first.");
    setBusy(true);
    const { error } = await supabase().from("feedback").insert({ page: path, mood, body: body.trim().slice(0, 4000) });
    setBusy(false);
    if (error) return toast("Could not send. Check your connection.");
    setBody(""); setOpen(false);
    toast("Thank you! Your note was sent.");
  }

  if (!open) return null;
  return (
    <Modal label="Send feedback" onClose={() => setOpen(false)}>
      <form onSubmit={send} style={{ display: "contents" }}>
        <h2>Send feedback</h2>
        <p className="small muted" style={{ marginTop: 0 }}>What&apos;s working, what&apos;s confusing, what you wish it did. Anything helps.</p>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }} role="group" aria-label="Kind of feedback">
          {MOODS.map(([k, l]) => <button key={k} type="button" aria-pressed={mood === k} className={`btn small${mood === k ? " solid" : ""}`} onClick={() => setMood(k)}>{l}</button>)}
        </div>
        <div className="form"><div className="field full"><label htmlFor="fb-body">Your note</label><textarea id="fb-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. I couldn't find where to change a client's rate" /></div></div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{busy ? "Sending…" : "Send"}</button>
        </div>
      </form>
    </Modal>
  );
}

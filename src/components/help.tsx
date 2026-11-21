"use client";

// "Have a question?" — a round Nocti button in the corner that opens a small help panel (not a blocking modal).
// Ask Nocti chats with /api/nocti about your workspace; Quick answers are short written how-tos with a link to the page.
// The chat lives in this component's state only, so a reload clears it.
import Link from "next/link";
import Image from "next/image";
import { Fragment, useEffect, useRef, useState } from "react";
import Nocti from "./nocti";
import Icon from "./icon";
import Seg from "./seg";
import { openTour } from "./tour";
import { openFeedback } from "./feedback";
import { openPalette } from "./command-palette";
import "@/styles/help.css";

type QA = { q: string; a: string; href?: string; palette?: boolean; k?: string };
const QAS: QA[] = [
  { q: "How do I invoice from my logged hours?", href: "/time", k: "bill billing unbilled rate",
    a: "On Time, each hourly client shows “Invoice … unbilled”. Tap it and the invoice fills in at their rate, and those hours are marked billed. A client's Invoices tab has the same button." },
  { q: "How do I start a timer?", href: "/time", k: "track clock stopwatch",
    a: "Tap “Start timer” on a client's overview, on Time, or in the Timer note on Today. Several timers can run at once. Stop saves the time as an entry for that client." },
  { q: "How do I share an approval link?", href: "/content", k: "approve client review sign off",
    a: "Save a post or deliverable, then tap “Send for approval” and copy the link. Your client approves or asks for changes without logging in, and their answer lands in your Inbox." },
  { q: "How do I invite a client to their portal?", href: "/clients", k: "portal access login",
    a: "Open the client, find the Client portal card, enter their email and tap “Make invite link”. Copy it and send it to them. You can revoke access there anytime." },
  { q: "How do I set up a booking page?", href: "/settings", k: "schedule meeting calendly book",
    a: "In Settings, under Booking pages, tap “New page”. Choose a link, a length and your days. People only see times when your calendar is clear, and bookings land on your calendar." },
  { q: "How do intake forms work?", href: "/settings", k: "request form intake",
    a: "In Settings, under Request forms, tap “New form” and share its /form/ link. Every request someone sends becomes a task on your Work board." },
  { q: "How do I use templates?", href: "/work", k: "template reuse save",
    a: "In a task, post or invoice form, tap “Save as template”. Next time you start a new one, pick the template at the top and it fills everything in." },
  { q: "How do I set a reminder?", href: "/inbox", k: "remind notification alert",
    a: "Tap “Remind me” on a task, post or invoice and pick when. At that time the reminder shows up in your Inbox." },
  { q: "How do I attach files to a task?", href: "/work", k: "upload file attachment pdf image",
    a: "Open the task and tap “Attach files”. Images, PDFs, Office files, text, ZIP, MP4 and MOV all work. Files stay private to you." },
  { q: "How do I customize my home board?", href: "/", k: "widgets today home",
    a: "On Today, tap “Customize” to add, remove or reorder widgets. Tap “Done” when it looks right." },
  { q: "Can I import clients or tasks from a CSV?", href: "/clients", k: "csv spreadsheet import export",
    a: "Yes. On Clients, tap “Import” (or “Export” for a copy). The Work board has its own Import for tasks. Pick your file and match the columns." },
  { q: "What does Cmd+K do?", palette: true, k: "search jump shortcut command palette ctrl",
    a: "Press ⌘K (Ctrl+K on Windows) or tap “Search or jump…” in the sidebar to find clients, tasks and pages, or start things like a new task. On a phone it's under More → Search." },
  { q: "How do I make a task repeat?", href: "/work", k: "recurring repeat daily weekly monthly",
    a: "In the task, set Repeats to Every work day, Every week or Every month. When you finish it, the next one is ready. In the Today list you can also type “daily”." },
  { q: "What are automations?", href: "/automations", k: "rules automate workflow",
    a: "“When this changes, do that” rules. Start from a preset (ask for a review when a project is done, celebrate payments, turn revisions into tasks) or make your own. They run on their own." },
  { q: "How does the pipeline work?", href: "/pipeline", k: "leads deals crm stages",
    a: "Drag cards between stages and add a value and next step to each deal. “Convert to client” turns a lead into a client. “Import clients” adds a card for clients you already have." },
  { q: "How do I log an expense?", href: "/wallet", k: "wallet receipt spend cost",
    a: "In Wallet, tap “Add expense” and add a receipt photo if you have one. Receipts are stored privately. Wallet also shows how much is ready to bill." },
  { q: "How do I get a monthly report PDF?", href: "/clients", k: "report pdf month summary",
    a: "Open a client, pick the month next to “Monthly report” and open it. Tap “Save as PDF”, then choose Save as PDF in your browser's print window." },
  { q: "How do I turn on night mode?", href: "/settings", k: "dark theme night",
    a: "In Settings, under Theme, choose Dark, or Auto to follow your phone or computer. It's saved to your profile so it follows you to other devices." },
  { q: "How do I reset my password?", href: "/account/password", k: "password forgot login",
    a: "Signed in, open Change password and set a new one. Signed out, tap “Forgot password?” on the sign-in page and we'll email you a link." },
  { q: "How do I see my Instagram grid?", href: "/content", k: "content calendar grid instagram feed",
    a: "On Content calendar, switch the view to Grid to see the feed before it posts. Drag tiles to change the order and their dates swap." },
];

const SUGGEST = ["What's due today?", "Who owes me money?", "How do I invoice from my hours?"];
type Msg = { role: "user" | "assistant"; content: string; skip?: boolean };

// Plain text, except markdown links to in-app paths ("/..." but never "//" or "/\"), which become Links.
const LINK = /\[([^\]\n]{1,200})\]\((\/(?![/\\])[\w\-./?=&%#~]*)\)/g;
function Answer({ text, onGo }: { text: string; onGo: () => void }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    out.push(text.slice(last, m.index));
    out.push(<Link key={m.index} href={m[2]} onClick={onGo}>{m[1]}</Link>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out.map((x, i) => <Fragment key={i}>{x}</Fragment>)}</>;
}

export default function Help() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"ask" | "qa">("ask");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [find, setFind] = useState("");
  const fab = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);

  const refocus = useRef(false);
  const close = (back = true) => { refocus.current = back; setOpen(false); };
  // Focus returns to the button after closing (once it's visible again on phones).
  useEffect(() => { if (!open && refocus.current) { refocus.current = false; fab.current?.focus(); } }, [open]);

  // Focus the box you type in when the panel opens or the tab changes.
  useEffect(() => {
    if (!open) return;
    (tab === "ask" ? input.current : search.current)?.focus({ preventScroll: true });
  }, [open, tab]);

  // Escape closes, as long as you're in the panel (or nowhere in particular) and no dialog is on top.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector(".scrim, .cmdk-scrim")) return;
      const a = document.activeElement;
      if (a && a !== document.body && !panel.current?.contains(a) && a !== fab.current) return;
      refocus.current = true;
      setOpen(false);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);

  useEffect(() => { list.current?.lastElementChild?.scrollIntoView({ block: "nearest" }); }, [msgs, busy]);

  async function ask(text: string) {
    const q = text.trim().slice(0, 2000);
    if (!q || busy) return;
    const mine: Msg = { role: "user", content: q };
    const next = [...msgs, mine];
    setMsgs(next); setDraft(""); setBusy(true);
    const fail = (content: string) => setMsgs((m) => [...m.map((x) => (x === mine ? { ...x, skip: true } : x)), { role: "assistant", content, skip: true }]);
    try {
      const res = await fetch("/api/nocti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => !m.skip).slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 2000) })) }),
      });
      const data = (await res.json().catch(() => ({}))) as { text?: unknown; error?: unknown };
      if (res.ok && typeof data.text === "string") setMsgs((m) => [...m, { role: "assistant", content: data.text as string }]);
      else if (res.status === 503) fail("I'm not switched on yet, so I can't chat today. The Quick answers tab still knows lots!");
      else fail(typeof data.error === "string" ? data.error : "Hmm, I couldn't answer just now. Try again in a moment.");
    } catch {
      fail("I can't reach the café right now. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const needle = find.trim().toLowerCase();
  const shown = needle ? QAS.filter((x) => `${x.q} ${x.a} ${x.k ?? ""}`.toLowerCase().includes(needle)) : QAS;

  return (
    <div className={`help${open ? " open" : ""}`}>
      {open && (
        <section ref={panel} id="help-panel" className="help-panel" role="dialog" aria-modal="false" aria-labelledby="help-h">
          <header className="help-top">
            <Nocti size={40} mood="awake" state={busy ? "thinking" : "idle"} label={busy ? "Nocti, thinking" : "Nocti"} />
            <div className="help-hi"><h2 id="help-h">Have a question?</h2><span>Nocti is here to help</span></div>
            <button type="button" className="help-x" onClick={() => close()} aria-label="Close help"><Icon name="x" /></button>
          </header>
          <Seg label="Help sections" value={tab} onChange={setTab} options={[["ask", "Ask Nocti"], ["qa", "Quick answers"]]} />

          {tab === "ask" ? (
            <div className="help-body help-chat">
              <ol ref={list} className="help-msgs" aria-live="polite" aria-label="Conversation with Nocti">
                {msgs.length === 0 && <li className="help-msg nocti">Hi! Ask me how to do something, or about your clients, tasks and invoices.</li>}
                {msgs.map((m, i) => (
                  <li key={i} className={`help-msg ${m.role === "user" ? "me" : "nocti"}${m.skip && m.role === "assistant" ? " oops" : ""}`}>
                    <span className="sr-only">{m.role === "user" ? "You: " : "Nocti: "}</span>
                    {m.role === "assistant" ? <Answer text={m.content} onGo={() => close(false)} /> : m.content}
                  </li>
                ))}
                {busy && <li className="help-msg nocti help-dots"><span className="sr-only">Nocti is thinking…</span><i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" /></li>}
              </ol>
              {msgs.length === 0 && (
                <div className="help-chips" role="group" aria-label="Try asking">
                  {SUGGEST.map((s) => <button key={s} type="button" className="pill" onClick={() => ask(s)}>{s}</button>)}
                </div>
              )}
              <form className="help-ask" onSubmit={(e) => { e.preventDefault(); ask(draft); }}>
                <label htmlFor="help-input" className="sr-only">Ask Nocti</label>
                <textarea id="help-input" ref={input} rows={2} maxLength={2000} value={draft} placeholder="Ask Nocti anything…"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(draft); } }} />
                <button type="submit" className="btn solid small" disabled={busy || !draft.trim()} aria-label="Send question"><Icon name="right" /></button>
              </form>
              <p className="help-note">Nocti reads your workspace to answer. Answers can be wrong.</p>
            </div>
          ) : (
            <div className="help-body">
              <div className="field help-find">
                <label htmlFor="help-search" className="sr-only">Search quick answers</label>
                <input id="help-search" ref={search} type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search, e.g. invoice, timer, portal" />
              </div>
              {shown.length ? (
                <ul className="help-qas">
                  {shown.map((x) => (
                    <li key={x.q}>
                      <details open={!!needle && shown.length <= 2}>
                        <summary>{x.q}</summary>
                        <p>{x.a}</p>
                        {x.palette
                          ? <button type="button" className="btn small" onClick={() => { close(false); openPalette(); }}><Icon name="more" />Open search</button>
                          : <Link className="btn small" href={x.href!} onClick={() => close(false)}><Icon name="right" />Take me there</Link>}
                      </details>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="help-none">Nothing matches “{find.trim()}”. <button type="button" className="linkish" onClick={() => { setTab("ask"); setDraft(find.trim()); }}>Ask Nocti instead</button></p>
              )}
            </div>
          )}

          <footer className="help-foot">
            <button type="button" className="btn small ghost" onClick={() => { close(false); openTour(); }}><Icon name="spark" />Take the tour</button>
            <button type="button" className="btn small ghost" onClick={() => { close(false); openFeedback(); }}><Icon name="chat" />Send feedback</button>
          </footer>
        </section>
      )}
      <button ref={fab} type="button" className="help-fab" onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open} aria-controls={open ? "help-panel" : undefined} aria-label={open ? "Close help" : "Have a question? Ask Nocti"}>
        <Image src="/nocti/question.png" alt="" width={46} height={46} className="help-fab-img" draggable={false} />
      </button>
    </div>
  );
}

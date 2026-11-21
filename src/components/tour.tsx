"use client";

// The first-run walkthrough, led by awake Nocti. Four real first actions, in order:
// add a client → create a task → start a timer → create an invoice. Each step ticks itself off when the thing
// actually exists in your data. Skippable any time; reopen it from "Take the tour" in the sidebar.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { supabase } from "@/lib/use-rows";
import Nocti, { type NoctiState } from "./nocti";
import "@/styles/tour.css";

const STEPS = [
  { key: "client", table: "clients", title: "Add your first client", line: "Everything in CafeNoct hangs off a client: work, time, posts and invoices.", href: "/clients/new", cta: "Add a client" },
  { key: "task", table: "tasks", title: "Create your first task", line: "Jot down one thing you'll do for them. Small is perfect.", href: "/work?new=1", cta: "New task" },
  { key: "timer", table: "time_entries", title: "Start your first timer", line: "Press play on the Timer card when you start working. Stop it when you're done.", href: "/", cta: "Go to the timer" },
  { key: "invoice", table: "invoices", title: "Create your first invoice", line: "Turn logged hours into an invoice in a couple of taps.", href: "/invoices", cta: "Open invoices" },
] as const;
type Key = (typeof STEPS)[number]["key"];

export const openTour = () => window.dispatchEvent(new Event("cn:tour"));

async function saveHidden(hidden: boolean) {
  const sb = supabase();
  const { data: auth } = await sb.auth.getSession();
  const uid = auth.session?.user.id;
  if (!uid) return;
  const { data } = await sb.from("profiles").select("settings").eq("user_id", uid).maybeSingle<{ settings: Record<string, unknown> | null }>();
  await sb.from("profiles").update({ settings: { ...(data?.settings ?? {}), tour: { hidden } } }).eq("user_id", uid);
}

export default function Tour({ hidden: savedHidden, seen }: { hidden: boolean; seen: boolean }) {
  const path = usePathname();
  const [hidden, setHidden] = useState(savedHidden);
  const [small, setSmall] = useState(false);
  const [done, setDone] = useState<Record<Key, boolean> | null>(null);
  const [mood, setMood] = useState<NoctiState>("idle");
  const card = useRef<HTMLDivElement>(null);
  const prev = useRef(0);

  // What's already done, read from your real data (a timer counts once it's running or logged).
  const check = useCallback(async () => {
    const sb = supabase();
    const has = async (t: string) => ((await sb.from(t).select("id", { count: "exact", head: true })).count ?? 0) > 0;
    const [client, task, entries, timers, invoice] = await Promise.all([has("clients"), has("tasks"), has("time_entries"), has("timers"), has("invoices")]);
    // Someone who already did all four before the tour existed never needs to see it.
    if (!seen && client && task && (entries || timers) && invoice) { setHidden(true); return; }
    setDone({ client, task, timer: entries || timers, invoice });
  }, [seen]);

  useEffect(() => {
    if (hidden) return;
    const t = setTimeout(check, 0);
    const again = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", again);
    const i = setInterval(check, 15000);
    return () => { clearTimeout(t); clearInterval(i); document.removeEventListener("visibilitychange", again); };
  }, [hidden, path, check]);

  useEffect(() => {
    const open = () => { setHidden(false); setSmall(false); saveHidden(false); };
    window.addEventListener("cn:tour", open);
    return () => window.removeEventListener("cn:tour", open);
  }, []);

  const count = done ? STEPS.filter((s) => done[s.key]).length : 0;
  // A step just got ticked off: Nocti hops.
  useEffect(() => {
    if (count > prev.current && prev.current !== 0) {
      const t1 = setTimeout(() => setMood("happy"), 0), t2 = setTimeout(() => setMood("idle"), 1400);
      prev.current = count;
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    prev.current = count;
  }, [count]);

  useEffect(() => {
    if (hidden || !card.current) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(card.current, { y: 24, opacity: 0, duration: 0.45, ease: "power3.out" });
    });
    return () => mm.revert();
  }, [hidden, small]);

  if (hidden || !done) return null;
  const allDone = count === STEPS.length;
  const current = STEPS.find((s) => !done[s.key]);
  const skip = () => { setHidden(true); saveHidden(true); };

  if (small) {
    return (
      <button type="button" className="tour-bubble" onClick={() => setSmall(false)} aria-label={`Open the tour, ${count} of ${STEPS.length} done`}>
        <Nocti mood="awake" state={mood} size={52} />
        <span className="tour-count">{count}/{STEPS.length}</span>
      </button>
    );
  }

  return (
    <aside className="tour" ref={card} aria-label="Getting started">
      <div className="tour-top">
        <Nocti mood="awake" state={allDone ? "happy" : mood} size={64} />
        <div className="tour-hi">
          <b>{allDone ? "You're all set ♡" : "Hi, I'm Nocti"}</b>
          <span>{allDone ? "That's the whole loop. I'll be around if you need me." : `Let's get you brewing. ${count} of ${STEPS.length} done.`}</span>
        </div>
        <button type="button" className="tour-x" onClick={() => setSmall(true)} aria-label="Minimize the tour">–</button>
      </div>
      <ol className="tour-steps">
        {STEPS.map((s) => {
          const ok = done[s.key], now = current?.key === s.key;
          return (
            <li key={s.key} className={`${ok ? "ok" : ""}${now ? " now" : ""}`}>
              <span className="tour-tick" aria-hidden="true">{ok ? "✓" : ""}</span>
              <div>
                <b>{s.title}</b>
                {now && <p>{s.line}</p>}
                {now && <Link className="btn solid small" href={s.href}>{s.cta}</Link>}
              </div>
              <span className="sr-only">{ok ? "done" : now ? "next" : "to do"}</span>
            </li>
          );
        })}
      </ol>
      <div className="tour-foot">
        <span className="small muted">Reopen anytime from “Take the tour”.</span>
        <button type="button" className="linkish" onClick={skip}>{allDone ? "Close" : "Skip tour"}</button>
      </div>
    </aside>
  );
}

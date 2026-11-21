"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { complete, noteLeave, read, secondsLeft, subscribe, type FocusState } from "@/lib/focus";
import { pad } from "@/lib/dates";
import { toast } from "@/lib/toast";
import IdleCheck from "./idle-check";

const server = () => null;

// Runs on every page: finishes focus sessions on time, counts leaving the tab, shows a small timer pill,
// and mounts the "Still working?" check for running timers.
export default function FocusRunner() {
  const s = useSyncExternalStore(subscribe, read, server) as FocusState | null;
  const path = usePathname();
  const [, setTick] = useState(0);

  useEffect(() => {
    const i = setInterval(() => {
      const f = read();
      if (f.running && Date.now() >= f.endAt) complete("done");
      if (f.running) setTick((n) => n + 1);
    }, 1000);
    const vis = () => {
      if (document.hidden) noteLeave();
      else { const f = read(); if (f.running && f.phase === "focus" && f.leaves) toast(`Welcome back. That's ${f.leaves} time${f.leaves > 1 ? "s" : ""} away this session.`); }
    };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(i); document.removeEventListener("visibilitychange", vis); };
  }, []);

  if (!s?.running || path === "/focus") return <IdleCheck />;
  const left = secondsLeft(s);
  return (
    <>
    <IdleCheck />
    <Link href="/focus" className="focus-pill" aria-label="Focus timer running. Open Focus.">
      <span className="dot-live" />
      <span className="num">{pad(Math.floor(left / 60))}:{pad(left % 60)}</span>
      <span>{s.phase === "focus" ? s.note || "Focus" : "Break"}</span>
    </Link>
    </>
  );
}

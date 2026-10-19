"use client";

import { useEffect } from "react";
import { desktopCall, isDesktop, notify, openOutside } from "@/lib/desktop";
import { useTimers } from "./timers";

// Only does something inside the Mac app: keeps the menu bar clock in step with your running timers,
// opens outside links (Gmail, Wise, client sites) in your browser, and shows Automations reminders.
export default function DesktopBridge() {
  const [timers] = useTimers();

  useEffect(() => {
    if (!isDesktop() || !timers) return;
    const starts = timers.map((t) => new Date(t.started_at).getTime()).sort((a, b) => a - b);
    desktopCall("set_tray_timer", { startMs: starts[0] ?? null, others: Math.max(0, starts.length - 1) });
  }, [timers]);

  useEffect(() => {
    if (!isDesktop()) return;
    document.documentElement.dataset.desktop = "1";
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      // The app has one window, so CafeNoct's own "new tab" links (like Print invoice) open in place.
      if (a.origin === location.origin) { if (a.target === "_blank") { e.preventDefault(); location.assign(a.href); } return; }
      if (/^https?:/.test(a.href)) { e.preventDefault(); openOutside(a.href); }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (!isDesktop()) return;
    const KEY = "cafenoct.mac-nudges";
    const check = async () => {
      const j = await fetch("/api/automations/due").then((r) => r.json()).catch(() => null);
      if (!j?.nudges?.length) return;
      let seen: string[] = [];
      try { seen = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch {}
      for (const n of j.nudges as { key: string; title: string; body: string }[]) {
        if (seen.includes(n.key)) continue;
        seen.push(n.key);
        await notify(n.title, n.body);
      }
      try { localStorage.setItem(KEY, JSON.stringify(seen.slice(-300))); } catch {}
    };
    check();
    const i = setInterval(check, 2 * 60000);
    return () => clearInterval(i);
  }, []);

  return null;
}

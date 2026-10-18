"use client";

import { useSyncExternalStore } from "react";
import { useRows } from "@/lib/use-rows";
import { parseYmd, today, weekStartYmd } from "@/lib/dates";
import { planBlocks } from "@/lib/cal";
import { hrs, money } from "@/lib/format";
import type { Client } from "@/lib/types";

type Entry = { client_id: string | null; minutes: number; started_at: string };

export function useWeekEntries(clientId?: string) {
  return useRows<Entry>(`week:${clientId ?? "all"}`, (s) => {
    let q = s.from("time_entries").select("client_id,minutes,started_at").gte("started_at", parseYmd(weekStartYmd()).toISOString());
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  }, ["time_entries"]);
}

// Hours today and this week, and what that work is worth at each client's rate.
export default function WeekStats({ clients, goal, currency = "USD", clientId }: { clients: Client[]; goal: number; currency?: string; clientId?: string }) {
  const [rows] = useWeekEntries(clientId);
  // "Today" depends on your device's time zone, so planned hours are worked out only in the browser.
  const ready = useSyncExternalStore(() => () => {}, () => true, () => false);
  const t0 = parseYmd(today()).getTime();
  const all = rows ?? [];
  const todayMin = all.filter((e) => new Date(e.started_at).getTime() >= t0).reduce((a, e) => a + e.minutes, 0);
  const weekMin = all.reduce((a, e) => a + e.minutes, 0);
  const earned = clients.filter((c) => c.rate_type === "Hourly" && c.rate).reduce((a, c) => a + (all.filter((e) => e.client_id === c.id).reduce((x, e) => x + e.minutes, 0) / 60) * (c.rate ?? 0), 0);
  const c = clientId ? clients.find((x) => x.id === clientId) : undefined;
  // Usual hours that fall on your today, after converting from each client's time zone.
  const plannedToday = !ready ? 0 : Math.round(planBlocks(today(), c ? [c] : clients).reduce((a, p) => a + p.e - p.s, 0) / 6) / 10;
  const weekGoal = c ? c.weekly_hours ?? 0 : goal;
  const bar = (v: number, max: number) => max ? <div className="bar"><i style={{ width: `${Math.min(100, (v / 60 / max) * 100)}%`, background: c?.color }} /></div> : null;
  return (
    <div className="stats">
      <div className="stat"><span className="k">Today</span><span className="v">{hrs(todayMin)}h</span><span className="s">{plannedToday ? `of ${plannedToday}h planned` : "logged"}</span>{bar(todayMin, plannedToday)}</div>
      <div className="stat"><span className="k">This week</span><span className="v">{hrs(weekMin)}h</span><span className="s">{weekGoal ? `of ${weekGoal}h ${c ? "target" : "goal"}` : "logged"}</span>{bar(weekMin, weekGoal)}</div>
      <div className="stat"><span className="k">Earned this week</span><span className="v">{c && c.rate_type !== "Hourly" ? "—" : money(earned, c?.currency ?? currency)}</span><span className="s">{c && c.rate_type !== "Hourly" ? c.rate_type : "hours × rate"}</span></div>
      <div className="stat"><span className="k">{c ? "Rate" : "Active clients"}</span><span className="v">{c ? (c.rate ? money(c.rate, c.currency) : "—") : clients.filter((x) => x.status === "Active").length}</span><span className="s">{c ? (c.rate_type === "Hourly" ? "per hour" : c.rate_type) : "portals"}</span></div>
    </div>
  );
}

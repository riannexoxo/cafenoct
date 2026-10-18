import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clientLabel, type Client, type Profile } from "@/lib/types";
import { hrs, money, weekStart } from "@/lib/format";
import Icon from "@/components/icon";

export const metadata = { title: "Today" };

export default async function Today() {
  const supabase = await createClient();
  const ws = weekStart();
  const [{ data: profile }, { data: clients }, { data: entries }] = await Promise.all([
    supabase.from("profiles").select("user_id,name,currency,weekly_goal").maybeSingle<Profile>(),
    supabase.from("clients").select("*").eq("status", "Active").order("company").returns<Client[]>(),
    supabase.from("time_entries").select("client_id,minutes,started_at").gte("started_at", ws.toISOString()),
  ]);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekMin = (entries ?? []).reduce((a, e) => a + e.minutes, 0);
  const todayMin = (entries ?? []).filter((e) => new Date(e.started_at) >= todayStart).reduce((a, e) => a + e.minutes, 0);
  const byClient = (id: string) => (entries ?? []).filter((e) => e.client_id === id).reduce((a, e) => a + e.minutes, 0);
  const earned = (clients ?? []).filter((c) => c.rate_type === "Hourly" && c.rate).reduce((a, c) => a + (byClient(c.id) / 60) * (c.rate ?? 0), 0);
  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = profile?.name?.split(" ")[0];
  const goal = profile?.weekly_goal || 40;

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          <h1>{greet}{first ? `, ${first}` : ""}.</h1>
          <p>{hrs(todayMin)}h worked today · {hrs(weekMin)}h this week</p>
        </div>
      </div>
      <div className="stats">
        <div className="stat"><span className="k">Today</span><span className="v">{hrs(todayMin)}h</span><span className="s">logged</span></div>
        <div className="stat"><span className="k">This week</span><span className="v">{hrs(weekMin)}h</span><span className="s">of {goal}h goal</span><div className="bar"><i style={{ width: `${Math.min(100, (weekMin / 60 / goal) * 100)}%` }} /></div></div>
        <div className="stat"><span className="k">Earned this week</span><span className="v">{money(earned, profile?.currency)}</span><span className="s">hours × each rate</span></div>
        <div className="stat"><span className="k">Active clients</span><span className="v">{clients?.length ?? 0}</span><span className="s">portals</span></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 18, fontWeight: 500 }}>Client portals</h2>
          <Link className="btn small ghost" href="/clients/new"><Icon name="plus" />New client</Link>
        </div>
        {clients?.length ? (
          <div className="doors">
            {clients.map((c) => (
              <Link key={c.id} href={`/clients/${c.id}`} className="door spot" style={{ ["--c" as string]: c.color }}>
                <span className="door-top">
                  <span className="avatar" style={{ background: c.color, width: 40, height: 40, fontSize: 16, borderRadius: 14 }}>{clientLabel(c)[0].toUpperCase()}</span>
                  <span className="door-go"><Icon name="right" size={16} /></span>
                </span>
                <span className="door-name">{clientLabel(c)}</span>
                <span className="small muted">{hrs(byClient(c.id))}{c.weekly_hours ? `/${c.weekly_hours}` : ""}h this week</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card empty"><b>Add your first client</b><span>Each client gets a portal with projects, tasks, time, money and reports.</span></div>
        )}
      </div>
    </>
  );
}

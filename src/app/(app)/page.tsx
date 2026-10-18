import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clientLabel, type Client, type Profile } from "@/lib/types";
import Icon from "@/components/icon";
import Greeting from "@/components/greeting";
import WeekStats from "@/components/week-stats";
import TodoList from "@/components/todo-list";
import Timers from "@/components/timers";

export const metadata = { title: "Today" };

export default async function Today() {
  const supabase = await createClient();
  const [{ data: profile }, { data: clients }] = await Promise.all([
    supabase.from("profiles").select("user_id,name,currency,weekly_goal").maybeSingle<Profile>(),
    supabase.from("clients").select("*").neq("status", "Past").order("company").returns<Client[]>(),
  ]);
  const list = clients ?? [];
  const active = list.filter((c) => c.status === "Active");
  return (
    <>
      <div className="head">
        <Greeting name={profile?.name?.split(" ")[0]} />
        <Link className="btn solid" href="/focus"><Icon name="focus" />Start focus</Link>
      </div>
      <WeekStats clients={list} goal={profile?.weekly_goal || 40} currency={profile?.currency} />
      <div className="grid g2" style={{ alignItems: "start" }}>
        <TodoList clients={list} />
        <Timers clients={list} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 18, fontWeight: 500 }}>Client portals</h2>
          <Link className="btn small ghost" href="/clients/new"><Icon name="plus" />New client</Link>
        </div>
        {active.length ? (
          <div className="doors">
            {active.map((c) => (
              <Link key={c.id} href={`/clients/${c.id}`} className="door spot" style={{ ["--c" as string]: c.color }}>
                <span className="door-top">
                  <span className="avatar" style={{ background: c.color, width: 40, height: 40, fontSize: 16, borderRadius: 14 }}>{clientLabel(c)[0].toUpperCase()}</span>
                  <span className="door-go"><Icon name="right" size={16} /></span>
                </span>
                <span className="door-name">{clientLabel(c)}</span>
                <span className="small muted">{c.weekly_hours ? `${c.weekly_hours}h a week` : c.services || "Open portal"}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card empty"><b>Add your first client</b><span>Each client gets a portal with projects, tasks, time, money and reports.</span><Link className="btn small" href="/clients/new"><Icon name="plus" />New client</Link></div>
        )}
      </div>
    </>
  );
}

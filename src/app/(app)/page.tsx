import Link from "next/link";
import { clientLabel } from "@/lib/types";
import { getClients, getProfile } from "@/lib/data";
import Icon from "@/components/icon";
import Greeting from "@/components/greeting";
import WeekStats from "@/components/week-stats";
import TodoList from "@/components/todo-list";
import Timers from "@/components/timers";
import ClientAvatar from "@/components/client-avatar";
import { BoardMotion, QuickAddNote, UnpaidNote, UpcomingNote } from "@/components/board";

export const metadata = { title: "Today" };

export default async function Today() {
  const [profile, clients] = await Promise.all([getProfile(), getClients()]);
  const list = clients.filter((c) => c.status !== "Past");
  const active = list.filter((c) => c.status === "Active");
  return (
    <>
      <div className="head">
        <Greeting name={profile?.name?.split(" ")[0]} />
        <Link className="btn solid" href="/focus"><Icon name="focus" />Start focus</Link>
      </div>
      <WeekStats clients={list} goal={profile?.weekly_goal || 40} currency={profile?.currency} />
      <BoardMotion>
        <div className="note note-blush note-tall"><Timers clients={list} /></div>
        <div className="note note-cream note-tall"><TodoList clients={list} /></div>
        <UpcomingNote clients={list} />
        <UnpaidNote clients={list} />
        <QuickAddNote clients={list} from={{ name: profile?.business || profile?.name || "", email: profile?.invoice_email || "" }} />
      </BoardMotion>
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
                  <ClientAvatar c={c} size={40} />
                  <span className="door-go"><Icon name="right" size={16} /></span>
                </span>
                <span className="door-name">{clientLabel(c)}</span>
                <span className="small muted">{c.weekly_hours ? `${c.weekly_hours}h a week` : c.services || "Open portal"}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card empty"><b>Add your first client</b><span>Each client gets a portal with projects, tasks, time, invoices and reports.</span><Link className="btn small" href="/clients/new"><Icon name="plus" />New client</Link></div>
        )}
      </div>
    </>
  );
}

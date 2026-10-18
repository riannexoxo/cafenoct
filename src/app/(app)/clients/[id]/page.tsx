import Link from "next/link";
import { notFound } from "next/navigation";
import { clientLabel } from "@/lib/types";
import { getClients } from "@/lib/data";
import { rateText } from "@/lib/format";
import Icon from "@/components/icon";
import WeekStats from "@/components/week-stats";
import TodoList from "@/components/todo-list";
import Timers from "@/components/timers";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function ClientPortal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clients = await getClients();
  const c = clients.find((x) => x.id === id);
  if (!c) notFound();
  const schedule = c.work_days.length ? `${c.work_days.length === 5 && c.work_days.join() === "1,2,3,4,5" ? "Mon–Fri" : c.work_days.map((d) => DAYS[d - 1]).join(", ")}${c.hours_per_day ? `, ${c.hours_per_day}h a day` : ""}` : c.weekly_hours ? `${c.weekly_hours}h a week, flexible days` : "";
  return (
    <>
      <div className="head portal-band" style={{ ["--c" as string]: c.color }}>
        <div className="row" style={{ flexWrap: "nowrap", gap: 16, minWidth: 0 }}>
          <span className="avatar" style={{ background: c.color }}>{clientLabel(c)[0].toUpperCase()}</span>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Client portal · {rateText(c)}{schedule ? ` · ${schedule}` : ""}</div>
            <h1 style={{ overflowWrap: "anywhere" }}>{clientLabel(c)}</h1>
            <p>{c.company ? c.name : ""}{c.services ? `${c.company ? " · " : ""}${c.services}` : ""}</p>
          </div>
        </div>
        <Link className="btn" href={`/clients/${c.id}/edit`}>Edit</Link>
      </div>
      <WeekStats clients={clients ?? []} goal={c.weekly_hours ?? 0} clientId={c.id} />
      <div className="grid g2" style={{ alignItems: "start" }}>
        <TodoList clients={clients ?? []} clientId={c.id} />
        <Timers clients={clients ?? []} clientId={c.id} />
      </div>
      <div className="card small muted row" style={{ gap: 8 }}><Icon name="spark" size={16} />Projects, calendar, content, money, docs and EOD reports for this client are next to move over.</div>
    </>
  );
}

"use client";

// The home page: My Day on the left, a board of widgets you choose and arrange on the right.
// Your layout is saved to your profile, so it follows you to every device.
import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/use-rows";
import { useFlip } from "@/lib/flip";
import { toast } from "@/lib/toast";
import type { Client } from "@/lib/types";
import Greeting from "./greeting";
import MyDay from "./my-day";
import Timers from "./timers";
import TodoList from "./todo-list";
import { BoardMotion, QuickAddNote, UnpaidNote, UpcomingNote } from "./board";
import { ClientsNote, IncomeNote, PipelineNote, PostsNote, WaitingNote, WeekNote } from "./widgets";
import Icon from "./icon";

type Props = { clients: Client[]; name?: string; goal: number; currency: string; from: { name: string; email: string }; saved: unknown };

export const WIDGETS = {
  timer: { label: "Timer", blurb: "Start and stop timers" },
  upcoming: { label: "Coming up", blurb: "Meetings and blocks this week" },
  posts: { label: "Posts this week", blurb: "What's going out and what needs approval" },
  waiting: { label: "Waiting on clients", blurb: "Designs, edits and posts sent for a yes" },
  week: { label: "This week", blurb: "Hours against your weekly goal" },
  unpaid: { label: "Waiting on payment", blurb: "Sent invoices and who's late" },
  income: { label: "Paid this month", blurb: "Money in, compared with last month" },
  pipeline: { label: "Pipeline", blurb: "Open leads and next steps" },
  quickadd: { label: "Quick add", blurb: "Task, time, event, invoice or client" },
  clients: { label: "Client portals", blurb: "Jump into any active client" },
  todo: { label: "To-do list", blurb: "The classic checklist with repeats" },
} as const;
type Key = keyof typeof WIDGETS;
const DEFAULT: Key[] = ["timer", "upcoming", "posts", "waiting", "week", "unpaid", "quickadd", "clients"];

// Saved settings are user-editable data: keep only known widget names, once each.
function clean(v: unknown): Key[] {
  if (!Array.isArray(v)) return DEFAULT;
  return [...new Set(v.filter((k): k is Key => typeof k === "string" && k in WIDGETS))];
}

async function save(widgets: Key[]) {
  const sb = supabase();
  const { data: auth } = await sb.auth.getSession();
  const uid = auth.session?.user.id;
  if (!uid) return false;
  const { data } = await sb.from("profiles").select("settings").eq("user_id", uid).maybeSingle<{ settings: Record<string, unknown> | null }>();
  const { error } = await sb.from("profiles").update({ settings: { ...(data?.settings ?? {}), home: { widgets } } }).eq("user_id", uid);
  return !error;
}

export default function HomeBoard({ clients, name, goal, currency, from, saved }: Props) {
  const [list, setList] = useState<Key[]>(() => clean((saved as { widgets?: unknown } | null)?.widgets));
  const [edit, setEdit] = useState(false);
  const [drag, setDrag] = useState<Key | null>(null);
  const [root, capture] = useFlip<HTMLDivElement>();
  const hidden = (Object.keys(WIDGETS) as Key[]).filter((k) => !list.includes(k));

  function change(next: Key[]) {
    capture();
    setList(next);
    save(next).then((ok) => { if (!ok) toast("Could not save your board. Check your connection."); });
  }
  const move = (k: Key, by: number) => {
    const i = list.indexOf(k), j = i + by;
    if (j < 0 || j >= list.length) return;
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]];
    change(next);
  };
  const dropOn = (k: Key) => {
    if (!drag || drag === k) return;
    const next = list.filter((x) => x !== drag);
    next.splice(next.indexOf(k), 0, drag);
    change(next);
    setDrag(null);
  };

  const render = (k: Key) => {
    switch (k) {
      case "timer": return <div className="note note-blush"><Timers clients={clients} /></div>;
      case "upcoming": return <UpcomingNote clients={clients} />;
      case "posts": return <PostsNote clients={clients} />;
      case "waiting": return <WaitingNote clients={clients} />;
      case "week": return <WeekNote clients={clients} goal={goal} />;
      case "unpaid": return <UnpaidNote clients={clients} />;
      case "income": return <IncomeNote currency={currency} />;
      case "pipeline": return <PipelineNote currency={currency} />;
      case "quickadd": return <QuickAddNote clients={clients} from={from} />;
      case "clients": return <ClientsNote clients={clients} />;
      case "todo": return <div className="note note-cream"><TodoList clients={clients} /></div>;
    }
  };

  return (
    <>
      <div className="head home-head">
        <Greeting name={name} />
        <div className="row">
          <button type="button" className={`btn${edit ? " solid" : " ghost"}`} aria-pressed={edit} onClick={() => setEdit(!edit)}>
            <Icon name={edit ? "check" : "apps"} />{edit ? "Done" : "Customize"}
          </button>
          {!edit && <Link className="btn solid" href="/focus"><Icon name="focus" />Start focus</Link>}
        </div>
      </div>
      <div className="home-grid">
        <MyDay clients={clients} />
        <div ref={root} className={`widgets${edit ? " editing" : ""}`}>
          <BoardMotion>
            {list.map((k, i) => (
              <div key={k} data-flip-id={k} className={`widget${drag === k ? " dragging" : ""}`}
                draggable={edit} onDragStart={(e) => { setDrag(k); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDrag(null)}
                onDragOver={(e) => { if (edit && drag) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); dropOn(k); }}>
                {edit && (
                  <div className="w-tools" role="group" aria-label={`${WIDGETS[k].label} widget`}>
                    <span className="w-grip" aria-hidden><Icon name="updown" size={14} />{WIDGETS[k].label}</span>
                    <button type="button" onClick={() => move(k, -1)} disabled={i === 0} aria-label={`Move ${WIDGETS[k].label} up`}><Icon name="left" size={14} className="up" /></button>
                    <button type="button" onClick={() => move(k, 1)} disabled={i === list.length - 1} aria-label={`Move ${WIDGETS[k].label} down`}><Icon name="right" size={14} className="down" /></button>
                    <button type="button" onClick={() => change(list.filter((x) => x !== k))} aria-label={`Remove ${WIDGETS[k].label}`}><Icon name="x" size={14} /></button>
                  </div>
                )}
                <div className="w-body" inert={edit}>{render(k)}</div>
              </div>
            ))}
          </BoardMotion>
          {edit && (
            <section className="w-add" aria-labelledby="w-add-h">
              <h3 id="w-add-h">Add a widget</h3>
              {hidden.length ? (
                <ul>
                  {hidden.map((k) => (
                    <li key={k}><button type="button" onClick={() => change([...list, k])}><Icon name="plus" size={15} /><span><b>{WIDGETS[k].label}</b><small>{WIDGETS[k].blurb}</small></span></button></li>
                  ))}
                </ul>
              ) : <p className="small muted">Every widget is on your board.</p>}
              <button type="button" className="btn small ghost" onClick={() => change(DEFAULT)}>Reset to the default board</button>
            </section>
          )}
          {!edit && list.length === 0 && <button type="button" className="w-add empty-add" onClick={() => setEdit(true)}><Icon name="plus" />Add widgets to your board</button>}
        </div>
      </div>
    </>
  );
}

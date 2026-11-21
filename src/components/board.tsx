"use client";

// The home board: sticky-note cards for what's next. Each card reads live data and reuses the app's own forms.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { useRows } from "@/lib/use-rows";
import { EVENT_COLS, expandEvents, type CalEvent } from "@/lib/cal";
import { INVOICE_COLS, isOverdue, total, type Invoice } from "@/lib/invoices";
import { money } from "@/lib/format";
import { today } from "@/lib/dates";
import { clientLabel, type Client } from "@/lib/types";
import { PROJECT_COLS, type Project } from "@/lib/work";
import TaskForm from "./task-form";
import EventForm from "./event-form";
import InvoiceForm from "./invoice-form";
import TimeForm from "./time-form";
import Nocti from "./nocti";
import Icon, { type IconName } from "./icon";

const name = (clients: Client[], id: string | null) => { const c = clients.find((x) => x.id === id); return c ? clientLabel(c) : ""; };

// Cards drift up one after another on first paint. Skipped entirely for reduced motion.
export function BoardMotion({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(ref.current!.querySelectorAll(":scope > *"), { y: 18, opacity: 0, rotate: () => gsap.utils.random(-1.5, 1.5), duration: 0.6, ease: "back.out(1.6)", stagger: 0.06, clearProps: "transform,opacity" });
    });
    return () => mm.revert();
  }, []);
  return <div ref={ref} className="board-notes">{children}</div>;
}

export function UpcomingNote({ clients }: { clients: Client[] }) {
  const [now] = useState(() => Date.now());
  const until = now + 7 * 864e5;
  const [events] = useRows<CalEvent>("board-events", (s) => s.from("events").select(EVENT_COLS).lte("starts_at", new Date(until).toISOString()).or(`ends_at.gte.${new Date(now).toISOString()},repeat.neq.none`).limit(200), ["events"]);
  const next = events ? expandEvents(events, now, until).sort((a, b) => a.start - b.start).slice(0, 5) : null;
  const when = (ms: number) => new Date(ms).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
  return (
    <section className="note note-lav" aria-labelledby="n-up">
      <header><h3 id="n-up">Coming up</h3><Link className="note-more" href="/calendar">Calendar<Icon name="right" size={14} /></Link></header>
      {next === null ? <p className="note-wait">Loading…</p> : next.length ? (
        <ul className="note-list">
          {next.map((o) => (
            <li key={o.key}><b>{o.ev.title || "Untitled"}</b><span>{when(o.start)}{o.ev.client_id ? ` · ${name(clients, o.ev.client_id)}` : ""}</span></li>
          ))}
        </ul>
      ) : <Empty text="Nothing on the calendar this week." />}
    </section>
  );
}

export function UnpaidNote({ clients }: { clients: Client[] }) {
  const [list] = useRows<Invoice>("board-unpaid", (s) => s.from("invoices").select(INVOICE_COLS).eq("status", "sent").order("due_date", { nullsFirst: false }).limit(50), ["invoices"]);
  const t = today();
  const late = (list ?? []).filter((i) => isOverdue(i, t)).length;
  return (
    <section className="note note-butter" aria-labelledby="n-pay">
      <header><h3 id="n-pay">Waiting on payment</h3><Link className="note-more" href="/invoices">Invoices<Icon name="right" size={14} /></Link></header>
      {list === null ? <p className="note-wait">Loading…</p> : list.length ? (
        <>
          {late > 0 && <p className="note-flag">{late} past due</p>}
          <ul className="note-list">
            {list.slice(0, 5).map((i) => (
              <li key={i.id} className={isOverdue(i, t) ? "late" : ""}>
                <b>{i.number} · {money(total(i), i.currency)}</b>
                <span>{name(clients, i.client_id) || "No client"}{i.due_date ? ` · due ${i.due_date}` : ""}</span>
              </li>
            ))}
          </ul>
        </>
      ) : <Empty text="Every invoice is paid. Lovely." />}
    </section>
  );
}

type Add = "task" | "event" | "invoice" | "time" | null;
export function QuickAddNote({ clients, from }: { clients: Client[]; from: { name: string; email: string } }) {
  const [open, setOpen] = useState<Add>(null);
  const [projects] = useRows<Project>("board-projects", (s) => s.from("projects").select(PROJECT_COLS).neq("status", "Done").limit(200), ["projects"]);
  const [invoices] = useRows<Pick<Invoice, "number">>("board-inv-numbers", (s) => s.from("invoices").select("number"), ["invoices"]);
  const close = () => setOpen(null);
  const btn = (k: Exclude<Add, null>, icon: IconName, label: string) => (
    <button type="button" className="note-add" onClick={() => setOpen(k)}><Icon name={icon} size={16} />{label}</button>
  );
  return (
    <section className="note note-mint" aria-labelledby="n-add">
      <header><h3 id="n-add">Quick add</h3></header>
      <div className="note-adds">
        {btn("task", "plus", "Task")}
        {btn("time", "time", "Log time")}
        {btn("event", "schedule", "Event")}
        {btn("invoice", "money", "Invoice")}
        <Link className="note-add" href="/clients/new"><Icon name="clients" size={16} />Client</Link>
      </div>
      {open === "task" && <TaskForm clients={clients} projects={projects ?? []} onClose={close} onSaved={close} />}
      {open === "event" && <EventForm clients={clients} onClose={close} onSaved={close} />}
      {open === "time" && <TimeForm clients={clients} onClose={close} onSaved={close} />}
      {open === "invoice" && <InvoiceForm clients={clients} existing={invoices ?? []} from={from} onClose={close} onSaved={close} />}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="note-empty"><Nocti mood="sleepy" size={56} /><span>{text}</span></div>;
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase, useRows } from "@/lib/use-rows";
import { rel, today } from "@/lib/dates";
import { TASK_COLS, nextUp, setStatus, type Task } from "@/lib/work";
import { toast } from "@/lib/toast";
import { clientLabel, type Client } from "@/lib/types";
import Timers from "./timers";
import Icon from "./icon";

// One screen for a quick look on your phone: do the next thing, jot a new one, start a timer.
export default function Quick({ clients }: { clients: Client[] }) {
  const [tasks, reload, setTasks] = useRows<Task>("quick-tasks", (s) => s.from("tasks").select(TASK_COLS).neq("status", "done").order("due_date", { nullsFirst: false }).limit(300), ["tasks"]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const t = today();
  const next = tasks ? nextUp(tasks) : undefined;
  const open = (tasks ?? []).filter((x) => x.due_date && x.due_date <= t && x.status !== "waiting").length;
  const label = (id: string | null) => { const c = clients.find((x) => x.id === id); return c ? clientLabel(c) : ""; };

  async function done() {
    if (!next) return;
    setBusy(true);
    setTasks((r) => (r ?? []).filter((x) => x.id !== next.id));
    const r = await setStatus(next, "done", clients.find((c) => c.id === next.client_id));
    setBusy(false);
    if (r.error) { reload(); return toast("Could not save. Try again."); }
    const after = nextUp((tasks ?? []).filter((x) => x.id !== next.id));
    toast(after ? `Nice. Next up: ${after.title}` : "Nice. That's everything for now.");
    if (r.next) reload();
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const title = text.trim();
    if (!title) return;
    setText("");
    const { error } = await supabase().from("tasks").insert({ title, status: "todo", due_date: t });
    if (error) { setText(title); return toast("Could not add it. Try again."); }
    toast("Added for today");
    reload();
  }

  return (
    <div className="quick">
      <div className="head" style={{ marginBottom: 0 }}>
        <div>
          <h1>What&apos;s next</h1>
          <p>{tasks == null ? " " : open ? `${open} task${open === 1 ? "" : "s"} due today or earlier.` : "Nothing due today."}</p>
        </div>
      </div>

      <div className="card">
        {tasks == null ? <div className="skel" style={{ height: 70 }} /> : next ? (
          <>
            <div className="small muted">{[next.status === "doing" ? "In progress" : next.due_date ? rel(next.due_date) : "No date", label(next.client_id)].filter(Boolean).join(" · ")}</div>
            <div className="quick-next">{next.title}</div>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn solid" disabled={busy} onClick={done}><Icon name="check" />Done</button>
              <Link className="btn" href="/work">All tasks</Link>
            </div>
          </>
        ) : <p className="muted" style={{ margin: 0 }}>You&apos;re all caught up. <Link href="/work" className="linkish">Open Work</Link></p>}
      </div>

      <form className="card quick-add" onSubmit={add}>
        <label htmlFor="q-add" className="sr-only">New task</label>
        <input id="q-add" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task for today…" enterKeyHint="done" />
        <button className="btn solid" type="submit" aria-label="Add task"><Icon name="plus" /></button>
      </form>

      <Timers clients={clients} />
    </div>
  );
}

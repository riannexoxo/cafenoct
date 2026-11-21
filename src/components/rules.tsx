"use client";

import "@/styles/rules.css";
import { useState } from "react";
import Link from "next/link";
import { supabase, useRows } from "@/lib/use-rows";
import { STAGES, stageLabel, type Stage } from "@/lib/pipeline";
import { toast } from "@/lib/toast";
import Modal from "./modal";
import Icon from "./icon";

// Status values are the database checks for each table (see the shared brief).
const SOURCES = {
  task: { label: "task", statuses: [["todo", "To do"], ["doing", "Doing"], ["waiting", "Waiting on client"], ["done", "Done"]] },
  deliverable: { label: "deliverable", statuses: [["brief", "Brief"], ["making", "Making"], ["review", "In review"], ["revisions", "Revisions"], ["approved", "Approved"], ["delivered", "Delivered"]] },
  invoice: { label: "invoice", statuses: [["draft", "Draft"], ["sent", "Sent"], ["paid", "Paid"]] },
  project: { label: "project", statuses: [["Active", "Active"], ["On hold", "On hold"], ["Done", "Done"]] },
} as const;
type Source = keyof typeof SOURCES;
type Action = "task" | "notify" | "move_card";
const ACTIONS: [Action, string][] = [["task", "create a task"], ["notify", "notify me"], ["move_card", "move the client's pipeline card"]];

type Rule = { id: string; preset: string; active: boolean; source: Source; to_status: string; action: Action; action_title: string; action_stage: "" | Stage };
type Result = { id: string; kind: string; title: string; body: string; href: string; created_at: string };

const PRESETS: (Omit<Rule, "id" | "active"> & { name: string; tone: string })[] = [
  { preset: "review", name: "Ask for a review when a project is done", tone: "note-mint", source: "project", to_status: "Done", action: "task", action_title: "Ask {client} for a review", action_stage: "" },
  { preset: "paid", name: "Celebrate payments", tone: "note-butter", source: "invoice", to_status: "paid", action: "notify", action_title: "{client} paid {item} ♡", action_stage: "" },
  { preset: "revisions", name: "Revisions become tasks", tone: "note-lav", source: "deliverable", to_status: "revisions", action: "task", action_title: "Revise: {item} for {client}", action_stage: "" },
];

const statusLabel = (src: Source, s: string) => (SOURCES[src]?.statuses as readonly (readonly [string, string])[]).find((x) => x[0] === s)?.[1] ?? s;
function sentence(r: Pick<Rule, "source" | "to_status" | "action" | "action_title" | "action_stage">) {
  const then = r.action === "move_card" ? `move the client's card to ${stageLabel(r.action_stage)}`
    : `${r.action === "task" ? "create a task" : "notify me"} “${r.action_title || "{item}"}”`;
  return { when: `When a ${SOURCES[r.source]?.label ?? r.source} changes to ${statusLabel(r.source, r.to_status)}`, then };
}
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// "When this changes, do that" rules. The cn_run_rules trigger runs them in the database, so nothing here has to stay open.
export default function Rules() {
  const [rules, reload, setRules] = useRows<Rule>("rules", (s) => s.from("automation_rules").select("id,preset,active,source,to_status,action,action_title,action_stage").order("created_at").limit(100), ["automation_rules"]);
  const [results] = useRows<Result>("rule-results", (s) => s.from("notifications").select("id,kind,title,body,href,created_at").in("kind", ["automation", "invoice"]).order("created_at", { ascending: false }).limit(10), ["notifications"]);
  const [edit, setEdit] = useState<Partial<Rule> | null>(null);
  const [sure, setSure] = useState("");
  const [adding, setAdding] = useState("");

  async function addPreset(p: (typeof PRESETS)[number]) {
    const had = rules?.find((r) => r.preset === p.preset);
    if (had) return had.active ? undefined : toggle(had);
    setAdding(p.preset);
    const { error } = await supabase().from("automation_rules").insert({ preset: p.preset, source: p.source, to_status: p.to_status, action: p.action, action_title: p.action_title, action_stage: p.action_stage });
    setAdding("");
    if (error) return toast("Could not turn that on. Try again.");
    toast(`${p.name}: on`);
    reload();
  }

  async function toggle(r: Rule) {
    setRules((cur) => cur?.map((x) => (x.id === r.id ? { ...x, active: !r.active } : x)) ?? cur);
    const { error } = await supabase().from("automation_rules").update({ active: !r.active }).eq("id", r.id);
    if (error) {
      setRules((cur) => cur?.map((x) => (x.id === r.id ? r : x)) ?? cur);
      toast("Could not change that rule. Try again.");
    }
  }

  async function remove(r: Rule) {
    if (sure !== r.id) return setSure(r.id);
    setSure("");
    const { error } = await supabase().from("automation_rules").delete().eq("id", r.id);
    if (error) return toast("Could not delete that rule. Try again.");
    toast("Rule deleted");
    reload();
  }

  return (
    <section className="card rules" aria-labelledby="rules-h">
      <div className="rules-head">
        <div>
          <h2 id="rules-h">When this happens, do that</h2>
          <p className="muted small">Rules run on the server the moment a status changes, even when a client approves something from their portal.</p>
        </div>
        <button type="button" className="btn solid small" onClick={() => setEdit({})}><Icon name="plus" size={16} /> New rule</button>
      </div>

      <div className="rules-presets">
        {PRESETS.map((p) => {
          const had = rules?.find((r) => r.preset === p.preset), on = !!had?.active;
          const s = sentence(p);
          return (
            <button key={p.preset} type="button" className={`note ${p.tone} rule-preset${on ? " on" : ""}`} onClick={() => addPreset(p)} disabled={!rules || on || adding === p.preset} aria-pressed={on}>
              <b>{p.name}</b>
              <span className="small">{s.when}, {s.then}.</span>
              <span className={`pill${on ? " rule-on" : ""}`}>{on ? <><Icon name="check" size={14} /> On</> : adding === p.preset ? "Turning on…" : had ? "Off · tap to turn on" : "Tap to turn on"}</span>
            </button>
          );
        })}
      </div>

      {!!rules?.length && (
        <ul className="rules-list">
          {rules.map((r) => {
            const s = sentence(r);
            return (
              <li key={r.id} className={r.active ? "" : "off"}>
                <button type="button" role="switch" aria-checked={r.active} aria-label={`${s.when}, ${s.then}`} className={`sw${r.active ? " on" : ""}`} onClick={() => toggle(r)} />
                <span className="rule-text"><span>{s.when}</span><span className="rule-then"><Icon name="right" size={14} /> {s.then}</span></span>
                <span className="rule-acts">
                  <button type="button" className="btn ghost small" onClick={() => setEdit(r)}>Edit</button>
                  <button type="button" className="btn ghost small danger" onClick={() => remove(r)} onBlur={() => setSure((x) => (x === r.id ? "" : x))}>{sure === r.id ? "Tap again" : "Delete"}</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="rules-results">
        <h3>Recently ran</h3>
        {!results ? <div className="skel rules-skel" /> : !results.length ? (
          <p className="muted small">Nothing has run yet. Turn on a rule, then change a status to see it here.</p>
        ) : (
          <ul>
            {results.map((n) => (
              <li key={n.id}>
                <Icon name={n.kind === "invoice" ? "money" : "auto"} size={16} />
                <span className="rule-res">{n.href.startsWith("/") ? <Link href={n.href} className="linkish">{n.title}</Link> : n.title}{n.body && <span className="muted small"> · {n.body}</span>}</span>
                <time className="muted small" dateTime={n.created_at}>{when(n.created_at)}</time>
              </li>
            ))}
          </ul>
        )}
      </div>

      {edit && <RuleEditor rule={edit} onClose={() => setEdit(null)} onSaved={reload} />}
    </section>
  );
}

function RuleEditor({ rule, onClose, onSaved }: { rule: Partial<Rule>; onClose: () => void; onSaved: () => void }) {
  const [source, setSource] = useState<Source>(rule.source ?? "task");
  const [status, setStatus] = useState(rule.to_status ?? SOURCES[rule.source ?? "task"].statuses[0][0]);
  const [action, setAction] = useState<Action>(rule.action ?? "task");
  const [stage, setStage] = useState<"" | Stage>(rule.action_stage || "active");
  const [title, setTitle] = useState(rule.action_title ?? "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const statuses = SOURCES[source].statuses as readonly (readonly [string, string])[];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // Same limits as the automation_rules checks; the status list per source is only enforced here.
    if (!statuses.some((x) => x[0] === status)) return setMsg("Pick a status.");
    if (!ACTIONS.some((x) => x[0] === action)) return setMsg("Pick what should happen.");
    if (action === "move_card" && !STAGES.some((s) => s.key === stage)) return setMsg("Pick a pipeline stage.");
    if (title.trim().length > 200) return setMsg("Keep the title under 200 characters.");
    const row = { source, to_status: status, action, action_title: action === "move_card" ? "" : title.trim(), action_stage: action === "move_card" ? stage : "" };
    setBusy(true);
    const { error } = rule.id ? await supabase().from("automation_rules").update(row).eq("id", rule.id) : await supabase().from("automation_rules").insert({ ...row, preset: "custom" });
    setBusy(false);
    if (error) return setMsg("Could not save. Check your connection and try again.");
    toast(rule.id ? "Rule saved" : "Rule added");
    onSaved();
    onClose();
  }

  return (
    <Modal label={rule.id ? "Edit rule" : "New rule"} onClose={onClose}>
      <form onSubmit={save} style={{ display: "contents" }}>
        <h2>{rule.id ? "Edit rule" : "New rule"}</h2>
        <div className="form rule-form">
          <div className="field"><label htmlFor="ru-src">When a</label>
            <select id="ru-src" value={source} onChange={(e) => { const s = e.target.value as Source; setSource(s); setStatus(SOURCES[s].statuses[0][0]); }}>
              {(Object.keys(SOURCES) as Source[]).map((k) => <option key={k} value={k}>{SOURCES[k].label}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="ru-status">changes to</label>
            <select id="ru-status" value={status} onChange={(e) => setStatus(e.target.value)}>{statuses.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
          <div className={`field${action === "move_card" ? "" : " full"}`}><label htmlFor="ru-act">then</label>
            <select id="ru-act" value={action} onChange={(e) => setAction(e.target.value as Action)}>{ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
          {action === "move_card" ? (
            <div className="field"><label htmlFor="ru-stage">to stage</label>
              <select id="ru-stage" value={stage} onChange={(e) => setStage(e.target.value as Stage)}>{STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
            </div>
          ) : (
            <div className="field full"><label htmlFor="ru-title">{action === "task" ? "Task title" : "Message"} (optional)</label>
              <input id="ru-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={action === "task" ? "Follow up on {item} with {client}" : "{item} for {client} changed"} aria-describedby="ru-hint" />
              <span id="ru-hint" className="small muted">{"{item}"} is the task, file, invoice or project name. {"{client}"} is the client.</span>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <span className="small muted left" role="status">{msg}</span>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{busy ? "Saving…" : rule.id ? "Save" : "Add rule"}</button>
        </div>
      </form>
    </Modal>
  );
}

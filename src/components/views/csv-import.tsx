"use client";

import { useState } from "react";
import { supabase } from "@/lib/use-rows";
import { isYmd, parseCsv } from "@/lib/csv";
import Modal from "@/components/modal";
import Nocti from "@/components/nocti";

export type Field = {
  key: string; label: string; required?: boolean; aliases?: string[]; max?: number;
  type?: "text" | "date" | "enum" | "number" | "list";
  options?: string[]; // allowed values for "enum" (matched without caring about case)
};
type Out = Record<string, unknown>;
type Checked = { line: number; values: Out | null; errors: string[]; cells: Record<string, string> };

const MAX_ROWS = 1000, MAX_BYTES = 5 * 1024 * 1024, BATCH = 100;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const NEVER = new Set(["id", "userid"]); // ids and owners always come from the database, never from a file

// Import rows from a CSV: pick a file, match its columns, check every row, then add the good ones.
// `finish` turns checked cells into a database row, or returns an error for that row.
export default function CsvImport({ title, table, fields, finish, onClose, onDone }: {
  title: string; table: "tasks" | "clients"; fields: Field[];
  finish: (cells: Record<string, string>) => Out | string;
  onClose: () => void; onDone: () => void;
}) {
  const [file, setFile] = useState<{ name: string; head: string[]; body: string[][] } | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; failed: number; skipped: Checked[] } | null>(null);
  const [problem, setProblem] = useState("");

  async function pick(f: File | undefined) {
    setProblem(""); setFile(null); setResult(null);
    if (!f) return;
    if (f.size > MAX_BYTES) return setProblem("That file is over 5 MB. Split it into smaller files.");
    const rows = parseCsv(await f.text());
    if (rows.length < 2) return setProblem("That file has no rows under the header.");
    const [head, ...body] = rows;
    if (body.length > MAX_ROWS) return setProblem(`That file has ${body.length} rows. Import up to ${MAX_ROWS} at a time.`);
    const auto: Record<string, number> = {};
    for (const fl of fields) {
      const names = [fl.key, fl.label, ...(fl.aliases ?? [])].map(norm);
      const i = head.findIndex((h) => !NEVER.has(norm(h)) && names.includes(norm(h)));
      if (i >= 0) auto[fl.key] = i;
    }
    setMap(auto);
    setFile({ name: f.name, head, body });
  }

  // Checks one row against the field rules and the database's allowed values.
  const check = (row: string[], line: number): Checked => {
    const cells: Record<string, string> = {}, errors: string[] = [];
    for (const fl of fields) {
      const i = map[fl.key];
      let v = (i === undefined ? "" : row[i] ?? "").trim();
      if (!v) { if (fl.required) errors.push(`${fl.label} is missing`); continue; }
      if (v.length > (fl.max ?? 4000)) { errors.push(`${fl.label} is too long`); continue; }
      if (fl.type === "date" && !isYmd(v)) { errors.push(`${fl.label} must be YYYY-MM-DD`); continue; }
      if (fl.type === "number" && !Number.isFinite(Number(v))) { errors.push(`${fl.label} must be a number`); continue; }
      if (fl.type === "enum") {
        const hit = fl.options!.find((o) => norm(o) === norm(v));
        if (!hit) { errors.push(`${fl.label} must be one of ${fl.options!.join(", ")}`); continue; }
        v = hit;
      }
      cells[fl.key] = v;
    }
    if (errors.length) return { line, values: null, errors, cells };
    const out = finish(cells);
    return typeof out === "string" ? { line, values: null, errors: [out], cells } : { line, values: out, errors, cells };
  };
  const checked = file ? file.body.map((r, i) => check(r, i + 2)) : [];
  const good = checked.filter((c) => c.values), bad = checked.filter((c) => !c.values);

  async function run() {
    setBusy(true);
    let added = 0, failed = 0;
    for (let i = 0; i < good.length; i += BATCH) {
      const batch = good.slice(i, i + BATCH).map((c) => Object.fromEntries(Object.entries(c.values!).filter(([k]) => !NEVER.has(norm(k)))));
      const { error } = await supabase().from(table).insert(batch);
      if (error) failed += batch.length; else added += batch.length;
    }
    setBusy(false);
    setResult({ added, failed, skipped: bad });
    if (added) onDone();
  }

  return (
    <Modal label={title} onClose={onClose} wide>
      <h2>{title}</h2>
      {result ? (
        <div className="empty v-empty">
          <Nocti mood="awake" state={result.added ? "happy" : "oops"} size={80} />
          <b>{result.added ? `Added ${result.added} ${result.added === 1 ? "row" : "rows"}` : "Nothing was added"}</b>
          {result.failed > 0 && <span className="bad-t">{result.failed} could not be saved. Check your connection and try those again.</span>}
          {result.skipped.length > 0 && <span>{result.skipped.length} skipped: {result.skipped.slice(0, 8).map((s) => `line ${s.line}`).join(", ")}{result.skipped.length > 8 ? "…" : ""}</span>}
          <button className="btn solid" onClick={onClose}>Done</button>
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="csv-file">CSV file (up to {MAX_ROWS} rows, 5 MB)</label>
            <input id="csv-file" type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0])} />
          </div>
          {problem && <p className="bad-t small" role="alert">{problem}</p>}
          {file && (
            <>
              <div className="form vmap">
                {fields.map((fl) => (
                  <div className="field" key={fl.key}>
                    <label htmlFor={`map-${fl.key}`}>{fl.label}{fl.required ? " *" : ""}</label>
                    <select id={`map-${fl.key}`} value={map[fl.key] ?? ""} onChange={(e) => setMap((m) => { const n = { ...m }; if (e.target.value === "") delete n[fl.key]; else n[fl.key] = Number(e.target.value); return n; })}>
                      <option value="">Skip</option>
                      {file.head.map((h, i) => (NEVER.has(norm(h)) ? null : <option key={i} value={i}>{h || `Column ${i + 1}`}</option>))}
                    </select>
                  </div>
                ))}
              </div>
              <p className="small muted">{good.length} ready · {bad.length} will be skipped · showing the first 50</p>
              <div className="table-wrap vpreview">
                <table>
                  <thead><tr><th>Line</th>{fields.filter((f) => map[f.key] !== undefined).map((f) => <th key={f.key}>{f.label}</th>)}<th>Check</th></tr></thead>
                  <tbody>
                    {checked.slice(0, 50).map((c) => (
                      <tr key={c.line} className={c.values ? "" : "vbad"}>
                        <td className="num">{c.line}</td>
                        {fields.filter((f) => map[f.key] !== undefined).map((f) => <td key={f.key} className="ellipsis" style={{ maxWidth: 180 }}>{c.cells[f.key] ?? ""}</td>)}
                        <td>{c.values ? <span className="pill good">OK</span> : <span className="small bad-t">{c.errors.join("; ")}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="modal-foot">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="button" className="btn solid" disabled={!good.length || busy} onClick={run}>{busy ? "Importing…" : `Import ${good.length} ${good.length === 1 ? "row" : "rows"}`}</button>
          </div>
        </>
      )}
    </Modal>
  );
}

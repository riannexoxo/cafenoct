"use client";

import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import "@/styles/views.css";

export type Val = string | number | null;
export type SheetCol<R> = {
  key: string; label: string; type: "text" | "select" | "date" | "number";
  get: (r: R) => Val;
  show?: (r: R, v: Val) => React.ReactNode; // how the cell looks when not editing
  options?: [string, string][]; // for select
  edit?: false; // read-only column
  right?: boolean;
  width?: number;
};
type Props<R> = {
  label: string; rows: R[]; cols: SheetCol<R>[];
  save: (r: R, key: string, v: Val) => Promise<{ error: unknown }>; // write one cell; resolve { error } when it fails
  group?: (r: R) => string; // rows arrive sorted by group; a header row starts each one
  open?: (r: R) => void; // the open button at the start of each row
};

// A spreadsheet grid. Click or Enter edits, Enter saves, Esc cancels, Tab and the arrow keys move.
// Edits show at once and roll back with a message if the save fails.
export default function Sheet<R extends { id: string }>({ label, rows, cols, save, group, open }: Props<R>) {
  const [at, setAt] = useState<[number, number]>([0, 0]);
  const [editing, setEditing] = useState<string | null>(null); // draft text while a cell is open
  // Edits waiting on the server: shown while the row still holds the old value, then the server's value wins.
  const [pending, setPending] = useState<Record<string, { v: Val; was: Val }>>({});
  const box = useRef<HTMLTableElement>(null);
  const wantFocus = useRef(false);
  const closed = useRef(false); // the editor was closed by a key, so its blur must not save again
  const startCol = open ? -1 : 0;
  const r0 = Math.max(0, Math.min(at[0], rows.length - 1)), c0 = at[1];
  useLayoutEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    const cell = box.current?.querySelector<HTMLElement>(`[data-cell="${r0}:${c0}"]`);
    (cell?.querySelector<HTMLElement>("input, select") ?? cell)?.focus();
  });

  const val = (r: R, c: SheetCol<R>) => { const p = pending[`${r.id}:${c.key}`], now = c.get(r); return p && p.was === now ? p.v : now; };
  const go = (r: number, c: number) => { wantFocus.current = true; setAt([Math.max(0, Math.min(rows.length - 1, r)), Math.max(startCol, Math.min(cols.length - 1, c))]); };

  async function commit(r: R, c: SheetCol<R>, raw: string) {
    setEditing(null);
    const v: Val = c.type === "number" ? (raw.trim() === "" ? null : Number(raw)) : c.type === "text" ? raw : raw || null;
    if (c.type === "number" && v !== null && !Number.isFinite(v)) return toast("That needs to be a number.");
    if (v === val(r, c)) return;
    const k = `${r.id}:${c.key}`;
    setPending((p) => ({ ...p, [k]: { v, was: c.get(r) } }));
    const { error } = await save(r, c.key, v);
    if (error) {
      setPending((p) => { const n = { ...p }; delete n[k]; return n; });
      toast("Could not save that cell. It's back to how it was.");
    }
  }
  function startEdit(c: SheetCol<R>, r: R, first?: string) {
    if (c.edit === false) return;
    const v = val(r, c);
    closed.current = false;
    setEditing(first ?? (v == null ? "" : String(v)));
    wantFocus.current = true;
  }

  // Keys while a cell is selected (not editing).
  function onCellKey(e: React.KeyboardEvent, ri: number, ci: number) {
    const r = rows[ri], c = cols[ci];
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[e.key]) { e.preventDefault(); return go(ri + moves[e.key][0], ci + moves[e.key][1]); }
    if (e.key === "Tab") {
      const next = ci + (e.shiftKey ? -1 : 1);
      if (next < startCol || next >= cols.length) return; // let Tab leave the grid at its edges
      e.preventDefault(); return go(ri, next);
    }
    if (ci < 0) return;
    if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); return startEdit(c, r); }
    if ((e.key === "Backspace" || e.key === "Delete") && c.edit !== false && c.type !== "select") { e.preventDefault(); return commit(r, c, ""); }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && (c.type === "text" || c.type === "number")) { e.preventDefault(); startEdit(c, r, e.key); }
  }
  // Keys inside the open editor.
  function onEditKey(e: React.KeyboardEvent, ri: number, ci: number) {
    const r = rows[ri], c = cols[ci], v = (e.target as HTMLInputElement).value;
    if (e.key === "Escape" || e.key === "Enter" || e.key === "Tab") closed.current = true;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(null); wantFocus.current = true; return; }
    if (e.key === "Enter") { e.preventDefault(); commit(r, c, v); return go(ri + (e.shiftKey ? -1 : 1), ci); }
    if (e.key === "Tab") { e.preventDefault(); commit(r, c, v); return go(ri, ci + (e.shiftKey ? -1 : 1)); }
  }

  return (
    <div className="table-wrap">
      <table ref={box} className="vsheet" role="grid" aria-label={label} aria-rowcount={rows.length}>
        <thead><tr>{open && <th aria-label="Open" style={{ width: 40 }} />}{cols.map((c) => <th key={c.key} className={c.right ? "r" : ""} style={c.width ? { minWidth: c.width } : undefined}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, ri) => {
            const g = group?.(r);
            const head = g !== undefined && (ri === 0 || group!(rows[ri - 1]) !== g) ? <tr className="vsheet-g"><td colSpan={cols.length + (open ? 1 : 0)}>{g}</td></tr> : null;
            return (
              <Fragment key={r.id}>
                {head}
                <tr>
                  {open && (
                    <td data-cell={`${ri}:-1`} tabIndex={r0 === ri && c0 === -1 ? 0 : -1} onKeyDown={(e) => { if (e.key === "Enter") open(r); else onCellKey(e, ri, -1); }} onFocus={() => setAt([ri, -1])} className="vsheet-open">
                      <button type="button" className="btn small ghost" tabIndex={-1} aria-label="Open" onClick={() => open(r)}>↗</button>
                    </td>
                  )}
                  {cols.map((c, ci) => {
                    const sel = r0 === ri && c0 === ci, ed = sel && editing !== null, v = val(r, c);
                    return (
                      <td key={c.key} data-cell={`${ri}:${ci}`} tabIndex={sel && !ed ? 0 : -1} aria-selected={sel} aria-readonly={c.edit === false || undefined}
                        className={`${c.right ? "r " : ""}${sel ? "sel " : ""}${c.edit === false ? "ro" : "ed"}`}
                        onClick={() => { if (!ed) { setAt([ri, ci]); startEdit(c, r); } }} onFocus={() => { if (!sel) setAt([ri, ci]); }}
                        onKeyDown={(e) => { if (!ed) onCellKey(e, ri, ci); }}>
                        {ed ? (
                          c.type === "select" ? (
                            <select aria-label={c.label} defaultValue={v == null ? "" : String(v)} onKeyDown={(e) => onEditKey(e, ri, ci)}
                              onChange={(e) => { commit(r, c, e.target.value); wantFocus.current = true; }} onBlur={() => setEditing(null)}>
                              {c.options!.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </select>
                          ) : (
                            <input aria-label={c.label} type={c.type === "date" ? "date" : c.type === "number" ? "number" : "text"} value={editing!}
                              onChange={(e) => setEditing(e.target.value)} onKeyDown={(e) => onEditKey(e, ri, ci)}
                              onBlur={(e) => { if (!closed.current) commit(r, c, e.target.value); closed.current = false; }} />
                          )
                        ) : (
                          <span className="vsheet-v">{c.show ? c.show(r, v) : v ?? <span className="muted">—</span>}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// CSV in and out (RFC 4180): quoted fields, doubled quotes, commas and newlines inside quotes.

// Reads CSV text into rows of cells. Strips a UTF-8 BOM and drops fully blank lines.
export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// A cell a spreadsheet would run as a formula gets a leading ' so it opens as plain text.
// Real numbers are left alone: a negative amount is not a formula.
const guard = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const cellOut = (v: unknown) => {
  if (v == null) return "";
  const s = typeof v === "number" ? String(v) : guard(String(v));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(cellOut).join(",")).join("\r\n");

// Saves CSV as a file. The BOM makes Excel read it as UTF-8 (parseCsv strips it again).
export function downloadCsv(name: string, rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

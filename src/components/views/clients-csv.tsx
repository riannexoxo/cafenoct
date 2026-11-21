"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/use-rows";
import { downloadCsv } from "@/lib/csv";
import { today } from "@/lib/dates";
import { toast } from "@/lib/toast";
import Icon from "@/components/icon";
import CsvImport, { type Field } from "./csv-import";

const COLS = ["name", "company", "email", "contact", "status", "rate", "rate_type", "currency", "services", "source", "start_date", "tags", "notes"] as const;
const FIELDS: Field[] = [
  { key: "name", label: "Name", required: true, max: 200, aliases: ["client", "full name", "contact name"] },
  { key: "company", label: "Company", max: 200, aliases: ["business", "organization"] },
  { key: "email", label: "Email", max: 320, aliases: ["e-mail", "email address"] },
  { key: "status", label: "Status", type: "enum", options: ["Active", "Lead", "Paused", "Past"] },
  { key: "rate", label: "Rate", type: "number" },
  { key: "rate_type", label: "Rate type", type: "enum", options: ["Hourly", "Monthly", "Per project", "No fixed rate", "Unpaid"] },
  { key: "currency", label: "Currency", max: 3 },
  { key: "services", label: "Services", max: 500 },
  { key: "source", label: "Source", max: 200 },
  { key: "start_date", label: "Start date", type: "date", aliases: ["started"] },
  { key: "tags", label: "Tags", type: "list", max: 500 },
  { key: "notes", label: "Notes" },
];

// Cells to a clients row. Only known columns go in; the database fills in ids and the owner.
function finish(c: Record<string, string>) {
  if (c.currency && !/^[A-Za-z]{3}$/.test(c.currency)) return "Currency must be a 3-letter code like USD";
  const row: Record<string, unknown> = { name: c.name };
  for (const k of ["company", "email", "status", "rate_type", "services", "source", "notes", "start_date"]) if (c[k]) row[k] = c[k];
  if (c.currency) row.currency = c.currency.toUpperCase();
  if (c.rate) row.rate = Number(c.rate);
  if (c.tags) row.tags = [...new Set(c.tags.split(/[;,]/).map((t) => t.trim()).filter(Boolean))].slice(0, 20);
  return row;
}

// Export and import buttons for the clients page.
export default function ClientsCsv() {
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  async function exportAll() {
    const { data, error } = await supabase().from("clients").select(COLS.join(",")).order("name").limit(5000);
    if (error) return toast("Could not export. Try again.");
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    downloadCsv(`clients-${today()}.csv`, [[...COLS], ...rows.map((r) => COLS.map((k) => (Array.isArray(r[k]) ? (r[k] as string[]).join("; ") : r[k])))]);
  }
  return (
    <div className="row" style={{ gap: 8 }}>
      <button className="btn ghost" onClick={exportAll}><Icon name="file" />Export</button>
      <button className="btn ghost" onClick={() => setImporting(true)}><Icon name="updown" />Import</button>
      {importing && <CsvImport title="Import clients" table="clients" fields={FIELDS} finish={finish} onClose={() => setImporting(false)} onDone={() => router.refresh()} />}
    </div>
  );
}

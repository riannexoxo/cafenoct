"use client";

import "@/styles/portal.css";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "./icon";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

// On the client page: pick a month (last month by default) and open its report.
export function ReportPicker({ clientId, initial }: { clientId: string; initial: string }) {
  const [m, setM] = useState(initial);
  const ok = MONTH.test(m);
  return (
    <div className="rpt-pick">
      <label htmlFor={`rpt-m-${clientId}`} className="sr-only">Report month</label>
      <input id={`rpt-m-${clientId}`} type="month" value={m} onChange={(e) => setM(e.target.value)} />
      <Link className={`btn${ok ? "" : " disabled"}`} href={ok ? `/clients/${clientId}/report/${m}` : "#"} aria-disabled={!ok}><Icon name="docs" />Monthly report</Link>
    </div>
  );
}

// On the report: switch months in place.
export function MonthSwitch({ clientId, month }: { clientId: string; month: string }) {
  const router = useRouter();
  return (
    <>
      <label htmlFor="rpt-month" className="sr-only">Month</label>
      <input id="rpt-month" type="month" defaultValue={month} onChange={(e) => { if (MONTH.test(e.target.value)) router.push(`/clients/${clientId}/report/${e.target.value}`); }} />
    </>
  );
}

export function SavePdf() {
  return <button type="button" className="btn solid" onClick={() => window.print()}><Icon name="file" />Save as PDF</button>;
}

// A short personal note at the top. Not saved anywhere: it's only for this printout.
export function IntroNote({ placeholder }: { placeholder: string }) {
  const [text, setText] = useState("");
  return (
    <div className="rpt-note">
      <label htmlFor="rpt-note" className="rpt-screen small muted">A note for your client (only on this printout, not saved)</label>
      <textarea id="rpt-note" className="rpt-screen" rows={3} maxLength={800} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
      <p className="rpt-print">{text || placeholder}</p>
    </div>
  );
}

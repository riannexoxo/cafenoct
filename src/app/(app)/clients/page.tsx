import Link from "next/link";
import { clientLabel } from "@/lib/types";
import { getClients } from "@/lib/data";
import { rateText } from "@/lib/format";
import Icon from "@/components/icon";

export const metadata = { title: "Clients" };

const ORDER = ["Active", "Lead", "Paused", "Past"];

export default async function Clients() {
  const clients = [...(await getClients())].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || clientLabel(a).localeCompare(clientLabel(b)));
  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Your people</div><h1>Clients</h1><p>{clients.filter((c) => c.status === "Active").length} active · {clients.length} total</p></div>
        <Link className="btn solid" href="/clients/new"><Icon name="plus" />New client</Link>
      </div>
      {clients.length ? (
        <div className="grid g3">
          {clients.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`} className="card spot lift" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <span className="avatar" style={{ background: c.color, width: 40, height: 40, fontSize: 16, borderRadius: 14 }}>{clientLabel(c)[0].toUpperCase()}</span>
                <div className="grow" style={{ minWidth: 0 }}><div className="ellipsis" style={{ fontWeight: 500 }}>{clientLabel(c)}</div><div className="small muted ellipsis">{c.company ? c.name : c.services || "—"}</div></div>
                <span className={`pill ${c.status === "Active" ? "good" : c.status === "Lead" ? "acc" : ""}`}>{c.status}</span>
              </div>
              <div className="small muted">{rateText(c)}</div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card empty"><b>Add your first client</b><span>Keep their rate, schedule, contacts and notes in one place.</span><Link className="btn small" href="/clients/new"><Icon name="plus" />New client</Link></div>
      )}
    </>
  );
}

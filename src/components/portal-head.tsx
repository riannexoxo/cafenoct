import Link from "next/link";
import { clientLabel, type Client } from "@/lib/types";
import ClientAvatar from "./client-avatar";

// The colored header at the top of each client portal page.
export default function PortalHead({ c, section, blurb }: { c: Client; section: string; blurb: string }) {
  return (
    <div className="head portal-band" style={{ ["--c" as string]: c.color }}>
      <div className="row" style={{ flexWrap: "nowrap", gap: 16, minWidth: 0 }}>
        <ClientAvatar c={c} />
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{c.personal ? "My own portal" : "Client portal"} · {section}</div>
          <h1 style={{ overflowWrap: "anywhere" }}>{clientLabel(c)}</h1>
          <p>{blurb}</p>
        </div>
      </div>
      <Link className="btn" href={`/clients/${c.id}`}>Overview</Link>
    </div>
  );
}

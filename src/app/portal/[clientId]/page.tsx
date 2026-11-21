import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { portalOwner, signFiles } from "@/lib/portal-server";
import { UUID, type PortalData } from "@/lib/portal";
import ClientAvatar from "@/components/client-avatar";
import Icon from "@/components/icon";
import CalmEmpty from "@/components/portal/calm-empty";
import PortalView from "@/components/portal/portal-view";

// One client's portal. Everything comes from portal_data, which checks this account was invited and is still active.
export default async function ClientPortalPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const noAccess = <CalmEmpty title="This portal isn't open to you" line="The link may be old, or access was turned off. Ask the person who invited you to send a new invite." href="/portal" action="See my portals" />;
  if (!UUID.test(clientId)) return noAccess;
  const sb = await createClient();
  const [{ data, error }, { data: all }] = await Promise.all([sb.rpc("portal_data", { p_client: clientId }), sb.rpc("portal_clients")]);
  if (error || !data?.client) return noAccess;
  const d = data as PortalData;
  ["projects", "deliverables", "posts", "invoices", "comments"].forEach((k) => { if (!Array.isArray(d[k as keyof PortalData])) (d as Record<string, unknown>)[k] = []; });
  // Signed links only for files portal_data itself returned.
  const me = (await sb.auth.getClaims()).data?.claims?.sub;
  const urls = await signFiles(d.deliverables.flatMap((x) => (x.files ?? []).map((f) => f.path)), await portalOwner(clientId, me));
  const many = Array.isArray(all) && all.length > 1;
  return (
    <>
      {many && <Link href="/portal" className="btn ghost small pt-back"><Icon name="left" />All portals</Link>}
      <header className="pt-hero" style={{ ["--c" as string]: d.client.color || "var(--accent)" }}>
        <ClientAvatar c={d.client} size={64} />
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Shared by {d.owner || "your team"}</div>
          <h1>{d.client.company || d.client.name}</h1>
          <p className="muted">Everything we&apos;re working on for you, in one place.</p>
        </div>
      </header>
      <PortalView data={d} urls={urls} />
    </>
  );
}

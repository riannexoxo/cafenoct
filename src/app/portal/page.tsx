import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClientAvatar from "@/components/client-avatar";
import Icon from "@/components/icon";
import CalmEmpty from "@/components/portal/calm-empty";
import { signOut } from "@/app/(app)/actions";

type Row = { client_id: string; name: string; company: string; color: string; logo_url: string; owner_name: string | null };

// Every portal shared with you. With just one, you go straight in.
export default async function PortalHome() {
  const sb = await createClient();
  const { data } = await sb.rpc("portal_clients");
  const list = (Array.isArray(data) ? data : []) as Row[];
  if (list.length === 1) redirect(`/portal/${list[0].client_id}`);
  if (!list.length) return (
    <CalmEmpty title="Nothing shared with you yet" line="When someone invites you to a portal, it shows up here. Signed in with the wrong email? Sign out and try the one your invite went to.">
      <form action={signOut}><button type="submit" className="btn solid big">Sign out</button></form>
    </CalmEmpty>
  );
  return (
    <>
      <h1 className="pt-hello">Your portals</h1>
      <div className="pt-portals">
        {list.map((p) => (
          <Link key={p.client_id} href={`/portal/${p.client_id}`} className="card pt-portal" style={{ ["--c" as string]: p.color || "var(--accent)" }}>
            <ClientAvatar c={{ name: p.name, company: p.company, color: p.color, logo_url: p.logo_url }} size={48} />
            <span className="grow"><b>{p.company || p.name}</b><span className="small muted">Shared by {p.owner_name || "your team"}</span></span>
            <Icon name="right" />
          </Link>
        ))}
      </div>
    </>
  );
}

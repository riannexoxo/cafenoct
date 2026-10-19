import { notFound } from "next/navigation";
import { adminClient } from "@/lib/automations-server";
import { ownerId } from "@/lib/owner";
import CopyButton from "@/components/copy-button";
import { createInvite, deleteInvite } from "./actions";

export const metadata = { title: "Friends beta" };
export const dynamic = "force-dynamic";

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");
const MOOD: Record<string, string> = { love: "💖", idea: "💡", confused: "🤔", bug: "🐞" };

// Only for the app owner: who signed up, invite codes, and feedback. Never anyone's clients, money or work.
export default async function OwnerPage() {
  const me = await ownerId();
  if (!me) notFound();
  const sb = adminClient();
  const [{ data: users }, { data: profiles }, { data: invites }, { data: feedback }] = await Promise.all([
    sb.auth.admin.listUsers({ perPage: 200 }),
    sb.from("profiles").select("user_id,name,business,settings"),
    sb.from("invites").select("code,note,created_at,used_by,used_at").order("created_at", { ascending: false }),
    sb.from("feedback").select("id,user_id,page,mood,body,created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  const prof = (id: string) => (profiles ?? []).find((p) => p.user_id === id);
  const people = (users?.users ?? []).filter((u) => u.id !== me).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const who = (id: string | null) => { if (!id) return ""; const p = prof(id), u = (users?.users ?? []).find((x) => x.id === id); return p?.name || u?.email || "Someone"; };
  const unused = (invites ?? []).filter((i) => !i.used_by);

  return (
    <>
      <div className="head"><div>
        <div className="eyebrow">Only you can see this</div>
        <h1>Friends beta</h1>
        <p>Invite friends, see who joined and read their feedback. Their clients, money and work stay private to them.</p>
      </div></div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <h3><span>Invite codes</span><span className="muted">{unused.length} unused</span></h3>
          <form action={createInvite} className="row" style={{ gap: 8, marginBottom: 12 }}>
            <input name="note" className="auto-pick grow" placeholder="Who it's for (e.g. Ana)" aria-label="Who the invite is for" />
            <button className="btn solid" type="submit">New invite</button>
          </form>
          {(invites ?? []).length ? (
            <div className="list">
              {(invites ?? []).map((i) => {
                const link = `https://cafenoct.vercel.app/login?invite=${i.code}`;
                return (
                  <div className="li" key={i.code}>
                    <span className="t"><span className="num">{i.code}</span><small>{i.note || "No note"} · {i.used_by ? `Used by ${who(i.used_by)} on ${when(i.used_at)}` : `Made ${when(i.created_at)}`}</small></span>
                    {!i.used_by && <>
                      <CopyButton text={link} label="Copy link" done="Invite link copied. Send it to your friend." />
                      <form action={deleteInvite}><input type="hidden" name="code" value={i.code} /><button className="btn small ghost" type="submit" aria-label={`Delete ${i.code}`}>Delete</button></form>
                    </>}
                  </div>
                );
              })}
            </div>
          ) : <p className="small muted">No invites yet. Make one for each friend; each code works once.</p>}
        </div>

        <div className="card">
          <h3><span>People</span><span className="muted">{people.length}</span></h3>
          {people.length ? (
            <div className="list">
              {people.map((u) => {
                const p = prof(u.id);
                return (
                  <div className="li" key={u.id}>
                    <span className="t">{p?.name || u.email}<small>{u.email} · joined {when(u.created_at)} · last in {when(u.last_sign_in_at)}</small></span>
                    <span className={`pill${p?.settings?.onboarded ? " good" : ""}`}>{p?.settings?.onboarded ? "Set up" : "Not set up"}</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="small muted">Nobody has joined yet.</p>}
        </div>
      </div>

      <div className="card">
        <h3><span>Feedback</span><span className="muted">{(feedback ?? []).length}</span></h3>
        {(feedback ?? []).length ? (
          <div className="list">
            {(feedback ?? []).map((f) => (
              <div className="li" key={f.id} style={{ alignItems: "flex-start" }}>
                <span style={{ fontSize: 18 }} aria-hidden="true">{MOOD[f.mood] ?? "💬"}</span>
                <span className="t" style={{ whiteSpace: "pre-wrap" }}>{f.body}<small>{who(f.user_id)} · {when(f.created_at)} · on {f.page || "/"}</small></span>
              </div>
            ))}
          </div>
        ) : <p className="small muted">No feedback yet. Friends can send it from &quot;Send feedback&quot; in the menu.</p>}
      </div>
    </>
  );
}

/* eslint-disable @next/next/no-img-element -- the small brand mark, already sized */
import "@/styles/portal.css";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { linkOwner, signFiles } from "@/lib/portal-server";
import { TOKEN, niceDate, type ShareData } from "@/lib/portal";
import { brand } from "@/brand";
import CalmEmpty from "@/components/portal/calm-empty";
import ApproveForm from "@/components/portal/approve-form";
import { ShareReactions } from "@/components/reactions";
import { DeliverablePreview, PostPreview, Thread } from "@/components/portal/previews";
import Icon from "@/components/icon";

export const metadata: Metadata = { title: "Approval", robots: { index: false, follow: false }, referrer: "no-referrer" };

// A private approval link: no sign-in, no tracking, only what share_view returns for this one item.
export default async function ApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = TOKEN.test(token) ? ((await (await createClient()).rpc("share_view", { p_token: token })).data as ShareData | null) : null;
  const shell = (body: React.ReactNode) => (
    <div className="pt-shell">
      <header className="pt-top"><span className="pt-brand"><img src={brand.logo} alt="" fetchPriority="high" decoding="async" width={28} height={28} /><span>{brand.name}</span></span></header>
      <main className="pt-main pt-narrow">{body}</main>
    </div>
  );
  if (!data?.item) return shell(<CalmEmpty title="This link has expired" line="Approval links close after a while or when they're turned off. Ask for a fresh link and you'll be all set." />);

  const item = data.item, owner = data.owner || "Your team";
  const isPost = data.entity === "post";
  const urls = isPost ? {} : await signFiles((item.files ?? []).map((f) => f.path), await linkOwner(token));
  const waiting = isPost ? item.status === "For approval" : item.status === "review";
  return shell(
    <>
      <div className="pt-ask">
        <div className="eyebrow">{owner}{data.client ? ` · for ${data.client}` : ""}</div>
        <h1>{item.title || (isPost ? "Your post" : "Your design")}</h1>
        <p className="muted">{waiting ? "Take a look. If it's good, tap Approve. If not, tell us what to change." : "You can leave a comment anytime."}</p>
      </div>
      {data.decision && (
        <div className={`pt-decided ${data.decision}`} role="status">
          <Icon name={data.decision === "approved" ? "check" : "repeat"} size={16} />
          {data.decision === "approved" ? "This was approved" : "Changes were requested"}{data.decided_at ? ` on ${niceDate(data.decided_at, true)}` : ""}.
        </div>
      )}
      <section className="card pt-sheet">
        {isPost ? <PostPreview p={item} /> : <DeliverablePreview d={item} urls={urls} />}
        <ShareReactions token={token} />
      </section>
      {data.comments.length > 0 && <section className="pt-sheet-thread"><h3>Comments</h3><Thread comments={data.comments} owner={owner} /></section>}
      <section className="card pt-sheet">
        <ApproveForm token={token} canDecide={waiting} />
      </section>
      <p className="small muted pt-fine">This private link works until {niceDate(data.expires_at, true)}. Only people with the link can see this.</p>
    </>,
  );
}

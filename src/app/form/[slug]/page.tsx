/* eslint-disable @next/next/no-img-element -- the small brand mark, already sized */
import "@/styles/portal.css";
import "@/styles/public.css";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { brand } from "@/brand";
import CalmEmpty from "@/components/portal/calm-empty";
import IntakePage from "@/components/public/intake-page";

export const metadata: Metadata = { title: "Send a request", robots: { index: false, follow: false }, referrer: "no-referrer" };

// A public request form: no account, only intake_info to read and intake_submit to send.
export default async function RequestForm({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug.toLowerCase();
  const ok = /^[a-z0-9][a-z0-9-]{2,39}$/.test(slug);
  const info = ok ? ((await (await createClient()).rpc("intake_info", { p_slug: slug })).data as { title: string; intro: string; owner: string | null } | null) : null;
  return (
    <div className="pt-shell">
      <header className="pt-top"><span className="pt-brand"><img src={brand.logo} alt="" fetchPriority="high" decoding="async" width={28} height={28} /><span>{brand.name}</span></span></header>
      <main className="pt-main pt-narrow">
        {info ? <IntakePage slug={slug} title={info.title} intro={info.intro} owner={info.owner || ""} /> : <CalmEmpty title="This form is resting" line="It may have moved or been paused. Ask for a fresh link and you'll be all set." />}
      </main>
    </div>
  );
}

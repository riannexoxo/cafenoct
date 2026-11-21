/* eslint-disable @next/next/no-img-element -- the small brand mark, already sized */
import "@/styles/portal.css";
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(app)/actions";
import { brand } from "@/brand";

export const metadata: Metadata = { title: "Your portal", robots: { index: false, follow: false } };

// The client's own calm space: no workspace sidebar, just their work.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return (
    <div className="pt-shell">
      <header className="pt-top">
        <Link href="/portal" className="pt-brand" aria-label={`${brand.name} portal home`}>
          <img src={brand.logo} alt="" fetchPriority="high" decoding="async" width={28} height={28} />
          <span>{brand.name}</span>
        </Link>
        <form action={signOut}>
          <button type="submit" className="btn">Sign out</button>
        </form>
      </header>
      <main className="pt-main">{children}</main>
    </div>
  );
}

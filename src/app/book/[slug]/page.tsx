/* eslint-disable @next/next/no-img-element -- the small brand mark, already sized */
import "@/styles/portal.css";
import "@/styles/public.css";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { brand } from "@/brand";
import CalmEmpty from "@/components/portal/calm-empty";
import BookingPage, { type BookingInfo } from "@/components/public/booking-page";

export const metadata: Metadata = { title: "Book a time", robots: { index: false, follow: false }, referrer: "no-referrer" };

// A public booking page: no account, only what booking_info returns (times you're busy, never what for).
export default async function Book({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug.toLowerCase();
  const ok = /^[a-z0-9][a-z0-9-]{2,39}$/.test(slug);
  const info = ok ? ((await (await createClient()).rpc("booking_info", { p_slug: slug })).data as BookingInfo | null) : null;
  return (
    <div className="pt-shell">
      <header className="pt-top"><span className="pt-brand"><img src={brand.logo} alt="" fetchPriority="high" decoding="async" width={28} height={28} /><span>{brand.name}</span></span></header>
      <main className="pt-main pt-narrow">
        {info ? <BookingPage slug={slug} initial={info} /> : <CalmEmpty title="This booking page is resting" line="It may have moved or been paused. Ask for a fresh link and you'll be all set." />}
      </main>
    </div>
  );
}

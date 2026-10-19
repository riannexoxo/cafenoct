import { createClient } from "@/lib/supabase/server";
import CalendarConnect from "@/components/calendar-connect";
import PaymentEmails from "@/components/payment-emails";
import ProfileForm from "@/components/profile-form";
import Link from "next/link";
import Icon from "@/components/icon";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const supabase = await createClient();
  // Only whether each connection is on is sent to the page, never the private address or key.
  const { data } = await supabase.from("profiles").select("gcal_url,inbox_key_hash,name,business,currency,invoice_email,settings").maybeSingle<{ gcal_url: string; inbox_key_hash: string; name: string; business: string; currency: string; invoice_email: string; settings: { tz?: string } | null }>();
  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">Your account</div>
          <h1>Settings</h1>
          <p>Your details, payment emails and calendar.</p>
        </div>
      </div>
      <ProfileForm initial={{ name: data?.name ?? "", business: data?.business ?? "", currency: data?.currency || "USD", invoice_email: data?.invoice_email ?? "", tz: data?.settings?.tz ?? "" }} />
      <PaymentEmails connected={!!data?.inbox_key_hash} />
      <CalendarConnect connected={!!data?.gcal_url} />
      <div className="card small muted row" style={{ gap: 8 }}><Icon name="spark" size={16} />Reminders live in <Link className="linkish" href="/automations">Automations</Link>. Themes come next.</div>
    </>
  );
}

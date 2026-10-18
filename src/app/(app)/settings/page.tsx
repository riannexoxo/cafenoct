import { createClient } from "@/lib/supabase/server";
import CalendarConnect from "@/components/calendar-connect";
import PaymentEmails from "@/components/payment-emails";
import Icon from "@/components/icon";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const supabase = await createClient();
  // Only whether each connection is on is sent to the page, never the private address or key.
  const { data } = await supabase.from("profiles").select("gcal_url,inbox_key_hash").maybeSingle<{ gcal_url: string; inbox_key_hash: string }>();
  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">Your account</div>
          <h1>Settings</h1>
          <p>Connect your payment emails and your calendar. More settings are on the way.</p>
        </div>
      </div>
      <PaymentEmails connected={!!data?.inbox_key_hash} />
      <CalendarConnect connected={!!data?.gcal_url} />
      <div className="card small muted row" style={{ gap: 8 }}><Icon name="spark" size={16} />Focus lengths, invoice details, automations and themes move here next.</div>
    </>
  );
}

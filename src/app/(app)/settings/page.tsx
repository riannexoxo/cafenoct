import { createClient } from "@/lib/supabase/server";
import CalendarConnect from "@/components/calendar-connect";
import Icon from "@/components/icon";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const supabase = await createClient();
  // Only whether a calendar is connected is sent to the page, never the private address itself.
  const { data } = await supabase.from("profiles").select("gcal_url").maybeSingle<{ gcal_url: string }>();
  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">Your account</div>
          <h1>Settings</h1>
          <p>Connect your calendar. More settings are on the way.</p>
        </div>
      </div>
      <CalendarConnect connected={!!data?.gcal_url} />
      <div className="card small muted row" style={{ gap: 8 }}><Icon name="spark" size={16} />Focus lengths, invoice details, automations and themes move here next.</div>
    </>
  );
}

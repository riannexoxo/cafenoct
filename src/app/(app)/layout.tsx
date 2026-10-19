import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/sidebar";
import MobileNav from "@/components/mobile-nav";
import MoneyPop from "@/components/money-pop";
import FocusRunner from "@/components/focus-runner";
import DesktopBridge from "@/components/desktop-bridge";
import Feedback from "@/components/feedback";
import { getClients, getProfile } from "@/lib/data";
import { ownerId } from "@/lib/owner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // getClaims checks your sign-in locally from the token, without an extra trip to Supabase.
  const { data: auth } = await supabase.auth.getClaims();
  const claims = auth?.claims;
  if (!claims) redirect("/login");
  const [profile, all, owner] = await Promise.all([getProfile(), getClients(), ownerId()]);
  // New accounts with no clients yet start with the short welcome setup.
  if (!profile?.settings?.onboarded && all.length === 0) redirect("/welcome");
  const clients = all.filter((c) => c.status !== "Past");
  // Accounts made before CafeNoct's tables existed get their empty profile on first visit only.
  if (!profile) await supabase.from("profiles").insert({ user_id: claims.sub, invoice_email: (claims.email as string) ?? "" });
  return (
    <div className="shell">
      <Sidebar owner={!!owner} clients={clients ?? []} name={profile?.name || (claims.email as string | undefined)?.split("@")[0] || ""} />
      <main>
        <div className="wrap">{children}</div>
      </main>
      <MobileNav clients={clients ?? []} />
      <MoneyPop clients={clients ?? []} />
      <FocusRunner />
      <DesktopBridge />
      <Feedback />
    </div>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/sidebar";
import MobileNav from "@/components/mobile-nav";
import type { Client, Profile } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  // Accounts made before CafeNoct's tables existed get their empty profile here on first visit.
  await supabase.from("profiles").upsert({ user_id: auth.user.id, invoice_email: auth.user.email ?? "" }, { onConflict: "user_id", ignoreDuplicates: true });
  const [{ data: profile }, { data: clients }] = await Promise.all([
    supabase.from("profiles").select("user_id,name,currency,weekly_goal").maybeSingle<Profile>(),
    supabase.from("clients").select("*").neq("status", "Past").order("company").returns<Client[]>(),
  ]);
  return (
    <div className="shell">
      <Sidebar clients={clients ?? []} name={profile?.name || auth.user.email?.split("@")[0] || ""} />
      <main>
        <div className="wrap">{children}</div>
      </main>
      <MobileNav clients={clients ?? []} />
    </div>
  );
}

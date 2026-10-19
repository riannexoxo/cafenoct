import { redirect } from "next/navigation";
import { brand } from "@/brand";
import { createClient } from "@/lib/supabase/server";
import Welcome from "./welcome";

export const metadata = { title: "Welcome" };

// First visit for a new account: a short setup, then their first client.
export default async function WelcomePage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login");
  const { data: p } = await supabase.from("profiles").select("name,business,currency,invoice_email").maybeSingle<{ name: string; business: string; currency: string; invoice_email: string }>();
  return (
    <main className="auth-page">
      <div className="auth-card welcome-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logo} alt="" className="auth-logo" />
        <Welcome initial={{ name: p?.name ?? "", business: p?.business ?? "", currency: p?.currency || "USD", email: p?.invoice_email || (auth.claims.email as string) || "" }} />
      </div>
    </main>
  );
}

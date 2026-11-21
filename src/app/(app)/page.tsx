import { getClients, getProfile } from "@/lib/data";
import HomeBoard from "@/components/home-board";
import "@/styles/home.css";

export const metadata = { title: "Today" };

export default async function Today() {
  const [profile, clients] = await Promise.all([getProfile(), getClients()]);
  return (
    <HomeBoard
      clients={clients.filter((c) => c.status !== "Past")}
      name={profile?.name?.split(" ")[0]}
      goal={profile?.weekly_goal || 40}
      currency={profile?.currency || "USD"}
      from={{ name: profile?.business || profile?.name || "", email: profile?.invoice_email || "" }}
      saved={(profile?.settings as { home?: unknown } | undefined)?.home ?? null}
    />
  );
}

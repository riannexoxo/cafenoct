import ClientForm from "@/components/client-form";
import { getProfile } from "@/lib/data";

export const metadata = { title: "New client" };

export default async function NewClient({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const [{ first }, profile] = await Promise.all([searchParams, getProfile()]);
  const roles = profile?.settings?.my_roles ?? [];
  return (
    <>
      <div className="head"><div>
        <div className="eyebrow">{first ? "Last step" : "Client accounts"}</div>
        <h1>{first ? "Add your first client" : "New client"}</h1>
        <p>{first ? "Their hours, rate and time zone power your calendar, timers, EODs and invoices. You can add the rest later." : "They get their own portal with projects, tasks, time, money and reports."}</p>
      </div></div>
      <ClientForm initial={first ? { roles } : undefined} />
    </>
  );
}

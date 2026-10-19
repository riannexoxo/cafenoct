import { getClients } from "@/lib/data";
import Quick from "@/components/quick";

export const metadata = { title: "Quick" };

// What the iPhone Back Tap shortcut opens: your next task, a quick add box and your timers.
export default async function QuickPage() {
  const clients = await getClients();
  return <Quick clients={clients.filter((c) => c.status !== "Past")} />;
}

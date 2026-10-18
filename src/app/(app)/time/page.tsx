import { getClients } from "@/lib/data";
import TimeView from "@/components/time-view";

export const metadata = { title: "Time" };

export default async function Time() {
  const clients = await getClients();
  return <TimeView clients={clients} />;
}

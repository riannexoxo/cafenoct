import { getClients } from "@/lib/data";
import Calendar from "@/components/calendar";
import ClientClocks from "@/components/client-clocks";

export const metadata = { title: "My calendar" };

export default async function MyCalendar() {
  const clients = (await getClients()).filter((c) => c.status !== "Past");
  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">Your schedule</div>
          <h1>My calendar</h1>
          <p>Everything in your time. Each client&apos;s usual hours are converted from their time zone.</p>
        </div>
      </div>
      <ClientClocks clients={clients} />
      <Calendar clients={clients} />
    </>
  );
}

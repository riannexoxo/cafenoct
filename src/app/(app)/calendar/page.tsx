import { getClients } from "@/lib/data";
import Calendar from "@/components/calendar";

export const metadata = { title: "My calendar" };

export default async function MyCalendar() {
  const clients = (await getClients()).filter((c) => c.status !== "Past");
  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">Your schedule</div>
          <h1>My calendar</h1>
          <p>Usual client hours, blocked time and the hours you logged, together.</p>
        </div>
      </div>
      <Calendar clients={clients} />
    </>
  );
}

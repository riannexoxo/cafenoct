import { getClients } from "@/lib/data";
import ContentCalendar from "@/components/content-calendar";

export const metadata = { title: "Content calendar" };

export default async function Content() {
  const clients = await getClients();
  return (
    <>
      <div className="head">
        <div>
          <h1>Content calendar</h1>
          <p>Every post for every social media client, from idea to posted.</p>
        </div>
      </div>
      <ContentCalendar clients={clients} />
    </>
  );
}

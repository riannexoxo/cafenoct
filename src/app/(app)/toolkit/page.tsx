import { getClients } from "@/lib/data";
import Toolkit from "@/components/toolkit";

export const metadata = { title: "Toolkit" };

export default async function MyToolkit() {
  const clients = await getClients();
  return (
    <>
      <div className="head">
        <div>
          <h1>My toolkit</h1>
          <p>Your own library of hooks, captions, calls to action, hashtag sets and resources. It shows in every social media client&apos;s toolkit too.</p>
        </div>
      </div>
      <Toolkit clients={clients} />
    </>
  );
}

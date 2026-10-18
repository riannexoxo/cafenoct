import ClientForm from "@/components/client-form";

export const metadata = { title: "New client" };

export default function NewClient() {
  return (
    <>
      <div className="head"><div><div className="eyebrow">Client accounts</div><h1>New client</h1><p>They get their own portal with projects, tasks, time, money and reports.</p></div></div>
      <ClientForm />
    </>
  );
}

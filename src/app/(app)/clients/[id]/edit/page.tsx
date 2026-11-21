import { notFound } from "next/navigation";
import ClientForm from "@/components/client-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Edit client" };

export default async function EditClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return (
    <>
      <div className="head"><div><h1>{data.company || data.name}</h1></div></div>
      <ClientForm initial={data} />
    </>
  );
}

import { notFound } from "next/navigation";
import { getClients } from "@/lib/data";
import PortalHead from "@/components/portal-head";
import BrandKit from "@/components/brand-kit";

export const metadata = { title: "Brand kit" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clients = await getClients();
  const c = clients.find((x) => x.id === id);
  if (!c) notFound();
  return (
    <>
      <PortalHead c={c} section="Brand kit" blurb="Colors, fonts, logos and brand rules, ready to copy into Canva or your editor." />
      <BrandKit client={c} />
    </>
  );
}

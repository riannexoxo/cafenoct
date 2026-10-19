"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import { ZONES, deviceTz } from "@/lib/tz";

const CURRENCIES = ["USD", "PHP", "AUD", "CAD", "GBP", "EUR", "NZD", "SGD"];
type P = { name: string; business: string; currency: string; invoice_email: string; tz: string };

// Your name, business, time zone and main currency (what invoices and the Wallet use).
export default function ProfileForm({ initial }: { initial: P }) {
  const router = useRouter();
  const device = useSyncExternalStore(() => () => {}, deviceTz, () => "");
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof P, v: string) => setF((x) => ({ ...x, [k]: v }));
  const zone = f.tz || device;
  const zones = ZONES.some(([z]) => z === zone) || !zone ? ZONES : [[zone, zone] as [string, string], ...ZONES];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data: auth } = await supabase().auth.getSession();
    const uid = auth.session?.user.id ?? "";
    const { data } = await supabase().from("profiles").select("settings").eq("user_id", uid).maybeSingle<{ settings: Record<string, unknown> | null }>();
    const prev = data?.settings ?? {};
    const settings = { ...prev, tz: zone, automations: { ...((prev.automations as object) ?? {}), tz: zone } };
    const { error } = await supabase().from("profiles").update({ name: f.name.trim(), business: f.business.trim(), currency: f.currency, invoice_email: f.invoice_email.trim(), settings }).eq("user_id", uid);
    setBusy(false);
    if (error) return toast("Could not save. Try again.");
    toast("Saved");
    router.refresh();
  }

  return (
    <form className="card" onSubmit={save}>
      <h3><span>Your details</span></h3>
      <div className="form">
        <div className="field"><label htmlFor="p-name">Your name</label><input id="p-name" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div className="field"><label htmlFor="p-biz">Business name</label><input id="p-biz" value={f.business} onChange={(e) => set("business", e.target.value)} placeholder="Shows on invoices" /></div>
        <div className="field"><label htmlFor="p-tz">Your time zone</label><select id="p-tz" value={zone} onChange={(e) => set("tz", e.target.value)}>{zones.map(([z, l]) => <option key={z} value={z}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor="p-cur">Main currency</label><select id="p-cur" value={f.currency} onChange={(e) => set("currency", e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field full"><label htmlFor="p-mail">Email on invoices</label><input id="p-mail" type="email" value={f.invoice_email} onChange={(e) => set("invoice_email", e.target.value)} /></div>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}><button className="btn solid" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button></div>
    </form>
  );
}

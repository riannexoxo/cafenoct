"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { brand } from "@/brand";
import { supabase } from "@/lib/use-rows";
import { ZONES, deviceTz } from "@/lib/tz";
import { ROLES, type Role } from "@/lib/roles";

const CURRENCIES = ["USD", "PHP", "AUD", "CAD", "GBP", "EUR", "NZD", "SGD"];

// Two quick steps (you, then what you do). Then straight on to adding the first client.
export default function Welcome({ initial }: { initial: { name: string; business: string; currency: string; email: string } }) {
  const router = useRouter();
  const device = useSyncExternalStore(() => () => {}, deviceTz, () => "");
  const [step, setStep] = useState(1);
  const [name, setName] = useState(initial.name);
  const [business, setBusiness] = useState(initial.business);
  const [tz, setTz] = useState("");
  const [currency, setCurrency] = useState(initial.currency);
  const [email, setEmail] = useState(initial.email);
  const [roles, setRoles] = useState<Role[]>([]);
  const [busy, setBusy] = useState(false);
  const zone = tz || device;
  const zones = ZONES.some(([z]) => z === zone) || !zone ? ZONES : [[zone, zone] as [string, string], ...ZONES];

  async function finish() {
    setBusy(true);
    const { data: auth } = await supabase().auth.getSession();
    const uid = auth.session?.user.id ?? "";
    const { data } = await supabase().from("profiles").select("settings").eq("user_id", uid).maybeSingle<{ settings: Record<string, unknown> | null }>();
    const prev = data?.settings ?? {};
    const settings = { ...prev, onboarded: true, tz: zone, my_roles: roles, automations: { ...((prev.automations as object) ?? {}), tz: zone } };
    const { error } = await supabase().from("profiles").upsert({ user_id: uid, name: name.trim(), business: business.trim(), currency, invoice_email: email.trim(), settings }, { onConflict: "user_id" });
    setBusy(false);
    if (error) return;
    router.replace("/clients/new?first=1");
  }

  if (step === 1) return (
    <form className="form auth-form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) setStep(2); }}>
      <div className="full" style={{ textAlign: "center" }}>
        <div className="eyebrow">Step 1 of 2</div>
        <h1>Welcome to {brand.name}</h1>
        <p className="muted small">A few details so your workspace, invoices and reminders feel like yours.</p>
      </div>
      <div className="field full"><label htmlFor="w-name">Your name</label><input id="w-name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
      <div className="field full"><label htmlFor="w-biz">Business name <span className="muted">(optional, shows on invoices)</span></label><input id="w-biz" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="e.g. Ana's VA Studio" /></div>
      <div className="field full"><label htmlFor="w-tz">Your time zone</label>
        <select id="w-tz" value={zone} onChange={(e) => setTz(e.target.value)}>{zones.map(([z, l]) => <option key={z} value={z}>{l}</option>)}</select>
      </div>
      <div className="field"><label htmlFor="w-cur">Main currency</label><select id="w-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
      <div className="field"><label htmlFor="w-mail">Email on invoices</label><input id="w-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="row full" style={{ justifyContent: "flex-end" }}><button type="submit" className="btn solid">Next</button></div>
    </form>
  );

  return (
    <div className="form auth-form">
      <div className="full" style={{ textAlign: "center" }}>
        <div className="eyebrow">Step 2 of 2</div>
        <h1>What do you do?</h1>
        <p className="muted small">Pick all that fit. Each client gets the tools for the work you do for them, and you can change this any time.</p>
      </div>
      <div className="full welcome-roles" role="group" aria-label="What you do">
        {ROLES.map((r) => {
          const on = roles.includes(r.key);
          return (
            <button key={r.key} type="button" aria-pressed={on} className={`welcome-role${on ? " on" : ""}`} onClick={() => setRoles((x) => (on ? x.filter((k) => k !== r.key) : [...x, r.key]))}>
              <b>{r.label}</b><span>{r.hint}</span>
            </button>
          );
        })}
      </div>
      <div className="row full" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn" onClick={() => setStep(1)}>Back</button>
        <button type="button" className="btn solid" disabled={busy} onClick={finish}>{busy ? "Saving…" : "Next: add your first client"}</button>
      </div>
    </div>
  );
}

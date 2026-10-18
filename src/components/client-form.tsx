"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/use-rows";
import { ZONES } from "@/lib/tz";
import type { Client } from "@/lib/types";
import ClientAvatar from "./client-avatar";

const COLORS = ["#976A4B", "#8C9A7B", "#B88A8A", "#7F8FA6", "#C9A66B", "#8E7CA0", "#6E8F8B", "#C39A78"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const RATE_TYPES = ["Hourly", "Monthly", "Per project", "No fixed rate", "Unpaid"] as const;

type Form = Omit<Client, "id"> & { email: string; contact: string; source: string; notes: string; links: string };

export default function ClientForm({ initial }: { initial?: Partial<Form> & { id?: string } }) {
  const router = useRouter();
  const [f, setF] = useState<Form>({
    name: "", company: "", email: "", contact: "", services: "", status: "Active", source: "", rate: null, rate_type: "Hourly",
    currency: "USD", work_days: [], hours_per_day: null, weekly_hours: null, start_time: null, report_cadence: "",
    color: COLORS[0], links: "", notes: "", timezone: "", logo_url: "", ...initial,
  } as Form);
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const num = (v: string) => (v === "" ? null : Number(v));
  const toggleDay = (d: number) => {
    const days = f.work_days.includes(d) ? f.work_days.filter((x) => x !== d) : [...f.work_days, d].sort();
    setF((x) => ({ ...x, work_days: days, weekly_hours: days.length && x.hours_per_day ? days.length * x.hours_per_day : x.weekly_hours }));
  };

  // Logos go to your own folder in the "logos" storage bucket.
  async function upload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setMsg("Choose an image file (PNG, JPG, WebP or SVG).");
    if (file.size > 2 * 1024 * 1024) return setMsg("That image is over 2 MB. Try a smaller one.");
    setUploading(true);
    setMsg("Uploading logo…");
    const { data: auth } = await supabase().auth.getSession();
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${auth.session?.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase().storage.from("logos").upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) return setMsg("Could not upload the logo. Try again.");
    set("logo_url", supabase().storage.from("logos").getPublicUrl(path).data.publicUrl);
    setMsg("Logo added. Save to keep it.");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setMsg("Add the client's name.");
    setMsg("Saving…");
    const body = { ...f, start_time: f.start_time || null };
    const { data, error } = initial?.id
      ? await supabase().from("clients").update(body).eq("id", initial.id).select("id").single()
      : await supabase().from("clients").insert(body).select("id").single();
    if (error) return setMsg(error.message);
    router.push(`/clients/${data.id}`);
    router.refresh();
  }

  return (
    <form className="card form" onSubmit={save}>
      <div className="field"><label htmlFor="name">Contact name</label><input id="name" value={f.name} onChange={(e) => set("name", e.target.value)} required /></div>
      <div className="field"><label htmlFor="company">Business or brand</label><input id="company" value={f.company} onChange={(e) => set("company", e.target.value)} /></div>
      <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
      <div className="field"><label htmlFor="contact">Phone, Slack or other contact</label><input id="contact" value={f.contact} onChange={(e) => set("contact", e.target.value)} /></div>
      <div className="field full"><label htmlFor="services">What you do for them</label><input id="services" placeholder="Admin support, social media, video editing" value={f.services} onChange={(e) => set("services", e.target.value)} /></div>
      <div className="field"><label htmlFor="status">Status</label><select id="status" value={f.status} onChange={(e) => set("status", e.target.value as Form["status"])}>{["Active", "Lead", "Paused", "Past"].map((s) => <option key={s}>{s}</option>)}</select></div>
      <div className="field"><label htmlFor="source">Where you found them</label><select id="source" value={f.source} onChange={(e) => set("source", e.target.value)}>{["", "OnlineJobs.ph", "Upwork", "LinkedIn", "Facebook group", "Referral", "Direct", "Other"].map((s) => <option key={s} value={s}>{s || "—"}</option>)}</select></div>
      <div className="field"><label htmlFor="rate_type">Rate type</label><select id="rate_type" value={f.rate_type} onChange={(e) => set("rate_type", e.target.value as Form["rate_type"])}>{RATE_TYPES.map((s) => <option key={s}>{s}</option>)}</select></div>
      <div className="field"><label htmlFor="rate">Rate</label><input id="rate" type="number" step="0.01" min="0" disabled={f.rate_type === "Unpaid" || f.rate_type === "No fixed rate"} value={f.rate ?? ""} onChange={(e) => set("rate", num(e.target.value))} /></div>
      <div className="field"><label htmlFor="currency">Currency</label><select id="currency" value={f.currency} onChange={(e) => set("currency", e.target.value)}>{["USD", "PHP", "AUD", "CAD", "GBP", "EUR", "NZD", "SGD"].map((s) => <option key={s}>{s}</option>)}</select></div>
      <div className="field"><label htmlFor="report">Reports they expect</label><select id="report" value={f.report_cadence} onChange={(e) => set("report_cadence", e.target.value as Form["report_cadence"])}><option value="">None</option><option value="Daily">Daily EOD</option><option value="Weekly">Weekly report</option></select></div>
      <div className="field full"><label>Work days (leave empty if flexible)</label>
        <div className="row" style={{ gap: 6 }}>{DAYS.map((d, i) => (
          <button key={d} type="button" className={`pill ${f.work_days.includes(i + 1) ? "acc" : ""}`} aria-pressed={f.work_days.includes(i + 1)} style={{ border: 0, padding: "5px 11px" }} onClick={() => toggleDay(i + 1)}>{d}</button>
        ))}</div>
      </div>
      <div className="field"><label htmlFor="hpd">Hours per work day</label><input id="hpd" type="number" min="0" step="0.5" value={f.hours_per_day ?? ""} onChange={(e) => { const h = num(e.target.value); setF((x) => ({ ...x, hours_per_day: h, weekly_hours: x.work_days.length && h ? x.work_days.length * h : x.weekly_hours })); }} /></div>
      <div className="field"><label htmlFor="weekly">Weekly hours target</label><input id="weekly" type="number" min="0" step="0.5" value={f.weekly_hours ?? ""} onChange={(e) => set("weekly_hours", num(e.target.value))} /></div>
      <div className="field"><label htmlFor="tz">Their time zone</label><select id="tz" value={f.timezone} onChange={(e) => set("timezone", e.target.value)}>
        <option value="">Same as mine</option>
        {!ZONES.some(([z]) => z === f.timezone) && f.timezone && <option value={f.timezone}>{f.timezone}</option>}
        {ZONES.map(([z, l]) => <option key={z} value={z}>{l}</option>)}
      </select></div>
      <div className="field"><label htmlFor="start">Usual start time{f.timezone ? " (their time)" : ""}</label><input id="start" type="time" value={f.start_time?.slice(0, 5) ?? ""} onChange={(e) => set("start_time", e.target.value || null)} /></div>
      <div className="field full"><label>Logo</label>
        <div className="row" style={{ gap: 12 }}>
          <ClientAvatar c={{ ...f, name: f.name || "?" }} size={44} />
          <label className="btn small" style={{ cursor: "pointer" }}>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden disabled={uploading} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
            {f.logo_url ? "Change logo" : "Upload logo"}
          </label>
          {f.logo_url && <button type="button" className="btn small ghost" onClick={() => set("logo_url", "")}>Remove</button>}
          <span className="small muted">Square images look best. Up to 2 MB.</span>
        </div>
      </div>
      <div className="field"><label>Color</label>
        <div className="row" style={{ gap: 6 }}>{COLORS.map((c) => (
          <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={f.color === c} onClick={() => set("color", c)} style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: `2px solid ${f.color === c ? "var(--ink)" : "transparent"}` }} />
        ))}</div>
      </div>
      <div className="field full"><label htmlFor="links">Links (Drive folder, brand kit)</label><input id="links" value={f.links} onChange={(e) => set("links", e.target.value)} /></div>
      <div className="field full"><label htmlFor="notes">Notes</label><textarea id="notes" value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
      <div className="modal-foot full">
        <span className="small muted left" role="status">{msg}</span>
        <button type="button" className="btn" onClick={() => router.back()}>Cancel</button>
        <button type="submit" className="btn solid" disabled={uploading}>{initial?.id ? "Save changes" : "Create client"}</button>
      </div>
    </form>
  );
}

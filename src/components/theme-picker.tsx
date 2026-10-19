"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/use-rows";
import { ACCENTS, MODES, applyTheme, parseTheme, themeString, THEME_COOKIE, type Accent, type Mode, type Theme } from "@/lib/theme";
import Seg from "./seg";

const fromCookie = () => parseTheme(document.cookie.split("; ").find((c) => c.startsWith(`${THEME_COOKIE}=`))?.split("=")[1]);

async function saveToProfile(t: Theme) {
  const { data: auth } = await supabase().auth.getSession();
  const uid = auth.session?.user.id;
  if (!uid) return;
  const { data } = await supabase().from("profiles").select("settings").eq("user_id", uid).maybeSingle<{ settings: Record<string, unknown> | null }>();
  await supabase().from("profiles").update({ settings: { ...(data?.settings ?? {}), theme: themeString(t) } }).eq("user_id", uid);
}

// Light, dark or auto, and an accent color. Changes show right away and follow you to your other devices.
const darkQuery = (cb: () => void) => { const m = matchMedia("(prefers-color-scheme: dark)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };

export default function ThemePicker({ saved }: { saved: string }) {
  const [t, setT] = useState<Theme>(() => parseTheme(saved));
  const deviceDark = useSyncExternalStore(darkQuery, () => matchMedia("(prefers-color-scheme: dark)").matches, () => false);
  const dark = t.mode === "dark" || (t.mode === "auto" && deviceDark);
  const pick = (next: Theme) => { setT(next); applyTheme(next); saveToProfile(next); };
  return (
    <div className="card">
      <h3><span>Theme</span></h3>
      <div className="theme-row">
        <span className="small muted">Mode</span>
        <Seg label="Light or dark" value={t.mode} onChange={(mode: Mode) => pick({ ...t, mode })} options={MODES} />
      </div>
      <div className="theme-tiles" role="radiogroup" aria-label="Theme color">
        {ACCENTS.map((a) => {
          const l = dark ? a.dark : a.light;
          return (
            <button key={a.key} type="button" role="radio" aria-checked={t.accent === a.key} className={`theme-tile${t.accent === a.key ? " on" : ""}`}
              onClick={() => pick({ ...t, accent: a.key as Accent })}>
              <span className="tt-prev" style={{ background: l.bg }} aria-hidden="true">
                <span className="tt-side" style={{ background: l.card }}><i style={{ background: l.accent }} /><i style={{ background: l.ink, opacity: 0.25 }} /><i style={{ background: l.ink, opacity: 0.25 }} /></span>
                <span className="tt-card" style={{ background: l.card }}><i style={{ background: l.ink }} /><i style={{ background: l.ink, opacity: 0.3 }} /><b style={{ background: l.accent }} /></span>
              </span>
              <span className="tt-name">{a.label}</span>
            </button>
          );
        })}
      </div>
      <p className="small muted" style={{ margin: "10px 0 0" }}>Each theme recolors the whole app. Auto follows your phone or computer. Your choice follows you to every device you sign in on.</p>
    </div>
  );
}

// On a new device, picks up the theme saved in your profile.
export function ThemeSync({ saved }: { saved: string }) {
  useEffect(() => {
    if (!saved) return;
    const want = parseTheme(saved);
    if (themeString(want) !== themeString(fromCookie())) applyTheme(want);
  }, [saved]);
  return null;
}

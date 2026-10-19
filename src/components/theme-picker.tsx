"use client";

import { useEffect, useState } from "react";
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
export default function ThemePicker({ saved }: { saved: string }) {
  const [t, setT] = useState<Theme>(() => parseTheme(saved));
  const pick = (next: Theme) => { setT(next); applyTheme(next); saveToProfile(next); };
  return (
    <div className="card">
      <h3><span>Theme</span></h3>
      <div className="theme-row">
        <span className="small muted">Mode</span>
        <Seg label="Light or dark" value={t.mode} onChange={(mode: Mode) => pick({ ...t, mode })} options={MODES} />
      </div>
      <div className="theme-row">
        <span className="small muted">Accent</span>
        <div className="swatch-row" role="radiogroup" aria-label="Accent color">
          {ACCENTS.map((a) => (
            <button key={a.key} type="button" role="radio" aria-checked={t.accent === a.key} className={`accent-pick${t.accent === a.key ? " on" : ""}`}
              onClick={() => pick({ ...t, accent: a.key as Accent })}>
              <span className="accent-dot" style={{ background: `linear-gradient(135deg, ${a.light} 50%, ${a.dark} 50%)` }} />
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <p className="small muted" style={{ margin: "10px 0 0" }}>Auto follows your phone or computer. Your choice follows you to every device you sign in on.</p>
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

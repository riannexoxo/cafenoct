// Themes: light, dark or auto (follow the device), plus an accent color. Saved in a cookie so pages load in
// the right colors with no flash, and in your profile so every device picks it up.
export type Mode = "auto" | "light" | "dark";
export type Accent = "coffee" | "rose" | "lavender" | "sage" | "ocean";
export type Theme = { mode: Mode; accent: Accent };

export const THEME_COOKIE = "cafenoct-theme";
export const MODES: [Mode, string][] = [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]];
// Swatch colors for the picker (light, dark).
export const ACCENTS: { key: Accent; label: string; light: string; dark: string }[] = [
  { key: "coffee", label: "Coffee", light: "#976A4B", dark: "#C39A78" },
  { key: "rose", label: "Rose", light: "#B8707A", dark: "#E2A9B0" },
  { key: "lavender", label: "Lavender", light: "#8673AE", dark: "#BBA8D8" },
  { key: "sage", label: "Sage", light: "#6E8B6A", dark: "#A9C2A5" },
  { key: "ocean", label: "Ocean", light: "#5F7F9A", dark: "#9FBAD2" },
];
export const DEFAULT_THEME: Theme = { mode: "auto", accent: "coffee" };

export function parseTheme(raw?: string | null): Theme {
  const [m, a] = (raw ?? "").split(".");
  return {
    mode: MODES.some(([k]) => k === m) ? (m as Mode) : DEFAULT_THEME.mode,
    accent: ACCENTS.some((x) => x.key === a) ? (a as Accent) : DEFAULT_THEME.accent,
  };
}
export const themeString = (t: Theme) => `${t.mode}.${t.accent}`;

// Applies a theme to the page right away and remembers it on this device for a year.
export function applyTheme(t: Theme) {
  const el = document.documentElement;
  if (t.mode === "auto") el.removeAttribute("data-theme"); else el.dataset.theme = t.mode;
  if (t.accent === "coffee") el.removeAttribute("data-accent"); else el.dataset.accent = t.accent;
  document.cookie = `${THEME_COOKIE}=${themeString(t)}; path=/; max-age=31536000; samesite=lax; secure`;
}

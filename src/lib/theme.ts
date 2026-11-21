// Themes: light, dark or auto (follow the device). Saved in a cookie so pages load in
// the right colors with no flash, and in your profile so every device picks it up.
export type Mode = "auto" | "light" | "dark";
// One palette now (the CafeNoct look). Older saved accents fall back to it.
export type Accent = "coffee";
export type Theme = { mode: Mode; accent: Accent };

export const THEME_COOKIE = "cafenoct-theme";
export const MODES: [Mode, string][] = [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]];
// Each theme's main colors, for the preview tiles and the browser bar (light, dark).
type Look = { bg: string; card: string; ink: string; accent: string };
export const ACCENTS: { key: Accent; label: string; light: Look; dark: Look }[] = [
  { key: "coffee", label: "CafeNoct", light: { bg: "#F6EEE3", card: "#FFFCF8", ink: "#3B2622", accent: "#A3324B" }, dark: { bg: "#1B1418", card: "#2B2127", ink: "#F5E9DE", accent: "#E58BA0" } },
];
export const lookOf = (a: Accent) => ACCENTS.find((x) => x.key === a) ?? ACCENTS[0];
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
  el.removeAttribute("data-accent");
  document.cookie = `${THEME_COOKIE}=${themeString(t)}; path=/; max-age=31536000; samesite=lax; secure`;
  // The phone's browser bar matches the theme too.
  const look = lookOf(t.accent), dark = t.mode === "dark" || (t.mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", (dark ? look.dark : look.light).bg));
}

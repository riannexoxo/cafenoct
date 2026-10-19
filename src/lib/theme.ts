// Themes: light, dark or auto (follow the device), plus an accent color. Saved in a cookie so pages load in
// the right colors with no flash, and in your profile so every device picks it up.
export type Mode = "auto" | "light" | "dark";
export type Accent = "coffee" | "rose" | "lavender" | "sage" | "ocean";
export type Theme = { mode: Mode; accent: Accent };

export const THEME_COOKIE = "cafenoct-theme";
export const MODES: [Mode, string][] = [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]];
// Each theme's main colors, for the preview tiles and the browser bar (light, dark).
type Look = { bg: string; card: string; ink: string; accent: string };
export const ACCENTS: { key: Accent; label: string; light: Look; dark: Look }[] = [
  { key: "coffee", label: "Coffee", light: { bg: "#F3ECE2", card: "#FFFFFF", ink: "#3B2A20", accent: "#976A4B" }, dark: { bg: "#17110D", card: "#271D17", ink: "#F1E6DA", accent: "#C39A78" } },
  { key: "rose", label: "Rose", light: { bg: "#F6E9EA", card: "#FFFFFF", ink: "#4A2A33", accent: "#B8707A" }, dark: { bg: "#1A1013", card: "#2B1C21", ink: "#F4E4E7", accent: "#E2A9B0" } },
  { key: "lavender", label: "Lavender", light: { bg: "#EEEAF5", card: "#FFFFFF", ink: "#352E4A", accent: "#8673AE" }, dark: { bg: "#13111B", card: "#221E2E", ink: "#ECE6F6", accent: "#BBA8D8" } },
  { key: "sage", label: "Sage", light: { bg: "#E9EEE6", card: "#FFFFFF", ink: "#2F3A2D", accent: "#6E8B6A" }, dark: { bg: "#101510", card: "#1E261D", ink: "#E6EEE3", accent: "#A9C2A5" } },
  { key: "ocean", label: "Ocean", light: { bg: "#E7EDF3", card: "#FFFFFF", ink: "#263645", accent: "#5F7F9A" }, dark: { bg: "#0E141B", card: "#1B2530", ink: "#E3ECF4", accent: "#9FBAD2" } },
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
  if (t.accent === "coffee") el.removeAttribute("data-accent"); else el.dataset.accent = t.accent;
  document.cookie = `${THEME_COOKIE}=${themeString(t)}; path=/; max-age=31536000; samesite=lax; secure`;
  // The phone's browser bar matches the theme too.
  const look = lookOf(t.accent), dark = t.mode === "dark" || (t.mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", (dark ? look.dark : look.light).bg));
}

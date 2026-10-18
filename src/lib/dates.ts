// Dates are always worked out on the viewer's device, so "today" means today where you are.
export const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const parseYmd = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s: string, n: number) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const weekStartYmd = (s = today()) => { const d = parseYmd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
export const weekday = (s: string) => ((parseYmd(s).getDay() + 6) % 7) + 1; // 1 = Monday
export function rel(s: string) {
  const n = Math.round((parseYmd(s).getTime() - parseYmd(today()).getTime()) / 864e5);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n < 0) return `${-n}d late`;
  if (n < 7) return parseYmd(s).toLocaleDateString("en-US", { weekday: "short" });
  return parseYmd(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600);
  return (h ? h + ":" : "") + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60);
};

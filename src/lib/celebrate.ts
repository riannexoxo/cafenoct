// celebrate() makes Nocti hop in the sidebar ("cn:celebrate"). Pass a money event to also show the
// "money in" notification with a little coin animation (see components/money-pop.tsx).
export type MoneyEvent = { amount: number; currency: string; title: string; detail?: string };
export const CELEBRATE = "cn:celebrate";
export function celebrate(e?: MoneyEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CELEBRATE));
  if (e && e.amount > 0) window.dispatchEvent(new CustomEvent<MoneyEvent>("cafenoct:money", { detail: e }));
}

// Shows the "money in" notification with a little coin animation (see components/money-pop.tsx).
export type MoneyEvent = { amount: number; currency: string; title: string; detail?: string };
export function celebrate(e: MoneyEvent) {
  if (typeof window !== "undefined" && e.amount > 0) window.dispatchEvent(new CustomEvent<MoneyEvent>("cafenoct:money", { detail: e }));
}

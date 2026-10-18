export const hrs = (minutes: number) => (minutes / 60).toFixed(1);

export function money(n: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n || 0);
  } catch {
    return `${currency} ${(n || 0).toFixed(2)}`;
  }
}

export function rateText(c: { rate: number | null; rate_type: string; currency: string }) {
  if (c.rate_type === "Unpaid" || c.rate_type === "No fixed rate") return c.rate_type;
  if (!c.rate) return "No rate set";
  const unit = c.rate_type === "Hourly" ? "/h" : c.rate_type === "Monthly" ? "/mo" : " per project";
  return money(c.rate, c.currency) + unit;
}

// Monday-based week start, as YYYY-MM-DD in the viewer's time zone.
export function weekStart(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

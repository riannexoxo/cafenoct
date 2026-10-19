export type Client = {
  id: string;
  name: string;
  company: string;
  status: "Active" | "Lead" | "Paused" | "Past";
  rate: number | null;
  rate_type: "Hourly" | "Monthly" | "Per project" | "No fixed rate" | "Unpaid";
  currency: string;
  work_days: number[];
  hours_per_day: number | null;
  weekly_hours: number | null;
  start_time: string | null;
  report_cadence: "" | "Daily" | "Weekly";
  color: string;
  services: string;
  timezone: string; // IANA name like America/New_York; empty means same as you
  logo_url: string;
  hours_tz: string; // time zone the usual hours are set in; empty means the client's time zone
  day_starts: Record<string, string>; // start time for particular days, e.g. {"3": "08:00"} for Wednesdays
  roles: string[]; // what you do for them: smm, web, ea, design, video, live, code (see lib/roles.ts)
  personal: boolean; // your own portal: no billing or hours
};

export type Profile = { user_id: string; name: string; currency: string; weekly_goal: number; business: string; invoice_email: string; settings?: { onboarded?: boolean; tz?: string; my_roles?: string[] } & Record<string, unknown> };

export const clientLabel = (c: Pick<Client, "name" | "company">) => c.company || c.name;

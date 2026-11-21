// Pipeline stages and card shape (table pipeline_cards, migration 0019). Stage keys match the database check.
export const STAGES = [
  { key: "lead", label: "New lead", tone: "var(--lilac)" },
  { key: "discovery", label: "Discovery", tone: "var(--caramel)" },
  { key: "proposal", label: "Proposal", tone: "var(--honey)" },
  { key: "active", label: "Active", tone: "var(--accent)" },
  { key: "paused", label: "Paused", tone: "var(--muted)" },
  { key: "done", label: "Done", tone: "var(--good)" },
] as const;

export type Stage = (typeof STAGES)[number]["key"];
export const stageLabel = (s: string) => STAGES.find((x) => x.key === s)?.label ?? s;

export type Card = {
  id: string;
  client_id: string | null;
  title: string;
  stage: Stage;
  value: number;
  currency: string;
  next_step: string;
  next_date: string | null;
  contact: string;
  email: string;
  tags: string[];
  notes: string;
  position: number;
};

export const CARD_COLS = "id,client_id,title,stage,value,currency,next_step,next_date,contact,email,tags,notes,position";

// Position for a card dropped at index i of a stage list (the list without the moving card).
export function positionAt(list: Pick<Card, "position">[], i: number) {
  const prev = list[i - 1]?.position, next = list[i]?.position;
  if (prev == null && next == null) return 0;
  if (prev == null) return next! - 1;
  if (next == null) return prev + 1;
  return (prev + next) / 2;
}

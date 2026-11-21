"use client";

import "@/styles/reactions.css";
import { useEffect, useState } from "react";
import { supabase, useRows } from "@/lib/use-rows";
import { friendly } from "./portal/decide";

// The five reactions a client can leave. Keys match the check in the reactions table (migration 0023).
export const EMOJI = [["heart", "❤️", "Love it"], ["fire", "🔥", "Fire"], ["clap", "👏", "Applause"], ["smile", "😊", "Smile"], ["eyes", "👀", "Looking"]] as const;
export type EmojiKey = (typeof EMOJI)[number][0];
type Counts = Partial<Record<EmojiKey, number>>;

// Tap-to-react row for clients. load/send go through portal_* or share_* functions, which check access again.
function ReactionBar({ load, send }: { load: () => PromiseLike<{ data: unknown }>; send: (e: EmojiKey) => PromiseLike<{ data: unknown; error: { message: string } | null }> }) {
  const [counts, setCounts] = useState<Counts>({});
  const [mine, setMine] = useState<EmojiKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { let alive = true; load().then(({ data }) => { if (alive && data) setCounts(data as Counts); }); return () => { alive = false; }; }, [load]);

  async function react(e: EmojiKey) {
    if (busy || mine.includes(e)) return;
    setBusy(true); setErr("");
    const { data, error } = await send(e);
    setBusy(false);
    if (error) return setErr(friendly(error.message));
    setMine((m) => [...m, e]);
    if (data) setCounts(data as Counts);
  }

  return (
    <div className="rx">
      <div className="rx-row" role="group" aria-label="React">
        {EMOJI.map(([k, glyph, label]) => {
          const n = counts[k] ?? 0;
          return (
            <button key={k} type="button" className={`rx-btn${mine.includes(k) ? " on" : ""}`} aria-pressed={mine.includes(k)} disabled={busy}
              aria-label={`${label}${n ? `, ${n}` : ""}`} onClick={() => react(k)}>
              <span aria-hidden="true">{glyph}</span>{n > 0 && <span className="num" aria-hidden="true">{n}</span>}
            </button>
          );
        })}
      </div>
      {err && <p className="small rx-err" role="alert">{err}</p>}
    </div>
  );
}

export function PortalReactions({ entity, id }: { entity: "deliverable" | "post"; id: string }) {
  const [load] = useState(() => () => supabase().rpc("portal_reactions", { p_entity: entity, p_id: id }));
  return <ReactionBar load={load} send={(e) => supabase().rpc("portal_react", { p_entity: entity, p_id: id, p_emoji: e })} />;
}

export function ShareReactions({ token }: { token: string }) {
  const [load] = useState(() => () => supabase().rpc("share_reactions", { p_token: token }));
  return <ReactionBar load={load} send={(e) => supabase().rpc("share_react", { p_token: token, p_emoji: e })} />;
}

// What clients reacted, for you. Read only; your own RLS shows only your rows.
export function ReactionCounts({ entityId, full }: { entityId: string; full?: boolean }) {
  const [rows] = useRows<{ emoji: EmojiKey; who: string }>(`reactions:${entityId}`, (s) => s.from("reactions").select("emoji,who").eq("entity_id", entityId).limit(500), ["reactions"]);
  if (!rows?.length) return null;
  return (
    <div className={`rx-row rx-read${full ? " full" : ""}`} role="group" aria-label="Client reactions">
      {EMOJI.map(([k, glyph, label]) => {
        const who = rows.filter((r) => r.emoji === k).map((r) => r.who);
        return who.length > 0 && (
          <span key={k} className="rx-btn" title={who.join(", ")}><span aria-hidden="true">{glyph}</span><span className="num">{who.length}</span><span className="sr-only">{label} from {who.join(", ")}</span></span>
        );
      })}
    </div>
  );
}

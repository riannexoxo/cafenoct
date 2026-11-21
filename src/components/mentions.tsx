"use client";

import "@/styles/mentions.css";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/use-rows";
import { clean } from "./command-palette";

export type Hit = { id: string; group: string; label: string; href: string };

// Brackets and parentheses would break the [@Name](/path) link, so they're dropped from the name.
export const mentionText = (h: Hit) => `[@${h.label.replace(/[[\]()\n\r]/g, "").trim().slice(0, 60) || h.group}](${h.href})`;

// Tasks, clients, invoices and posts matching what you typed after @. Empty query shows your clients.
export function useMentionHits(q: string | null) {
  const [hits, setHits] = useState<Hit[]>([]);
  const seq = useRef(0);
  useEffect(() => {
    if (q === null) return;
    const my = ++seq.current, term = clean(q), like = `%${term}%`;
    const t = setTimeout(async () => {
      const s = supabase();
      const [cl, tk, iv, po] = await Promise.all([
        term ? s.from("clients").select("id,name,company").or(`name.ilike.${like},company.ilike.${like}`).limit(5)
          : s.from("clients").select("id,name,company").eq("status", "Active").order("company").limit(6),
        term ? s.from("tasks").select("id,title").ilike("title", like).order("updated_at", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
        term ? s.from("invoices").select("id,number").ilike("number", like).limit(4) : Promise.resolve({ data: [] }),
        term ? s.from("posts").select("id,title,caption").or(`title.ilike.${like},caption.ilike.${like}`).limit(4) : Promise.resolve({ data: [] }),
      ]);
      if (my !== seq.current) return;
      setHits([
        ...((cl.data ?? []) as { id: string; name: string; company: string }[]).map((c) => ({ id: `c${c.id}`, group: "Client", label: c.company || c.name, href: `/clients/${c.id}` })),
        ...((tk.data ?? []) as { id: string; title: string }[]).map((x) => ({ id: `t${x.id}`, group: "Task", label: x.title, href: `/work?task=${x.id}` })),
        ...((iv.data ?? []) as { id: string; number: string }[]).map((x) => ({ id: `i${x.id}`, group: "Invoice", label: x.number, href: `/invoice/${x.id}` })),
        ...((po.data ?? []) as { id: string; title: string; caption: string }[]).map((x) => ({ id: `o${x.id}`, group: "Post", label: x.title || (x.caption ?? "").slice(0, 50) || "Post", href: `/content?post=${x.id}` })),
      ]);
    }, 150);
    return () => clearTimeout(t);
  }, [q]);
  return q === null ? [] : hits;
}

// The list under the editor. Keyboard is handled by the textarea (arrows, Enter, Esc); mouse and touch pick here.
export function MentionList({ id, hits, active, onPick }: { id: string; hits: Hit[]; active: number; onPick: (h: Hit) => void }) {
  return (
    <ul className="mn-list" id={id} role="listbox" aria-label="Mention a task, client, invoice or post">
      {hits.length === 0 ? <li className="mn-none small muted">Keep typing to find a task, client, invoice or post.</li> : hits.map((h, i) => (
        <li key={h.id} id={`${id}-${i}`} role="option" aria-selected={i === active} className={i === active ? "on" : ""}
          onMouseDown={(e) => { e.preventDefault(); onPick(h); }}>
          <span className="mn-l">{h.label}</span><span className="small muted">{h.group}</span>
        </li>
      ))}
    </ul>
  );
}

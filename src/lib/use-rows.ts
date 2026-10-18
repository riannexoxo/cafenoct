"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const sb = typeof window !== "undefined" ? createClient() : (null as unknown as SupabaseClient);
export const supabase = () => sb;

// Loads rows from Supabase and reloads them whenever any of the watched tables changes,
// on this device or another one (that's how your phone and laptop stay in step).
export function useRows<T>(key: string, query: (s: SupabaseClient) => PromiseLike<{ data: T[] | null }>, watch: string[]) {
  const [rows, setRows] = useState<T[] | null>(null);
  const q = useRef(query);
  useEffect(() => { q.current = query; });
  const reload = useCallback(async () => {
    const { data } = await q.current(sb);
    setRows(data ?? []);
  }, []);
  useEffect(() => {
    let alive = true;
    q.current(sb).then(({ data }) => { if (alive) setRows(data ?? []); });
    const ch = sb.channel(`live:${key}:${Math.random().toString(36).slice(2)}`);
    watch.forEach((t) => ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => reload()));
    ch.subscribe();
    return () => { alive = false; sb.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reload]);
  return [rows, reload, setRows] as const;
}

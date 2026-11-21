"use client";

// Cmd+K (Ctrl+K): jump anywhere and find anything. Clients, projects, tasks, invoices, posts and docs,
// plus pages, favorites and recents. Opens from the keyboard or the search button in the sidebar.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/use-rows";
import { toast } from "@/lib/toast";
import Icon, { type IconName } from "./icon";
import Nocti from "./nocti";
import "@/styles/palette.css";

type Item = { id: string; group: string; label: string; hint?: string; href: string; icon: IconName };

const PAGES: [string, string, IconName][] = [
  ["/", "Today", "today"], ["/inbox", "Inbox", "bell"], ["/work", "Work", "tasks"], ["/projects", "Projects", "projects"],
  ["/calendar", "My calendar", "schedule"], ["/time", "Time", "time"], ["/workload", "Workload", "schedule"], ["/focus", "Focus", "focus"], ["/invoices", "Invoices", "file"],
  ["/wallet", "Wallet", "money"], ["/content", "Content calendar", "content"], ["/analytics", "Analytics", "time"],
  ["/clients", "All clients", "clients"], ["/pipeline", "Pipeline", "projects"], ["/docs", "Docs", "docs"], ["/toolkit", "Toolkit", "spark"],
  ["/automations", "Automations", "auto"], ["/settings", "Settings", "settings"], ["/account/password", "Change password", "settings"],
];
const ACTIONS: [string, string, IconName][] = [
  ["/clients/new", "New client", "plus"], ["/work?new=1", "New task", "plus"], ["/focus", "Start a focus session", "focus"],
];
const RECENTS = "cn-recents";

export const openPalette = () => window.dispatchEvent(new Event("cn:palette"));

// Strips characters that have meaning in PostgREST filters, so a search can never change the query.
export const clean = (q: string) => q.replace(/[%_,()\\*:"'.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

function readRecents(): Item[] {
  try { return JSON.parse(localStorage.getItem(RECENTS) ?? "[]").slice(0, 6); } catch { return []; }
}
function remember(it: Item) {
  try {
    const list = [{ ...it, group: "Recent" }, ...readRecents().filter((x) => x.href !== it.href)].slice(0, 6);
    localStorage.setItem(RECENTS, JSON.stringify(list));
  } catch { /* private mode: recents are a nicety */ }
}

export default function CommandPalette() {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Item[]>([]);
  const [favs, setFavs] = useState<Item[]>([]);
  const [recents, setRecents] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  // Opening starts fresh: empty search, latest recents.
  const show = useCallback(() => { setQ(""); setHits([]); setActive(0); setRecents(readRecents()); setOpen(true); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (open) setOpen(false); else show(); }
    };
    const ev = () => show();
    window.addEventListener("keydown", key);
    window.addEventListener("cn:palette", ev);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("cn:palette", ev); };
  }, [open, show]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => input.current?.focus(), 10);
    supabase().from("favorites").select("id,label,href,kind").order("position").limit(20)
      .then(({ data }) => setFavs((data ?? []).map((f) => ({ id: `f${f.id}`, group: "Favorites", label: f.label, href: f.href, icon: "spark" as IconName }))));
  }, [open]);

  // Live search, debounced. Every query is limited and runs under your own RLS.
  useEffect(() => {
    const term = clean(q);
    if (!open || term.length < 2) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      const s = supabase(), like = `%${term}%`;
      const [cl, pr, tk, iv, po, dc] = await Promise.all([
        s.from("clients").select("id,name,company").or(`name.ilike.${like},company.ilike.${like}`).limit(5),
        s.from("projects").select("id,name").ilike("name", like).limit(5),
        s.from("tasks").select("id,title,status").ilike("title", like).order("updated_at", { ascending: false }).limit(6),
        s.from("invoices").select("id,number,status").ilike("number", like).limit(5),
        s.from("posts").select("id,title,caption,status").or(`title.ilike.${like},caption.ilike.${like}`).limit(5),
        s.from("docs").select("id,title").ilike("title", like).limit(5),
      ]);
      if (my !== seq.current) return;
      setBusy(false);
      setHits([
        ...(cl.data ?? []).map((c) => ({ id: `c${c.id}`, group: "Clients", label: c.company || c.name, hint: c.company ? c.name : "", href: `/clients/${c.id}`, icon: "clients" as IconName })),
        ...(pr.data ?? []).map((p) => ({ id: `p${p.id}`, group: "Projects", label: p.name, href: `/projects`, icon: "projects" as IconName })),
        ...(tk.data ?? []).map((x) => ({ id: `t${x.id}`, group: "Tasks", label: x.title, hint: x.status === "done" ? "Done" : "", href: `/work?task=${x.id}`, icon: "tasks" as IconName })),
        ...(iv.data ?? []).map((x) => ({ id: `i${x.id}`, group: "Invoices", label: x.number, hint: x.status, href: `/invoice/${x.id}`, icon: "file" as IconName })),
        ...(po.data ?? []).map((x) => ({ id: `o${x.id}`, group: "Posts", label: x.title || (x.caption ?? "").slice(0, 60) || "Untitled post", hint: x.status, href: `/content?post=${x.id}`, icon: "content" as IconName })),
        ...(dc.data ?? []).map((x) => ({ id: `d${x.id}`, group: "Docs", label: x.title || "Untitled", href: `/docs`, icon: "docs" as IconName })),
      ]);
    }, 160);
    return () => clearTimeout(t);
  }, [q, open]);

  const list = useMemo<Item[]>(() => {
    const term = q.trim().toLowerCase();
    const pages = [...ACTIONS.map(([href, label, icon]) => ({ id: `a${href}`, group: "Actions", label, href, icon })),
      ...PAGES.map(([href, label, icon]) => ({ id: `g${href}`, group: "Go to", label, href, icon }))];
    if (!term) return [...favs, ...recents, ...pages];
    return [...(clean(q).length >= 2 ? hits : []), ...pages.filter((p) => p.label.toLowerCase().includes(term)), ...favs.filter((f) => f.label.toLowerCase().includes(term))];
  }, [q, hits, favs, recents]);

  const go = useCallback((it: Item) => {
    remember(it);
    setOpen(false);
    router.push(it.href);
  }, [router]);

  async function favoriteThis() {
    const label = document.title.split(" · ")[0] || "Page";
    const { error } = await supabase().from("favorites").insert({ label, href: path, kind: "page" });
    toast(error ? (error.code === "23505" ? "Already in favorites." : "Couldn't add that.") : `Added ${label} to favorites`);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(list.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && list[active]) { e.preventDefault(); go(list[active]); }
  }

  useEffect(() => { document.getElementById(`cmdk-${active}`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  if (!open) return null;
  let last = "";
  return (
    <div className="cmdk-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Search and jump">
        <div className="cmdk-bar">
          <Icon name="more" />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} placeholder="Search clients, tasks, invoices, posts…"
            role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-activedescendant={list[active] ? `cmdk-${active}` : undefined}
            aria-autocomplete="list" spellCheck={false} autoComplete="off" maxLength={80} />
          <kbd>esc</kbd>
        </div>
        <ul className="cmdk-list" id="cmdk-list" role="listbox" aria-label="Results">
          {list.map((it, i) => {
            const head = it.group !== last ? (last = it.group) : "";
            return (
              <li key={it.id} role="presentation">
                {head && <div className="cmdk-h" role="presentation">{head}</div>}
                <div id={`cmdk-${i}`} role="option" aria-selected={i === active} className={`cmdk-i${i === active ? " on" : ""}`}
                  onMouseMove={() => setActive(i)} onClick={() => go(it)}>
                  <Icon name={it.icon} size={16} />
                  <span className="cmdk-l">{it.label}</span>
                  {it.hint && <span className="cmdk-hint">{it.hint}</span>}
                </div>
              </li>
            );
          })}
          {q.trim().length >= 2 && !busy && list.length === 0 && (
            <li className="cmdk-empty" role="presentation"><Nocti mood="sleepy" size={56} /><span>Nothing matches “{q.trim()}”.</span></li>
          )}
        </ul>
        <div className="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> move <kbd>↵</kbd> open</span>
          <button type="button" className="linkish" onClick={favoriteThis}><Icon name="star" size={15} />Favorite this page</button>
        </div>
      </div>
    </div>
  );
}

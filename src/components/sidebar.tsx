"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { brand } from "@/brand";
import { clientLabel, type Client } from "@/lib/types";
import { rateText } from "@/lib/format";
import { signOut } from "@/app/(app)/actions";
import Icon, { type IconName } from "./icon";
import ClientAvatar from "./client-avatar";
import { openFeedback } from "./feedback";
import { portalTabs, rolePages } from "@/lib/roles";
import { openPalette } from "./command-palette";
import { openTour } from "./tour";
import { useUnread } from "./inbox";
import { useTimers } from "./timers";
import Nocti from "./nocti";
import { CELEBRATE } from "@/lib/celebrate";
import "@/styles/nav.css";

// Each section gets its own chip color: Me rose, client portals lavender, workspace honey, the rest mint.
type Tone = "rose" | "lav" | "honey" | "mint";

const ME: [string, string, IconName][] = [
  ["/calendar", "My calendar", "schedule"],
  ["/time", "Time", "time"],
  ["/focus", "Focus", "focus"],
  ["/wallet", "Wallet", "money"],
  ["/invoices", "Invoices", "file"],
];
const WORKSPACE: [string, string, IconName][] = [
  ["/pipeline", "Pipeline", "coin"],
  ["/workload", "Workload", "time"],
  ["/projects", "Projects", "projects"],
  ["/work", "Work", "tasks"],
  ["/docs", "Docs", "docs"],
  ["/content", "Content calendar", "content"],
  ["/toolkit", "Toolkit", "spark"],
  ["/analytics", "Analytics", "time"],
];
export default function Sidebar({ clients, name, owner = false }: { clients: Client[]; name: string; owner?: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const portalId = path.match(/^\/clients\/([0-9a-f-]{36})/)?.[1];
  const current = clients.find((c) => c.id === portalId);
  const unread = useUnread();
  const [timers] = useTimers();
  const live = new Set((timers ?? []).map((t) => t.client_id));
  const running = (timers ?? []).length;
  const [happy, setHappy] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const pill = useRef<HTMLSpanElement>(null);

  // Nocti hops for a moment whenever something good happens (celebrate() in lib/celebrate.ts).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const on = () => { setHappy(true); clearTimeout(t); t = setTimeout(() => setHappy(false), 1500); };
    window.addEventListener(CELEBRATE, on);
    return () => { window.removeEventListener(CELEBRATE, on); clearTimeout(t); };
  }, []);

  // The berry pill sits under the active link and glides to the next one (CSS transition; none for reduced motion).
  useEffect(() => {
    const n = nav.current, p = pill.current;
    if (!n || !p) return;
    const place = () => {
      const a = n.querySelector<HTMLElement>("a.on");
      p.style.opacity = a ? "1" : "0";
      if (a) { p.style.height = `${a.offsetHeight}px`; p.style.transform = `translateY(${a.offsetTop}px)`; }
    };
    place();
    const r = requestAnimationFrame(() => p.classList.add("ready")); // first placement lands without gliding
    const ro = new ResizeObserver(place);
    ro.observe(n);
    return () => { cancelAnimationFrame(r); ro.disconnect(); };
  }, [path, portalId]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const item = (href: string, label: string, icon: IconName, on: boolean, tone: Tone) => (
    <Link key={href + label} href={href} className={on ? "on" : ""} aria-current={on ? "page" : undefined} data-tone={tone}>
      <span className="nav-chip"><Icon name={icon} /></span>
      <span>{label}</span>
    </Link>
  );

  return (
    <aside className="rail" aria-label="Sections">
      <div className="acct" ref={box}>
        <button className="brand acct-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
          {current ? (
            <ClientAvatar c={current} className="acct-av" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo} alt="" className="brand-logo" />
          )}
          <span className="brand-txt">
            <b>{current ? clientLabel(current) : brand.name}</b>
            <span>{current ? (current.personal ? "My own portal" : "Client account") : `Admin${name ? " · " + name : ""}`}</span>
          </span>
          <Icon name="updown" className="acct-chev" />
        </button>
        {open && (
          <div className="acct-menu" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>
            <div className="acct-h">Your account</div>
            <Link href="/" className={`acct-i ${!current ? "on" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brand.logo} alt="" className="acct-av" />
              <span><b>Admin</b><small>{name || "You"} · everything</small></span>
            </Link>
            <div className="acct-h">Client accounts</div>
            {clients.map((c) => (
              <Link key={c.id} href={`/clients/${c.id}`} className={`acct-i ${current?.id === c.id ? "on" : ""}`}>
                <ClientAvatar c={c} className="acct-av" />
                <span><b>{clientLabel(c)}</b><small>{c.company ? c.name : rateText(c)}</small></span>
              </Link>
            ))}
            <Link href="/clients/new" className="acct-i add"><Icon name="plus" /><span><b>Add client account</b></span></Link>
          </div>
        )}
      </div>

      <button type="button" className="cmdk-open" onClick={openPalette} aria-keyshortcuts="Meta+K Control+K">
        <Icon name="more" size={16} /><span>Search or jump…</span><kbd>⌘K</kbd>
      </button>

      <nav className="nav" aria-label="Main" ref={nav}>
        <span className="nav-glide" ref={pill} aria-hidden="true" />
        {current ? (
          <>
            <div className="nav-h">{clientLabel(current)}</div>
            {portalTabs(current).map(([sub, label, icon]) => item(`/clients/${current.id}${sub}`, label, icon, path === `/clients/${current.id}${sub}`, "lav"))}
            <div className="nav-h" />
            {item("/", "Back to Admin", "left", false, "mint")}
          </>
        ) : (
          <>
            {item("/", "Today", "today", path === "/", "rose")}
            <Link href="/inbox" className={path === "/inbox" ? "on" : ""} aria-current={path === "/inbox" ? "page" : undefined} data-tone="rose" aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"}>
              <span className="nav-chip"><Icon name="bell" /></span><span>Inbox</span>{unread > 0 && <span className="badge-dot">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <div className="nav-h">Me</div>
            {ME.map(([href, label, icon]) => item(href, label, icon, path.startsWith(href), "rose"))}
            <div className="nav-h">Client portals</div>
            {clients.filter((c) => c.status === "Active").map((c) => (
              <Link key={c.id} href={`/clients/${c.id}`} data-tone="lav">
                <span className="nav-av"><ClientAvatar c={c} className="nav-dot" />{live.has(c.id) && <i className="nav-live" aria-hidden="true" />}</span>
                <span className="ellipsis">{clientLabel(c)}</span>
                {live.has(c.id) && <span className="sr-only">, timer running</span>}
              </Link>
            ))}
            {item("/clients", "All clients", "clients", path === "/clients", "lav")}
            <div className="nav-h">Workspace</div>
            {[...WORKSPACE, ...rolePages(clients)].map(([href, label, icon]) => item(href, label, icon, path.startsWith(href), "honey"))}
            <div className="nav-h" />
            {item("/automations", "Automations", "auto", path === "/automations", "mint")}
            {owner && item("/owner", "Friends beta", "clients", path === "/owner", "mint")}
            {item("/settings", "Settings", "settings", path === "/settings", "mint")}
          </>
        )}
      </nav>

      <div className="rail-foot">
        <div className="rail-nocti">
          <Nocti size={44} state={happy ? "happy" : running > 0 ? "watch" : "idle"} label="Nocti" />
          <span>{happy ? "Yay, nice work!" : running > 0 ? `Watching ${running === 1 ? "your timer" : `${running} timers`}` : "All quiet"}</span>
        </div>
        <button className="btn small ghost" type="button" onClick={openTour}><Icon name="spark" />Take the tour</button>
        <button className="btn small ghost" type="button" onClick={openFeedback}><Icon name="chat" />Send feedback</button>
        <form action={signOut}>
          <button className="btn small ghost" type="submit">Sign out</button>
        </form>
      </div>
    </aside>
  );
}

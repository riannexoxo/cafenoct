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
import { portalTabs } from "@/lib/roles";

const ME: [string, string, IconName][] = [
  ["/calendar", "My calendar", "schedule"],
  ["/time", "Time", "time"],
  ["/focus", "Focus", "focus"],
  ["/wallet", "Wallet", "money"],
  ["/invoices", "Invoices", "file"],
];
const WORKSPACE: [string, string, IconName][] = [
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

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const item = (href: string, label: string, icon: IconName, on: boolean) => (
    <Link key={href + label} href={href} className={on ? "on" : ""}>
      <Icon name={icon} />
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

      <nav className="nav" aria-label="Main">
        {current ? (
          <>
            <div className="nav-h">{clientLabel(current)}</div>
            {portalTabs(current).map(([sub, label, icon]) => item(`/clients/${current.id}${sub}`, label, icon, path === `/clients/${current.id}${sub}`))}
            <div className="nav-h" />
            {item("/", "Back to Admin", "left", false)}
          </>
        ) : (
          <>
            {item("/", "Today", "today", path === "/")}
            <div className="nav-h">Me</div>
            {ME.map(([href, label, icon]) => item(href, label, icon, path.startsWith(href)))}
            <div className="nav-h">Client portals</div>
            {clients.filter((c) => c.status === "Active").map((c) => (
              <Link key={c.id} href={`/clients/${c.id}`}>
                <ClientAvatar c={c} className="nav-dot" />
                <span className="ellipsis">{clientLabel(c)}</span>
              </Link>
            ))}
            {item("/clients", "All clients", "clients", path === "/clients")}
            <div className="nav-h">Workspace</div>
            {WORKSPACE.map(([href, label, icon]) => item(href, label, icon, path.startsWith(href)))}
            <div className="nav-h" />
            {item("/automations", "Automations", "auto", path === "/automations")}
            {owner && item("/owner", "Friends beta", "clients", path === "/owner")}
            {item("/settings", "Settings", "settings", path === "/settings")}
          </>
        )}
      </nav>

      <div className="rail-foot">
        <button className="btn small ghost" type="button" onClick={openFeedback}><Icon name="chat" />Send feedback</button>
        <form action={signOut}>
          <button className="btn small ghost" type="submit">Sign out</button>
        </form>
      </div>
    </aside>
  );
}

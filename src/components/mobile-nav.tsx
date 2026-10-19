"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { clientLabel, type Client } from "@/lib/types";
import { signOut } from "@/app/(app)/actions";
import Icon, { type IconName } from "./icon";
import ClientAvatar from "./client-avatar";
import { portalTabs } from "@/lib/roles";

const TABS: [string, string, IconName][] = [
  ["/", "Today", "today"],
  ["/calendar", "Calendar", "schedule"],
  ["/work", "Work", "tasks"],
  ["/clients", "Clients", "clients"],
];
const ALL: [string, string, IconName][] = [
  ["/time", "Time", "time"],
  ["/focus", "Focus", "focus"],
  ["/wallet", "Wallet", "money"],
  ["/invoices", "Invoices", "file"],
  ["/projects", "Projects", "projects"],
  ["/docs", "Docs", "docs"],
  ["/content", "Content calendar", "content"],
  ["/toolkit", "Toolkit", "spark"],
  ["/analytics", "Analytics", "time"],
  ["/automations", "Automations", "auto"],
  ["/settings", "Settings", "settings"],
];

// The phone version of the sidebar: four tabs plus a "More" sheet with every section and client account.
export default function MobileNav({ clients }: { clients: Client[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const inTabs = TABS.some(([h]) => active(h));
  const here = clients.find((c) => c.id === path.match(/^\/clients\/([0-9a-f-]{36})/)?.[1]);
  return (
    <>
      <nav className="tabbar" aria-label="Sections">
        {TABS.map(([href, label, icon]) => (
          <Link key={href} href={href} className={active(href) ? "on" : ""}>
            <Icon name={icon} />
            <span>{label}</span>
          </Link>
        ))}
        <button className={!inTabs || open ? "on" : ""} onClick={() => setOpen(true)} aria-haspopup="dialog">
          <Icon name="more" />
          <span>More</span>
        </button>
      </nav>
      {open && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal in" role="dialog" aria-modal="true" aria-label="All sections" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>
            {here && (
              <>
                <div className="sheet-h">{clientLabel(here)}</div>
                <div className="sheet-grid">
                  {portalTabs(here).map(([sub, label, icon]) => (
                    <Link key={sub} href={`/clients/${here.id}${sub}`}>
                      <Icon name={icon} />
                      <span>{label}</span>
                    </Link>
                  ))}
                </div>
              </>
            )}
            {clients.length > 0 && (
              <>
                <div className="sheet-h">Client accounts</div>
                <div className="sheet-grid">
                  {clients.map((c) => (
                    <Link key={c.id} href={`/clients/${c.id}`}>
                      <ClientAvatar c={c} className="nav-dot" />
                      <span>{clientLabel(c)}</span>
                    </Link>
                  ))}
                </div>
              </>
            )}
            <div className="sheet-h">Everything else</div>
            <div className="sheet-grid">
              {ALL.map(([href, label, icon]) => (
                <Link key={href} href={href}>
                  <Icon name={icon} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
            <div className="modal-foot">
              <form action={signOut} className="left"><button className="btn" type="submit">Sign out</button></form>
              <button className="btn solid" onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

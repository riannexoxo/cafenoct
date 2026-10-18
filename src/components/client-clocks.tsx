"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { deviceTz, tzShort } from "@/lib/tz";
import type { Client } from "@/lib/types";
import ClientAvatar from "./client-avatar";

const noop = () => () => {};

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(i); }, []);
  return now;
}
const timeIn = (tz: string, at: number) => new Date(at).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase();
const dayIn = (tz: string, at: number) => new Date(at).toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });

// What time it is for each client right now, so you never have to work it out.
export default function ClientClocks({ clients }: { clients: Client[] }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  const list = clients.filter((c) => c.status === "Active" && c.timezone);
  if (!ready || !list.length) return null;
  return <Clocks list={list} />;
}

function Clocks({ list }: { list: Client[] }) {
  const now = useNow();
  const mine = deviceTz();
  return (
    <div className="clocks" aria-label="Your clients' local times">
      {list.map((c) => (
        <div className="cclock" key={c.id} style={{ ["--c" as string]: c.color }}>
          <ClientAvatar c={c} size={28} />
          <span className="cclock-t">
            <b><span className="num">{timeIn(c.timezone, now)}</span> <i>{c.timezone === mine ? "same as you" : tzShort(c.timezone, now)}</i></b>
            <small>{c.name.split(" ")[0]} · {dayIn(c.timezone, now)}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

// "It's 5:46pm for them (ET)" for a client portal header.
export function TheirTime({ tz, name }: { tz: string; name: string }) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready || !tz) return null;
  return <TheirTimeInner tz={tz} name={name} />;
}
function TheirTimeInner({ tz, name }: { tz: string; name: string }) {
  const now = useNow();
  if (tz === deviceTz()) return <span className="pill">Same time zone as you</span>;
  return <span className="pill lilac">It&apos;s {timeIn(tz, now)} {dayIn(tz, now).split(",")[0]} for {name} · {tzShort(tz, now)}</span>;
}

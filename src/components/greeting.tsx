"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
// Greets by the time where you are, not where the server is.
export default function Greeting({ name }: { name?: string }) {
  const parts = useSyncExternalStore(noop, () => {
    const d = new Date(), h = d.getHours();
    return `${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}|${h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}`;
  }, () => "|Hello");
  const [date, greet] = parts.split("|");
  return (
    <div>
      <h1>{greet}{name ? `, ${name}` : ""}.</h1>
      <p>{date || " "}</p>
    </div>
  );
}

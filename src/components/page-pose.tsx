"use client";

// Picks a Nocti pose for the current page; CSS shows it beside the page title (styles/pose.css).
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import "@/styles/pose.css";

const POSES: [RegExp, string][] = [
  [/^\/(calendar|workload)/, "calendar"],
  [/^\/(wallet|invoices|pipeline)/, "coin"],
  [/^\/(time|focus)/, "stopwatch"],
  [/^\/(work|projects|docs|designs|edits|batches|automations)/, "clipboard"],
  [/^\/(content|analytics|toolkit|inbox)/, "jump"],
  [/^\/(clients|settings)/, "wave"],
];

export default function PagePose() {
  const path = usePathname();
  useEffect(() => {
    const pose = POSES.find(([re]) => re.test(path))?.[1];
    if (pose) document.body.dataset.pose = pose; else delete document.body.dataset.pose;
  }, [path]);
  return null;
}

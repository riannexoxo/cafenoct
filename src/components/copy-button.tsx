"use client";

import { toast } from "@/lib/toast";
import Icon from "./icon";

export default function CopyButton({ text, label = "Copy", done = "Copied" }: { text: string; label?: string; done?: string }) {
  return (
    <button type="button" className="btn small" onClick={async () => { try { await navigator.clipboard.writeText(text); toast(done); } catch { toast("Copy was blocked here."); } }}>
      <Icon name="copy" />{label}
    </button>
  );
}

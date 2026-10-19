"use client";

import { useRows } from "@/lib/use-rows";
import { toast } from "@/lib/toast";

// Connect or disconnect your Canva account (used by the Design queue).
export default function CanvaSettings({ ready }: { ready: boolean }) {
  const [rows, reload] = useRows<{ name: string; connected_at: string }>("canva-conn", (s) => s.from("canva_connections").select("name,connected_at").limit(1), ["canva_connections"]);
  const c = rows?.[0];
  async function disconnect() {
    if (!confirm("Disconnect Canva? Linked designs and saved files stay on your requests.")) return;
    await fetch("/api/canva/disconnect", { method: "POST" });
    reload();
    toast("Canva disconnected");
  }
  return (
    <div className="card">
      <h3><span>Canva</span>{c && <span className="pill good">Connected</span>}</h3>
      <p className="small muted" style={{ marginTop: 0 }}>
        {c ? `Connected${c.name ? ` as ${c.name}` : ""}. Link designs to requests in the Design queue, open them in Canva, and save full-quality PNGs.`
          : ready ? "Link your Canva designs to requests in the Design queue and save them as full-quality PNGs."
          : "Canva connection isn't set up yet. You can still upload your exports to each request."}
      </p>
      {c ? <button className="btn" onClick={disconnect}>Disconnect</button>
        // eslint-disable-next-line @next/next/no-html-link-for-pages -- a server sign-in route, not an app page
        : ready ? <a className="btn solid" href="/api/canva/start?back=/settings">Connect Canva</a> : null}
    </div>
  );
}

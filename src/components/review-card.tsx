"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/use-rows";
import type { Project } from "@/lib/work";
import type { Client } from "@/lib/types";
import CopyButton from "./copy-button";
import Nocti from "./nocti";
import { okReviewUrl } from "./profile-form";

type Me = { name: string; business: string; settings: { review_url?: string } | null };

// Shown on a finished project: a ready message asking the client for a review, with your saved review link.
export default function ReviewCard({ project, client }: { project: Project; client?: Client }) {
  const [me, setMe] = useState<Me | null>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: auth } = await supabase().auth.getSession();
      const { data } = await supabase().from("profiles").select("name,business,settings").eq("user_id", auth.session?.user.id ?? "").maybeSingle<Me>();
      if (!alive || !data) return;
      setMe(data);
      const url = data.settings?.review_url ?? "";
      const hi = client?.name?.split(" ")[0] || "there";
      setText(`Hi ${hi}, thank you for trusting me with ${project.name}. It was a joy to work on.\n\nIf you're happy with how it turned out, would you leave a short review? It takes a minute and means a lot:\n${okReviewUrl(url) ? url : "[your review link]"}\n\nThank you!\n${data.name || data.business}`);
    })();
    return () => { alive = false; };
  }, [project.name, client?.name]);

  if (!me) return null;
  const hasLink = okReviewUrl(me.settings?.review_url ?? "");
  return (
    <div className="note note-mint" style={{ marginBottom: 16 }}>
      <div className="row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "nowrap" }}>
        <Nocti mood="awake" state="happy" size={56} />
        <div className="grow" style={{ minWidth: 0 }}>
          <h3 style={{ margin: "0 0 4px" }}><span>Ask for a review</span></h3>
          <p className="small muted" style={{ margin: "0 0 8px" }}>This project is done. A happy client is the best time to ask.</p>
          <div className="field">
            <label htmlFor={`rv-${project.id}`}>Message</label>
            <textarea id={`rv-${project.id}`} rows={7} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <CopyButton text={text} label="Copy message" done="Message copied" />
            {!hasLink && <span className="small muted">Add your review link in <Link className="linkish" href="/settings">Settings</Link> and it fills in here.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

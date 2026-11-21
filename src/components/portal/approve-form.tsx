"use client";

import { supabase } from "@/lib/use-rows";
import DecisionBox, { friendly, type Decision } from "./decide";

// The decision form on a no-login approval link. The token is the only key; share_decide checks it again.
export default function ApproveForm({ token, canDecide }: { token: string; canDecide: boolean }) {
  async function send(d: Decision, comment: string, name: string) {
    const { error } = await supabase().rpc("share_decide", { p_token: token, p_decision: d, p_comment: comment, p_name: name });
    return error ? friendly(error.message) : null;
  }
  return <DecisionBox id="ap" askName canDecide={canDecide} onSend={send} />;
}

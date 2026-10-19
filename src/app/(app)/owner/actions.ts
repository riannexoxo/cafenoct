"use server";

import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/automations-server";
import { newCode, ownerId } from "@/lib/owner";

export async function createInvite(form: FormData) {
  if (!(await ownerId())) return;
  const note = String(form.get("note") ?? "").trim().slice(0, 80);
  await adminClient().from("invites").insert({ code: newCode(), note });
  revalidatePath("/owner");
}

// Only unused codes can be removed.
export async function deleteInvite(form: FormData) {
  if (!(await ownerId())) return;
  await adminClient().from("invites").delete().eq("code", String(form.get("code") ?? "")).is("used_by", null);
  revalidatePath("/owner");
}

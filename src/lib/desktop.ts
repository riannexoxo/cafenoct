"use client";

// Helpers for the CafeNoct Mac app, which opens this same website in its own window.
// Everywhere else (phone, browser) these quietly do nothing.

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function invoker(): Invoke | null {
  if (typeof window === "undefined") return null;
  const t = (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__;
  return t?.core?.invoke ?? null;
}

export const isDesktop = () => invoker() !== null;

export function desktopCall(cmd: string, args?: Record<string, unknown>) {
  const inv = invoker();
  return inv ? inv(cmd, args).catch(() => undefined) : Promise.resolve(undefined);
}

// Opens a link in your normal browser instead of inside the app window.
export const openOutside = (url: string) => desktopCall("plugin:opener|open_url", { url });

let allowed: boolean | null = null;

// A Mac notification from the app; falls back to the browser's own notifications on the web.
export async function notify(title: string, body: string) {
  if (isDesktop()) {
    if (allowed === null) allowed = (await desktopCall("plugin:notification|is_permission_granted")) === true;
    if (!allowed) allowed = (await desktopCall("plugin:notification|request_permission")) === "granted";
    if (allowed) await desktopCall("plugin:notification|notify", { options: { title, body } });
    return allowed;
  }
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "default") await Notification.requestPermission();
  if (Notification.permission !== "granted") return false;
  try { new Notification(title, { body, icon: "/icon.png" }); return true; } catch { return false; }
}

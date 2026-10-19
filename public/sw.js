// CafeNoct's notification helper: shows reminders from Automations, even when the app is closed.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { title: "CafeNoct", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(m.title || "CafeNoct", {
    body: m.body || "",
    icon: "/brand/icon-192.png",
    badge: "/brand/icon-192.png",
    tag: m.tag,
    data: { url: m.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin);
  e.waitUntil((async () => {
    if (url.origin === self.location.origin) {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of open) { if ("focus" in c) { await c.focus(); return c.navigate(url.href); } }
    }
    return self.clients.openWindow(url.href);
  })());
});

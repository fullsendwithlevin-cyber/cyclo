// Service Worker: empfängt Push-Benachrichtigungen und öffnet beim Klick den passenden App-Pfad.
self.addEventListener("push", (event) => {
  let data = { title: "Chief of Staff", body: "", link: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/icon.svg", data: { link: data.link } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";
  const url = link.startsWith("/") ? link : "/";
  event.waitUntil(self.clients.matchAll({ type: "window" }).then((list) => {
    for (const c of list) if ("focus" in c) return c.navigate(url).then((w) => w?.focus());
    return self.clients.openWindow(url);
  }));
});

const CACHE = "madrasti-shell-v8";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/student.html", "/student.webmanifest", "/icon.svg", "/parent-icon.svg", "/student-icon.svg", "/curriculum-runtime.js"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const url = new URL(request.url);
    const isCurriculumJson = url.pathname.startsWith("/curriculum/") && url.pathname.endsWith(".json");
    if (isCurriculumJson) {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const write = caches.open(CACHE).then(cache => cache.put(request, response.clone()));
          event.waitUntil(write.catch(error => console.warn("تعذر تحديث نسخة المنهج المخزنة:", error)));
        }
        if (response.ok) return response;
        const cached = await caches.match(request);
        return cached || response;
      } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw error;
      }
    }
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && request.destination !== "document") {
        const write = caches.open(CACHE).then(cache => cache.put(request, response.clone()));
        event.waitUntil(write.catch(error => console.warn("تعذر تخزين مورد للعمل دون اتصال:", error)));
      }
      return response;
    } catch (error) {
      if (request.mode === "navigate" || request.destination === "document") {
        const fallback = await caches.match(url.pathname === "/student.html" ? "/student.html" : "/index.html");
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});

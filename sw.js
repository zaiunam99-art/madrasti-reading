const CACHE = "madrasti-shell-v10";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/student.html", "/icon.svg", "/student-icon.svg", "/curriculum-runtime.js", "/curriculum/catalog.json", "/curriculum/grade-1/math-2025-2026.json", "/curriculum/grade-1/math-2025-2026/chapters-index.json", "/curriculum/grade-1/math-2025-2026/lessons/chapter-01-lessons-01-02.json", "/curriculum/grade-1/math-2025-2026/lessons/chapter-01-lessons-03-05.json", "/curriculum/grade-1/math-2025-2026/lessons/chapter-01-lessons-06-09.json", "/curriculum/grade-1/math-2025-2026/lessons/chapter-01-lessons-10-review.json", "/curriculum/grade-1/math-2025-2026/lessons/chapter-02-lessons-01-08.json", "/curriculum/grade-1/math-2025-2026/lessons/chapter-02-review.json", "/curriculum/grade-1/math-2025-2026/lessons/chapter-03-lessons-01-10.json", "/curriculum/grade-1/math-2025-2026/lessons/chapter-04-lessons-01-04.json", "/curriculum/grade-1/math-2025-2026/lessons/chapter-05-lessons-01-04.json", "/curriculum/grade-1/math-2025-2026/lessons/chapter-06-lessons-01-04.json", "/curriculum/grade-1/math-2025-2026/lessons/chapter-07-lessons-01-10.json", "/curriculum/grade-1/math-2025-2026/lessons/chapter-08-lessons-01-07.json", "/curriculum/grade-1/math-2025-2026/lessons/chapter-09-lessons-01-04.json", "/curriculum/grade-1/reading-2025-2026/lessons/preparatory-unit.json", "/curriculum/grade-1/reading-2025-2026/lessons/unit-01-my-family.json", "/curriculum/grade-1/reading-2025-2026/lessons/unit-02-my-school.json", "/curriculum/grade-1/reading-2025-2026/lessons/unit-03-my-country.json", "/curriculum/grade-1/reading-2025-2026/lessons/unit-04-health-and-environment.json", "/curriculum/grade-1/reading-2025-2026/lessons/unit-05-hobbies-and-games.json", "/curriculum/grade-1/reading-2025-2026/lessons/unit-06-world-around-me.json", "/curriculum/grade-1/reading-2025-2026/units-index.json", "/curriculum/grade-2/math-2025-2026/chapters-index.json"];
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
        const fallback = await caches.match("/index.html");
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});

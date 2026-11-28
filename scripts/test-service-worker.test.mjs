import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

function createWorker({ fetchImpl, cached = new Map() }) {
  const listeners = new Map();
  const writes = [];
  const worker = {
    location: { origin: "https://madrasti.test" },
    clients: { claim() {} },
    skipWaiting() {},
    addEventListener(name, callback) { listeners.set(name, callback); }
  };
  const cacheStore = {
    async match(request) {
      const key = typeof request === "string" ? request : request.url;
      return cached.get(key) || null;
    },
    async open() {
      return {
        async addAll() {},
        async put(request, response) {
          writes.push(request.url);
          cached.set(request.url, response);
        }
      };
    },
    async keys() { return ["madrasti-shell-v3"]; },
    async delete() { return true; }
  };
  runInNewContext(source, {
    self: worker,
    caches: cacheStore,
    fetch: fetchImpl,
    URL,
    console: { warn() {} }
  });
  return { listeners, writes, cached };
}

function makeEvent(request) {
  let responsePromise;
  const waits = [];
  return {
    request,
    respondWith(promise) { responsePromise = Promise.resolve(promise); },
    waitUntil(promise) { waits.push(Promise.resolve(promise)); },
    get response() { return responsePromise; },
    async settleWrites() { await Promise.all(waits); }
  };
}

test("offline navigation falls back to the cached application shell", async () => {
  const shell = { body: "cached app shell" };
  const worker = createWorker({
    fetchImpl: async () => { throw new Error("offline"); },
    cached: new Map([["/index.html", shell]])
  });
  const event = makeEvent({ method: "GET", url: "https://madrasti.test/lesson", mode: "navigate", destination: "document" });
  worker.listeners.get("fetch")(event);
  assert.equal(await event.response, shell);
});

test("offline navigation to the student app falls back to the cached student page", async () => {
  const studentShell = { body: "cached student app" };
  const worker = createWorker({
    fetchImpl: async () => { throw new Error("offline"); },
    cached: new Map([["/student.html", studentShell]])
  });
  const event = makeEvent({ method: "GET", url: "https://madrasti.test/student.html", mode: "navigate", destination: "document" });
  worker.listeners.get("fetch")(event);
  assert.equal(await event.response, studentShell);
});

test("an uncached curriculum JSON request does not receive HTML as a fake fallback", async () => {
  const worker = createWorker({ fetchImpl: async () => { throw new Error("offline"); } });
  const event = makeEvent({ method: "GET", url: "https://madrasti.test/curriculum/grade-1/reading.json", mode: "cors", destination: "" });
  worker.listeners.get("fetch")(event);
  await assert.rejects(event.response, /offline/);
});

test("successful non-document resources are scheduled for cache storage", async () => {
  const response = { ok: true, clone() { return { cachedCopy: true }; } };
  const worker = createWorker({ fetchImpl: async () => response });
  const event = makeEvent({ method: "GET", url: "https://madrasti.test/curriculum/unit.json", mode: "cors", destination: "" });
  worker.listeners.get("fetch")(event);
  assert.equal(await event.response, response);
  await event.settleWrites();
  assert.deepEqual(worker.writes, ["https://madrasti.test/curriculum/unit.json"]);
});

test("cross-origin requests are left to the browser", () => {
  const worker = createWorker({ fetchImpl: async () => { throw new Error("must not be called"); } });
  const event = makeEvent({ method: "GET", url: "https://example.com/data.json", mode: "cors", destination: "" });
  worker.listeners.get("fetch")(event);
  assert.equal(event.response, undefined);
});

test("curriculum JSON uses the fresh network response and refreshes its cache", async () => {
  const oldVersion = { version: "old" };
  const newVersion = { version: "new", ok: true, clone() { return { version: "new cached" }; } };
  const worker = createWorker({
    fetchImpl: async () => newVersion,
    cached: new Map([["https://madrasti.test/curriculum/unit.json", oldVersion]])
  });
  const event = makeEvent({ method: "GET", url: "https://madrasti.test/curriculum/unit.json", mode: "cors", destination: "" });
  worker.listeners.get("fetch")(event);
  assert.equal(await event.response, newVersion);
  await event.settleWrites();
  assert.equal(worker.cached.get("https://madrasti.test/curriculum/unit.json").version, "new cached");
});

test("curriculum JSON uses its last cached copy when the device is offline", async () => {
  const cachedLesson = { version: "offline cached lesson" };
  const worker = createWorker({
    fetchImpl: async () => { throw new Error("offline"); },
    cached: new Map([["https://madrasti.test/curriculum/unit.json", cachedLesson]])
  });
  const event = makeEvent({ method: "GET", url: "https://madrasti.test/curriculum/unit.json", mode: "cors", destination: "" });
  worker.listeners.get("fetch")(event);
  assert.equal(await event.response, cachedLesson);
});

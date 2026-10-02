import test from "node:test";
import assert from "node:assert/strict";
import { createEventDetailStore } from "../src/data/eventDetails.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const event = (id) => ({ id, detailPath: `data/events/${id}.json` });

function controlledStore() {
  const calls = [];
  const store = createEventDetailStore((path, signal) => new Promise((resolve, reject) => {
    calls.push({ path, signal, resolve, reject });
  }));
  return { store, calls };
}

test("same ID shares one request and a departing consumer cannot cancel another", async () => {
  const { store, calls } = controlledStore();
  const leaveArchive = store.acquire(event("a"));
  const leaveCalendar = store.acquire(event("a"));
  await tick();
  assert.equal(calls.length, 1);
  leaveArchive();
  assert.equal(calls[0].signal.aborted, false);
  calls[0].resolve({ id: "a", missions: [1] });
  await tick();
  assert.equal(store.snapshot("a").status, "ready");
  leaveCalendar();
  store.acquire(event("a"))();
  assert.equal(calls.length, 1);
});

test("switching IDs aborts unused work; late success cannot overwrite another ID", async () => {
  const { store, calls } = controlledStore();
  const leaveA = store.acquire(event("a"));
  await tick();
  leaveA();
  const leaveB = store.acquire(event("b"));
  await tick();
  assert.equal(calls[0].signal.aborted, true);
  calls[0].resolve({ id: "a" });
  calls[1].resolve({ id: "b" });
  await tick();
  assert.equal(store.snapshot("a").status, "idle");
  assert.equal(store.snapshot("b").data.id, "b");
  leaveB();
});

test("failures and retries are per ID; mismatched payload is rejected", async () => {
  const { store, calls } = controlledStore();
  const leaveA = store.acquire(event("a"));
  const leaveB = store.acquire(event("b"));
  await tick();
  calls[0].reject(new Error("HTTP 503"));
  calls[1].resolve({ id: "not-b" });
  await tick();
  assert.equal(store.snapshot("a").error, "HTTP 503");
  assert.equal(store.snapshot("b").status, "error");
  store.retry(event("a"));
  assert.equal(store.snapshot("a").status, "loading");
  await tick();
  calls[2].resolve({ id: "a" });
  await tick();
  assert.equal(store.snapshot("a").status, "ready");
  assert.equal(store.snapshot("b").status, "error");
  leaveA();
  leaveB();
});

test("closing and reopening a failed detail retries without poisoning the cache", async () => {
  const { store, calls } = controlledStore();
  const leave = store.acquire(event("a"));
  await tick();
  calls[0].reject(new Error("temporary failure"));
  await tick();
  assert.equal(store.snapshot("a").status, "error");
  leave();
  const closeAgain = store.acquire(event("a"));
  await tick();
  assert.equal(calls.length, 2);
  assert.equal(store.snapshot("a").status, "loading");
  calls[1].resolve({ id: "a" });
  await tick();
  assert.equal(store.snapshot("a").status, "ready");
  closeAgain();
});

test("subscribers only hear their own ID, including cancellation", async () => {
  const { store } = controlledStore();
  let a = 0;
  let b = 0;
  const unsubscribeA = store.subscribe("a", () => a++);
  const unsubscribeB = store.subscribe("b", () => b++);
  const leave = store.acquire(event("a"));
  assert.equal(a, 1);
  assert.equal(b, 0);
  leave();
  assert.equal(a, 2);
  unsubscribeA();
  unsubscribeB();
  await tick();
});

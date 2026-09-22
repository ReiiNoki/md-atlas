import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { expandAnalytics } from "../src/utils/archive.js";

const publicRoot = new URL("../public/", import.meta.url);
const archive = JSON.parse(await readFile(new URL("data/archive.json", publicRoot), "utf8"));
const analyticsPayload = JSON.parse(
  await readFile(new URL("data/analytics.json", publicRoot), "utf8"),
);
const searchIndex = JSON.parse(
  await readFile(new URL("data/search-index.json", publicRoot), "utf8"),
);

test("generated archive metadata matches event summaries", () => {
  assert.equal(archive.meta.eventCount, archive.events.length);
  assert.ok(archive.meta.missionCount > archive.meta.eventCount);
  assert.ok(archive.meta.yearRange.min <= archive.meta.yearRange.max);
});

test("compact analytics expands to the advertised mission count", () => {
  const analytics = expandAnalytics(analyticsPayload);
  assert.equal(analytics.events.length, archive.meta.eventCount);
  assert.equal(
    analytics.events.reduce((total, event) => total + event.missions.length, 0),
    archive.meta.missionCount,
  );
  const firstMissionEvent = analytics.events.find((event) => event.missions.length);
  assert.ok(firstMissionEvent);
  assert.equal(typeof firstMissionEvent.missions[0].title, "string");
  assert.equal("authorFaction" in firstMissionEvent.missions[0], true);
});

test("every event has its published detail file without depending on maintenance tools", async () => {
  let missionCount = 0;
  for (const event of archive.events) {
    const filename = `${Buffer.from(event.id, "utf8").toString("base64url")}.json`;
    assert.equal(event.detailPath, `data/events/${filename}`);
    const detail = JSON.parse(await readFile(new URL(event.detailPath, publicRoot), "utf8"));
    assert.equal(detail.id, event.id);
    assert.equal(detail.missionCount, event.missionCount);
    assert.ok(Array.isArray(detail.missions));
    if (!(event.status === "scheduled" && detail.missions.length === 0)) {
      assert.equal(detail.missions.length, event.missionCount);
    }
    missionCount += detail.missions.length;
  }
  assert.equal(missionCount, archive.meta.missionCount);
});

test("event summaries expose normalized known statuses", () => {
  const allowedStatuses = new Set(["online", "offline", "partially_offline", "scheduled"]);
  for (const event of archive.events) {
    assert.equal(
      allowedStatuses.has(event.status),
      true,
      `${event.id} has unexpected status ${event.status}`,
    );
  }
});

test("every event has one audited Mission Day type", () => {
  const allowedTypes = new Set(["md-xma", "md-standard", "md-lite"]);
  const counts = Object.create(null);
  for (const event of archive.events) {
    assert.equal(
      allowedTypes.has(event.missionDayType),
      true,
      `${event.id} has unexpected Mission Day type ${event.missionDayType}`,
    );
    counts[event.missionDayType] = (counts[event.missionDayType] ?? 0) + 1;
  }
  assert.deepEqual({ ...counts }, { "md-xma": 222, "md-lite": 11, "md-standard": 544 });
});

test("mission search text is deferred to a complete standalone index", () => {
  assert.deepEqual(Object.keys(searchIndex).sort(), archive.events.map(({ id }) => id).sort());
  for (const event of archive.events) {
    assert.equal("searchText" in event, false);
    assert.equal(typeof searchIndex[event.id], "string");
  }
});

test("event summaries are unique, valid, and do not embed mission details", () => {
  const ids = new Set();
  for (const event of archive.events) {
    assert.ok(event.id);
    assert.equal(ids.has(event.id), false, `duplicate event ${event.id}`);
    ids.add(event.id);
    assert.equal(Array.isArray(event.missions), false);
    assert.match(event.detailPath, /^data\/events\/.+\.json$/);
    assert.ok(Number.isFinite(event.lat) && Math.abs(event.lat) <= 90);
    assert.ok(Number.isFinite(event.lng) && Math.abs(event.lng) <= 180);
  }
});

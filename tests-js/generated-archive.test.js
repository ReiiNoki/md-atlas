import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { expandAnalytics } from "../src/domain/archive.js";

const publicRoot = new URL("../public/", import.meta.url);
const archive = JSON.parse(await readFile(new URL("data/archive.json", publicRoot), "utf8"));
const analyticsPayload = JSON.parse(
  await readFile(new URL("data/analytics.json", publicRoot), "utf8"),
);
const searchIndex = JSON.parse(
  await readFile(new URL("data/search-index.json", publicRoot), "utf8"),
);
const officialMissions = JSON.parse(
  await readFile(new URL("data/official-missions.json", publicRoot), "utf8"),
);
const officialMissionSearchIndex = JSON.parse(
  await readFile(new URL("data/official-mission-search-index.json", publicRoot), "utf8"),
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
    assert.equal(event.address, detail.address);
    assert.equal(detail.missionCount, event.missionCount);
    assert.ok(Array.isArray(detail.missions));
    if (!(event.status === "scheduled" && detail.missions.length === 0)) {
      assert.equal(detail.missions.length, event.missionCount);
    }
    missionCount += detail.missions.length;
  }
  assert.equal(missionCount, archive.meta.missionCount);
});

test("archive list averages match independent valid samples from published details", async () => {
  for (const event of [...archive.events, ...officialMissions.events]) {
    const detail = JSON.parse(await readFile(new URL(event.detailPath, publicRoot), "utf8"));
    for (const [source, average, count] of [
      ["distanceMeters", "averageMissionDistanceMeters", "missionDistanceSampleCount"],
      ["timeMilliseconds", "averageMissionTimeMilliseconds", "missionTimeSampleCount"],
    ]) {
      const samples = detail.missions.map((mission) => mission[source]).filter((value) => typeof value === "number" && Number.isFinite(value) && value >= 0);
      assert.equal(event[count], samples.length, `${event.id}: ${count}`);
      if (!samples.length) assert.equal(event[average], null, `${event.id}: ${average}`);
      else {
        const expected = samples.reduce((total, value) => total + value, 0) / samples.length;
        assert.ok(Number.isFinite(event[average]) && event[average] >= 0);
        assert.ok(Math.abs(event[average] - expected) <= Math.max(1, expected) * 1e-12, `${event.id}: ${average}`);
      }
    }
  }
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
  assert.equal(Object.values(counts).reduce((total, count) => total + count, 0), archive.events.length);
});

test("archive-only official mission sets stay separate from Mission Day data", async () => {
  assert.equal(officialMissions.meta.eventCount, officialMissions.events.length);
  assert.equal(archive.meta.eventCount, archive.events.length);
  const missionDayIds = new Set(archive.events.map((event) => event.id));
  const typeCounts = Object.create(null);
  let missionCount = 0;
  for (const event of officialMissions.events) {
    assert.equal(missionDayIds.has(event.id), false);
    typeCounts[event.activityType] = (typeCounts[event.activityType] ?? 0) + 1;
    assert.equal(typeof officialMissionSearchIndex[event.id], "string");
    const detail = JSON.parse(await readFile(new URL(event.detailPath, publicRoot), "utf8"));
    assert.equal(detail.id, event.id);
    assert.equal(detail.activityType, event.activityType);
    assert.equal(detail.missions.length, event.missionCount);
    missionCount += detail.missions.length;
  }
  const allowedTypes = new Set(["anime_collaboration", "brand_campaign", "goruck", "intel_ops", "special_event"]);
  assert.ok(Object.keys(typeCounts).every((type) => allowedTypes.has(type)));
  assert.equal(missionCount, officialMissions.meta.missionCount);
  assert.equal(
    officialMissions.events.find((event) => event.id === "gr-fredericksburg-scavenger-hunt-ebf6").date,
    null,
  );
});

test("the 2026 Denver banner replaces its placeholder without overwriting the 2016 event", async () => {
  const denver = archive.events.find((event) => event.id === "md2026-denver-ff0a");
  assert.equal(archive.events.some((event) => event.id === "scheduled-md-2026-denver"), false);
  assert.equal(denver.date, "2026-09-20");
  assert.equal(denver.missionDayType, "md-xma");
  assert.equal(denver.status, "online");
  assert.equal(denver.missionCount, 24);
  const detail = JSON.parse(await readFile(new URL(denver.detailPath, publicRoot), "utf8"));
  assert.equal(detail.missions.length, 24);
  assert.ok(detail.missions.every((mission) => mission.author === "NIAMission02"));
  assert.ok(detail.missions.every((mission) => mission.authorFaction === "ENLIGHTENED"));
  assert.ok(detail.missions.every((mission) => typeof mission.rating === "number" && mission.rating >= 0 && mission.rating <= 100));
  assert.ok(archive.events.some((event) => event.id === "md-denver-a948" && event.date === "2016-08-28"));
});

test("the 2026 Zhuhai banner replaces its placeholder with published mission details", async () => {
  const id = "md-2026-zhuhai-bd33";
  const matches = archive.events.filter((event) => event.id === id);
  assert.equal(matches.length, 1);
  assert.equal(archive.events.some((event) => event.id === "scheduled-md-2026-zhuhai"), false);
  const [event] = matches;
  assert.equal(event.title, "MD 2026: Zhuhai");
  assert.equal(event.date, "2026-11-07");
  assert.equal(event.year, 2026);
  assert.equal(event.status, "online");
  assert.equal(event.missionDayType, "md-standard");
  assert.equal(event.missionCount, 18);
  assert.equal(event.picture, "https://api.bannergress.com/bnrs/pictures/9e422305aabe06c52634a8fd3d78b275");
  assert.equal(event.lat, 22.259495);
  assert.equal(event.lng, 113.573393);
  const detail = JSON.parse(await readFile(new URL(event.detailPath, publicRoot), "utf8"));
  assert.equal(detail.missions.length, event.missionCount);
  assert.equal(detail.onlineMissionCount, detail.missions.length);
  assert.equal(detail.offlineMissionCount, 0);
  assert.deepEqual(detail.missions.map((mission) => mission.index), Array.from({ length: event.missionCount }, (_, index) => index + 1));
  assert.equal(new Set(detail.missions.map((mission) => mission.id)).size, event.missionCount);
  assert.ok(detail.missions.every((mission) => mission.status === "published" && mission.title.startsWith("MD 2026: Zhuhai,")));
  assert.ok(detail.missions.every((mission) => mission.author === "NIAMission01" && mission.authorFaction === "RESISTANCE"));
  assert.equal(detail.missions[0].title, "MD 2026: Zhuhai, 九洲城");
  assert.ok(searchIndex[id].includes("九洲城"));
  const counts = detail.missions.map((mission) => mission.completions);
  if (counts.some((count) => count == null)) assert.equal(event.completions, null);
  else assert.equal(event.completions, counts.reduce((total, count) => total + count, 0));
  const statistics = expandAnalytics(analyticsPayload).events.find((entry) => entry.id === id);
  assert.equal(statistics.missions.length, detail.missions.length);
  assert.deepEqual(statistics.missions.map((mission) => mission.id), detail.missions.map((mission) => mission.id));
});

test("2026 Shanghai retains its confirmed total before mission details are published", async () => {
  const analytics = expandAnalytics(analyticsPayload);
  for (const [id, date] of [["scheduled-md-2026-shanghai", "2026-11-29"]]) {
    const matches = archive.events.filter((event) => event.id === id);
    assert.equal(matches.length, 1);
    const [event] = matches;
    assert.equal(event.date, date);
    assert.equal(event.year, 2026);
    assert.equal(event.status, "scheduled");
    assert.equal(event.missionCount, 18);
    const detail = JSON.parse(await readFile(new URL(event.detailPath, publicRoot), "utf8"));
    assert.equal(detail.missionCount, 18);
    assert.deepEqual(detail.missions, []);
    const statistics = analytics.events.find((event) => event.id === id);
    assert.equal(statistics.missionCount, 18);
    assert.deepEqual(statistics.missions, []);
  }
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

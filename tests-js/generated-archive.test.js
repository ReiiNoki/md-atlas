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
  assert.equal(event.picture, "https://api.bannergress.com/bnrs/pictures/15f92659a7acee59239e05dabff03924");
  assert.equal(event.lat, 22.259495);
  assert.equal(event.lng, 113.573393);
  const detail = JSON.parse(await readFile(new URL(event.detailPath, publicRoot), "utf8"));
  assert.equal(detail.picture, event.picture, "Zhuhai summary and detail must use the same reviewed image");
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

test("Zhuhai uses the reviewed latest MDTrace snapshot without summing historical readings", async () => {
  const event = archive.events.find((entry) => entry.id === "md-2026-zhuhai-bd33");
  const detail = JSON.parse(await readFile(new URL(event.detailPath, publicRoot), "utf8"));
  assert.equal(event.date, "2026-11-07", "the collection window must not replace the official event date");
  assert.equal(event.completions, 2756);
  assert.equal(event.averageRating, 75.7295);
  assert.ok(detail.missions.every((mission) => Number.isInteger(mission.completions) && mission.completions >= 0));
  assert.ok(detail.missions.every((mission) => typeof mission.rating === "number" && mission.rating >= 0 && mission.rating <= 100));
  assert.equal(event.completions, detail.missions.reduce((sum, mission) => sum + mission.completions, 0));
  const ratingMean = detail.missions.reduce((sum, mission) => sum + mission.rating, 0) / detail.missions.length;
  assert.ok(Math.abs(event.averageRating - ratingMean) <= 0.00005, "activity rating is an unweighted task mean");
  assert.equal(event.missionTimeSampleCount, detail.missions.length);
  const timeMean = detail.missions.reduce((sum, mission) => sum + mission.timeMilliseconds, 0) / detail.missions.length;
  assert.ok(Math.abs(event.averageMissionTimeMilliseconds - timeMean) < 1e-6);
  assert.equal(event.missionDistanceSampleCount, detail.missions.length);
  assert.ok(Math.abs(event.averageMissionDistanceMeters - 434.8333333333333) < 1e-9);
  const jiuzhoucheng = detail.missions.find((mission) => mission.id === "bcc535cdf0524b13a06b877c9caf8bcb.1c");
  assert.equal(jiuzhoucheng.index, 1, "MDTrace order 6 must not overwrite the Bannergress order");
  assert.equal(jiuzhoucheng.completions, 207);
  assert.equal(jiuzhoucheng.rating, 85.1852);
  assert.equal(jiuzhoucheng.timeMilliseconds, 522549);
});

test("the 2026 Khon Kaen banner replaces only its own placeholder with 24 reviewed missions", async () => {
  const id = "md-2026-khon-kaen-5d27";
  const matches = archive.events.filter((event) => event.id === id);
  assert.equal(matches.length, 1);
  assert.equal(archive.events.some((event) => event.id === "scheduled-md-2026-khon-kaen"), false);
  const [event] = matches;
  assert.equal(event.title, "MD 2026: Khon Kaen");
  assert.equal(event.city, "Khon Kaen");
  assert.equal(event.countryCode, "TH");
  assert.equal(event.date, "2026-11-14");
  assert.equal(event.year, 2026);
  assert.equal(event.status, "online");
  assert.equal(event.missionDayType, "md-standard");
  assert.equal(event.missionCount, 24);
  assert.equal(event.picture, "https://api.bannergress.com/bnrs/pictures/3fbb2d49406d35ca1a13a7bc5a7b7d56");
  assert.equal(event.lat, 16.432336);
  assert.equal(event.lng, 102.824094);
  const detail = JSON.parse(await readFile(new URL(event.detailPath, publicRoot), "utf8"));
  assert.equal(detail.picture, event.picture);
  assert.equal(detail.date, detail.endDate);
  assert.equal(detail.timezone, "Asia/Bangkok");
  assert.equal(detail.missions.length, event.missionCount);
  assert.equal(detail.onlineMissionCount, detail.missions.length);
  assert.equal(detail.offlineMissionCount, 0);
  assert.deepEqual(detail.missions.map((mission) => mission.index), Array.from({ length: event.missionCount }, (_, index) => index + 1));
  assert.equal(new Set(detail.missions.map((mission) => mission.id)).size, detail.missions.length);
  assert.ok(detail.missions.every((mission) => mission.author === "NIAMission01" && mission.authorFaction === "RESISTANCE"));
  assert.ok(detail.missions.every((mission) => mission.status === "published" && !mission.offline));
  assert.equal(detail.missions[0].id, "14481a0746034184a571f999810919bd.1c");
  assert.equal(detail.missions[0].title, "MD 2026: KHON KAEN, Central Plaza");
  assert.equal(detail.missions[3].title, "MD 2026: Khon Kaen Train Station", "preserve the original mixed-case title");
  assert.ok(searchIndex[id].includes("Central Plaza") && searchIndex[id].includes("Khon Kaen Train Station"));
  const statistics = expandAnalytics(analyticsPayload).events.find((entry) => entry.id === id);
  assert.equal(statistics.missions.length, detail.missions.length);
  assert.deepEqual(statistics.missions.map((mission) => mission.id), detail.missions.map((mission) => mission.id));
  const completionCounts = detail.missions.map((mission) => mission.completions);
  if (completionCounts.some((count) => count == null)) assert.equal(event.completions, null);
  const noviSad = archive.events.find((entry) => entry.id === "md-novi-sad-novi-sad-f1a1");
  assert.equal(noviSad.date, event.date, "a different activity on the same date must survive independently");
  assert.equal(noviSad.status, "online");
});

test("the 2026 Novi Sad banner replaces its own placeholder without changing Khon Kaen", async () => {
  const id = "md-novi-sad-novi-sad-f1a1";
  const matches = archive.events.filter((event) => event.id === id);
  assert.equal(matches.length, 1);
  assert.equal(archive.events.some((event) => event.id === "scheduled-md-2026-novi-sad"), false);
  const [event] = matches;
  assert.equal(event.title, "MD Novi Sad Novi Sad", "preserve the Banner's original title");
  assert.equal(event.city, "Novi Sad");
  assert.equal(event.countryCode, "RS");
  assert.equal(event.date, "2026-11-14");
  assert.equal(event.year, 2026);
  assert.equal(event.status, "online");
  assert.equal(event.missionDayType, "md-standard");
  assert.equal(event.missionCount, 18);
  assert.equal(event.picture, "https://api.bannergress.com/bnrs/pictures/7aea039ffe2f5f8409a4343b299b44cb");
  assert.equal(event.lat, 45.265569);
  assert.equal(event.lng, 19.830374);
  const detail = JSON.parse(await readFile(new URL(event.detailPath, publicRoot), "utf8"));
  assert.equal(detail.picture, event.picture);
  assert.equal(detail.date, detail.endDate);
  assert.equal(detail.timezone, "Europe/Belgrade");
  assert.equal(detail.missions.length, event.missionCount);
  assert.equal(detail.onlineMissionCount, detail.missions.length);
  assert.equal(detail.offlineMissionCount, 0);
  assert.deepEqual(detail.missions.map((mission) => mission.index), Array.from({ length: event.missionCount }, (_, index) => index + 1));
  assert.equal(new Set(detail.missions.map((mission) => mission.id)).size, detail.missions.length);
  assert.ok(detail.missions.every((mission) => mission.author === "NIAMission02" && mission.authorFaction === "ENLIGHTENED"));
  assert.ok(detail.missions.every((mission) => mission.status === "published" && !mission.offline));
  assert.equal(detail.missions[0].id, "dd77c2a41eff448780fc05bbcba4d8e6.1c");
  assert.equal(detail.missions[0].title, "MD Novi Sad 2026: Memorial Steam Locomotive");
  assert.equal(detail.missions[8].title, "MD Novi Sad: Novi Sad Synagogue", "do not invent a year in a source mission title");
  assert.equal(detail.missions[17].title, "MD Novi Sad 2026: Štrand");
  assert.ok(searchIndex[id].includes("Memorial Steam Locomotive") && searchIndex[id].includes("Štrand"));
  const statistics = expandAnalytics(analyticsPayload).events.find((entry) => entry.id === id);
  assert.deepEqual(statistics.missions.map((mission) => mission.id), detail.missions.map((mission) => mission.id));
  if (detail.missions.some((mission) => mission.completions == null)) assert.equal(event.completions, null);
  const khonKaen = archive.events.find((entry) => entry.id === "md-2026-khon-kaen-5d27");
  assert.equal(khonKaen.date, event.date);
  assert.equal(khonKaen.missionCount, 24);
  assert.equal(khonKaen.status, "online");
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

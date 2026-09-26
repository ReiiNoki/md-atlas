import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { INITIAL_FILTERS } from "../src/utils/archive.js";
import {
  calendarActivityType,
  filterXmAnomalies,
  normalizeXmAnomalies,
} from "../src/utils/calendarActivities.js";

const payload = JSON.parse(
  await readFile(new URL("../public/data/xm-anomalies.json", import.meta.url), "utf8"),
);
const anomalies = normalizeXmAnomalies(payload);

test("published XM Anomalies remain independent calendar activities", () => {
  assert.equal(anomalies.length, 484);
  assert.equal(new Set(anomalies.map((event) => event.series)).size, 40);
  assert.equal(new Set(anomalies.map((event) => event.date)).size, 115);
  assert.equal(anomalies.filter((event) => event.siteRole === "global").length, 7);
  assert.ok(anomalies.every((event) => event.year === Number(event.date.slice(0, 4))));
  assert.ok(anomalies.every((event) => calendarActivityType(event) === "xm-anomaly"));
  assert.equal(calendarActivityType({ missionDayType: "md-xma" }), "mission-day");
});

test("cancelled sites stay absent and global phases stay compact", () => {
  for (const [series, city] of [
    ["Shōnin", "Alexandria"],
    ["Persepolis", "Kathmandu"],
    ["Erased Memories", "Valencia"],
  ]) {
    assert.equal(anomalies.some((event) => event.series === series && event.city === city), false);
  }
  assert.deepEqual(
    anomalies
      .filter((event) => event.series === "Kureze Effect")
      .map((event) => [event.date, event.city]),
    [
      ["2022-01-23", "Global"],
      ["2022-02-19", "Global"],
      ["2022-03-19", "Global"],
    ],
  );
});

test("calendar filters apply common criteria without conflating MD types", () => {
  assert.equal(filterXmAnomalies(anomalies, INITIAL_FILTERS).length, 484);
  assert.ok(filterXmAnomalies(anomalies, { ...INITIAL_FILTERS, year: "2015" })
    .every((event) => event.year === 2015));
  assert.ok(filterXmAnomalies(anomalies, { ...INITIAL_FILTERS, region: "APAC" })
    .every((event) => event.region === "APAC"));
  assert.ok(filterXmAnomalies(anomalies, { ...INITIAL_FILTERS, country: "JP" })
    .every((event) => event.countryCode === "JP"));
  assert.ok(filterXmAnomalies(anomalies, INITIAL_FILTERS, "shōnin")
    .every((event) => event.series === "Shōnin"));
  assert.equal(filterXmAnomalies(anomalies, { ...INITIAL_FILTERS, missionDayType: "md-xma" }).length, 0);
  assert.equal(filterXmAnomalies(anomalies, { ...INITIAL_FILTERS, status: "online" }).length, 0);
});

test("invalid anomaly payloads fail instead of rendering partial calendar data", () => {
  assert.throws(() => normalizeXmAnomalies([]), /non-empty array/);
  assert.throws(() => normalizeXmAnomalies([{ ...payload[0], title: "Wrong" }]), /Invalid XM Anomaly/);
  assert.throws(() => normalizeXmAnomalies([payload[0], payload[0]]), /Duplicate/);
});

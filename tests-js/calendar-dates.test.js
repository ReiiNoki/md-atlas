import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { defaultCalendarDate, nextMissionDayDate, localIsoDate, millisecondsUntilNextLocalDay, nearestUpcomingEvent, isoDate, monthCells } from "../src/domain/calendarDates.js";

test("calendar cells start on Monday, include leap days and complete weeks", () => {
  const leap = monthCells(2024, 1);
  assert.equal(leap.findIndex(({ day }) => day === 1), 3);
  assert.equal(leap.filter(({ day }) => day != null).length, 29);
  assert.equal(leap.length % 7, 0);
  assert.equal(new Set(leap.map(({ key }) => key)).size, leap.length);
  assert.equal(monthCells(2023, 1).filter(({ day }) => day != null).length, 28);
  assert.equal(monthCells(2024, 0)[0].day, 1);
});

test("calendar ISO dates keep UTC-friendly padding and month indexing", () => {
  assert.equal(isoDate(2024, 0, 1), "2024-01-01");
  assert.equal(isoDate(2024, 11, 31), "2024-12-31");
});

test("nearest upcoming activity ignores undated/past events and keeps same-day ties stable", () => {
  const later = { id: "later", date: "2026-12-06" };
  const next = { id: "next", date: "2026-11-07" };
  const tied = { id: "tied", date: "2026-11-07" };
  const events = [later, { date: null }, { date: "2026-09-19" }, {}, next, tied];
  assert.strictEqual(nearestUpcomingEvent(events, "2026-10-08"), next);
  assert.strictEqual(nearestUpcomingEvent(events, "2026-11-07"), next);
  assert.equal(nearestUpcomingEvent(events, "2026-12-07"), undefined);
  assert.equal(nearestUpcomingEvent([], "2026-10-08"), undefined);
  assert.deepEqual(events.map(({ id }) => id), ["later", undefined, undefined, undefined, "next", "tied"]);
});

test("calendar opens on the current local day, independently of future activities", () => {
  assert.equal(defaultCalendarDate("2026-11-22"), "2026-11-22");
  assert.equal(defaultCalendarDate("2027-01-01"), "2027-01-01");
  assert.equal(defaultCalendarDate(), localIsoDate());
});

test("next MD is strictly future, ignores standalone Anomalies, and marks one date for same-day MDs", () => {
  const events = [
    { calendarType: "mission-day", date: "2026-12-05" },
    { calendarType: "xm-anomaly", date: "2026-11-23" },
    { calendarType: "mission-day", date: "2026-11-22" },
    { calendarType: "mission-day", date: "2026-11-21" },
    { calendarType: "mission-day", date: null },
    { calendarType: "mission-day", date: "2026-11-29", missionDayType: "md-xma" },
    { calendarType: "mission-day", date: "2026-11-29", missionDayType: "md-standard" },
  ];
  assert.equal(nextMissionDayDate(events, "2026-11-22"), "2026-11-29");
  assert.equal(nextMissionDayDate(events, "2026-11-29"), "2026-12-05", "today uses the cyan marker, not the next-MD marker");
  assert.equal(nextMissionDayDate(events, "2026-12-05"), undefined);
  assert.equal(nextMissionDayDate(events.filter(e => e.calendarType === "xm-anomaly"), "2026-11-22"), undefined);
  assert.equal(nextMissionDayDate([], "2026-11-22"), undefined);
});

test("local day and midnight delay handle month/year boundaries", () => {
  assert.equal(localIsoDate(new Date(2026, 10, 22, 23, 59, 59, 900)), "2026-11-22");
  assert.equal(millisecondsUntilNextLocalDay(new Date(2026, 10, 22, 23, 59, 59, 900)), 100);
  assert.equal(millisecondsUntilNextLocalDay(new Date(2026, 11, 31, 23, 59, 59, 999)), 1);
  assert.equal(localIsoDate(new Date(2027, 0, 1)), "2027-01-01");
});

test("viewer-local dates differ correctly from UTC and midnight scheduling respects daylight saving", () => {
  const moduleUrl = new URL("../src/domain/calendarDates.js", import.meta.url).href;
  const script = `import {localIsoDate,millisecondsUntilNextLocalDay} from ${JSON.stringify(moduleUrl)};
    console.log(JSON.stringify([localIsoDate(new Date('2026-11-22T16:30:00Z')),
      millisecondsUntilNextLocalDay(new Date(2026,2,8)),millisecondsUntilNextLocalDay(new Date(2026,10,1))]));`;
  const run = (timezone) => {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", env: { ...process.env, TZ: timezone } });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  assert.equal(run("Asia/Shanghai")[0], "2026-11-23", "UTC still says November 22");
  assert.deepEqual(run("America/New_York").slice(1), [23 * 3600000, 25 * 3600000]);
});

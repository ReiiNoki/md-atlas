import test from "node:test";
import assert from "node:assert/strict";
import { defaultCalendarDate, nearestUpcomingEvent, isoDate, monthCells } from "../src/domain/calendarDates.js";

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

test("calendar opens on the nearest upcoming activity or the current date", () => {
  const events = [
    { date: "2026-09-19" },
    { date: "2026-11-07" },
    { date: "2026-11-14" },
    { date: "2026-12-06" },
    { date: null },
  ];
  assert.equal(defaultCalendarDate(events, "2026-10-08"), "2026-11-07");
  assert.equal(defaultCalendarDate(events, "2026-11-07"), "2026-11-07", "a day that just started still counts");
  assert.equal(defaultCalendarDate(events, "2026-11-14"), "2026-11-14");
  assert.equal(defaultCalendarDate(events, "2026-12-24"), "2026-12-24", "no upcoming activity targets today");
  assert.equal(defaultCalendarDate([], "2026-10-08"), "2026-10-08");
  assert.equal(defaultCalendarDate([{ date: "2999-01-01" }]), "2999-01-01");
  assert.equal(
    defaultCalendarDate([{ date: "2000-01-01" }]),
    new Date().toISOString().slice(0, 10),
    "past-only activities fall back to the real current date",
  );
});

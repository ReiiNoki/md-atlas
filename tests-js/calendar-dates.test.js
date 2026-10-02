import test from "node:test";
import assert from "node:assert/strict";
import { isoDate, monthCells } from "../src/domain/calendarDates.js";

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

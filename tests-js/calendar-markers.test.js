import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { localIsoDate } from "../src/domain/calendarDates.js";
import { translate } from "../src/i18n/messages.js";
import { loadJsxModules } from "./helpers/load-jsx.mjs";

const [renderer, grid, view, details] = await loadJsxModules(
  "/tests-js/helpers/render-jsx.jsx", "/src/features/calendar/CalendarGrid.jsx", "/src/features/calendar/CalendarView.jsx", "/src/data/useEventDetail.jsx",
);
const md = (id, date) => ({ id, date, year: 2026, title: id, city: "Shanghai", country: "China", countryCode: "CN", calendarType: "mission-day" });
const props = {
  months: Array.from({ length: 12 }, (_, i) => String(i + 1)), weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  activeYear: 2026, activeMonth: 10, today: "2026-11-22", nextMdDate: "2026-11-29", activeDate: "2026-11-21",
  eventsByDate: new Map([["2026-11-21", [md("past", "2026-11-21")]], ["2026-11-29", [md("next", "2026-11-29"), md("tied", "2026-11-29")]]]),
  monthEventCount: 3, undatedCount: 0, onWheel() {}, onDate() {},
};
const button = (html, date) => html.match(new RegExp(`<button\\b[^>]*data-date="${date}"[^>]*>`))?.[0];

test("today remains marked and selectable without events; selected and next-MD dates stay independent", () => {
  const html = renderer.renderLocalized(grid.CalendarGrid, props);
  const today = button(html, "2026-11-22");
  assert.ok(today);
  assert.match(today, /is-today/);
  assert.match(today, /aria-current="date"/);
  assert.match(today, /aria-pressed="false"/);
  assert.match(today, /今天/);
  assert.doesNotMatch(today, /has-events/);
  const selected = button(html, "2026-11-21");
  assert.match(selected, /is-selected/);
  assert.match(selected, /aria-pressed="true"/);
  assert.doesNotMatch(selected, /is-today|is-next-md|aria-current/);
  const next = button(html, "2026-11-29");
  assert.match(next, /is-next-md/);
  assert.match(next, /下一场 MD/);
  assert.doesNotMatch(next, /is-selected|is-today/);
  assert.equal((html.match(/is-next-md/g) ?? []).length, 1, "two same-day MDs share a date marker");
});

test("today's MD still uses today's marker and no future MD means no amber date marker", () => {
  const html = renderer.renderLocalized(grid.CalendarGrid, { ...props, today: "2026-11-29", nextMdDate: undefined, activeDate: "2026-11-29" });
  const today = button(html, "2026-11-29");
  assert.match(today, /has-events/);
  assert.match(today, /is-today/);
  assert.match(today, /is-selected/);
  assert.doesNotMatch(html, /is-next-md/);
});

test("calendar opens on this month/year even when its only activity is in a future year", () => {
  const today = localIsoDate();
  const year = Number(today.slice(0, 4)) + 1;
  const event = { ...md("future", `${year}-01-01`), year };
  const CalendarWithDetails = (props) => createElement(details.EventDetailProvider, null, createElement(view.CalendarView, props));
  const html = renderer.renderLocalized(CalendarWithDetails, { events: [event], xmAnomalies: [] });
  assert.match(button(html, today), /aria-current="date"/);
  assert.match(button(html, today), /aria-pressed="true"/);
  assert.ok(html.includes(`<option value="${year - 1}" selected="">`));
  assert.doesNotMatch(html, /is-next-md/, "the next MD is outside the displayed month");
});

test("calendar date marker labels remain localized", () => {
  for (const language of ["zh", "en", "ja"]) {
    for (const key of ["calendarToday", "calendarDayEmpty", "nextMissionDay"]) assert.notEqual(translate(language, key), key);
  }
});

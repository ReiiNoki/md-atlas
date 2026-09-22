import test from "node:test";
import assert from "node:assert/strict";
import {
  countEventsByYear,
  filterEvents,
  getYearRange,
  INITIAL_FILTERS,
  matchesQuery,
} from "../src/utils/archive.js";

const events = [
  {
    id: "a",
    title: "MD Tokyo",
    city: "Tokyo",
    country: "Japan",
    countryCode: "JP",
    region: "APAC",
    missionDayType: "md-xma",
    status: "online",
    year: 2024,
    searchText: "First mission Second mission",
  },
  {
    id: "b",
    title: "MD Berlin",
    city: "Berlin",
    country: "Germany",
    countryCode: "DE",
    region: "EMEA",
    missionDayType: "md-standard",
    status: "offline",
    year: 2023,
    searchText: "Historic route",
  },
  {
    id: "c",
    title: "Undated",
    city: "Unknown",
    country: "Japan",
    countryCode: "JP",
    region: "APAC",
    missionDayType: "md-lite",
    status: "online",
    year: null,
    searchText: "",
  },
  {
    id: "d",
    title: "MD Taipei",
    city: "Taipei",
    country: "Taiwan",
    countryCode: "TW",
    region: "APAC",
    missionDayType: "md-standard",
    status: "online",
    year: 2024,
    searchText: "",
  },
];

test("search includes deferred mission title text", () => {
  assert.equal(matchesQuery(events[0], "second mission"), true);
  assert.equal(matchesQuery(events[1], "second mission"), false);
});

test("standalone search index restores mission-title search for compact summaries", () => {
  const compactEvents = events.map(({ searchText, ...event }) => event);
  const searchIndex = Object.fromEntries(events.map((event) => [event.id, event.searchText]));
  assert.deepEqual(
    filterEvents(
      compactEvents,
      { ...INITIAL_FILTERS, query: "second mission" },
      "second mission",
      searchIndex,
    ).map((event) => event.id),
    ["a"],
  );
});

test("sensitive region display aliases remain searchable", () => {
  assert.equal(matchesQuery(events[3], "台湾地区"), true);
  assert.equal(matchesQuery(events[3], "中國台灣"), true);
  assert.equal(matchesQuery(events[3], "Taiwan"), true);
});

test("event filters combine year, region, status, and query", () => {
  const filters = {
    ...INITIAL_FILTERS,
    year: "2024",
    region: "APAC",
    status: "online",
    query: "Tokyo",
  };
  assert.deepEqual(filterEvents(events, filters).map((event) => event.id), ["a"]);
});

test("Mission Day type combines with the other filters", () => {
  const filters = {
    ...INITIAL_FILTERS,
    year: "2024",
    region: "APAC",
    missionDayType: "md-xma",
  };
  assert.deepEqual(filterEvents(events, filters).map((event) => event.id), ["a"]);
});

test("filtered calendar counts are derived from visible events", () => {
  assert.deepEqual(countEventsByYear(events.slice(0, 1)), { 2024: 1 });
  assert.deepEqual(countEventsByYear(events), { 2023: 1, 2024: 2 });
});

test("year range ignores undated events", () => {
  assert.deepEqual(getYearRange(events), { min: 2023, max: 2024 });
  assert.equal(getYearRange([events[2]]), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  countEventsByCountry,
  filterEvents,
  INITIAL_FILTERS,
} from "../src/utils/archive.js";
import { translate } from "../src/i18n/messages.js";

const events = [
  { id: "jp-1", year: 2024, region: "APAC", countryCode: "JP", country: "Japan", status: "online" },
  { id: "jp-2", year: 2019, region: "APAC", countryCode: "JP", country: "Japan", status: "offline" },
  { id: "tw-1", year: 2024, region: "APAC", countryCode: "TW", country: "Taiwan", status: "online" },
  { id: "fr-1", year: 2024, region: "EMEA", countryCode: "FR", country: "France", status: "online" },
];

test("country filter selects events by countryCode", () => {
  assert.deepEqual(
    filterEvents(events, { ...INITIAL_FILTERS, country: "JP" }).map((event) => event.id),
    ["jp-1", "jp-2"],
  );
  assert.deepEqual(
    filterEvents(events, { ...INITIAL_FILTERS, country: "FR" }).map((event) => event.id),
    ["fr-1"],
  );
  assert.equal(filterEvents(events, INITIAL_FILTERS).length, 4);
});

test("country filter combines with region, year and status", () => {
  const filters = { ...INITIAL_FILTERS, country: "JP", region: "EMEA" };
  assert.deepEqual(filterEvents(events, filters), []);
  const narrowed = { ...INITIAL_FILTERS, country: "JP", year: "2019", status: "offline" };
  assert.deepEqual(filterEvents(events, narrowed).map((event) => event.id), ["jp-2"]);
});

test("country options aggregate counts and skip invalid codes", () => {
  const options = countEventsByCountry([
    ...events,
    { id: "bad-1", countryCode: "jpn", country: "Not a code" },
    { id: "bad-2", country: "Macao" }, // derivable through the override table
  ]);
  assert.deepEqual(
    options.map(({ code, count }) => ({ code, count })),
    [
      { code: "JP", count: 2 },
      { code: "FR", count: 1 },
      { code: "MO", count: 1 },
      { code: "TW", count: 1 },
    ],
  );
  // Macao keeps its source label for display fallback.
  assert.equal(options.find(({ code }) => code === "MO").country, "Macao");
  assert.deepEqual(
    filterEvents([{ id: "lower", countryCode: "jp", country: "Japan" }], {
      ...INITIAL_FILTERS,
      country: "JP",
    }).map(({ id }) => id),
    ["lower"],
  );
  assert.deepEqual(
    filterEvents([{ id: "fallback", country: "Macao" }], {
      ...INITIAL_FILTERS,
      country: "MO",
    }).map(({ id }) => id),
    ["fallback"],
  );
});

test("countries sort by count first, then code", () => {
  const options = countEventsByCountry(events);
  assert.deepEqual(options.map(({ code }) => code), ["JP", "FR", "TW"]);
});

test("country filter is exposed in the filter console and active chips", () => {
  const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const consoleSource = readFileSync(new URL("../src/components/FilterConsole.jsx", import.meta.url), "utf8");
  const chipsSource = readFileSync(new URL("../src/components/ActiveFilters.jsx", import.meta.url), "utf8");
  assert.match(consoleSource, /onFilterChange\("country", event\.target\.value\)/);
  assert.match(consoleSource, /displayCountryName\(code, country, language\)/);
  assert.match(chipsSource, /country: \(value, t, language\) => displayCountryName\(value, undefined, language\)/);
  assert.match(
    appSource,
    /const updateFilter = [\s\S]*?urlSelectionIsExplicitRef\.current = false;[\s\S]*?setSelectedId\(null\);/,
  );
});

test("country filter labels are localized in both languages", () => {
  for (const language of ["zh", "en", "ja"]) {
    assert.notEqual(translate(language, "country"), "country");
    assert.notEqual(translate(language, "allCountries"), "allCountries");
  }
  assert.equal(translate("zh", "country"), "国家或地区");
  assert.equal(translate("en", "country"), "Country/Region");
  assert.equal(translate("ja", "country"), "国・地域");
});

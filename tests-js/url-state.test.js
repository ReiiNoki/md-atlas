import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INITIAL_FILTERS } from "../src/utils/archive.js";
import { parseUrlState, serializeUrlState } from "../src/utils/urlState.js";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("empty or default state serializes to a parameterless URL", () => {
  assert.equal(serializeUrlState({ view: "map", filters: INITIAL_FILTERS, event: null }), "");
  assert.equal(serializeUrlState({}), "");
});

test("parse without parameters yields defaults", () => {
  assert.deepEqual(parseUrlState(""), {
    view: "map",
    filters: { query: "", year: "all", region: "all", country: "all", status: "all" },
    event: null,
  });
});

test("non-default state round-trips through serialize and parse", () => {
  const state = {
    view: "calendar",
    filters: { query: "kyoto", year: "2019", region: "APAC", country: "JP", status: "offline" },
    event: "md-2019kyoto-c90c",
  };
  const search = serializeUrlState(state);
  assert.equal(search, "?view=calendar&q=kyoto&year=2019&region=APAC&country=JP&status=offline&event=md-2019kyoto-c90c");
  assert.deepEqual(parseUrlState(search), state);
});

test("invalid values fall back to defaults instead of breaking the link", () => {
  const parsed = parseUrlState("?view=explorer&q=&year=20x4&region=MARS&country=JPN&status=hidden&event=");
  assert.equal(parsed.view, "map");
  assert.equal(parsed.filters.year, "all");
  assert.equal(parsed.filters.region, "all");
  assert.equal(parsed.filters.country, "all");
  assert.equal(parsed.filters.status, "all");
  assert.equal(parsed.event, null);
});

test("country codes are two-letter and normalize to uppercase", () => {
  assert.equal(parseUrlState("?country=jp").filters.country, "JP");
  assert.equal(parseUrlState("?country=JP").filters.country, "JP");
  assert.equal(parseUrlState("?country=j").filters.country, "all");
  assert.equal(serializeUrlState({ filters: { ...INITIAL_FILTERS, country: "jp" } }), "");
});

test("unknown tracking parameters are ignored", () => {
  const parsed = parseUrlState("?utm_source=telegram&view=archive");
  assert.equal(parsed.view, "archive");
  assert.equal(parsed.filters.query, "");
});

test("whitespace-only search is treated as inactive and omitted", () => {
  const search = serializeUrlState({ filters: { ...INITIAL_FILTERS, query: "   " } });
  assert.equal(search, "");
  assert.equal(parseUrlState("?q=%20%20").filters.query, "  ");
});

test("4-digit years are preserved; other formats are dropped", () => {
  assert.equal(parseUrlState("?year=2024").filters.year, "2024");
  assert.equal(parseUrlState("?year=24").filters.year, "all");
  assert.equal(parseUrlState("?year=99999").filters.year, "all");
});

test("duplicate parameters resolve to the first value", () => {
  assert.equal(parseUrlState("?view=archive&view=data").view, "archive");
});

test("App restores shareable state from the URL without overriding deep links", () => {
  assert.match(appSource, /parseUrlState\(window\.location\.search\)/);
  assert.match(appSource, /serializeUrlState\(/);
  assert.match(appSource, /requestedValid/);
  assert.match(appSource, /window\.history\.pushState/);
  assert.match(appSource, /window\.history\.replaceState/);
  assert.match(appSource, /addEventListener\("popstate"/);
  // Search typing must not grow history; only the query key replaces in place.
  assert.match(appSource, /key === "query" \? "replace" : "push"/);
});

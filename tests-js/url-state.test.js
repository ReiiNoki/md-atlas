import test from "node:test";
import assert from "node:assert/strict";
import { INITIAL_FILTERS } from "../src/domain/archive.js";
import { parseUrlState, serializeUrlState } from "../src/utils/urlState.js";

import { explorerReducer, initialExplorerState, resolveExplorerSelection, resolveExplorerEvent, writeExplorerUrl } from "../src/app/explorerState.js";

test("empty or default state serializes to a parameterless URL", () => {
  assert.equal(serializeUrlState({ view: "map", filters: INITIAL_FILTERS, event: null }), "");
  assert.equal(serializeUrlState({}), "");
});

test("parse without parameters yields defaults", () => {
  assert.deepEqual(parseUrlState(""), {
    view: "map",
    filters: {
      query: "",
      year: "all",
      region: "all",
      country: "all",
      missionDayType: "all",
      status: "all",
    },
    event: null,
  });
});

test("non-default state round-trips through serialize and parse", () => {
  const state = {
    view: "calendar",
    filters: {
      query: "kyoto",
      year: "2019",
      region: "APAC",
      country: "JP",
      missionDayType: "md-xma",
      status: "offline",
    },
    event: "md-2019kyoto-c90c",
  };
  const search = serializeUrlState(state);
  assert.equal(search, "?view=calendar&q=kyoto&year=2019&region=APAC&country=JP&type=md-xma&status=offline&event=md-2019kyoto-c90c");
  assert.deepEqual(parseUrlState(search), state);
});

test("non-MD activity filters are shareable only in the archive view", () => {
  const archiveState = {
    view: "archive",
    filters: { ...INITIAL_FILTERS, missionDayType: "goruck" },
    event: null,
  };
  assert.deepEqual(parseUrlState(serializeUrlState(archiveState)), archiveState);
  assert.equal(parseUrlState("?view=map&type=goruck").filters.missionDayType, "all");
  assert.equal(parseUrlState("?view=data&type=intel_ops").filters.missionDayType, "all");
});

test("invalid values fall back to defaults instead of breaking the link", () => {
  const parsed = parseUrlState("?view=explorer&q=&year=20x4&region=MARS&country=JPN&type=other&status=hidden&event=");
  assert.equal(parsed.view, "map");
  assert.equal(parsed.filters.year, "all");
  assert.equal(parsed.filters.region, "all");
  assert.equal(parsed.filters.country, "all");
  assert.equal(parsed.filters.missionDayType, "all");
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

test("browser-state initialization and restoration keep explicit deep links", () => {
  const state = initialExplorerState("?view=archive&country=JP&event=official-id");
  assert.equal(state.event, "official-id");
  assert.equal(state.writeMode, "replace");
  const changed = explorerReducer(state, { type: "select", id: "another" });
  const restored = explorerReducer(changed, { type: "restore", search: "?view=archive&country=JP&event=official-id" });
  assert.equal(restored.event, "official-id");
  assert.equal(restored.filters.country, "JP");
  assert.equal(restored.writeMode, "replace");
});

test("selection waits for both archives in either completion order", () => {
  const state = initialExplorerState("?view=archive&event=official-id");
  const archive = { events: [{ id: "md-id" }] };
  const official = { events: [{ id: "official-id" }] };
  for (const [main, extra] of [[null, null], [archive, null], [null, official]]) {
    assert.deepEqual(resolveExplorerSelection(state, main, extra),
      { ready: false, selectedId: "official-id", invalid: false });
  }
  assert.deepEqual(resolveExplorerSelection(state, archive, official),
    { ready: true, selectedId: "official-id", invalid: false });
  const newer = explorerReducer(state, { type: "select", id: "md-id" });
  assert.equal(resolveExplorerSelection(newer, archive, official).selectedId, "md-id",
    "Data completion validates current selection, not boot-time selection");
});

test("default display never becomes a URL selection; invalid IDs normalize only when ready", () => {
  const state = initialExplorerState("?view=archive");
  const archive = { events: [{ id: "first" }] };
  const official = { events: [] };
  assert.equal(resolveExplorerSelection(state, archive, official).selectedId, null);
  assert.equal(serializeUrlState(state), "?view=archive");
  const invalid = initialExplorerState("?view=archive&event=missing");
  assert.equal(resolveExplorerSelection(invalid, archive, null).invalid, false);
  assert.equal(resolveExplorerSelection(invalid, archive, official).invalid, true);
  const normalized = explorerReducer(invalid, { type: "invalidate", expectedRevision: invalid.revision });
  assert.equal(normalized.event, null);
  assert.equal(normalized.writeMode, "replace");
  const newer = explorerReducer(invalid, { type: "select", id: "first" });
  assert.strictEqual(explorerReducer(newer, { type: "invalidate", expectedRevision: invalid.revision }), newer);
});

test("boot and interaction defaults stay derived, preserving the existing fallback scope", () => {
  const first = { id: "first", countryCode: "US" };
  const filtered = { id: "filtered", countryCode: "JP" };
  const archive = { events: [first, filtered] };
  const boot = initialExplorerState("?view=archive&country=JP");
  assert.strictEqual(resolveExplorerEvent(boot, null, archive.events, [filtered], archive), first);
  assert.equal(serializeUrlState(boot), "?view=archive&country=JP");
  const interactive = explorerReducer(boot, { type: "filter", key: "country", value: "JP" });
  assert.strictEqual(resolveExplorerEvent(interactive, null, archive.events, [filtered], archive), filtered);
  const explicit = explorerReducer(interactive, { type: "select", id: "first" });
  assert.strictEqual(resolveExplorerEvent(explicit, explicit.event, archive.events, [filtered], archive), first);
});

test("view changes clear archive-only state but preserve other filters and main selections", () => {
  const official = [{ id: "official-id" }];
  for (const search of ["?view=archive&type=goruck&country=JP&event=md-id", "?view=archive&country=JP&event=official-id"]) {
    const next = explorerReducer(initialExplorerState(search), { type: "view", view: "map", officialEvents: official });
    assert.equal(next.event, null);
    assert.equal(next.filters.missionDayType, "all");
    assert.equal(next.filters.country, "JP");
    assert.equal(next.writeMode, "push");
  }
  const main = explorerReducer(initialExplorerState("?view=archive&event=md-id"),
    { type: "view", view: "calendar", officialEvents: official });
  assert.equal(main.event, "md-id");
});

test("search replaces history, discrete actions push, duplicate writes are suppressed", () => {
  const writes = [];
  const location = { pathname: "/md-atlas/", search: "", hash: "#keep" };
  const browser = { location, history: Object.fromEntries(["pushState", "replaceState"].map((method) => [method,
    (_state, _unused, url) => { writes.push({ method, url }); location.search = new URL(url, "http://localhost").search; }])) };
  const initial = initialExplorerState("");
  assert.equal(writeExplorerUrl(initial, browser), false);
  const query = explorerReducer(initial, { type: "filter", key: "query", value: "Kyoto" });
  writeExplorerUrl(query, browser);
  assert.equal(writeExplorerUrl(query, browser), false);
  const discrete = explorerReducer(query, { type: "filter", key: "year", value: "2019" });
  writeExplorerUrl(discrete, browser);
  const selected = explorerReducer(discrete, { type: "select", id: "md-id", view: "archive" });
  writeExplorerUrl(selected, browser);
  const reset = explorerReducer(selected, { type: "reset" });
  writeExplorerUrl(reset, browser);
  assert.deepEqual(writes.map(({ method }) => method), ["replaceState", "pushState", "pushState", "pushState"]);
  assert.equal(writes[0].url, "/md-atlas/?q=Kyoto#keep");
  assert.equal(writes[2].url, "/md-atlas/?view=archive&q=Kyoto&year=2019&event=md-id#keep");
  assert.equal(writes[3].url, "/md-atlas/?view=archive#keep");
});

import test from "node:test";
import assert from "node:assert/strict";
import { BASE_PATH } from "../site.config.js";
import { INITIAL_FILTERS } from "../src/domain/archive.js";
import { parseUrlState, serializeUrlState } from "../src/utils/urlState.js";
import { explorerReducer, initialExplorerState, resolveExplorerSelection, resolveExplorerEvent, writeExplorerUrl } from "../src/app/explorerState.js";

const location = (path = "", search = "") => ({ pathname: BASE_PATH + path, search });
const parse = (path = "", search = "") => parseUrlState(location(path, search));
const initial = (path = "", search = "") => initialExplorerState(location(path, search));

for (const view of ["map", "archive", "calendar", "data"]) {
  test(`${view} pathname round-trips with default filters`, () => {
    const state = { view, filters: INITIAL_FILTERS, event: null };
    const url = location(view === "map" ? "" : view);
    assert.deepEqual(serializeUrlState(state), url);
    assert.deepEqual(parseUrlState(url), state);
  });
}

test("default state generates the mounted root", () => {
  assert.deepEqual(serializeUrlState(), location());
  assert.deepEqual(parseUrlState(), parse());
});

for (const id of ["md-2026-asahikawa-ee08", "md-2026-paris-79e4", "md-2026-佛山-1394", "id/with?reserved#characters"]) {
  test(`resource route encodes and decodes existing ID: ${id}`, () => {
    const state = { view: "archive", filters: INITIAL_FILTERS, event: id };
    const url = serializeUrlState(state);
    assert.equal(url.pathname, `${BASE_PATH}md/${encodeURIComponent(id)}`);
    assert.deepEqual(parseUrlState(url), state);
    assert.equal(parse("md/" + id).event, id.includes("/") ? null : id);
    assert.deepEqual(serializeUrlState({ ...state, view: "map" }), url);
  });
}

test("pathname and all filters round-trip independently", () => {
  const filters = { query: "kyoto", year: "2019", region: "APAC", country: "JP", missionDayType: "md-xma", status: "offline" };
  for (const state of [
    { view: "calendar", filters, event: null },
    { view: "archive", filters, event: "md-2019kyoto-c90c" },
  ]) {
    const url = serializeUrlState(state);
    assert.equal(url.search, "?q=kyoto&year=2019&region=APAC&country=JP&type=md-xma&status=offline");
    assert.deepEqual(parseUrlState(url), state);
  }
  assert.deepEqual(parse("archive", "?year=2026&country=JP").filters,
    { ...INITIAL_FILTERS, year: "2026", country: "JP" });
});

test("non-MD activity filters remain archive-only, including resource routes", () => {
  for (const path of ["archive", "md/official-id"]) {
    assert.equal(parse(path, "?type=goruck").filters.missionDayType, "goruck");
  }
  assert.equal(parse("", "?type=goruck").filters.missionDayType, "all");
  assert.equal(parse("data", "?type=intel_ops").filters.missionDayType, "all");
});

test("invalid root routes and encodings default safely without interpreting old prefixes", () => {
  for (const pathname of ["/md-atlas/archive", "/md-atlas-other/archive", "/archive/extra", "/md/", "/md/a/b", "/md/%", "/md/%FF", "/nope"]) {
    const state = parseUrlState({ pathname, search: "?country=JP" });
    assert.equal(state.view, "map", pathname);
    assert.equal(state.event, null, pathname);
    assert.deepEqual(serializeUrlState(state), location("", "?country=JP"));
  }
});

test("root and trailing slashes serialize canonically", () => {
  assert.deepEqual(serializeUrlState(parseUrlState({ pathname: "/" })), location());
  assert.deepEqual(serializeUrlState(parse("archive/")), location("archive"));
  assert.deepEqual(serializeUrlState(parse("md/foo/")), location("md/foo"));
});

test("legacy navigation parameters and unknown tracking parameters are ignored", () => {
  assert.deepEqual(parse("", "?view=archive&event=foo&utm_source=telegram"), parse());
  assert.equal(parse("calendar", "?view=data&event=foo").view, "calendar");
});

test("invalid filter values fall back to defaults", () => {
  assert.deepEqual(parse("", "?year=20x4&region=MARS&country=JPN&type=other&status=hidden").filters, INITIAL_FILTERS);
});

test("country shape, whitespace search, years and duplicate filter semantics are unchanged", () => {
  assert.equal(parse("", "?country=jp").filters.country, "JP");
  assert.equal(parse("", "?country=j").filters.country, "all");
  assert.deepEqual(serializeUrlState({ filters: { ...INITIAL_FILTERS, country: "jp", query: "   " } }), location());
  assert.equal(parse("", "?q=%20%20").filters.query, "  ");
  assert.equal(parse("", "?year=2024&year=2019").filters.year, "2024");
  assert.equal(parse("", "?year=24").filters.year, "all");
  assert.equal(parse("", "?year=99999").filters.year, "all");
});

test("initialization and restoration keep explicit deep links", () => {
  const state = initial("md/official-id", "?country=JP");
  assert.equal(state.event, "official-id");
  assert.equal(state.writeMode, "replace");
  const changed = explorerReducer(state, { type: "select", id: "another" });
  const restored = explorerReducer(changed, { type: "restore", location: location("md/official-id", "?country=JP") });
  assert.equal(restored.event, "official-id");
  assert.equal(restored.filters.country, "JP");
  assert.equal(restored.writeMode, "replace");
  assert.ok(restored.routeVersion > state.routeVersion);
});

test("selection waits for both archives in either completion order", () => {
  const state = initial("md/official-id");
  const archive = { events: [{ id: "md-id" }] };
  const official = { events: [{ id: "official-id" }] };
  for (const [main, extra] of [[null, null], [archive, null], [null, official]]) {
    assert.deepEqual(resolveExplorerSelection(state, main, extra),
      { ready: false, selectedId: "official-id", invalid: false });
  }
  assert.deepEqual(resolveExplorerSelection(state, archive, official),
    { ready: true, selectedId: "official-id", invalid: false });
  const newer = explorerReducer(state, { type: "select", id: "md-id" });
  assert.equal(resolveExplorerSelection(newer, archive, official).selectedId, "md-id");
});

test("fallback never becomes a URL selection; nonexistent IDs replace only when ready", () => {
  const state = initial("archive");
  const archive = { events: [{ id: "first" }] };
  const official = { events: [] };
  assert.equal(resolveExplorerSelection(state, archive, official).selectedId, null);
  assert.deepEqual(serializeUrlState(state), location("archive"));
  const invalid = initial("md/missing");
  assert.equal(resolveExplorerSelection(invalid, archive, null).invalid, false);
  assert.equal(resolveExplorerSelection(invalid, archive, official).invalid, true);
  const normalized = explorerReducer(invalid, { type: "invalidate", expectedRevision: invalid.revision });
  assert.equal(normalized.event, null);
  assert.equal(normalized.writeMode, "replace");
  assert.deepEqual(serializeUrlState(normalized), location("archive"));
  const newer = explorerReducer(invalid, { type: "select", id: "first" });
  assert.strictEqual(explorerReducer(newer, { type: "invalidate", expectedRevision: invalid.revision }), newer);
});

test("boot and interaction fallbacks preserve scope without writing an implicit selection", () => {
  const first = { id: "first", countryCode: "US" };
  const filtered = { id: "filtered", countryCode: "JP" };
  const archive = { events: [first, filtered] };
  const boot = initial("archive", "?country=JP");
  assert.strictEqual(resolveExplorerEvent(boot, null, archive.events, [filtered], archive), first);
  assert.deepEqual(serializeUrlState(boot), location("archive", "?country=JP"));
  const interactive = explorerReducer(boot, { type: "filter", key: "country", value: "JP" });
  assert.strictEqual(resolveExplorerEvent(interactive, null, archive.events, [filtered], archive), filtered);
  const explicit = explorerReducer(interactive, { type: "select", id: "first" });
  assert.strictEqual(resolveExplorerEvent(explicit, explicit.event, archive.events, [filtered], archive), first);
});

test("map defaults to the nearest upcoming visible point without making it a URL selection", () => {
  const later = { id: "later", date: "2026-12-06", lat: 23, lng: 113 };
  const next = { id: "next", date: "2026-11-07", lat: 22, lng: 113 };
  const past = { id: "past", date: "2026-09-19", lat: 35, lng: 139 };
  const invalidPoints = [
    { id: "no-point", date: "2026-10-09" },
    { id: "nan", date: "2026-10-09", lat: NaN, lng: 113 },
    { id: "infinity", date: "2026-10-09", lat: 22, lng: Infinity },
    { id: "out-of-range", date: "2026-10-09", lat: 91, lng: 113 },
    { id: "bad-longitude", date: "2026-10-09", lat: 22, lng: 181 },
  ];
  const archive = { events: [later, past, ...invalidPoints, next] };
  const boot = initial();
  const resolve = (state, filtered, today = "2026-10-08") =>
    resolveExplorerEvent(state, state.event, archive.events, filtered, archive, today);
  assert.strictEqual(resolve(boot, archive.events), next);
  assert.strictEqual(resolve(boot, archive.events, "2026-11-07"), next);
  assert.deepEqual(serializeUrlState(boot), location());
  const filteredState = explorerReducer(boot, { type: "filter", key: "country", value: "JP" });
  assert.strictEqual(resolve(filteredState, [later]), later, "honors filters instead of selecting a hidden upcoming point");
  assert.strictEqual(resolve(filteredState, [past]), past, "no upcoming event keeps the first result fallback");
  assert.equal(resolve(filteredState, []), undefined, "no results means no highlighted point");
  const explicit = explorerReducer(boot, { type: "select", id: past.id });
  assert.strictEqual(resolve(explicit, [next]), past, "explicit selection wins, even outside filters");
  const invalid = explorerReducer(boot, { type: "select", id: "missing" });
  assert.equal(resolve(invalid, archive.events), undefined, "pending/invalid routes do not display a fallback");
  const reentered = explorerReducer(initial("calendar"), { type: "view", view: "map" });
  assert.strictEqual(resolve(reentered, archive.events), next, "returning to map uses the same default");
});

test("view changes leave resource paths and clear only archive-specific filters", () => {
  const official = [{ id: "official-id" }];
  for (const [id, type] of [["md-id", "goruck"], ["official-id", "all"]]) {
    const next = explorerReducer(initial(`md/${id}`, `?type=${type}&country=JP`), { type: "view", view: "map", officialEvents: official });
    assert.equal(next.event, null);
    assert.equal(next.filters.missionDayType, "all");
    assert.equal(next.filters.country, "JP");
    assert.equal(next.writeMode, "push");
  }
  const main = explorerReducer(initial("md/md-id"), { type: "view", view: "calendar", officialEvents: official });
  assert.equal(main.event, null);
  assert.deepEqual(serializeUrlState(main), location("calendar"));
});

function fakeBrowser() {
  const current = { ...location(), hash: "#keep" };
  const writes = [];
  const browser = { location: current, history: Object.fromEntries(["pushState", "replaceState"].map((method) => [method,
    (state, _unused, url) => {
      writes.push({ method, url, state });
      const parsed = new URL(url, "http://localhost");
      current.pathname = parsed.pathname;
      current.search = parsed.search;
    }])) };
  return { browser, writes };
}

test("search replaces, discrete actions push, selection changes pathname, duplicate writes are suppressed", () => {
  const { browser, writes } = fakeBrowser();
  const boot = initial();
  assert.equal(writeExplorerUrl(boot, browser), false);
  const query = explorerReducer(boot, { type: "filter", key: "query", value: "Kyoto" });
  writeExplorerUrl(query, browser);
  assert.equal(writeExplorerUrl(query, browser), false);
  const discrete = explorerReducer(query, { type: "filter", key: "year", value: "2019" });
  writeExplorerUrl(discrete, browser);
  const selected = explorerReducer(discrete, { type: "select", id: "md-id", view: "archive" });
  writeExplorerUrl(selected, browser);
  const reset = explorerReducer(selected, { type: "reset" });
  writeExplorerUrl(reset, browser);
  assert.deepEqual(writes.map(({ method }) => method), ["replaceState", "pushState", "pushState", "pushState"]);
  assert.equal(writes[0].url, "/?q=Kyoto#keep");
  assert.equal(writes[2].url, "/md/md-id?q=Kyoto&year=2019#keep");
  assert.equal(writes[3].url, "/archive#keep");
});

test("Back/Forward restore A/B selection and originating screen; refresh resolves the same resource", () => {
  const { browser, writes } = fakeBrowser();
  const root = initial();
  const a = explorerReducer(root, { type: "select", id: "A" });
  writeExplorerUrl(a, browser);
  const b = explorerReducer(a, { type: "select", id: "B" });
  writeExplorerUrl(b, browser);
  const restore = (state, index) => {
    const url = new URL(writes[index].url, "http://localhost");
    Object.assign(browser.location, { pathname: url.pathname, search: url.search });
    return explorerReducer(state, { type: "restore", location: browser.location, historyState: writes[index].state });
  };
  const back = restore(b, 0);
  assert.equal(back.event, "A");
  assert.equal(back.view, "map");
  assert.equal(writeExplorerUrl(back, browser), false);
  const forward = restore(back, 1);
  assert.equal(forward.event, "B");
  assert.equal(forward.view, "map");
  const refresh = initialExplorerState(browser.location);
  assert.equal(refresh.event, "B");
  assert.equal(refresh.view, "archive");
  const home = explorerReducer(forward, { type: "restore", location: location() });
  assert.equal(home.event, null);
  assert.equal(home.view, "map");
});

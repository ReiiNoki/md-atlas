import test from "node:test";
import assert from "node:assert/strict";
import { INITIAL_FILTERS, filterEvents } from "../src/domain/archive.js";
import { activeFilterEntries } from "../src/domain/filters.js";
import { EVENT_TAG_IDS, eventTagLabel } from "../src/domain/eventTags.js";
import { translate } from "../src/i18n/messages.js";
import { loadJsxModules } from "./helpers/load-jsx.mjs";

const [renderer, consoleView, chipsView] = await loadJsxModules(
  "/tests-js/helpers/render-jsx.jsx", "/src/components/FilterConsole.jsx", "/src/components/ActiveFilters.jsx",
);
const events = [
  { id: "standard", title: "New Taipei", year: 2015, region: "APAC", countryCode: "TW", missionDayType: "md-standard", tags: ["mosaic-md"], status: "online" },
  { id: "xma", title: "Milan", year: 2015, region: "EMEA", countryCode: "IT", missionDayType: "md-xma", tags: ["mosaic-md"], status: "offline" },
  { id: "untagged", title: "Unreviewed", year: 2015, region: "EMEA", countryCode: "IT", missionDayType: "md-xma", status: "online" },
  { id: "malformed", title: "Bad tags", missionDayType: "md-standard", tags: "mosaic-md" },
  { id: "unknown-tag", title: "Other tag", missionDayType: "md-standard", tags: ["unknown"] },
];
const ids = (filters) => filterEvents(events, { ...INITIAL_FILTERS, ...filters }).map((e) => e.id);

test("a tag filter selects reviewed labels and treats missing labels as unknown, not negative", () => {
  assert.deepEqual(ids({}), events.map((e) => e.id));
  assert.deepEqual(ids({ eventTag: undefined }), events.map((e) => e.id), "older filter objects remain compatible");
  assert.deepEqual(ids({ eventTag: "mosaic-md" }), ["standard", "xma"]);
  assert.deepEqual(ids({ eventTag: "unsupported" }), []);
  assert.deepEqual(activeFilterEntries(INITIAL_FILTERS), []);
  assert.deepEqual(activeFilterEntries({ ...INITIAL_FILTERS, eventTag: "mosaic-md" }), [["eventTag", "mosaic-md"]]);
});

test("tag, primary MD type, location, time, status and text filters intersect", () => {
  const tagged = { eventTag: "mosaic-md" };
  assert.deepEqual(ids({ ...tagged, missionDayType: "md-xma" }), ["xma"]);
  assert.deepEqual(ids({ ...tagged, missionDayType: "md-standard" }), ["standard"]);
  assert.deepEqual(ids({ ...tagged, country: "TW", region: "APAC", year: "2015", status: "online" }), ["standard"]);
  assert.deepEqual(ids({ ...tagged, country: "IT", region: "EMEA", year: "2015", status: "offline", query: "Milan" }), ["xma"]);
  assert.deepEqual(ids({ ...tagged, year: "2016" }), []);
  assert.deepEqual(ids({ ...tagged, missionDayType: "goruck" }), []);
  assert.equal(events[2].tags, undefined, "filtering must never manufacture or mutate tags");
});

test("the console exposes a separate labeled selector without supplementary hint text", () => {
  const filters = { ...INITIAL_FILTERS, eventTag: "mosaic-md", missionDayType: "md-xma" };
  const html = renderer.renderLocalized(consoleView.FilterConsole, { filters, years: [2015], includeOfficialTypes: true });
  assert.match(html, /活动标签/);
  const selector = html.match(/<select name="eventTag"[\s\S]*?<\/select>/)?.[0];
  assert.ok(selector);
  assert.doesNotMatch(selector, /aria-describedby=/, "no dangling description reference after removing the hint");
  assert.match(selector, /option value="all"[^>]*>全部标签/);
  assert.match(selector, /option value="mosaic-md" selected=""[^>]*>拼图 MD/);
  assert.equal((html.match(/value="mosaic-md"/g) ?? []).length, 1, "the label must not also appear as a mutually exclusive type");
  assert.doesNotMatch(html, /event-tag-filter-hint|filter-console__hint|未标注不代表不是拼图 MD/);
  assert.deepEqual(EVENT_TAG_IDS, ["mosaic-md"]);
});

test("tag chips are localized, independently clearable and omitted after reset", () => {
  const filters = { ...INITIAL_FILTERS, eventTag: "mosaic-md", missionDayType: "md-xma" };
  const html = renderer.renderLocalized(chipsView.ActiveFilters, { filters, resultCount: 1 });
  assert.equal((html.match(/class="filter-chip"/g) ?? []).length, 2);
  assert.match(html, /title="拼图 MD"/);
  assert.match(html, /title="Anomaly MD"/);
  assert.ok(html.includes(translate("zh", "clearFilter", { label: "拼图 MD" })));
  assert.equal(renderer.renderLocalized(chipsView.ActiveFilters, { filters: INITIAL_FILTERS, resultCount: 5 }), "");
  for (const language of ["zh", "en", "ja"]) {
    for (const key of ["allEventTags", "eventTags"]) assert.notEqual(translate(language, key), key);
    assert.equal(eventTagLabel("mosaic-md", (key) => translate(language, key)), translate(language, "eventTagMosaicMd"));
  }
  assert.equal(eventTagLabel("toString", (key) => key), "unknown");
});

import test from "node:test";
import assert from "node:assert/strict";
import { INITIAL_FILTERS, filterEvents, matchesQuery } from "../src/domain/archive.js";
import { eventActivityType, ACTIVITY_TYPES } from "../src/domain/activityTypes.js";
import { knownEventTags } from "../src/domain/eventTags.js";
import { translate } from "../src/i18n/messages.js";
import { loadJsxModules } from "./helpers/load-jsx.mjs";

const [renderer, badges, table, detail] = await loadJsxModules(
  "/tests-js/helpers/render-jsx.jsx", "/src/components/EventTagBadges.jsx",
  "/src/features/archive/EventTable.jsx", "/src/components/EventDetail.jsx",
);
const event = Object.freeze({ id: "新北耶誕城-9203", title: "新北耶誕城", city: "新北市", country: "Taiwan", countryCode: "TW", region: "APAC", date: "2015-12-05", status: "online", missionDayType: "md-standard", missionCount: 18, tags: ["mosaic-md"] });

test("mosaic labels are independent of all three primary MD types", () => {
  assert.equal(ACTIVITY_TYPES.includes("mosaic-md"), false);
  for (const type of ["md-standard", "md-xma", "md-lite"]) {
    const tagged = { ...event, missionDayType: type };
    assert.equal(eventActivityType(tagged), type);
    assert.deepEqual(filterEvents([tagged], { ...INITIAL_FILTERS, missionDayType: type }), [tagged]);
    assert.deepEqual(knownEventTags(tagged), ["mosaic-md"]);
  }
});

test("tags are searchable without the deferred mission search index", () => {
  for (const query of ["拼图", "拼图MD", "拼圖 MD", "MOSAIC MD", "mosaic-md", "メダルアートMD"]) {
    assert.equal(matchesQuery(event, query), true, query);
    assert.equal(matchesQuery({ ...event, tags: undefined }, query), false, query);
  }
  assert.deepEqual(knownEventTags({ tags: ["mosaic-md", "unknown", "mosaic-md", "toString"] }), ["mosaic-md"]);
  assert.deepEqual(knownEventTags({ tags: "mosaic-md" }), []);
});

test("tag labels and explanations are localized and untagged events render no badge", () => {
  for (const language of ["zh", "en", "ja"]) {
    for (const key of ["eventTags", "eventTagMosaicMd", "eventTagMosaicMdDescription"]) assert.notEqual(translate(language, key), key);
  }
  assert.match(renderer.renderLocalized(badges.EventTagBadges, { event }), /拼图 MD/);
  assert.equal(renderer.renderLocalized(badges.EventTagBadges, { event: {} }), "");
});

test("archive and detail show the additional tag without replacing Standard MD or adding a column", () => {
  const html = renderer.renderLocalized(table.EventTable, { events: [event], page: 1 });
  assert.match(html, /Standard MD/);
  assert.match(html, /event-tag--mosaic-md/);
  assert.match(html, /拼图 MD/);
  assert.doesNotMatch(html, /event-row__completions/);
  const header = html.split('<div class="event-table__body">')[0];
  assert.equal((header.match(/<span\b/g) ?? []).length, 8);
  const panel = renderer.renderLocalized(detail.EventDetail, { event, open: true, onClose() {} });
  assert.match(panel, /Standard MD/);
  assert.match(panel, /aria-label="活动标签"/);
  assert.doesNotMatch(panel, /<dt>活动标签<\/dt>/, "the tag no longer needs a separate facts row");
  assert.match(panel, /拼图 MD/);
  const untagged = renderer.renderLocalized(detail.EventDetail, { event: { ...event, tags: undefined }, open: true, onClose() {} });
  assert.doesNotMatch(untagged, /event-tag--mosaic-md|活动标签/);
});

test("supplementary tags follow the primary badge inside one shared wrapping group", () => {
  for (const type of ["md-standard", "md-xma", "md-lite"]) {
    const tagged = { ...event, missionDayType: type };
    const html = renderer.renderLocalized(table.EventTable, { events: [tagged], page: 1 });
    const rowGroup = html.match(/<span class="activity-badges">([\s\S]*?)<\/small>/)?.[1];
    assert.ok(rowGroup);
    assert.ok(rowGroup.indexOf(`activity-type--${type}`) < rowGroup.indexOf("event-tag--mosaic-md"));
    const panel = renderer.renderLocalized(detail.EventDetail, { event: tagged, open: true, onClose() {} });
    const detailGroup = panel.match(/<dd class="activity-badges">([\s\S]*?)<\/dd>/)?.[1];
    assert.ok(detailGroup);
    assert.ok(detailGroup.indexOf(`activity-type--${type}`) < detailGroup.indexOf("event-tag--mosaic-md"));
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { activityFeedSections } from "../src/domain/activityFeed.js";

const md = (id, date, extra = {}) => ({ id, date, missionDayType: "md-standard", ...extra });

test("feed pins one nearest upcoming MD and lists the latest two completed MDs", () => {
  const events = Object.freeze([
    md("later", "2026-12-06"),
    md("next", "2026-11-07"),
    md("same-day-next", "2026-11-07"),
    md("old", "2024-01-01"),
    md("past-1", "2026-09-20"),
    md("past-2", "2026-09-20", { missionDayType: "md-xma" }),
    md("past-3", "2026-09-05", { missionDayType: "md-lite" }),
    md("past-4", "2026-08-23"),
    md("no-date", null),
    md("ongoing", "2026-10-07", { endDate: "2026-10-09" }),
    md("ends-today", "2026-10-07", { endDate: "2026-10-08" }),
    md("official", "2026-10-07", { activityType: "goruck" }),
    md("anomaly", "2026-10-09", { activityType: "xm-anomaly" }),
  ]);
  const { upcoming, recent } = activityFeedSections(events, "2026-10-08");
  assert.strictEqual(upcoming, events[1]);
  assert.deepEqual(recent.map(({ id }) => id), ["past-1", "past-2"]);
  assert.equal(events[0].id, "later", "input order is not mutated");
});

test("feed treats today as upcoming, respects filtered input and handles missing sections", () => {
  const today = md("today", "2026-10-08");
  const yesterday = md("yesterday", "2026-10-07");
  assert.deepEqual(activityFeedSections([today, yesterday], "2026-10-08"), { upcoming: today, recent: [yesterday] });
  assert.deepEqual(activityFeedSections([yesterday], "2026-10-08"), { upcoming: undefined, recent: [yesterday] });
  assert.deepEqual(activityFeedSections([today], "2026-10-08"), { upcoming: today, recent: [] });
  assert.deepEqual(activityFeedSections([], "2026-10-08"), { upcoming: undefined, recent: [] });
  assert.equal(activityFeedSections([md("future", "2999-01-01")]).upcoming.id, "future");
});

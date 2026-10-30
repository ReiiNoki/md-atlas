import test from "node:test";
import assert from "node:assert/strict";
import { formatAverageMissionDistance as distance, formatAverageMissionTime as time } from "../src/utils/missionAverages.js";
import { loadJsxModules } from "./helpers/load-jsx.mjs";

const [renderer, table] = await loadJsxModules("/tests-js/helpers/render-jsx.jsx", "/src/features/archive/EventTable.jsx");
const render = (fields) => renderer.renderLocalized(table.EventTable, { events: [{ id: "sample", city: "Tokyo", country: "Japan", countryCode: "JP", date: "2026-01-01", status: "online", missionCount: 18, ...fields }], visibleCount: 60, onSelect() {} });

test("archive list actually displays average distance/time and valid sample information", () => {
  const markup = render({ averageMissionDistanceMeters: 850, averageMissionTimeMilliseconds: 5100000, missionDistanceSampleCount: 17, missionTimeSampleCount: 16 });
  assert.match(markup, /平均任务距离/);
  assert.match(markup, /平均任务时间/);
  assert.match(markup, /0\.85 公里/);
  assert.match(markup, /1 小时 25 分钟/);
  assert.match(markup, /基于 17 条有效任务数据/);
  assert.match(markup, /基于 16 条有效任务数据/);
  assert.match(markup, /event-table__average-distance-heading/);
  assert.match(markup, /event-table__average-time-heading/);
  assert.match(markup, /class="event-row__average event-row__average-distance"/);
  assert.match(markup, /class="event-row__average event-row__average-time"/);
  assert.doesNotMatch(markup, /event-row__averages/);
});
test("scheduled events without details display unknown averages, not zero", () => {
  const markup = render({ status: "scheduled", averageMissionDistanceMeters: null, averageMissionTimeMilliseconds: null, missionDistanceSampleCount: 0, missionTimeSampleCount: 0 });
  assert.match(markup, /event-row__average-distance[^]*?<b>—<\/b>/);
  assert.match(markup, /event-row__average-time[^]*?<b>—<\/b>/);
  assert.doesNotMatch(markup, /0 公里|0 分钟/);
});
test("display formats kilometres and rounded hours/minutes without false zero values", () => {
  assert.equal(distance(850), "0.85 公里");
  assert.equal(distance(1234.56), "1.23 公里");
  assert.equal(distance(1), "不足 0.01 公里");
  assert.equal(distance(0), "0 公里");
  assert.equal(time(5100000), "1 小时 25 分钟");
  assert.equal(time(1080000), "18 分钟");
  assert.equal(time(3599000), "1 小时");
  assert.equal(time(1000), "不足 1 分钟");
  assert.equal(time(0), "0 分钟");
  for (const value of [null, undefined, NaN, Infinity, -1, "850", false]) { assert.equal(distance(value), "—"); assert.equal(time(value), "—"); }
});
test("existing languages use localized average units", () => {
  assert.equal(distance(850, "en"), "0.85 km");
  assert.equal(time(5100000, "en"), "1 h 25 min");
  assert.equal(distance(850, "ja"), "0.85 km");
  assert.equal(time(5100000, "ja"), "1 時間 25 分");
});

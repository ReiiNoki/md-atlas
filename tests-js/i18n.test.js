import test from "node:test";
import assert from "node:assert/strict";
import { formatLocalizedNumber, localeForLanguage } from "../src/i18n/formatters.js";
import { messages, translate } from "../src/i18n/messages.js";

test("all message catalogs expose the same keys", () => {
  for (const language of ["en", "ja"]) {
    assert.deepEqual(Object.keys(messages.zh).sort(), Object.keys(messages[language]).sort());
  }
});

test("translations preserve all interpolation placeholders", () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const language of ["en", "ja"]) {
    for (const key of Object.keys(messages.zh)) {
      assert.deepEqual(placeholders(messages[language][key]), placeholders(messages.zh[key]), `${language}.${key}`);
    }
  }
});

test("Japanese calendar wording works with counts and non-current months", () => {
  assert.equal(`3 ${translate("ja", "noConfirmedDate")}`, "3 件のイベントは開催日が未確認です。");
  assert.equal(translate("ja", "noActivityThisMonth"), "この月に表示できるイベントはありません");
});

test("translations interpolate named values and fall back safely", () => {
  assert.equal(
    translate("en", "calendarDayTitle", { count: 2, locations: "Paris" }),
    "2 events: Paris",
  );
  assert.equal(
    translate("zh", "missionImageAlt", { city: "佛山" }),
    "佛山 Mission Day 任务图像",
  );
  assert.equal(
    translate("ja", "calendarDayTitle", { count: 2, locations: "東京" }),
    "2 件：東京",
  );
  assert.equal(translate("en", "missingMessage"), "missingMessage");
});

test("Japanese messages preserve UI meaning and count suffixes", () => {
  assert.equal(translate("ja", "scheduled"), "開催発表済み");
  assert.equal(translate("ja", "activityRanking"), "完了回数ランキング");
  assert.equal(translate("ja", "missionsPerEvent"), "ミッション数別のイベント件数");
  assert.equal(`24 / 24 ${translate("ja", "publisherIdentified")}`, "24 / 24 件のミッションで公開者を確認済み");
  assert.equal(`2 ${translate("ja", "missionDayEvents")}`, "2 件の Mission Day");
  assert.equal(translate("ja", "clearFilter", { label: "2026" }), "絞り込みを解除：2026");
});

test("locale helpers normalize supported and unsupported languages", () => {
  assert.equal(localeForLanguage("en"), "en-US");
  assert.equal(localeForLanguage("zh"), "zh-CN");
  assert.equal(localeForLanguage("ja"), "ja-JP");
  assert.equal(localeForLanguage("unknown"), "zh-CN");
  assert.equal(formatLocalizedNumber(12345, "en"), "12,345");
  assert.equal(formatLocalizedNumber(12345, "ja"), "12,345");
});

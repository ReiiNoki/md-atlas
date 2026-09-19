import test from "node:test";
import assert from "node:assert/strict";
import { formatLocalizedNumber, localeForLanguage } from "../src/i18n/formatters.js";
import { messages, translate } from "../src/i18n/messages.js";

test("all message catalogs expose the same keys", () => {
  for (const language of ["en", "ja"]) {
    assert.deepEqual(Object.keys(messages.zh).sort(), Object.keys(messages[language]).sort());
  }
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

test("locale helpers normalize supported and unsupported languages", () => {
  assert.equal(localeForLanguage("en"), "en-US");
  assert.equal(localeForLanguage("zh"), "zh-CN");
  assert.equal(localeForLanguage("ja"), "ja-JP");
  assert.equal(localeForLanguage("unknown"), "zh-CN");
  assert.equal(formatLocalizedNumber(12345, "en"), "12,345");
  assert.equal(formatLocalizedNumber(12345, "ja"), "12,345");
});

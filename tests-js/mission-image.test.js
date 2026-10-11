import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BASE_PATH } from "../site.config.js";
import { translate } from "../src/i18n/messages.js";
import { loadJsxModules } from "./helpers/load-jsx.mjs";

const [renderer, imageView] = await loadJsxModules(
  "/tests-js/helpers/render-jsx.jsx", "/src/components/MissionImage.jsx",
);
const event = { city: "Zhuhai", countryCode: "CN" };

test("missing event pictures use the compass photo with an honest localized alt label", () => {
  for (const picture of [undefined, null, ""]) {
    const html = renderer.renderLocalized(imageView.MissionImage, {
      event: { ...event, picture }, className: "event-row__image",
    });
    assert.match(html, /mission-image--placeholder event-row__image/);
    assert.ok(html.includes(`src="${BASE_PATH}event-placeholder-thumbnail.webp"`));
    assert.ok(html.includes(translate("zh", "eventImagePlaceholder", { city: "珠海市" })));
    assert.match(html, /loading="lazy"/);
    assert.match(html, /width="480" height="320"/);
    assert.doesNotMatch(html, /<small>|mission-image--fallback|mission-image__loading/);
  }
  const eager = renderer.renderLocalized(imageView.MissionImage, { event, eager: true });
  assert.match(eager, /loading="eager"/);
  assert.doesNotMatch(eager, /fetchPriority="high"/i, "placeholders do not compete with real banners for high priority");
  for (const language of ["zh", "en", "ja"]) {
    assert.notEqual(translate(language, "eventImagePlaceholder", { city: "Zhuhai" }), "eventImagePlaceholder");
  }
});

test("details use the wide crop while thumbnail is the safe default variant", () => {
  const detail = renderer.renderLocalized(imageView.MissionImage, { event, placeholderVariant: "detail" });
  assert.ok(detail.includes(`src="${BASE_PATH}event-placeholder-detail.webp"`));
  assert.match(detail, /width="660" height="400"/);
  assert.doesNotMatch(detail, /event-placeholder-thumbnail/);
  const fallback = renderer.renderLocalized(imageView.MissionImage, { event, placeholderVariant: "invalid" });
  assert.ok(fallback.includes(`src="${BASE_PATH}event-placeholder-thumbnail.webp"`));
});

test("real event pictures keep their original source, loading behavior and image label", () => {
  const picture = "https://example.com/banner.png";
  const html = renderer.renderLocalized(imageView.MissionImage, { event: { ...event, picture }, eager: true, retryable: true, placeholderVariant: "detail" });
  assert.ok(html.includes(`src="${picture}"`));
  assert.ok(html.includes(translate("zh", "missionImageAlt", { city: "珠海市" })));
  assert.match(html, /is-loading/);
  assert.match(html, /loading="eager"/);
  assert.match(html, /fetchPriority="high"/i);
  assert.match(html, /referrerPolicy="no-referrer"/i);
  assert.doesNotMatch(html, /event-placeholder-(?:thumbnail|detail)\.webp|mission-image--placeholder/);
  assert.match(html, /width="320" height="240"/);
});

test("approved photo crops use 3:2 thumbnails and 1.65:1 details without secondary cropping", () => {
  for (const [variant, width, height] of [["thumbnail", 480, 320], ["detail", 660, 400]]) {
    const image = readFileSync(new URL(`../public/event-placeholder-${variant}.webp`, import.meta.url));
    assert.equal(image.toString("ascii", 0, 4), "RIFF");
    assert.equal(image.toString("ascii", 8, 12), "WEBP");
    assert.equal(image.toString("ascii", 12, 16), "VP8 ", "photo WebP encoding");
    assert.deepEqual([...image.subarray(23, 26)], [0x9d, 0x01, 0x2a], "VP8 key-frame signature");
    assert.equal(image.readUInt16LE(26) & 0x3fff, width);
    assert.equal(image.readUInt16LE(28) & 0x3fff, height);
    assert.ok(image.length < 65536, "each crop stays below 64 KiB");
  }
  const styles = readFileSync(new URL("../src/styles/base.css", import.meta.url), "utf8");
  const archive = readFileSync(new URL("../src/styles/views/archive.css", import.meta.url), "utf8");
  const calendar = readFileSync(new URL("../src/styles/views/calendar.css", import.meta.url), "utf8");
  assert.match(styles, /\.mission-image--placeholder img \{ object-fit: contain; object-position: center; opacity: 1; \}/);
  assert.match(archive, /\.event-row__image\.mission-image--placeholder \{ height: auto; aspect-ratio: 3 \/ 2; \}/);
  assert.match(calendar, /\.calendar-activity-card > \.mission-image\.mission-image--placeholder \{ height: auto; aspect-ratio: 3 \/ 2; align-self: center; \}/);
});

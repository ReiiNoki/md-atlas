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

test("missing event pictures use the legacy icon with an honest localized alt label", () => {
  for (const picture of [undefined, null, ""]) {
    const html = renderer.renderLocalized(imageView.MissionImage, {
      event: { ...event, picture }, className: "event-row__image",
    });
    assert.match(html, /mission-image--placeholder event-row__image/);
    assert.ok(html.includes(`src="${BASE_PATH}event-placeholder.webp"`));
    assert.ok(html.includes(translate("zh", "eventImagePlaceholder", { city: "珠海市" })));
    assert.match(html, /loading="lazy"/);
    assert.match(html, /width="256" height="256"/);
    assert.doesNotMatch(html, /<small>|mission-image--fallback|mission-image__loading/);
  }
  const eager = renderer.renderLocalized(imageView.MissionImage, { event, eager: true });
  assert.match(eager, /loading="eager"/);
  assert.doesNotMatch(eager, /fetchPriority="high"/i, "placeholders do not compete with real banners for high priority");
  for (const language of ["zh", "en", "ja"]) {
    assert.notEqual(translate(language, "eventImagePlaceholder", { city: "Zhuhai" }), "eventImagePlaceholder");
  }
});

test("real event pictures keep their original source, loading behavior and image label", () => {
  const picture = "https://example.com/banner.png";
  const html = renderer.renderLocalized(imageView.MissionImage, { event: { ...event, picture }, eager: true, retryable: true });
  assert.ok(html.includes(`src="${picture}"`));
  assert.ok(html.includes(translate("zh", "missionImageAlt", { city: "珠海市" })));
  assert.match(html, /is-loading/);
  assert.match(html, /loading="eager"/);
  assert.match(html, /fetchPriority="high"/i);
  assert.match(html, /referrerPolicy="no-referrer"/i);
  assert.doesNotMatch(html, /event-placeholder\.webp|mission-image--placeholder/);
});

test("legacy placeholder is a compact transparent 256px lossless WebP and fits without cropping", () => {
  const image = readFileSync(new URL("../public/event-placeholder.webp", import.meta.url));
  const styles = readFileSync(new URL("../src/styles/base.css", import.meta.url), "utf8");
  assert.equal(image.toString("ascii", 0, 4), "RIFF");
  assert.equal(image.toString("ascii", 8, 12), "WEBP");
  assert.equal(image.toString("ascii", 12, 16), "VP8L", "lossless WebP encoding");
  assert.equal(image[20], 0x2f, "VP8L signature");
  const dimensions = image.readUInt32LE(21);
  assert.equal((dimensions & 0x3fff) + 1, 256);
  assert.equal(((dimensions >>> 14) & 0x3fff) + 1, 256);
  assert.ok((dimensions >>> 28) & 1, "transparent background retained");
  assert.ok(image.length < 32768, "placeholder stays below 32 KiB");
  assert.match(styles, /\.mission-image--placeholder \{ display: flex; align-items: center; justify-content: center; \}/);
  assert.match(styles, /\.mission-image--placeholder img \{ width: 80%; height: 80%; max-width: 144px; max-height: 144px; object-fit: contain; opacity: 1; \}/);
});

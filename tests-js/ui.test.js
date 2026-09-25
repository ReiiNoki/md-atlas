import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activeFilterEntries } from "../src/utils/filters.js";
import { INITIAL_FILTERS } from "../src/utils/archive.js";
import { translate } from "../src/i18n/messages.js";

test("filter indicators omit defaults and whitespace-only searches", () => {
  assert.deepEqual(activeFilterEntries(INITIAL_FILTERS), []);
  assert.deepEqual(activeFilterEntries({ ...INITIAL_FILTERS, query: "  " }), []);
});

test("filter indicators retain every active criterion without mutating filters", () => {
  const filters = Object.freeze({ query: "台湾地区", year: "2025", region: "APAC", status: "online" });
  assert.deepEqual(activeFilterEntries(filters), Object.entries(filters));
  assert.deepEqual(activeFilterEntries({ ...filters, region: "all" }).map(([key]) => key), ["query", "year", "status"]);
});

test("all language titles use MD Atlas and retain the full archive name", () => {
  for (const language of ["zh", "en", "ja"]) {
    assert.match(translate(language, "pageTitle"), /^MD Atlas — Ingress Mission Day/);
    for (const key of ["brandDescription", "openSearch", "closeSearch", "editSearch"]) {
      assert.notEqual(translate(language, key), key);
    }
  }
});

test("footer legal notices and external icon links are complete", () => {
  assert.equal(
    translate("en", "fanSiteDisclaimer"),
    "This is a fan site and not officially affiliated with Niantic Inc.",
  );
  assert.equal(
    translate("zh", "dataSourceNotice"),
    "数据来源于 Bannergress 和 Ingress Intel Map。",
  );
  assert.equal(
    translate("zh", "ingressTrademarkNotice"),
    "Ingress 是 Niantic Inc. 的注册商标。",
  );
  const footer = readFileSync(new URL("../src/components/ArchiveStatusBar.jsx", import.meta.url), "utf8");
  assert.match(footer, /https:\/\/t\.me\/missiondayatlas/);
  assert.match(footer, /https:\/\/ingress\.com\//);
  assert.match(footer, /https:\/\/bannergress\.com\//);
  assert.match(footer, /https:\/\/github\.com\/ReiiNoki\/md-atlas/);
  assert.match(footer, /https:\/\/reiinoki\.dpdns\.org\//);
  assert.match(footer, /blog-logo\.ico/);
  for (const language of ["zh", "en", "ja"]) {
    assert.notEqual(translate(language, "personalBlog"), "personalBlog");
  }
  assert.doesNotMatch(footer, /city-name-credits\.html/);
});

test("mobile map starts unobstructed and keeps compact overlays available", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const responsive = readFileSync(new URL("../src/styles/responsive.css", import.meta.url), "utf8");
  const map = readFileSync(new URL("../src/styles/views/map.css", import.meta.url), "utf8");
  assert.match(app, /matchMedia\?\.\("\(max-width: 760px\)"\)\.matches/);
  assert.match(app, /intel-shell intel-shell--\$\{activeView\}/);
  assert.match(responsive, /\.intel-shell--map \.intel-statusbar \{ display: none; \}/);
  assert.match(responsive, /\.intel-search \{ position: absolute;/);
  assert.match(map, /\.event-feed__rows > button:nth-child\(n \+ 3\) \{ display: none; \}/);
});

const tokens = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
function token(name) {
  const match = tokens.match(new RegExp(`--${name}:\\s*(#[a-f0-9]{6});`, "i"));
  assert.ok(match, `Missing hex color token: ${name}`);
  return match[1];
}
function luminance(hex) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

test("core text tokens meet 4.5:1 against opaque page, surface and hover backgrounds", () => {
  // This checks the palette, not every rendered element/translucent map overlay.
  for (const foreground of ["color-text", "color-text-secondary", "color-text-muted"]) {
    for (const background of ["color-page", "color-surface", "color-surface-raised", "color-surface-hover"]) {
      const values = [luminance(token(foreground)), luminance(token(background))].sort((a, b) => b - a);
      const ratio = (values[0] + 0.05) / (values[1] + 0.05);
      assert.ok(ratio >= 4.5, `${foreground} on ${background}: ${ratio.toFixed(2)}:1`);
    }
  }
});

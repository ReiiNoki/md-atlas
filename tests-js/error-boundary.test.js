import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { translate } from "../src/i18n/messages.js";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const boundarySource = readFileSync(new URL("../src/components/ErrorBoundary.jsx", import.meta.url), "utf8");
const lazyViewSource = readFileSync(new URL("../src/components/RetryableLazyView.jsx", import.meta.url), "utf8");

const CRASH_KEYS = [
  "viewCrashedTitle",
  "viewCrashedHint",
  "appCrashedTitle",
  "appCrashedHint",
  "errorDetail",
  "retryView",
  "reloadPage",
];

test("crash fallback messages exist in both languages", () => {
  for (const key of CRASH_KEYS) {
    for (const language of ["zh", "en"]) {
      assert.notEqual(translate(language, key), key, `${language}/${key}`);
    }
  }
  assert.notEqual(translate("zh", "viewCrashedTitle"), translate("en", "viewCrashedTitle"));
});

test("the boundary stores render errors and retry clears them", () => {
  // node:test cannot import .jsx directly; assert the class contract by source.
  assert.match(boundarySource, /static getDerivedStateFromError\(error\) \{\r?\n    return \{ error \};/);
  assert.match(boundarySource, /retry\(\) \{\r?\n    this\.setState\(\{ error: null \}\);/);
  // Fallback retry prefers a parent-driven epoch rebuild when provided.
  assert.match(boundarySource, /onRetry=\{this\.props\.onRequestRetry \?\? this\.retry\}/);
});

test("map and archive views are isolated by their own keyed boundaries", () => {
  assert.match(appSource, /key=\{`map-\$\{viewEpochs\.map\}`\}/);
  assert.match(appSource, /key=\{`archive-\$\{viewEpochs\.archive\}`\}/);
  assert.equal(appSource.match(/<ViewErrorBoundary/g).length, 2);
});

test("lazy views rerun their chunk import on retry", () => {
  assert.equal(appSource.match(/<RetryableLazyView/g).length, 2);
  assert.match(appSource, /load=\{loadCalendarView\}/);
  assert.match(appSource, /load=\{loadDataView\}/);
  // The loader must attempt a fresh import after the epoch changes.
  assert.match(lazyViewSource, /\[epoch, load\]/);
  assert.match(lazyViewSource, /load\(\)\.then/);
  // Loaded views still get render-error isolation.
  assert.match(lazyViewSource, /<ViewErrorBoundary key=\{epoch\}/);
});

test("a top-level boundary still renders a localized screen outside the views", () => {
  assert.match(mainSource, /<ViewErrorBoundary fallback=\{AppCrashFallback\}>/);
});

test("boundaries handle render errors only; request paths stay in view state", () => {
  // Analytics and archive fetch failures keep their own retry affordances.
  assert.match(appSource, /analyticsAttempt/);
  assert.match(appSource, /loadState === "error"/);
  // The boundary never swallows errors silently into a blank screen.
  assert.match(boundarySource, /getDerivedStateFromError/);
  assert.match(boundarySource, /onReload/);
});

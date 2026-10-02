import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { translate } from "../src/i18n/messages.js";
import { startViewLoad } from "../src/shared/ui/loadView.js";
import { loadJsxModules } from "./helpers/load-jsx.mjs";

const [boundary, renderer, boot, analytics] = await loadJsxModules(
  "/src/shared/ui/ErrorBoundary.jsx", "/tests-js/helpers/render-jsx.jsx",
  "/src/shared/ui/ArchiveBoot.jsx", "/src/features/analytics/AnalyticsScreen.jsx",
);
const { ViewErrorBoundary, ViewCrashFallback, AppCrashFallback } = boundary;
const markup = renderer.renderLocalized;
const tick = () => new Promise((resolve) => setImmediate(resolve));
function instance(props = {}) {
  const component = new ViewErrorBoundary(props);
  // Use React's updater contract to inspect the actual class without adding a
  // renderer dependency. Real isolation/remount is also checked in Chromium.
  component.updater = { enqueueSetState(target, update) { target.state = { ...target.state, ...update }; } };
  return component;
}

test("crash fallback messages exist in all three languages", () => {
  for (const key of ["viewCrashedTitle", "viewCrashedHint", "appCrashedTitle", "appCrashedHint", "errorDetail", "retryView", "reloadPage"]) {
    for (const language of ["zh", "en", "ja"]) assert.notEqual(translate(language, key), key);
  }
});

test("the actual boundary stores errors, renders its fallback and retry restores children", () => {
  const child = createElement("span", null, "healthy child");
  const component = instance({ children: child });
  assert.strictEqual(component.render(), child);
  const error = new Error("render failed");
  component.state = ViewErrorBoundary.getDerivedStateFromError(error);
  const fallback = component.render();
  assert.strictEqual(fallback.type, ViewCrashFallback);
  assert.strictEqual(fallback.props.error, error);
  fallback.props.onRetry();
  assert.strictEqual(component.render(), child);
});

test("view boundaries are independent and prefer the parent's retry when supplied", () => {
  let retries = 0;
  const archive = instance({ onRequestRetry: () => retries++ });
  const mapChild = createElement("span", null, "map still healthy");
  const map = instance({ children: mapChild });
  archive.state = { error: new Error("archive render failure") };
  archive.render().props.onRetry();
  assert.equal(retries, 1);
  assert.strictEqual(map.render(), mapChild);
  const diagnostic = [];
  archive.props.onError = (...args) => diagnostic.push(args);
  archive.componentDidCatch(archive.state.error, { componentStack: "archive" });
  assert.strictEqual(diagnostic[0][0], archive.state.error);
});

test("lazy loads retry fresh, and an unmounted request cannot publish", async () => {
  const states = [];
  let attempts = 0;
  const Component = () => null;
  const load = async () => { if (++attempts === 1) throw new Error("chunk missing"); return { default: Component }; };
  const stop = startViewLoad(load, (state) => states.push(state));
  await tick();
  assert.equal(states.at(-1).status, "error");
  stop();
  startViewLoad(load, (state) => states.push(state));
  await tick();
  assert.equal(attempts, 2);
  assert.strictEqual(states.at(-1).Component, Component);
  let resolve;
  const late = [];
  const dispose = startViewLoad(() => new Promise((done) => { resolve = done; }), (state) => late.push(state));
  await tick();
  dispose();
  resolve({ default: Component });
  await tick();
  assert.deepEqual(late, [{ status: "loading" }]);
});

test("top-level errors render a localized nonblank recovery screen", () => {
  const html = markup(AppCrashFallback, { error: new Error("top-level failure") });
  assert.match(html, /role="alert"/);
  assert.ok(html.includes(translate("zh", "appCrashedTitle")));
  assert.ok(html.includes("top-level failure"));
  assert.ok(html.includes(translate("zh", "reloadPage")));
});

test("request failures keep their loading/retry UI rather than becoming render crashes", () => {
  const request = { status: "error", error: "HTTP 503", data: null, retry: () => {} };
  const bootHtml = markup(boot.ArchiveBoot, { request });
  const viewHtml = markup(analytics.AnalyticsScreen, { active: true, request, events: [] });
  assert.ok(bootHtml.includes("HTTP 503"));
  assert.ok(viewHtml.includes("HTTP 503"));
  assert.ok(viewHtml.includes(translate("zh", "retry")));
  assert.equal(viewHtml.includes(translate("zh", "viewCrashedTitle")), false);
});

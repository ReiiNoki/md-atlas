// Optional Chromium smoke test against Vite preview, --dev or --workers,
// without a framework dependency. Requires Node 22+ and Chrome (CHROME_PATH).
// Multilingual vector fixtures and local fonts exercise actual label rendering offline;
// banner images are blocked deliberately.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { displayCityName } from "../src/utils/locations.js";
import { eventMapLocation } from "../src/utils/eventMapLabel.js";
import { MAP_LABEL_SOURCE } from "../src/data/intelMapStyle.js";
import { labelTile } from "./map-browser-fixtures.mjs";
import { BASE_PATH } from "../site.config.js";
import { startWorkersPreview } from "./workers-preview.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dev = process.argv.includes("--dev");
const workers = process.argv.includes("--workers");
assert.ok(!(dev && workers), "Choose only one preview mode.");
const chromePath = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(existsSync);
assert.ok(chromePath, "Set CHROME_PATH to a Chrome/Chromium executable.");
assert.equal(typeof WebSocket, "function", "Browser checks require Node 22+.");
if (!dev) assert.ok(existsSync(resolve(root, "dist/index.html")), "Run npm run build first.");

const artifacts = await mkdtemp(join(tmpdir(), "md-atlas-browser-"));
const profile = join(artifacts, "profile");
const port = await new Promise((resolve, reject) => {
  const socket = createServer();
  socket.on("error", reject);
  socket.listen(0, "127.0.0.1", () => {
    const port = socket.address().port;
    socket.close(() => resolve(port));
  });
});
const { events } = JSON.parse(await readFile(resolve(root, "public/data/archive.json"), "utf8"));
const firstEvent = events[0];
const firstMissionRow = events.findIndex(e => e.missionCount > 0);
const firstMissionEvent = events[firstMissionRow];
const secondMissionRow = events.findIndex(e => e.missionCount > 0 && e.id !== firstMissionEvent.id);
const firstCityZh = displayCityName(firstEvent.countryCode, firstEvent.city, "zh");
const firstLocationZh = eventMapLocation(firstEvent, "zh");
const missionLocationZh = eventMapLocation(firstMissionEvent, "zh");
const workerPreview = workers ? await startWorkersPreview(artifacts) : null;
const origin = workerPreview?.origin ?? `http://127.0.0.1:${port}`;
const pageUrl = origin + BASE_PATH;
const chrome = spawn(chromePath, [
  "--headless=new", "--remote-debugging-port=0", "--no-first-run",
  "--no-default-browser-check", "--disable-background-networking",
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });
const server = workers ? null : spawn(process.execPath, [
  resolve(root, "node_modules/vite/bin/vite.js"), ...(dev ? [] : ["preview"]),
  "--host", "127.0.0.1", "--port", String(port), "--strictPort",
], { cwd: root, stdio: "ignore" });
let startupError;
chrome.on("error", (error) => { startupError = error; });
server?.on("error", (error) => { startupError = error; });
server?.on("exit", (code) => { startupError ??= new Error(`Preview exited: ${code}`); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check, label, limit = 30000) {
  const end = Date.now() + limit;
  while (Date.now() < end) {
    if (startupError) throw startupError;
    if (await check()) return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${label}`);
}
let ws;
let nextId = 0;
const pending = new Map();
const errors = [];
const consoleMessages = [];
let cancelledInterceptions = 0;
const failNext = { searchIndex: 0, eventDetail: 0, xmAnomalies: 0 };
function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 10000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function intercept({ requestId, request }) {
  if (request.url.endsWith("/data/search-index.json") && failNext.searchIndex > 0) {
    failNext.searchIndex -= 1;
    await send("Fetch.failRequest", { requestId, errorReason: "Failed" });
    return;
  }
  if (request.url.includes("/data/events/") && failNext.eventDetail > 0) {
    failNext.eventDetail -= 1;
    await send("Fetch.failRequest", { requestId, errorReason: "Failed" });
    return;
  }
  if (request.url.endsWith("/data/xm-anomalies.json") && failNext.xmAnomalies > 0) {
    failNext.xmAnomalies -= 1;
    await send("Fetch.failRequest", { requestId, errorReason: "Failed" });
    return;
  }
  if (request.url.includes("/data/")) {
    await send("Fetch.continueRequest", { requestId });
    return;
  }
  let body = labelTile, type = "application/x-protobuf";
  if (request.url.endsWith("/planet")) {
    type = "application/json";
    body = JSON.stringify({
      tilejson: "3.0.0", minzoom: 0, maxzoom: 14,
      tiles: ["https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf"],
    });
  } else if (request.url.includes("/fonts/")) {
    await send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
    throw new Error("Map labels must not depend on remote font ranges");
  } else if (request.url.includes("api.bannergress.com")) {
    await send("Fetch.failRequest", { requestId, errorReason: "Aborted" });
    return;
  }
  await send("Fetch.fulfillRequest", {
    requestId, responseCode: 200,
    responseHeaders: [
      { name: "Content-Type", value: type },
      { name: "Access-Control-Allow-Origin", value: "*" },
    ],
    body: Buffer.from(body).toString("base64"),
  });
}
async function click(selector) {
  assert.ok(await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), selector);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
const view = (index) => click(`.intel-tabs button:nth-child(${index})`);
const visible = (selector) => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
try {
  await waitFor(() => existsSync(join(profile, "DevToolsActivePort")), "Chrome startup");
  const debugPort = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0];
  await waitFor(() => fetch(pageUrl).then((r) => r.ok).catch(() => false), "preview startup");
  const page = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const task = pending.get(message.id);
      if (!task) return;
      clearTimeout(task.timer);
      pending.delete(message.id);
      if (message.error) task.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
      else task.resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
    else if (message.method === "Runtime.consoleAPICalled") consoleMessages.push(message.params);
    else if (message.method === "Fetch.requestPaused") intercept(message.params).catch((error) => {
      // View changes can cancel an image between requestPaused and our reply.
      // This CDP cancellation is not an application exception; keep all other
      // interception failures fatal and report cancellations separately.
      if (error.code === -32602 && error.message === "Invalid InterceptionId.") {
        cancelledInterceptions += 1;
      } else errors.push(String(error));
    });
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*tiles.openfreemap.org/*" }, { urlPattern: "*api.bannergress.com/*" }, { urlPattern: "*/data/search-index.json" }, { urlPattern: "*/data/events/*" }, { urlPattern: "*/data/xm-anomalies.json" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    // MapLibre 6 Worker protocol, observed only in this isolated test browser.
    // Wait for real tile re-layout replies instead of trusting text-field/DOM.
    window.__mapReloads = { sources: [], pending: new Set(), errors: [], aborted: 0 };
    const watched = new WeakSet();
    const originalPost = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(message, ...args) {
      const state = window.__mapReloads;
      if (!watched.has(this)) {
        watched.add(this);
        this.addEventListener('message', ({data}) => {
          if (data.type === '<response>' && state.pending.delete(data.id) && data.error) {
            // A newer language can supersede an in-flight glyph/layout request.
            // MapLibre handles AbortError normally; all other errors are fatal.
            if (data.error.name === 'AbortError') state.aborted += 1;
            else state.errors.push(data.error);
          }
        });
      }
      if (message.type === 'RT') {
        state.sources.push(message.data.source);
        state.pending.add(message.id);
      } else if (message.type === '<cancel>') state.pending.delete(message.id);
      return originalPost.call(this, message, ...args);
    };
  ` });
  await send("Page.navigate", { url: pageUrl });
  const mapReady = () => evaluate("Boolean(document.querySelector('.mission-map canvas')) && !document.querySelector('.map-state')");
  await waitFor(mapReady, "map ready (including bundled Worker)");
  await sleep(1200); // Wait for the initial flyTo animation before hit testing.

  // This crop excludes translated DOM overlays, controls and the popup. A
  // changed fingerprint therefore comes from the actual WebGL map, not UI text.
  const labelClip = await evaluate(`(() => {
    const r = document.querySelector('.mission-map canvas').getBoundingClientRect();
    window.__smokeCanvas = document.querySelector('.mission-map canvas');
    return { x: r.x + 160, y: r.y + 120, width: r.width - 320, height: 300, scale: 1 };
  })()`);
  async function labelPixels(name) {
    const image = await send("Page.captureScreenshot", { clip: labelClip });
    const bytes = Buffer.from(image.data, "base64");
    await writeFile(join(artifacts, `labels-${name}.png`), bytes);
    return createHash("sha256").update(bytes).digest("hex");
  }
  async function waitForLabelLayout() {
    await waitFor(() => evaluate("window.__mapReloads.sources.length > 0 && window.__mapReloads.pending.size === 0"), "label tile re-layout");
    assert.deepEqual(await evaluate("window.__mapReloads.errors"), []);
    assert.deepEqual(await evaluate("[...new Set(window.__mapReloads.sources)]"), [MAP_LABEL_SOURCE], "Language changes must not reparse the geometry source");
    assert.ok(await evaluate("window.__smokeCanvas === document.querySelector('.mission-map canvas')"));
    await sleep(500); // Allow the renderer to commit the worker result.
  }
  async function selectLanguage(language) {
    const lang = language === "zh" ? "zh-CN" : language;
    await click(".intel-language-button");
    await click(`.intel-language-menu button[lang="${lang}"]`);
  }
  async function switchMapLanguage(language) {
    await evaluate("window.__mapReloads.sources = []");
    await selectLanguage(language);
    await waitForLabelLayout();
  }
  const chinesePixels = await labelPixels("zh");
  await switchMapLanguage("en");
  const englishPixels = await labelPixels("en");
  assert.notEqual(englishPixels, chinesePixels, "English labels must change actual map pixels");
  await switchMapLanguage("ja");
  const japanesePixels = await labelPixels("ja");
  assert.notEqual(japanesePixels, englishPixels, "Japanese labels must change actual map pixels");
  assert.notEqual(japanesePixels, chinesePixels, "Japanese labels must differ from Chinese labels");
  await switchMapLanguage("zh");
  assert.equal(await labelPixels("zh-return"), chinesePixels, "Returning to Chinese must restore the same map view and labels");
  await evaluate("window.__mapReloads.sources = []");
  for (const language of ["en", "ja", "zh", "en"]) await selectLanguage(language);
  await waitForLabelLayout();
  assert.equal(await labelPixels("en-rapid"), englishPixels, "The latest language must win after rapid selections");
  await switchMapLanguage("ja");
  assert.equal(await labelPixels("ja-final"), japanesePixels);
  await switchMapLanguage("zh");
  assert.equal(await labelPixels("zh-final"), chinesePixels);
  const labelReloadAborts = await evaluate("window.__mapReloads.aborted");

  assert.ok(await visible(".event-feed.is-open"), "Event feed starts open");
  assert.equal(await visible(".map-activity-button"), false, "Activity button stays hidden while feed is open");
  await click(".event-feed__close");
  await waitFor(() => visible(".map-activity-button"), "map activity button");
  assert.equal(await visible(".event-feed.is-open"), false, "Close button hides event feed");
  await click(".map-activity-button");
  await waitFor(() => visible(".event-feed.is-open"), "reopened event feed");
  assert.equal(await visible(".map-activity-button"), false, "Reopening feed hides activity button");

  const point = await evaluate(`(() => {
    const r = document.querySelector('.mission-map canvas').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await waitFor(() => visible(".mission-map-popup__body"), "marker popup");
  assert.equal(await evaluate("document.querySelector('.mission-map-popup__body strong').textContent"), firstEvent.title);
  assert.ok(await evaluate(`document.querySelector('.mission-map-popup__body span').textContent.includes(${JSON.stringify(firstLocationZh)})`));
  assert.equal(await evaluate("document.querySelector('.selection-strip strong').textContent"), firstEvent.title);
  await evaluate("window.__smokeCanvas = document.querySelector('.mission-map canvas')");
  await selectLanguage("en");
  assert.equal(await evaluate("document.querySelector('.mission-map-popup__body strong').textContent"), firstEvent.title);
  assert.ok(await evaluate("window.__smokeCanvas === document.querySelector('.mission-map canvas')"));
  await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
  await waitFor(() => visible(".detail-panel.is-open"), "marker selection");
  assert.ok(await evaluate(`(() => {
    const h = document.querySelector('.intel-workspace--map .detail-panel__heading');
    const r = h.getBoundingClientRect();
    const c = h.querySelector('button').getBoundingClientRect();
    const m = h.querySelector('.detail-actions__map').getBoundingClientRect();
    return c.top - r.top <= 4 && Math.abs(r.right - c.right - 17) <= 2 &&
      Math.abs(c.right - m.right) <= 2 && m.top - c.bottom >= 2;
  })()`), "Desktop drawer actions share a right edge without overlapping");
  const desktopDetailScreenshot = await send('Page.captureScreenshot');
  await writeFile(join(artifacts, 'detail-desktop.png'), Buffer.from(desktopDetailScreenshot.data, 'base64'));
  await click(".detail-panel__heading button");
  await click(".map-control-dock button:first-child");
  await click(".map-control-dock button:nth-child(2)");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  assert.ok(await evaluate("document.querySelector('.mission-map canvas').getBoundingClientRect().width <= 390"));
  assert.ok(await evaluate(`(() => {
    const feed = document.querySelector('.event-feed').getBoundingClientRect();
    const label = document.querySelector('.event-feed > header > span').getBoundingClientRect();
    const nav = document.querySelector('.event-feed nav').getBoundingClientRect();
    const selection = document.querySelector('.selection-strip').getBoundingClientRect();
    const attribution = document.querySelector('.maplibregl-ctrl-attrib').getBoundingClientRect();
    const visibleRows = [...document.querySelectorAll('.event-feed__rows > button')]
      .filter((row) => getComputedStyle(row).display !== 'none');
    return feed.height <= 207 && nav.top >= label.bottom && visibleRows.length === 2 &&
      feed.top - selection.bottom >= 100 && feed.bottom <= attribution.top;
  })()`), "Mobile event feed uses a compact two-row header and leaves the map visible");
  assert.ok(await visible(".maplibregl-ctrl-attrib"));
  assert.equal(
    await evaluate("getComputedStyle(document.querySelector('.intel-statusbar')).display"),
    "none",
    "The mobile map gives the workspace the footer's space",
  );
  const workspaceHeight = await evaluate("document.querySelector('.intel-workspace').getBoundingClientRect().height");
  await click(".intel-search-toggle");
  assert.ok(await evaluate(`(() => {
    const search = document.querySelector('.intel-search');
    const close = document.querySelector('.intel-search__close');
    const input = document.querySelector('#archive-search-input');
    const box = search.getBoundingClientRect();
    const workspace = document.querySelector('.intel-workspace').getBoundingClientRect();
    return getComputedStyle(search).display === 'flex' && workspace.height === ${workspaceHeight} &&
      box.width >= innerWidth - 24 && Math.abs((box.left + box.right) / 2 - innerWidth / 2) <= 1 &&
      getComputedStyle(close).display === 'grid' && close.getBoundingClientRect().width >= 44 &&
      input.getBoundingClientRect().width >= 200;
  })()`), "Mobile search is a wide centered overlay with its own close button");
  const mobileSearchScreenshot = await send("Page.captureScreenshot");
  await writeFile(join(artifacts, "map-mobile-search.png"), Buffer.from(mobileSearchScreenshot.data, "base64"));
  await click(".intel-search__close");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.intel-search')).display"), "none");
  await click(".event-feed__close");
  await waitFor(() => visible(".map-activity-button"), "compact mobile activity button");
  await sleep(250);
  const screenshot = await send("Page.captureScreenshot");
  await writeFile(join(artifacts, "map-mobile.png"), Buffer.from(screenshot.data, "base64"));
  await view(2);
  await waitFor(() => visible(".event-row"), "archive");
  assert.ok(await evaluate(`(() => {
    const footer = document.querySelector('.intel-statusbar').getBoundingClientRect();
    const content = [
      document.querySelector('.intel-statusbar__legal'),
      ...document.querySelectorAll('.intel-statusbar__links a'),
    ].map((element) => element.getBoundingClientRect());
    return content.every((rect) =>
      rect.left >= 0 && rect.right <= innerWidth && rect.top >= footer.top && rect.bottom <= footer.bottom
    );
  })()`), "Legal notices and footer links remain visible in mobile content views");
  assert.equal(
    await evaluate("document.querySelector('.intel-statusbar__links a[href=\"https://t.me/missiondayatlas\"]').href"),
    "https://t.me/missiondayatlas",
  );
  assert.equal(
    await evaluate("document.querySelector('.intel-statusbar__links a[href=\"https://ingress.com/\"]').href"),
    "https://ingress.com/",
  );
  assert.equal(
    await evaluate("document.querySelector('.intel-statusbar__links a[href=\"https://bannergress.com/\"]').href"),
    "https://bannergress.com/",
  );
  assert.equal(
    await evaluate("document.querySelector('.intel-statusbar__links a[href=\"https://github.com/ReiiNoki/md-atlas\"]').href"),
    "https://github.com/ReiiNoki/md-atlas",
  );
  assert.ok(await evaluate(
    "document.querySelector('.intel-statusbar__legal').textContent.includes('not officially affiliated')",
  ));
  assert.ok(await evaluate(
    "document.querySelector('.intel-statusbar__legal').textContent.includes('Mission Day data is sourced from Bannergress') && document.querySelector('.intel-statusbar__legal').textContent.includes('XM Anomaly schedules')",
  ));
  assert.equal(await evaluate("document.querySelector('.event-row__place strong').textContent"), firstEvent.city);
  await selectLanguage("ja");
  assert.equal(await evaluate("document.documentElement.lang"), "ja");
  assert.equal(await evaluate("document.querySelector('.event-row__place strong').textContent"), firstEvent.city);
  assert.ok(await evaluate(
    "document.querySelector('.intel-statusbar__legal').textContent.includes('公式な関係はありません')",
  ));
  await selectLanguage("zh");
  assert.equal(await evaluate("document.querySelector('.event-row__place strong').textContent"), firstCityZh);
  assert.ok(await evaluate(
    "document.querySelector('.intel-statusbar__legal').textContent.includes('无官方关联')",
  ));
  assert.ok(await evaluate(
    "document.querySelector('.intel-statusbar__legal').textContent.includes('数据来源于 Bannergress') && document.querySelector('.intel-statusbar__legal').textContent.includes('XM Anomaly 日程')",
  ));
  await click(`.event-row:nth-child(${firstMissionRow + 1})`);
  await waitFor(() => visible(".mission-row"), "mission details");
  assert.equal(await evaluate("document.querySelector('#event-detail-title').textContent"), firstMissionEvent.title);
  assert.equal(await evaluate("document.querySelector('.detail-panel__identity p').textContent"), missionLocationZh);
  assert.ok(await evaluate(`(() => {
    const heading = document.querySelector('.detail-panel__heading');
    const actions = heading.querySelector('.detail-actions');
    const banner = actions?.querySelector('a.detail-actions__banner');
    const map = actions?.querySelector('.detail-actions__map');
    const close = heading.querySelector('button');
    if (!banner || !map || !close ||
        banner.title !== '查看 Banner' || banner.getAttribute('aria-label') !== banner.title ||
        !banner.querySelector('img[src$="bannergress-logo.png"]')) return false;
    const h = heading.getBoundingClientRect();
    const b = banner.getBoundingClientRect();
    const m = map.getBoundingClientRect();
    const c = close.getBoundingClientRect();
    const han = heading.querySelector('h2 .detail-panel__han');
    return b.top >= h.top && b.bottom <= h.bottom && m.top >= h.top &&
      m.bottom <= h.bottom && b.right <= m.left && Math.abs(c.right - m.right) <= 2 &&
      m.top - c.bottom >= 2 && c.right <= h.right &&
      h.right - c.right >= 11 && h.right - c.right <= 14 &&
      c.top >= h.top && c.top - h.top <= 4 &&
      close.querySelector('svg').getBoundingClientRect().top >= h.top &&
      close.querySelector('svg').getBoundingClientRect().top - h.top <= 6 &&
      (!han || parseFloat(getComputedStyle(han).fontSize) < parseFloat(getComputedStyle(han.parentElement).fontSize));
  })()`), "Detail header keeps mixed-script title balanced and separates the raised close button");
  const detailScreenshot = await send("Page.captureScreenshot");
  await writeFile(join(artifacts, "detail-mobile.png"), Buffer.from(detailScreenshot.data, "base64"));

  // Mission-title matches must not be reported from summary-only data, and a
  // failed index request must recover without reloading or clearing the query.
  failNext.searchIndex = 1;
  await evaluate(`(() => {
    const input = document.querySelector('#archive-search-input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(firstEvent.city)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor(() => visible('.view-loading[role="alert"]'), "search index error");
  assert.equal(await visible('.event-row'), false, "Partial search results must stay hidden");
  assert.ok(await evaluate("document.querySelector('.active-filters strong').textContent.includes('暂不可用')"));
  await click('.view-loading button');
  await waitFor(() => visible('.event-row'), "search index retry");
  assert.ok(await evaluate("document.querySelector('.active-filters strong').textContent.includes('项结果')"));
  await evaluate(`(() => {
    const input = document.querySelector('#archive-search-input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor(() => visible('.event-row:nth-child(2)'), "clear search");

  failNext.eventDetail = 1;
  await click(`.event-row:nth-child(${secondMissionRow + 1})`);
  await waitFor(() => visible('.detail-loading--error button'), "mission detail error");
  await click('.detail-loading--error button');
  await waitFor(() => visible('.mission-row'), "mission detail retry");
  assert.equal(await visible('.detail-loading--error'), false);
  await click('.detail-panel__heading button');
  await evaluate(`(() => {
    const input = document.querySelector('#archive-search-input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '恆春');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor(() => evaluate("document.querySelector('.event-row__place strong')?.textContent.includes('屏东')"), "Hengchun archive row");
  await click('.event-row');
  await waitFor(() => evaluate("document.querySelector('#event-detail-title')?.textContent.includes('恆春')"), "mixed-script detail title");
  await sleep(250);
  assert.ok(await evaluate(`(() => {
    const heading = document.querySelector('.detail-panel__heading');
    const han = heading.querySelector('.detail-panel__han');
    const close = heading.querySelector('button');
    const map = heading.querySelector('.detail-actions__map');
    const c = close.getBoundingClientRect();
    const m = map.getBoundingClientRect();
    return han && parseFloat(getComputedStyle(han).fontSize) < parseFloat(getComputedStyle(han.parentElement).fontSize) &&
      Math.abs(c.right - m.right) <= 2 && m.top - c.bottom >= 2;
  })()`), "Han glyphs are optically balanced and header controls align without overlapping");
  const mixedScreenshot = await send('Page.captureScreenshot');
  await writeFile(join(artifacts, 'detail-han-mobile.png'), Buffer.from(mixedScreenshot.data, 'base64'));
  await evaluate(`(() => {
    const input = document.querySelector('#archive-search-input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  failNext.xmAnomalies = 1;
  await view(3);
  await waitFor(() => visible('.view-loading[role="alert"]'), "XM Anomaly calendar error");
  assert.equal(await visible(".calendar-days"), false, "Incomplete calendar data must stay hidden");
  await click('.view-loading button');
  await waitFor(() => visible(".calendar-days"), "calendar data retry");
  assert.ok(await evaluate(`document.querySelector('.calendar-days').textContent.includes(${JSON.stringify(firstCityZh)})`));
  assert.equal(await evaluate("document.querySelectorAll('.calendar-type-control button').length"), 3);
  await click(".calendar-type-control button:nth-child(3)");
  await waitFor(() => visible(".calendar-activity-card--xma"), "XM Anomaly calendar cards");
  await waitFor(
    () => evaluate("[...document.querySelectorAll('.calendar-activity-card--xma .calendar-xma-mark img')].every((image) => image.complete && image.naturalWidth > 0)"),
    "XM Anomaly calendar logos",
  );
  assert.ok(await evaluate("document.querySelector('.calendar-activity-list').textContent.includes('XM Anomaly: Apollo')"));
  assert.ok(await evaluate(`(() => {
    const heading = document.querySelector('.calendar-heading').getBoundingClientRect();
    const controls = document.querySelector('.calendar-heading__controls').getBoundingClientRect();
    const typeButtons = [...document.querySelectorAll('.calendar-type-control button')];
    return controls.left >= 0 && controls.right <= innerWidth && controls.bottom <= heading.bottom &&
      typeButtons.every((button) => button.getBoundingClientRect().width >= 80) &&
      document.querySelectorAll('.calendar-activity-card--xma').length === 2 &&
      document.querySelector('.calendar-day__markers .is-xm-anomaly')?.textContent.trim() === 'Apollo' &&
      [...document.querySelectorAll('.calendar-activity-card--xma .calendar-xma-mark img')]
        .every((image) => image.complete && image.naturalWidth > 0) &&
      !document.querySelector('.calendar-activity-card--xma .mission-image');
  })()`), "Mobile calendar separates XMA data with usable type controls and dedicated cards");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await sleep(250);
  assert.ok(await evaluate(`(() => {
    const marker = document.querySelector('.calendar-day__markers .is-xm-anomaly');
    return marker?.textContent.trim() === 'Apollo' && getComputedStyle(marker.parentElement).display !== 'none';
  })()`), "Desktop calendar labels XM Anomaly dates by series");
  const calendarDesktopScreenshot = await send("Page.captureScreenshot");
  await writeFile(join(artifacts, "calendar-xma-desktop.png"), Buffer.from(calendarDesktopScreenshot.data, "base64"));
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(250);
  const calendarControlsScreenshot = await send("Page.captureScreenshot");
  await writeFile(join(artifacts, "calendar-xma-controls-mobile.png"), Buffer.from(calendarControlsScreenshot.data, "base64"));
  await evaluate("document.querySelector('.calendar-activity-panel').scrollIntoView({ block: 'start' })");
  await sleep(250);
  const calendarScreenshot = await send("Page.captureScreenshot");
  await writeFile(join(artifacts, "calendar-xma-mobile.png"), Buffer.from(calendarScreenshot.data, "base64"));
  await view(4);
  await waitFor(() => visible(".data-dashboard"), "analytics");
  assert.equal(await visible(".data-quality"), false, "Data quality diagnostics are not shown in the dashboard");
  await view(1);
  await waitFor(mapReady, "remounted map");
  assert.deepEqual(errors, []);

  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return type === 'webgl2' ? null : originalGetContext.call(this, type, ...args);
    };
  ` });
  await send("Page.reload", { ignoreCache: true });
  await waitFor(() => visible(".map-state--unavailable"), "WebGL2 fallback");
  assert.ok(await evaluate("document.querySelector('.map-state--unavailable').textContent.includes('WebGL2')"));
  await view(2);
  await waitFor(() => visible(".event-row"), "archive without GPU");
  await click(`.event-row:nth-child(${firstMissionRow + 1})`);
  await waitFor(() => visible(".mission-row"), "mission details without GPU");
  await view(1);
  await waitFor(() => visible(".map-state--unavailable"), "fallback remount");
  assert.deepEqual(errors, []);
  assert.equal(await evaluate("location.pathname"), BASE_PATH);
  assert.equal(
    await evaluate("new URL(document.querySelector('.intel-statusbar__links img[src$=\"telegram-logo.svg\"]').src).pathname"),
    `${BASE_PATH}telegram-logo.svg`,
  );
  assert.equal(
    await evaluate("new URL(document.querySelector('.intel-statusbar__links img[src$=\"ingress-logo.svg\"]').src).pathname"),
    `${BASE_PATH}ingress-logo.svg`,
  );
  assert.equal(
    await evaluate("new URL(document.querySelector('.intel-statusbar__links img[src$=\"bannergress-logo.png\"]').src).pathname"),
    `${BASE_PATH}bannergress-logo.png`,
  );
  const resources = await evaluate("performance.getEntriesByType('resource').map(entry => entry.name)");
  const localResources = resources.map((name) => new URL(name)).filter((url) => url.origin === origin);
  assert.ok(localResources.some((url) => url.pathname === `${BASE_PATH}data/archive.json`));
  if (!dev) {
    for (const url of localResources) assert.ok(url.pathname.startsWith(BASE_PATH), `Resource escaped the mount: ${url.pathname}`);
  }
  await writeFile(join(artifacts, "results.json"), JSON.stringify({
    result: "pass", mode: workers ? "workers" : dev ? "development" : "production", pageUrl, exceptions: errors, cancelledInterceptions, labelReloadAborts,
    checks: ["map Worker", "rendered multilingual label pixels, rapid selections and label-only tile re-layout", "popup", "localized cities and language menu without map remount", "marker selection", "zoom controls", "localized legal footer and links", "mobile resize", "four views", "remount", "WebGL2 fallback"],
    externalTiles: "synthetic multilingual vector tiles", glyphs: "local browser fonts", images: "blocked",
  }, null, 2));
  console.log(`Browser smoke passed. Artifacts: ${artifacts}`);
} catch (error) {
  const body = ws?.readyState === WebSocket.OPEN ? await evaluate("document.body.innerText").catch(String) : "";
  await writeFile(join(artifacts, "errors.json"), JSON.stringify({ message: String(error), errors, consoleMessages, body }, null, 2));
  console.error(`Browser smoke failed. Artifacts: ${artifacts}`);
  throw error;
} finally {
  if (ws?.readyState === WebSocket.OPEN) {
    try { await send("Browser.close"); } catch { /* Browser may already be closed. */ }
    ws.close();
  }
  // Only close processes started by this test; never reuse a user's browser.
  chrome.kill();
  if (workerPreview) await workerPreview.stop();
  else server?.kill();
  for (const task of pending.values()) {
    clearTimeout(task.timer);
    task.reject(new Error("Browser test closing"));
  }
}

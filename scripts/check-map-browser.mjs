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
import { displayCityName } from "../src/domain/geography/locations.js";
import { eventMapLocation } from "../src/utils/eventMapLabel.js";
import { MAP_LABEL_SOURCE } from "../src/features/map/intelMapStyle.js";
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
const { events: officialEvents } = JSON.parse(await readFile(resolve(root, "public/data/official-missions.json"), "utf8"));
const officialEvent = officialEvents[0];
assert.ok(officialEvent, "Expected an archive-only deep link fixture");
const secondMissionRow = events.findIndex(e => e.missionCount > 0 && e.id !== firstMissionEvent.id);
const firstCityZh = displayCityName(firstEvent.countryCode, firstEvent.city, "zh");
const firstEventCompletions = new Intl.NumberFormat("en-US").format(firstEvent.completions);
const oldestEvent = events.filter((event) => event.date).sort((a, b) => a.date.localeCompare(b.date))[0];
const longCjkMarkerEvent = events.find((event) => event.date === "2024-08-31" && event.city === "San Vicente de Cañete");
assert.ok(longCjkMarkerEvent, "Expected the long CJK calendar marker fixture");
const longCjkMarkerZh = displayCityName(longCjkMarkerEvent.countryCode, longCjkMarkerEvent.city, "zh");
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
    try {
      if (await check()) return;
    } catch (error) {
      // Page.navigate/reload can replace the execution context while this
      // read-only readiness probe runs. Retry that CDP race, not app errors.
      if (error.code !== -32000 || error.message !== "Inspected target navigated or closed") throw error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out: ${label}`);
}
let ws;
let nextId = 0;
const pending = new Map();
const errors = [];
const consoleMessages = [];
const browserLogs = [];
let cancelledInterceptions = 0;
const failNext = { searchIndex: 0, eventDetail: 0, xmAnomalies: 0 };
const heldData = new Map();
let corruptDetail = false;
let corruptArchive = null;
function pauseData(path) {
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const gate = { wait, release: () => { heldData.delete(path); release(); }, reached: false };
  heldData.set(path, gate);
  return gate;
}
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
  const gate = heldData.get(new URL(request.url).pathname);
  if (gate) {
    gate.reached = true;
    await gate.wait;
  }
  if (corruptDetail && request.url.endsWith(firstMissionEvent.detailPath)) {
    corruptDetail = false;
    await send('Fetch.fulfillRequest', { requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify({ ...firstMissionEvent, missions: {} })).toString('base64') });
    return;
  }
  if (corruptArchive && request.url.endsWith('/data/archive.json')) {
    const payload = corruptArchive === 'map'
      ? { events: [{ ...firstEvent, title: { invalid: true } }] } : { events: null };
    await send('Fetch.fulfillRequest', { requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(payload)).toString('base64') });
    return;
  }
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
    else if (message.method === "Log.entryAdded") browserLogs.push(message.params.entry);
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
  await send("Log.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*tiles.openfreemap.org/*" }, { urlPattern: "*api.bannergress.com/*" }, { urlPattern: "*/data/*" }] });
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
  const initialDataRequests = await evaluate(`performance.getEntriesByType('resource').map(({name}) => new URL(name).pathname).filter(path => path.startsWith(${JSON.stringify(`${BASE_PATH}data/`)}))`);
  if (dev) {
    // StrictMode replays the boot request; aborted entries may or may not appear
    // in Resource Timing. Source modules under src/data are not JSON requests.
    assert.ok(initialDataRequests.length >= 1 && initialDataRequests.length <= 2);
    assert.ok(initialDataRequests.every((path) => path === `${BASE_PATH}data/archive.json`));
  } else assert.deepEqual(initialDataRequests, [`${BASE_PATH}data/archive.json`], "Initial map loads only the archive JSON");
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
  // Derive the expected total from the published data: the archive view lists
  // Mission Day events plus the archive-only official mission sets, so a
  // hardcoded number breaks every time the archive grows.
  const archiveEventCount = String(events.length + officialEvents.length);
  assert.ok(await evaluate(`document.querySelector('.archive-tools strong').textContent.replace(/\\D/g, '').includes(${JSON.stringify(archiveEventCount)})`));
  assert.ok(await evaluate(`document.querySelector('.event-row__completions').textContent.includes(${JSON.stringify(firstEventCompletions)})`));
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await sleep(250);
  assert.ok(await evaluate(`(() => {
    const headers = [...document.querySelectorAll('.event-table__header > span')];
    const row = document.querySelector('.event-row');
    const date = headers[2].getBoundingClientRect();
    const completions = headers[3].getBoundingClientRect();
    const missions = headers[4].getBoundingClientRect();
    return headers.length === 7 && date.right <= completions.left && completions.right <= missions.left &&
      row.querySelector('.event-row__completions').textContent.includes(${JSON.stringify(firstEventCompletions)}) &&
      document.querySelector('.event-table__body').scrollWidth <= document.querySelector('.event-table__body').clientWidth;
  })()`), "Desktop archive places completion totals between date and mission count");
  await click(".event-table__date-sort");
  await waitFor(
    () => evaluate(`document.querySelector('.event-row__place strong').textContent === ${JSON.stringify(oldestEvent.city)}`),
    "ascending archive dates",
  );
  assert.equal(await evaluate("document.querySelector('.event-table__date-heading').getAttribute('aria-sort')"), "ascending");
  const archiveAscendingScreenshot = await send("Page.captureScreenshot");
  await writeFile(join(artifacts, "archive-date-ascending-desktop.png"), Buffer.from(archiveAscendingScreenshot.data, "base64"));
  await click(".event-table__date-sort");
  await waitFor(
    () => evaluate(`document.querySelector('.event-row__place strong').textContent === ${JSON.stringify(firstEvent.city)}`),
    "descending archive dates",
  );
  assert.equal(await evaluate("document.querySelector('.event-table__date-heading').getAttribute('aria-sort')"), "descending");
  const archiveCompletionsScreenshot = await send("Page.captureScreenshot");
  await writeFile(join(artifacts, "archive-completions-desktop.png"), Buffer.from(archiveCompletionsScreenshot.data, "base64"));
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(250);
  assert.ok(await evaluate(`(() => {
    const row = document.querySelector('.event-row');
    const completions = row.querySelector('.event-row__completions');
    const missions = row.querySelector('.event-row__count');
    const c = completions.getBoundingClientRect();
    const m = missions.getBoundingClientRect();
    return getComputedStyle(completions.querySelector('small')).display !== 'none' &&
      getComputedStyle(missions.querySelector('small')).display !== 'none' && c.bottom <= m.top;
  })()`), "Mobile archive stacks completion and mission totals without overlap");
  assert.equal(await visible(".event-table__date-sort"), true, "Mobile archive exposes the date sort control");
  await click(".event-table__date-sort");
  await waitFor(
    () => evaluate(`document.querySelector('.event-row__place strong').textContent === ${JSON.stringify(oldestEvent.city)}`),
    "mobile ascending archive dates",
  );
  await click(".event-table__date-sort");
  await waitFor(
    () => evaluate(`document.querySelector('.event-row__place strong').textContent === ${JSON.stringify(firstEvent.city)}`),
    "mobile descending archive dates",
  );
  const archiveCompletionsMobileScreenshot = await send("Page.captureScreenshot");
  await writeFile(join(artifacts, "archive-completions-mobile.png"), Buffer.from(archiveCompletionsMobileScreenshot.data, "base64"));
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

  await evaluate(`(() => {
    const input = document.querySelector('#archive-search-input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'GORUCK');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor(
    () => evaluate("document.querySelector('.event-row .activity-type')?.classList.contains('activity-type--goruck')"),
    "GORUCK archive results",
  );
  assert.ok(await evaluate("getComputedStyle(document.querySelector('.activity-type--goruck')).color === 'rgb(126, 219, 149)'"));
  await click('.event-row');
  await waitFor(() => visible('.mission-row'), "GORUCK mission details");
  assert.equal(await evaluate("document.querySelector('.event-facts .activity-type')?.textContent.trim()"), "GORUCK");
  const officialMissionScreenshot = await send("Page.captureScreenshot");
  await writeFile(join(artifacts, "archive-goruck-mobile.png"), Buffer.from(officialMissionScreenshot.data, "base64"));
  await click('.detail-panel__heading button');
  await evaluate(`(() => {
    const input = document.querySelector('#archive-search-input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor(() => evaluate(`document.querySelector('.event-row:first-child .event-row__place strong')?.textContent === ${JSON.stringify(firstCityZh)}`), "clear GORUCK search");

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
  await waitFor(() => visible(".calendar-xma-series"), "XM Anomaly series agenda");
  await waitFor(
    () => evaluate("[...document.querySelectorAll('.calendar-xma-series .calendar-xma-logo img')].every((image) => image.complete && image.naturalWidth > 0)"),
    "XM Anomaly calendar logos",
  );
  assert.equal(await evaluate("document.querySelector('.calendar-xma-series__identity h3').textContent"), "Apollo");
  assert.ok(await evaluate(`(() => {
    const heading = document.querySelector('.calendar-heading').getBoundingClientRect();
    const controls = document.querySelector('.calendar-heading__controls').getBoundingClientRect();
    const typeButtons = [...document.querySelectorAll('.calendar-type-control button')];
    return controls.left >= 0 && controls.right <= innerWidth && controls.bottom <= heading.bottom &&
      typeButtons.every((button) => button.getBoundingClientRect().width >= 80) &&
      document.querySelectorAll('.calendar-xma-series').length === 1 &&
      document.querySelectorAll('.calendar-xma-sites li').length === 2 &&
      document.querySelectorAll('.calendar-xma-logo img').length === 1 &&
      document.querySelector('.calendar-day__markers .is-xm-anomaly')?.textContent.trim() === 'Apollo' &&
      [...document.querySelectorAll('.calendar-xma-logo img')]
        .every((image) => image.complete && image.naturalWidth > 0) &&
      !document.querySelector('.calendar-activity-card--xma');
  })()`), "Mobile calendar groups XMA sites under a dedicated series presentation");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await sleep(250);
  assert.ok(await evaluate(`(() => {
    const marker = document.querySelector('.calendar-day__markers .is-xm-anomaly');
    return marker?.textContent.trim() === 'Apollo' && getComputedStyle(marker.parentElement).display !== 'none';
  })()`), "Desktop calendar labels XM Anomaly dates by series");
  const calendarDesktopScreenshot = await send("Page.captureScreenshot");
  await writeFile(join(artifacts, "calendar-xma-desktop.png"), Buffer.from(calendarDesktopScreenshot.data, "base64"));
  await evaluate(`(() => {
    const year = document.querySelector('.calendar-period-control select');
    year.value = '2024';
    year.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(
    () => evaluate("document.querySelector('.calendar-day__markers .is-xm-anomaly')?.textContent.trim() === 'Erased Memories'"),
    "long XM Anomaly series marker",
  );
  assert.ok(await evaluate(`(() => {
    const marker = document.querySelector('.calendar-day__markers .is-xm-anomaly');
    const style = getComputedStyle(marker);
    return style.whiteSpace === 'nowrap' && style.overflowX === 'hidden' &&
      style.textOverflow === 'ellipsis' && marker.getBoundingClientRect().height < 20;
  })()`), "Series markers stay on one line and use ellipsis when needed");
  const calendarLongSeriesScreenshot = await send("Page.captureScreenshot");
  await writeFile(join(artifacts, "calendar-xma-single-line-desktop.png"), Buffer.from(calendarLongSeriesScreenshot.data, "base64"));
  await click(".calendar-type-control button:nth-child(1)");
  await evaluate(`(() => {
    const year = document.querySelector('.calendar-period-control select');
    year.value = '2019';
    year.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(
    () => evaluate("document.querySelector('.calendar-panel__heading > div > span')?.textContent.trim() === '2019'"),
    "six-week calendar year",
  );
  await evaluate(`(() => {
    const month = document.querySelectorAll('.calendar-period-control select')[1];
    month.value = '8';
    month.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(
    () => evaluate("document.querySelectorAll('.calendar-period-control select')[1]?.value === '8'"),
    "six-week calendar month",
  );
  assert.ok(await evaluate(`(() => {
    const panel = document.querySelector('.calendar-panel');
    const days = document.querySelector('.calendar-days').getBoundingClientRect();
    const cells = [...document.querySelectorAll('.calendar-day')];
    return getComputedStyle(panel).overflowY === 'hidden' && panel.scrollHeight <= panel.clientHeight + 1 &&
      cells.every((cell) => {
        const rect = cell.getBoundingClientRect();
        return rect.top >= days.top - 1 && rect.bottom <= days.bottom + 1;
      });
  })()`), "Six-week months fit without an internal calendar scrollbar");
  const calendarSixWeekScreenshot = await send("Page.captureScreenshot");
  await writeFile(join(artifacts, "calendar-six-week-month-desktop.png"), Buffer.from(calendarSixWeekScreenshot.data, "base64"));
  await evaluate(`(() => {
    const year = document.querySelector('.calendar-period-control select');
    year.value = '2024';
    year.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(
    () => evaluate("document.querySelector('.calendar-panel__heading > div > span')?.textContent.trim() === '2024'"),
    "CJK marker calendar year",
  );
  await evaluate(`(() => {
    const month = document.querySelectorAll('.calendar-period-control select')[1];
    month.value = '7';
    month.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(
    () => evaluate(`[...document.querySelectorAll('.calendar-day__markers span')].some((marker) => marker.textContent.trim() === ${JSON.stringify(longCjkMarkerZh)})`),
    "long CJK calendar marker",
  );
  assert.ok(await evaluate(`(() => {
    const marker = [...document.querySelectorAll('.calendar-day__markers span')]
      .find((element) => element.textContent.trim() === ${JSON.stringify(longCjkMarkerZh)});
    const cell = marker.closest('.calendar-day').getBoundingClientRect();
    const rect = marker.getBoundingClientRect();
    const style = getComputedStyle(marker);
    marker.style.width = '24px';
    const ellipsisCanActivate = marker.scrollWidth > marker.clientWidth;
    marker.style.removeProperty('width');
    return style.whiteSpace === 'nowrap' && style.overflowX === 'hidden' &&
      style.textOverflow === 'ellipsis' && ellipsisCanActivate &&
      rect.left >= cell.left && rect.right <= cell.right;
  })()`), "Long CJK marker labels stay inside their date cell with ellipsis");
  const calendarCjkMarkerScreenshot = await send("Page.captureScreenshot");
  await writeFile(join(artifacts, "calendar-ellipsis-marker-desktop.png"), Buffer.from(calendarCjkMarkerScreenshot.data, "base64"));
  await click(".calendar-type-control button:nth-child(3)");
  await evaluate(`(() => {
    const year = document.querySelector('.calendar-period-control select');
    year.value = '2024';
    year.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(
    () => evaluate("document.querySelector('.calendar-panel__heading > div > span')?.textContent.trim() === '2024'"),
    "restore long-series calendar year",
  );
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
  assert.ok(await evaluate(`(() => {
    const row = document.querySelector('.data-year-row');
    const track = row.querySelector('.data-track').getBoundingClientRect();
    const missions = row.querySelector('strong').getBoundingClientRect();
    const events = row.querySelector('span').getBoundingClientRect();
    const bounds = row.getBoundingClientRect();
    return getComputedStyle(row.querySelector('span')).display !== 'none' &&
      track.right <= missions.left && missions.right <= events.left && events.right <= bounds.right + 1;
  })()`), "Mobile yearly analytics show event totals without overlapping mission totals");
  await evaluate("document.querySelector('.data-trend').scrollIntoView({ block: 'start' })");
  await sleep(250);
  const dataMobileScreenshot = await send("Page.captureScreenshot");
  await writeFile(join(artifacts, "data-year-events-mobile.png"), Buffer.from(dataMobileScreenshot.data, "base64"));
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
  // Selection routes must restore their originating map screen and drawer.
  await send('Page.navigate', { url: pageUrl });
  await waitFor(() => visible('.event-feed__rows button'), 'route history map baseline');
  const expectSelection = (event) => waitFor(() => evaluate(`
    location.pathname === ${JSON.stringify(`${BASE_PATH}md/${encodeURIComponent(event.id)}`)} &&
    document.querySelector('.intel-workspace--map .detail-panel.is-open #event-detail-title')?.textContent === ${JSON.stringify(event.title)}
  `), `selected route ${event.id}`);
  await click('.event-feed__rows button:first-child');
  await expectSelection(firstEvent);
  await click('.event-feed__rows button:nth-child(2)');
  await expectSelection(events[1]);
  await evaluate('history.back()');
  await expectSelection(firstEvent);
  await evaluate('history.back()');
  await waitFor(() => evaluate(`location.pathname === '${BASE_PATH}' && !document.querySelector('.detail-panel.is-open')`), 'Back to root closes resource drawer');
  await evaluate('history.forward()');
  await expectSelection(firstEvent);
  await evaluate('history.forward()');
  await expectSelection(events[1]);

  // Primary navigation must leave the selection route, even with an open drawer.
  for (const [index, path, selector] of [[2, 'archive', '.event-row'], [3, 'calendar', '.calendar-days'], [4, 'data', '.data-dashboard']]) {
    await view(index);
    await waitFor(() => evaluate(`location.pathname === '${BASE_PATH}${path}' && Boolean(document.querySelector(${JSON.stringify(selector)}))`), `page route ${path}`);
  }
  await evaluate('history.back()');
  await waitFor(() => visible('.calendar-days'), 'page Back to calendar');
  assert.equal(await evaluate('location.pathname'), `${BASE_PATH}calendar`);
  await evaluate('history.forward()');
  await waitFor(() => visible('.data-dashboard'), 'page Forward to data');

  const unicodeEvent = events.find(({ id }) => [...id].some((char) => char.codePointAt(0) > 127));
  assert.ok(unicodeEvent, 'Expected a real Unicode BannerGress ID');
  await send('Page.navigate', { url: `${pageUrl}md/${encodeURIComponent(unicodeEvent.id)}?year=2026&country=JP` });
  await waitFor(() => evaluate(`document.querySelector('.detail-panel.is-open #event-detail-title')?.textContent === ${JSON.stringify(unicodeEvent.title)}`), 'Unicode route selects even when filters hide the event');
  await send('Page.reload', { ignoreCache: true });
  await waitFor(() => evaluate(`document.querySelector('.detail-panel.is-open #event-detail-title')?.textContent === ${JSON.stringify(unicodeEvent.title)}`), 'Unicode deep-link refresh');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('country')"), 'JP');
  await send('Page.navigate', { url: `${pageUrl}md/nonexistent-event` });
  await waitFor(() => evaluate(`location.pathname === '${BASE_PATH}archive' && !document.querySelector('.detail-panel.is-open')`), 'unknown ID replaces with archive canonical route');
  await send('Page.navigate', { url: `${pageUrl}invalid-route?year=2026` });
  await waitFor(() => evaluate(`location.pathname === '${BASE_PATH}' && new URLSearchParams(location.search).get('year') === '2026'`), 'invalid route normalizes without dropping filters');

  // Refresh a resource pathname, then exercise discrete history navigation.
  const missionUrl = `${pageUrl}md/${encodeURIComponent(firstMissionEvent.id)}`;
  await send("Page.navigate", { url: missionUrl });
  await waitFor(() => evaluate(`document.querySelector('.intel-workspace--archive #event-detail-title')?.textContent === ${JSON.stringify(firstMissionEvent.title)}`), "archive deep link refresh");
  assert.equal(await evaluate('location.pathname'), `${BASE_PATH}md/${encodeURIComponent(firstMissionEvent.id)}`);
  assert.equal(await visible('.detail-panel.is-open'), true, 'Resource navigation opens details');
  await send('Page.reload', { ignoreCache: true });
  await waitFor(() => visible('.mission-row'), 'resource refresh restores detail loading');
  await click(`.event-row:nth-child(${firstMissionRow + 1})`);
  await waitFor(() => visible('.mission-row'), "archive detail before calendar reuse");
  const detailRequestsBeforeCalendar = await evaluate(`performance.getEntriesByType('resource').filter(({name}) => name.endsWith(${JSON.stringify(firstMissionEvent.detailPath)})).length`);
  assert.equal(detailRequestsBeforeCalendar, 1);
  await view(3);
  await waitFor(() => visible('.calendar-days'), "history calendar");
  await evaluate(`(() => {
    const year = document.querySelector('.calendar-period-control select:first-of-type');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(year, ${JSON.stringify(String(firstMissionEvent.year))});
    year.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(() => evaluate(`document.querySelector('.calendar-period-control select:first-of-type').value === ${JSON.stringify(String(firstMissionEvent.year))}`), "calendar year selection");
  await evaluate(`(() => {
    const month = document.querySelector('.calendar-period-control select:nth-of-type(2)');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(month, ${JSON.stringify(String(Number(firstMissionEvent.date.slice(5, 7)) - 1))});
    month.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await click(`.calendar-day[aria-label^=${JSON.stringify(firstMissionEvent.date)}]`);
  await waitFor(() => evaluate(`Boolean([...document.querySelectorAll('.calendar-activity-card')].find(card => card.textContent.includes(${JSON.stringify(firstMissionEvent.title)})))`), "calendar agenda for cached event");
  await evaluate(`([...document.querySelectorAll('.calendar-activity-card')].find(card => card.textContent.includes(${JSON.stringify(firstMissionEvent.title)}))).click()`);
  await waitFor(() => visible('.calendar-activity-panel .mission-row'), "calendar reuses archive detail");
  assert.equal(await evaluate(`performance.getEntriesByType('resource').filter(({name}) => name.endsWith(${JSON.stringify(firstMissionEvent.detailPath)})).length`), detailRequestsBeforeCalendar, "Cross-view detail must not refetch");
  await evaluate("history.back()");
  await waitFor(() => visible('.event-row'), "history restores archive");
  assert.equal(await evaluate('location.pathname'), `${BASE_PATH}md/${encodeURIComponent(firstMissionEvent.id)}`);
  assert.equal(await visible('.detail-panel.is-open'), true);
  await evaluate("history.forward()");
  await waitFor(() => visible('.calendar-days'), "history forward restores calendar");
  await evaluate("history.back()");
  await waitFor(() => visible('.event-row'), "history back restores archive again");

  // Search typing replaces; discrete country changes push and clear selection.
  const beforeTyping = await evaluate("history.length");
  for (const text of [firstMissionEvent.city.slice(0, 1), firstMissionEvent.city.slice(0, 2), firstMissionEvent.city]) {
    await evaluate(`(() => {
      const input = document.querySelector('#archive-search-input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(text)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitFor(() => evaluate(`new URLSearchParams(location.search).get('q') === ${JSON.stringify(text)} && location.pathname === '${BASE_PATH}archive'`), "search replaces and clears explicit selection");
    assert.equal(await evaluate('history.length'), beforeTyping, 'Typing never appends history entries');
  }
  assert.equal(await evaluate("history.length"), beforeTyping);
  await click('.intel-filter-button');
  await waitFor(() => visible('.filter-console'), "history filter console");
  await evaluate(`(() => {
    const country = document.querySelector('.filter-console label:nth-of-type(3) select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(country, ${JSON.stringify(firstMissionEvent.countryCode)});
    country.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(() => evaluate(`new URLSearchParams(location.search).get('country') === ${JSON.stringify(firstMissionEvent.countryCode)}`), "country pushes history");
  await evaluate("history.back()");
  await waitFor(() => evaluate("!new URLSearchParams(location.search).has('country')"), "country history back");
  assert.equal(await evaluate("document.querySelector('.filter-console label:nth-of-type(3) select').value"), 'all');
  await evaluate("history.forward()");
  await waitFor(() => evaluate(`document.querySelector('.filter-console label:nth-of-type(3) select').value === ${JSON.stringify(firstMissionEvent.countryCode)}`), "country history forward");

  // An archive-only URL must survive either order of dataset completion.
  const officialUrl = `${pageUrl}md/${encodeURIComponent(officialEvent.id)}`;
  const mainGate = pauseData(`${BASE_PATH}data/archive.json`);
  await send('Page.navigate', { url: officialUrl });
  await waitFor(() => mainGate.reached, 'paused main archive request');
  await waitFor(() => evaluate("performance.getEntriesByType('resource').some(({name}) => name.endsWith('/data/official-missions.json'))"), 'official archive precedes main archive');
  assert.equal(await evaluate('location.href'), officialUrl, 'No early URL normalization');
  mainGate.release();
  await waitFor(() => evaluate(`document.querySelector('.intel-workspace--archive #event-detail-title')?.textContent === ${JSON.stringify(officialEvent.title)}`), 'official deep link when main finishes last');
  assert.equal(await visible('.detail-panel.is-open'), true, 'Resource refresh opens the drawer');

  const mainFirstGate = pauseData(`${BASE_PATH}data/official-missions.json`);
  await send('Page.navigate', { url: officialUrl });
  await waitFor(() => mainFirstGate.reached, 'main-first official request paused');
  await waitFor(() => visible('.intel-tabs'), 'main archive precedes official archive');
  assert.equal(await evaluate('location.href'), officialUrl);
  const historyBeforeReady = await evaluate('history.length');
  mainFirstGate.release();
  await waitFor(() => evaluate(`document.querySelector('.intel-workspace--archive #event-detail-title')?.textContent === ${JSON.stringify(officialEvent.title)}`), 'official deep link when official finishes last');
  assert.equal(await evaluate('location.href'), officialUrl);
  assert.equal(await evaluate('history.length'), historyBeforeReady, 'Data completion does not append history');

  const officialGate = pauseData(`${BASE_PATH}data/official-missions.json`);
  await send('Page.navigate', { url: officialUrl });
  await waitFor(() => officialGate.reached, 'paused official archive request');
  await waitFor(() => visible('.intel-tabs'), 'main archive ready with official archive pending');
  assert.equal(await evaluate('location.href'), officialUrl, 'Pending official archive preserves selection');
  // A newer user choice must win, not the boot-time official event.
  await view(1);
  await waitFor(() => visible('.event-feed__rows button'), 'map during official load');
  await click('.event-feed__rows button');
  await waitFor(() => evaluate(`location.pathname === ${JSON.stringify(`${BASE_PATH}md/${encodeURIComponent(firstEvent.id)}`)}`), 'new explicit map choice');
  await view(2);
  officialGate.release();
  await waitFor(() => evaluate(`document.querySelector('.intel-workspace--archive #event-detail-title')?.textContent === ${JSON.stringify(firstEvent.title)}`), 'late official payload cannot override user choice');
  assert.equal(await evaluate('location.pathname'), `${BASE_PATH}archive`, 'Late data does not resurrect the previous resource route');

  // Selecting an archive-only activity and leaving clears only archive state.
  await send('Page.navigate', { url: `${officialUrl}?type=goruck&country=JP` });
  await waitFor(() => visible('.event-table, .empty-state'), 'archive-only filters loaded');
  await view(3);
  await waitFor(() => evaluate(`location.pathname === '${BASE_PATH}calendar'`), 'leaving archive-only state');
  assert.equal(await evaluate("new URLSearchParams(location.search).has('type') || new URLSearchParams(location.search).has('event')"), false);
  assert.equal(await evaluate("new URLSearchParams(location.search).get('country')"), 'JP');
  await evaluate('history.back()');
  await waitFor(() => evaluate(`document.querySelector('.intel-workspace--archive #event-detail-title')?.textContent === ${JSON.stringify(officialEvent.title)}`), 'history restores archive-only deep link and hidden selection');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('type')"), 'goruck');
  assert.equal(await visible('.detail-panel.is-open'), true, 'History restores the resource drawer');
  assert.deepEqual(errors, []);

  // Lightweight screen owners retain only the UI state that historically lived
  // in App. Heavy subtrees must still reset their component-local state.
  await send('Page.navigate', { url: `${pageUrl}archive` });
  await waitFor(() => visible('.load-more'), 'pagination baseline');
  await click('.load-more');
  await waitFor(() => evaluate("document.querySelectorAll('.event-row').length === 120"), 'second page');
  await view(1);
  await waitFor(() => visible('.event-feed'), 'map feed owner');
  await click('.map-activity-button');
  await evaluate("[...document.querySelectorAll('.event-feed nav button')].find(button => button.textContent.trim() === 'APAC').click()");
  await view(2);
  await waitFor(() => evaluate("document.querySelectorAll('.event-row').length === 120"), 'pagination survives view switch');
  await click('.intel-filter-button');
  await click('.filter-console header button');
  await waitFor(() => evaluate("document.querySelectorAll('.event-row').length === 60"), 'filter reset resets pagination');
  await view(1);
  await waitFor(() => visible('.event-feed nav button.is-active'), 'feed region retained');
  assert.equal(await evaluate("document.querySelector('.event-feed nav button.is-active').textContent.trim()"), 'APAC');
  assert.equal(await visible('.event-feed.is-open'), false, 'Explicit non-map navigation closes the feed');
  await view(3);
  await waitFor(() => visible('.calendar-days'), 'calendar lifecycle baseline');
  const initialCalendarYear = await evaluate("document.querySelector('.calendar-period-control select').value");

  // Real wheel input must be cancellable; listener updates and StrictMode
  // remounts must not accumulate handlers or leave them on detached panels.
  const calendarPeriod = () => evaluate("[...document.querySelectorAll('.calendar-period-control select')].map(select => select.value)");
  const calendarYears = await evaluate("[...document.querySelector('.calendar-period-control select').options].map(option => option.value)");
  assert.ok(calendarYears.length > 1);
  async function setCalendarPeriod(year, month) {
    for (const [index, value] of [[0, year], [1, String(month)]]) {
      await evaluate(`(() => {
        const select = document.querySelectorAll('.calendar-period-control select')[${index}];
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(value)});
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await waitFor(() => evaluate(`document.querySelectorAll('.calendar-period-control select')[${index}].value === ${JSON.stringify(value)}`), 'calendar wheel period setup');
    }
  }
  await evaluate(`(() => {
    window.__calendarWheelEvents = [];
    document.addEventListener('wheel', (event) => {
      if (event.target.closest?.('.calendar-panel')) {
        window.__calendarWheelEvents.push({ cancelled: event.defaultPrevented, trusted: event.isTrusted });
      }
    }, { passive: true });
  })()`);
  async function calendarWheel(deltaY) {
    const before = await evaluate('window.__calendarWheelEvents.length');
    const point = await evaluate(`(() => {
      const panel = document.querySelector('.calendar-panel');
      panel.scrollIntoView({ block: 'start' });
      const rect = panel.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + 40 };
    })()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY });
    await waitFor(() => evaluate(`window.__calendarWheelEvents.length > ${before}`), 'native calendar wheel event');
    const event = await evaluate('window.__calendarWheelEvents.at(-1)');
    assert.equal(event.trusted, true, 'CDP must deliver actual browser input');
    return event.cancelled;
  }
  async function wheelListeners(objectId) {
    const { listeners } = await send('DOMDebugger.getEventListeners', { objectId });
    return listeners.filter(({ type }) => type === 'wheel');
  }
  await setCalendarPeriod(initialCalendarYear, 6);
  const { result: panelObject } = await send('Runtime.evaluate', { expression: "document.querySelector('.calendar-panel')" });
  const listeners = await wheelListeners(panelObject.objectId);
  assert.equal(listeners.length, 1, 'Exactly one wheel listener is attached');
  assert.equal(listeners[0].passive, false, 'The month gesture can prevent default scrolling');
  assert.equal(await calendarWheel(5), false, 'Small deltas keep their native behavior');
  assert.deepEqual(await calendarPeriod(), [initialCalendarYear, '6']);
  assert.equal(await calendarWheel(-100), true, 'Handled wheel input prevents scrolling');
  await waitFor(() => evaluate("document.querySelectorAll('.calendar-period-control select')[1].value === '5'"), 'wheel selects previous month');
  await sleep(350);
  assert.deepEqual(await evaluate(`(() => {
    const panel = document.querySelector('.calendar-panel');
    return Array.from({ length: 3 }, () => {
      const event = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
      panel.dispatchEvent(event);
      return event.defaultPrevented;
    });
  })()`), [true, true, true], 'A synchronous burst remains cancelled while locked');
  await waitFor(() => evaluate("document.querySelectorAll('.calendar-period-control select')[1].value === '6'"), 'one month per burst');
  await sleep(350);
  assert.deepEqual(await calendarPeriod(), [initialCalendarYear, '6'], 'The burst must not queue extra month changes');
  assert.equal(await calendarWheel(100), true);
  await waitFor(() => evaluate("document.querySelectorAll('.calendar-period-control select')[1].value === '7'"), 'wheel unlocks after 320ms');
  await sleep(350);
  await setCalendarPeriod(calendarYears.at(-1), 0);
  assert.equal(await calendarWheel(-100), false, 'Lower boundary does not consume the wheel');
  assert.deepEqual(await calendarPeriod(), [calendarYears.at(-1), '0']);
  await setCalendarPeriod(calendarYears[0], 11);
  assert.equal(await calendarWheel(100), false, 'Upper boundary does not consume the wheel');
  assert.deepEqual(await calendarPeriod(), [calendarYears[0], '11']);
  await setCalendarPeriod(calendarYears[0], 0);
  assert.equal(await calendarWheel(-100), true);
  await waitFor(() => evaluate(`document.querySelector('.calendar-period-control select').value === ${JSON.stringify(calendarYears[1])}`), 'wheel crosses the year boundary');
  assert.deepEqual(await calendarPeriod(), [calendarYears[1], '11']);
  assert.equal((await wheelListeners(panelObject.objectId)).length, 1, 'Period updates do not duplicate listeners');
  await view(2); await waitFor(() => visible('.event-row'), 'wheel panel unmounted');
  assert.equal((await wheelListeners(panelObject.objectId)).length, 0, 'Unmount removes the listener from the old panel');
  await send('Runtime.releaseObject', { objectId: panelObject.objectId });
  await view(3); await waitFor(() => visible('.calendar-days'), 'wheel panel remounted');
  const { result: remountedPanel } = await send('Runtime.evaluate', { expression: "document.querySelector('.calendar-panel')" });
  const remountedListeners = await wheelListeners(remountedPanel.objectId);
  assert.equal(remountedListeners.length, 1);
  assert.equal(remountedListeners[0].passive, false);
  await send('Runtime.releaseObject', { objectId: remountedPanel.objectId });
  assert.equal(await evaluate("document.querySelector('.calendar-period-control select').value"), initialCalendarYear);
  const wheelPassiveWarnings = browserLogs.filter(({ text }) => /preventDefault.*passive|passive.*preventDefault/i.test(text));
  assert.deepEqual(wheelPassiveWarnings, [], 'Browser must not report passive-listener interventions');

  await evaluate(`(() => {
    const year = document.querySelector('.calendar-period-control select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(year, year.options[year.options.length - 1].value);
    year.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(() => evaluate(`document.querySelector('.calendar-period-control select').value !== ${JSON.stringify(initialCalendarYear)}`), 'calendar older year');
  await view(2); await waitFor(() => visible('.event-row'), 'calendar unmounted');
  await view(3); await waitFor(() => visible('.calendar-days'), 'calendar remounted');
  assert.equal(await evaluate("document.querySelector('.calendar-period-control select').value"), initialCalendarYear, 'Calendar period resets on unmount');
  assert.equal(await evaluate("document.querySelector('.calendar-type-control button.is-active').getAttribute('aria-pressed')"), 'true');

  // Capture resource/path checks before intentional render failures.
  const resources = await evaluate("performance.getEntriesByType('resource').map(entry => entry.name)");
  const localResources = resources.map((name) => new URL(name)).filter((url) => url.origin === origin);
  assert.ok(localResources.some((url) => url.pathname === `${BASE_PATH}data/archive.json`));
  if (!dev) {
    for (const url of localResources) assert.ok(url.pathname.startsWith(BASE_PATH), `Resource escaped the mount: ${url.pathname}`);
  }
  // Real React boundary wiring, not source matching. Fixtures are intercepted
  // only inside this browser; no published JSON is changed.
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  corruptDetail = true;
  await send('Page.navigate', { url: `${pageUrl}archive` });
  await waitFor(() => visible('.event-row'), 'archive before intentional render failure');
  await click(`.event-row:nth-child(${firstMissionRow + 1})`);
  await waitFor(() => visible('.intel-workspace--archive .view-crash__actions'), 'archive render-error isolation');
  assert.equal(await visible('.intel-tabs'), true, 'Archive crash leaves navigation intact');
  await view(3); await waitFor(() => visible('.calendar-days'), 'another view survives archive render failure');
  corruptArchive = 'map';
  await send('Page.navigate', { url: pageUrl });
  await waitFor(() => visible('.intel-workspace--map .view-crash__actions'), 'map render-error isolation');
  corruptArchive = null;
  assert.equal(await visible('.intel-tabs'), true, 'Map crash leaves navigation intact');
  corruptArchive = 'app';
  await send('Page.navigate', { url: pageUrl });
  await waitFor(() => visible('.boot-screen--error[role="alert"]'), 'top-level render fallback');
  corruptArchive = null;
  assert.ok(await evaluate("document.querySelector('.boot-screen--error button')?.textContent.trim().length > 0"));
  // Reloading clean data must recover the root and keep the mobile default.
  await send('Page.navigate', { url: pageUrl });
  await waitFor(() => visible('.map-state--unavailable'), 'root recovery after render failure');
  assert.equal(await visible('.event-feed.is-open'), false, 'Fresh phone map stays unobstructed');
  await writeFile(join(artifacts, "results.json"), JSON.stringify({
    result: "pass", mode: workers ? "workers" : dev ? "development" : "production", pageUrl, exceptions: errors, cancelledInterceptions, labelReloadAborts, initialDataRequests,
    checks: ["map Worker", "rendered multilingual label pixels, rapid selections and label-only tile re-layout", "popup", "localized cities and language menu without map remount", "marker selection", "zoom controls", "localized legal footer and links", "mobile resize", "four views", "remount", "WebGL2 fallback", "pathname page/resource routing, Unicode filtered deep-link refresh and invalid route/ID normalization", "map A/B/root Back/Forward selection and drawer restoration", "main/official deep links in both completion orders", "new selection supersedes pending boot link", "search replace and country push", "history back/forward", "archive-only state cleanup", "cross-view detail cache", "pagination/feed/calendar lifetimes", "real calendar wheel cancellation, throttling, bounds and listener cleanup", "actual map/archive/root render-error isolation"],
    externalTiles: "synthetic multilingual vector tiles", glyphs: "local browser fonts", images: "blocked",
  }, null, 2));
  console.log(`Browser smoke passed. Artifacts: ${artifacts}`);
} catch (error) {
  const body = ws?.readyState === WebSocket.OPEN ? await evaluate("document.body.innerText").catch(String) : "";
  await writeFile(join(artifacts, "errors.json"), JSON.stringify({ message: String(error), errors, consoleMessages, browserLogs, body }, null, 2));
  console.error(`Browser smoke failed. Artifacts: ${artifacts}`);
  throw error;
} finally {
  for (const gate of heldData.values()) gate.release();
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

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
const { events: [firstEvent] } = JSON.parse(await readFile(resolve(root, "public/data/archive.json"), "utf8"));
const firstCityZh = displayCityName(firstEvent.countryCode, firstEvent.city, "zh");
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
  await send("Fetch.enable", { patterns: [{ urlPattern: "*tiles.openfreemap.org/*" }, { urlPattern: "*api.bannergress.com/*" }] });
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

  const point = await evaluate(`(() => {
    const r = document.querySelector('.mission-map canvas').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await waitFor(() => visible(".mission-map-popup__body"), "marker popup");
  assert.equal(await evaluate("document.querySelector('.mission-map-popup__body strong').textContent"), firstCityZh);
  assert.equal(await evaluate("document.querySelector('.selection-strip strong').textContent"), firstCityZh);
  await evaluate("window.__smokeCanvas = document.querySelector('.mission-map canvas')");
  await selectLanguage("en");
  assert.equal(await evaluate("document.querySelector('.mission-map-popup__body strong').textContent"), firstEvent.city);
  assert.ok(await evaluate("window.__smokeCanvas === document.querySelector('.mission-map canvas')"));
  await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
  await waitFor(() => visible(".detail-panel.is-open"), "marker selection");
  await click(".detail-panel__heading button");
  await click(".map-control-dock button:first-child");
  await click(".map-control-dock button:nth-child(2)");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  assert.ok(await evaluate("document.querySelector('.mission-map canvas').getBoundingClientRect().width <= 390"));
  assert.ok(await visible(".maplibregl-ctrl-attrib"));
  assert.ok(await evaluate(`(() => {
    const footer = document.querySelector('.intel-statusbar').getBoundingClientRect();
    const content = [
      document.querySelector('.intel-statusbar__legal'),
      ...document.querySelectorAll('.intel-statusbar__links a'),
    ].map((element) => element.getBoundingClientRect());
    return content.every((rect) =>
      rect.left >= 0 && rect.right <= innerWidth && rect.top >= footer.top && rect.bottom <= footer.bottom
    );
  })()`), "Legal notices and footer links remain visible on mobile");
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
    "document.querySelector('.intel-statusbar__legal').textContent.includes('Data is sourced from Bannergress')",
  ));
  const screenshot = await send("Page.captureScreenshot");
  await writeFile(join(artifacts, "map-mobile.png"), Buffer.from(screenshot.data, "base64"));
  await view(2);
  await waitFor(() => visible(".event-row"), "archive");
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
    "document.querySelector('.intel-statusbar__legal').textContent.includes('数据来源于 Bannergress')",
  ));
  await click(".event-row");
  await waitFor(() => visible(".mission-row"), "mission details");
  assert.equal(await evaluate("document.querySelector('#event-detail-title').textContent"), firstCityZh);
  await view(3);
  await waitFor(() => visible(".calendar-days"), "calendar");
  assert.ok(await evaluate(`document.querySelector('.calendar-days').textContent.includes(${JSON.stringify(firstCityZh)})`));
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
  await click(".event-row");
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

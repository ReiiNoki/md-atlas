// Local-only integration test; no real data fetch, backend, dependency or deployment.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { BASE_PATH } from "../site.config.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const chromePath = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(existsSync);
assert.ok(chromePath, "Set CHROME_PATH to Chrome/Chromium");
assert.equal(typeof WebSocket, "function", "Node 22+ required");
const artifacts = await mkdtemp(join(tmpdir(), "md-atlas-lifecycle-"));
const profile = join(artifacts, "profile");
const server = await createServer({
  root, configFile: false, base: BASE_PATH, appType: "custom", logLevel: "silent",
  server: { host: "127.0.0.1", port: 0 },
  plugins: [react(), { name: "lifecycle-fixture", configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      if (!req.url.includes("__lifecycle")) return next();
      const html = `<!doctype html><html><head><title>Local lifecycle test</title></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/data-lifecycle.jsx"></script></body></html>`;
      vite.transformIndexHtml(req.url, html).then((result) => {
        res.setHeader("Content-Type", "text/html"); res.end(result);
      }, next);
    });
  } }],
});
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const chrome = spawn(chromePath, ["--headless=new", "--remote-debugging-port=0", "--no-first-run",
  "--no-default-browser-check", "--disable-background-networking", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ws;
let id = 0;
const pending = new Map();
const errors = [];
const consoleMessages = [];
let startupError;
chrome.on("error", (error) => { startupError = error; });
function send(method, params = {}) {
  const key = ++id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(key, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
}
async function evaluate(expression) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails));
  return result.value;
}
async function wait(check, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (startupError) throw startupError;
    if (await check()) return;
    await sleep(50);
  }
  throw new Error(`Timed out: ${label}`);
}
const calls = () => evaluate("__lifecycle.calls()");
const snapshot = (name = "dataset") => evaluate(`__lifecycle.snapshots[${JSON.stringify(name)}]`);
const status = (value, name = "dataset") => wait(async () => (await snapshot(name))?.status === value, `${name}: ${value}`);
const complete = (index, data, code = 200) => evaluate(`__lifecycle.complete(${index}, ${JSON.stringify(data)}, ${code})`);
async function activeIndices(base) {
  return (await calls()).flatMap((call, index) => index >= base && !call.aborted ? [index] : []);
}
async function mount(type, expectedRequests = 1) {
  const base = (await calls()).length;
  await evaluate(`__lifecycle.mount(${JSON.stringify(type)})`);
  await wait(async () => (await activeIndices(base)).length === expectedRequests, `${type} active requests`);
  await status("loading");
  return { base, indices: await activeIndices(base) };
}
try {
  await wait(() => existsSync(join(profile, "DevToolsActivePort")), "Chrome startup");
  const port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0];
  const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
  ws.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const task = pending.get(message.id);
      if (!task) return;
      clearTimeout(task.timer); pending.delete(message.id);
      if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
    else if (message.method === "Runtime.consoleAPICalled") consoleMessages.push(message.params);
  });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: `${origin}${BASE_PATH}__lifecycle` });
  await wait(() => evaluate("Boolean(window.__lifecycle?.mount && __lifecycle.snapshots.dataset)"), "fixture ready");
  assert.equal((await calls()).length, 0, "Disabled hooks must not fetch");
  await evaluate("__lifecycle.enable(true)");
  await wait(async () => (await calls()).length === 1, "first search request");
  await complete(0, { first: "cached" }); await status("ready");
  await evaluate("__lifecycle.enable(false)"); await sleep(50);
  await evaluate("__lifecycle.enable(true)"); await sleep(50);
  assert.equal((await calls()).length, 1, "Successful dataset survives disabling");

  const strict = await mount("search");
  assert.equal((await calls()).slice(strict.base).filter(({ aborted }) => aborted).length, 1, "StrictMode cancels the replayed request");
  await complete(strict.indices[0], { latest: "strict" }); await status("ready");
  await complete(strict.base, { stale: "strict" }); await sleep(50);
  assert.deepEqual((await snapshot()).data, { latest: "strict" });

  const cancelled = await mount("search");
  await evaluate("__lifecycle.enable(false)"); await status("idle");
  assert.equal((await calls())[cancelled.indices[0]].aborted, true);
  await evaluate("__lifecycle.enable(true)");
  await wait(async () => (await activeIndices(cancelled.base)).length === 1, "re-enabled request");
  const current = (await activeIndices(cancelled.base))[0];
  await complete(cancelled.indices[0], { stale: "cancelled" }); await sleep(50);
  assert.equal((await snapshot()).data, null);
  await complete(current, {}, 503); await status("error");
  assert.equal((await snapshot()).error, "HTTP 503");
  await evaluate("__lifecycle.enable(false)"); await status("idle");
  const reenableBase = (await calls()).length;
  await evaluate("__lifecycle.enable(true)"); await status("loading");
  assert.equal((await snapshot()).error, "", "Re-enabling a failed request clears the old error");
  await wait(async () => (await activeIndices(reenableBase)).length === 1, "failed dataset re-enabled");
  await complete((await activeIndices(reenableBase))[0], {}, 503); await status("error");
  const retryBase = (await calls()).length;
  await evaluate("__lifecycle.retry()"); await status("loading");
  await wait(async () => (await activeIndices(retryBase)).length === 1, "retry request");
  await complete((await activeIndices(retryBase))[0], { recovered: true }); await status("ready");

  const official = await mount("official", 2);
  const officialPayload = { meta: { eventCount: 1 }, events: [{ id: "extra", activityType: "goruck", detailPath: "data/official-mission-events/extra.json" }] };
  const officialCalls = await calls();
  const archiveIndex = official.indices.find((index) => officialCalls[index].path.endsWith("/official-missions.json"));
  const searchIndex = official.indices.find((index) => officialCalls[index].path.endsWith("/official-mission-search-index.json"));
  await complete(archiveIndex, officialPayload); await sleep(50);
  assert.equal((await snapshot()).data, null, "The additional archive and index publish atomically");
  await complete(searchIndex, { extra: "missions" }); await status("ready");
  assert.equal((await snapshot()).data.archive.events[0].id, "extra");
  const failedOfficial = await mount("official", 2);
  const failedCalls = await calls();
  for (const index of failedOfficial.indices) {
    const isArchive = failedCalls[index].path.endsWith('/official-missions.json');
    await complete(index, isArchive ? officialPayload : {}, isArchive ? 200 : 404);
  }
  await status("error");
  assert.equal((await snapshot()).data, null, "A missing index must not publish partial data");
  const officialRetryBase = (await calls()).length;
  await evaluate("__lifecycle.retry()"); await status("loading");
  await wait(async () => (await activeIndices(officialRetryBase)).length === 2, "official retry pair");
  const retriedCalls = await calls();
  for (const index of await activeIndices(officialRetryBase)) await complete(index,
    retriedCalls[index].path.endsWith('/official-missions.json') ? officialPayload : { extra: 'missions' });
  await status("ready");

  const xm = await mount("xm");
  await complete(xm.indices[0], [{ id: "xm", type: "xm-anomaly", series: "Test", title: "XM Anomaly: Test", date: "2024-01-01", siteRole: "site", status: "completed" }]);
  await status("ready"); assert.equal((await snapshot()).data[0].year, 2024);
  const analytics = await mount("analytics");
  await complete(analytics.indices[0], { events: [["md", 2024, "City", "Japan", "JP", "APAC", "md-standard", 0, []]] });
  await status("ready"); assert.equal((await snapshot()).data.events[0].id, "md");
  const archive = await mount("archive");
  await complete(archive.indices[0], { events: [{ id: "md" }] }); await status("ready");

  const detailsBase = (await calls()).length;
  await evaluate("__lifecycle.details(['a', 'a'])");
  await status("loading", "detail-0"); await status("loading", "detail-1");
  await wait(async () => (await activeIndices(detailsBase)).length === 1, "concurrent detail deduplication");
  const detailIndex = (await activeIndices(detailsBase))[0];
  await evaluate("__lifecycle.details([null, 'a'])"); await status("idle", "detail-0");
  assert.equal((await calls())[detailIndex].aborted, false, "One subscriber cannot cancel another");
  await complete(detailIndex, { id: "a", missions: [] }); await status("ready", "detail-1");
  const beforeReuse = (await calls()).length;
  await evaluate("__lifecycle.details(['a', null])"); await status("ready", "detail-0");
  assert.equal((await calls()).length, beforeReuse, "Another consumer reuses cached detail");
  await evaluate("__lifecycle.details(['b', null])"); await status("loading", "detail-0");
  await wait(async () => (await activeIndices(beforeReuse)).length === 1, "detail B request");
  const b = (await activeIndices(beforeReuse))[0];
  await evaluate("__lifecycle.details(['c', null])"); await status("loading", "detail-0");
  await wait(async () => (await activeIndices(beforeReuse)).length === 1 && (await activeIndices(beforeReuse))[0] !== b, "detail C supersedes B");
  assert.equal((await calls())[b].aborted, true);
  await complete(b, { id: "b", missions: ["stale"] }); await sleep(50);
  assert.equal((await snapshot("detail-0")).data, null);
  await complete((await activeIndices(beforeReuse))[0], { id: "c", missions: [] }); await status("ready", "detail-0");
  assert.equal((await snapshot("detail-0")).data.id, "c");
  const failureBase = (await calls()).length;
  await evaluate("__lifecycle.details(['d', null])"); await status('loading', 'detail-0');
  await wait(async () => (await activeIndices(failureBase)).length === 1, 'failing detail request');
  await complete((await activeIndices(failureBase))[0], {}, 500); await status('error', 'detail-0');
  await evaluate("__lifecycle.details([])"); await sleep(50);
  const reopenDetailBase = (await calls()).length;
  await evaluate("__lifecycle.details(['d'])"); await status('loading', 'detail-0');
  await wait(async () => (await activeIndices(reopenDetailBase)).length === 1, 'reopening failed detail retries');
  await complete((await activeIndices(reopenDetailBase))[0], { id: 'd', missions: [] }); await status('ready', 'detail-0');
  assert.deepEqual(errors, []);
  await writeFile(join(artifacts, "results.json"), JSON.stringify({ result: "pass", mockedRequests: await calls(), errors }, null, 2));
  console.log(`Data lifecycle checks passed. Artifacts: ${artifacts}`);
} catch (error) {
  await writeFile(join(artifacts, "errors.json"), JSON.stringify({ message: String(error), errors, consoleMessages, body: ws?.readyState === WebSocket.OPEN ? await evaluate('document.documentElement.outerHTML').catch(String) : '', calls: ws?.readyState === WebSocket.OPEN ? await calls().catch(() => []) : [] }, null, 2));
  console.error(`Data lifecycle checks failed. Artifacts: ${artifacts}`);
  throw error;
} finally {
  if (ws?.readyState === WebSocket.OPEN) { try { await send("Browser.close"); } catch { /* already closed */ } ws.close(); }
  chrome.kill(); await server.close();
  for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error("Test closed")); }
}

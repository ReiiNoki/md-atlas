// HTTP checks against the actual local Workers static-assets runtime.
// Build first. No Cloudflare login, remote bindings, DNS edits or deployment.
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_PATH, WORKERS_ASSETS_DIRECTORY } from "../site.config.js";
import { startWorkersPreview } from "./workers-preview.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = await mkdtemp(join(tmpdir(), "md-atlas-workers-http-"));
const server = await startWorkersPreview(artifacts);
const checks = [];
try {
  const index = await readFile(join(root, "dist/index.html"));
  assert.deepEqual(await readFile(join(root, WORKERS_ASSETS_DIRECTORY, "index.html")), index);
  async function asset(path, file, type) {
    const response = await fetch(server.origin + path, { signal: AbortSignal.timeout(10000), redirect: "manual" });
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("Content-Type"), type, path);
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff", path);
    assert.equal(response.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin", path);
    assert.equal(response.headers.get("Permissions-Policy"), "geolocation=(self)", path);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(join(root, file)), path);
    checks.push(path);
    return response;
  }
  await asset(BASE_PATH, "dist/index.html", /text\/html/);
  await asset(`${BASE_PATH}?from=local-test&lang=en`, "dist/index.html", /text\/html/);
  checks.push("root query loads directly without a prefix or redirect");
  const eventFile = (await readdir(join(root, "public/data/events"))).find((name) => name.endsWith(".json"));
  for (const file of ["data/archive.json", "data/analytics.json", `data/events/${eventFile}`]) {
    const response = await asset(BASE_PATH + file, "public/" + file, /application\/json/);
    const age = file.startsWith("data/events/") ? 3600 : 300;
    assert.equal(response.headers.get("Cache-Control"), `public, max-age=${age}, must-revalidate`);
  }
  const assets = await readdir(join(root, "dist/assets"));
  for (const pattern of [/^index-.*\.js$/, /^MissionMap-.*\.js$/, /^maplibre-gl-worker-.*\.js$/, /\.css$/, /\.woff2$/]) {
    const file = assets.find((name) => pattern.test(name));
    assert.ok(file, String(pattern));
    const type = file.endsWith(".js") ? /javascript/ : file.endsWith(".css") ? /text\/css/ : /font\/woff2/;
    const response = await asset(`${BASE_PATH}assets/${file}`, `dist/assets/${file}`, type);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  }
  await asset(`${BASE_PATH}favicon.svg`, "public/favicon.svg", /image\/svg\+xml/);
  await asset(`${BASE_PATH}event-placeholder.webp`, "public/event-placeholder.webp", /image\/webp/);
  const credits = await fetch(`${server.origin}${BASE_PATH}city-name-credits.html`, { redirect: "manual" });
  assert.equal(credits.status, 307);
  const canonical = new URL(credits.headers.get("Location"), server.origin);
  assert.equal(canonical.href, `${server.origin}${BASE_PATH}city-name-credits`);
  await credits.body?.cancel();
  await asset(canonical.pathname, "public/city-name-credits.html", /text\/html/);
  assert.equal(new URL("./", canonical).pathname, BASE_PATH, "Attribution return link stays in this app");
  for (const route of ["archive", "calendar", "data", "md/md-2026-asahikawa-ee08", `md/${encodeURIComponent("md-2026-佛山-1394")}?year=2026&country=JP`, "md/nonexistent-event", "nested/local-spa-probe"]) {
    const navigation = await fetch(`${server.origin}${BASE_PATH}${route}`, {
      headers: { "Sec-Fetch-Mode": "navigate", Accept: "text/html" }, redirect: "manual",
    });
    assert.equal(navigation.status, 200, route);
    assert.deepEqual(Buffer.from(await navigation.arrayBuffer()), index, route);
    checks.push(`SPA shell at ${route}`);
  }
  // Local workers.dev-style serving has no zone routing. Do not confuse these
  // checks with proof that the real domain's homepage/zone is configured safely.
  for (const path of ["package.json", "wrangler.jsonc", "_headers"]) {
    const response = await fetch(server.origin + BASE_PATH + path);
    const body = Buffer.from(await response.arrayBuffer());
    assert.ok(response.status === 404 || (response.status === 200 && body.equals(index)), path);
  }
  const result = { result: "pass", origin: server.origin, checks, zoneRouting: "not simulated; dedicated custom domain checked by unit tests", deployment: false };
  await writeFile(join(artifacts, "results.json"), JSON.stringify(result, null, 2));
  console.log(`Workers HTTP checks passed. Artifacts: ${artifacts}`);
} finally {
  await server.stop();
}

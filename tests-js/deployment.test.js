import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_PATH, WORKERS_ASSETS_DIRECTORY } from "../site.config.js";
import { prepareWorkersAssets } from "../scripts/prepare-workers-assets.mjs";
import viteConfig from "../vite.config.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(await readFile(join(root, "wrangler.jsonc"), "utf8"));

test("project identifiers consistently use the atlas spelling", async () => {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
  assert.equal(manifest.name, "md-atlas");
  assert.equal(config.name, manifest.name);
  assert.equal(lock.name, manifest.name);
  assert.equal(lock.packages[""].name, manifest.name);
  assert.equal(manifest.repository.url, `git+https://github.com/ReiiNoki/${manifest.name}.git`);
  assert.equal(BASE_PATH, "/");
});

test("Vite and assets configuration agree on the public path without a runtime Worker", () => {
  assert.equal(BASE_PATH, "/");
  assert.equal(viteConfig.base, BASE_PATH);
  assert.equal(resolve(root, config.assets.directory), resolve(root, WORKERS_ASSETS_DIRECTORY));
  assert.equal(config.assets.not_found_handling, "single-page-application");
  assert.equal(config.workers_dev, true);
  assert.equal(config.main, undefined);
  assert.equal(config.assets.binding, undefined);
});

test("the dedicated custom domain owns all paths without capturing the parent website", () => {
  const host = "md-atlas.reiinoki.dpdns.org";
  assert.deepEqual(config.routes, [{ pattern: host, custom_domain: true }]);
  const matches = (url) => config.routes.some((route) => route.custom_domain && new URL(url).hostname === route.pattern);
  for (const path of ["/", "/?lang=en", "/archive?year=2026&country=JP", "/calendar", "/data", "/md/md-2026-asahikawa-ee08", `/md/${encodeURIComponent("md-2026-佛山-1394")}`, "/assets/app.js", "/data/archive.json"]) {
    assert.equal(matches(`https://${host}${path}`), true, path);
  }
  for (const other of ["reiinoki.dpdns.org", "other.reiinoki.dpdns.org", "md-atlas-other.reiinoki.dpdns.org"]) {
    assert.equal(matches(`https://${other}/`), false, other);
  }
});

test("canonical and social metadata use the root-domain URLs", async () => {
  const html = await readFile(join(root, "index.html"), "utf8");
  assert.ok(html.includes('rel="canonical" href="https://md-atlas.reiinoki.dpdns.org/"'));
  assert.ok(html.includes('property="og:url" content="https://md-atlas.reiinoki.dpdns.org/"'));
  assert.ok(html.includes('content="https://md-atlas.reiinoki.dpdns.org/og-card.png"'));
  assert.equal(html.includes("reiinoki.dpdns.org/md-atlas/"), false);
});

test("cache rules use the same root paths as generated asset URLs", async () => {
  const headers = await readFile(join(root, "public/_headers"), "utf8");
  const paths = headers.split(/\r?\n/).filter((line) => line.startsWith("/"));
  assert.deepEqual(paths, [
    `${BASE_PATH}assets/*`, `${BASE_PATH}data/archive.json`,
    `${BASE_PATH}data/analytics.json`, `${BASE_PATH}data/events/*`, "/*",
  ]);
});

test("packaging keeps files at the domain root and removes stale prefixed output", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "md-atlas-assets-test-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const source = join(temp, "dist"), destination = join(temp, "generated");
  await mkdir(join(source, "data"), { recursive: true });
  const index = '<script src="/assets/app.js"></script>';
  await writeFile(join(source, "index.html"), index);
  await writeFile(join(source, "data/archive.json"), '{"synthetic":true}');
  await writeFile(join(source, "_headers"), "/data/*\n  Cache-Control: public\n");
  await mkdir(destination);
  await writeFile(join(destination, "stale.txt"), "old generated file");
  await mkdir(join(destination, "md-atlas"));
  await writeFile(join(destination, "md-atlas/index.html"), "old prefixed shell");
  assert.equal(await prepareWorkersAssets(source, destination), 3);
  assert.deepEqual((await readdir(destination)).sort(), ["_headers", "data", "index.html"]);
  assert.equal(await readFile(join(destination, "index.html"), "utf8"), index);
  assert.deepEqual(await readFile(join(destination, "data/archive.json")), await readFile(join(source, "data/archive.json")));
  assert.deepEqual(await readFile(join(destination, "_headers")), await readFile(join(source, "_headers")));
  assert.equal(await readFile(join(source, "index.html"), "utf8"), index);
});

test("invalid paths, missing index, overlaps and symlinks fail before replacing previous output", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "md-atlas-assets-invalid-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const source = join(temp, "dist"), destination = join(temp, "generated");
  await mkdir(source); await mkdir(destination);
  await writeFile(join(destination, "keep.txt"), "previous build");
  await assert.rejects(prepareWorkersAssets(source, destination), /missing index/);
  await assert.rejects(prepareWorkersAssets(source, join(source, "nested")), /overlap/);
  await assert.rejects(prepareWorkersAssets(source, temp), /overlap/);
  await writeFile(join(source, "index.html"), "synthetic");
  for (const path of ["/../", "/md-atlas/../../", "/md-atlas", "//", "/md-atlas//", "/%2e%2e/", "https://example.com/"]) {
    await assert.rejects(prepareWorkersAssets(source, destination, path), /normalized directory segments/);
  }
  // Windows directory junctions do not require symlink/developer-mode privileges.
  await symlink(destination, join(source, "linked"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(prepareWorkersAssets(source, destination), /Unsupported build entry/);
  assert.equal(await readFile(join(destination, "keep.txt"), "utf8"), "previous build");
});

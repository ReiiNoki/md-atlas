import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/", import.meta.url));
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
}
// Shared deployment constants are also imported by the runtime URL parser.
const siteConfig = resolve(root, "../site.config.js");
const sourceFiles = await files(root);
const sources = [...sourceFiles.filter((file) => [".js", ".jsx"].includes(extname(file))), siteConfig];
const allFiles = new Set([...sourceFiles, siteConfig]);
const graph = new Map();
const label = (file) => relative(root, file).replaceAll("\\", "/");
for (const file of sources) {
  const content = await readFile(file, "utf8");
  const edges = [];
  for (const match of content.matchAll(/(from\s*|import\s*\(\s*|import\s*)["']([^"']+)["']/g)) {
    const specifier = match[2];
    if (!specifier.startsWith(".")) {
      if (label(file).startsWith("domain/")) assert.equal(["react", "react-dom"].includes(specifier), false);
      continue;
    }
    const base = resolve(dirname(file), specifier);
    const target = [base, `${base}.js`, `${base}.jsx`].find((candidate) => allFiles.has(candidate));
    assert.ok(target, `${label(file)} has unresolved import ${specifier}`);
    edges.push({ file: target, dynamic: match[1].includes("(") });
  }
  graph.set(file, edges);
}

test("local imports resolve and the source module graph has no cycles", () => {
  const done = new Set();
  const visit = (file, stack = []) => {
    assert.equal(stack.includes(file), false, `Cycle: ${[...stack, file].map(label).join(" -> ")}`);
    if (done.has(file)) return;
    for (const edge of graph.get(file) ?? []) visit(edge.file, [...stack, file]);
    done.add(file);
  };
  sources.forEach((file) => visit(file));
});

test("domain, shared UI, data and features respect dependency direction", () => {
  for (const [file, edges] of graph) {
    const name = label(file);
    for (const edge of edges) {
      const target = label(edge.file);
      if (name.startsWith("domain/")) assert.equal(/^(app|data|features|components|shared)\//.test(target), false, `${name} -> ${target}`);
      if (name.startsWith("shared/")) assert.equal(/^(app|data|features|components)\//.test(target), false, `${name} -> ${target}`);
      if (name.startsWith("data/")) assert.equal(/^(app|features|components)\//.test(target), false, `${name} -> ${target}`);
      if (name.startsWith("features/")) {
        assert.equal(target.startsWith("app/"), false, `${name} -> ${target}`);
        if (target.startsWith("features/")) assert.equal(name.split("/")[1], target.split("/")[1], `${name} -> ${target}`);
      }
    }
  }
});

test("calendar, statistics and map implementations are not eager entry dependencies", () => {
  const eager = new Set();
  function visit(file) {
    if (eager.has(file)) return;
    eager.add(file);
    for (const edge of graph.get(file) ?? []) if (!edge.dynamic) visit(edge.file);
  }
  visit(resolve(root, "main.jsx"));
  for (const name of ["features/calendar/CalendarView.jsx", "features/analytics/DataView.jsx", "features/map/MissionMap.jsx", "domain/statistics.js"]) {
    assert.equal(eager.has(resolve(root, name)), false, `${name} entered the initial dependency graph`);
  }
});

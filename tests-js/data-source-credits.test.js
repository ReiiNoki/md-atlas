import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const credits = await readFile(new URL("../public/data-source-credits.html", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

test("published MDTrace statistics retain attribution, licence and transformation notices", () => {
  for (const text of [credits, readme]) {
    assert.ok(text.includes("MDTrace (szres)"));
    assert.ok(text.includes("https://github.com/szres/MDtrace-Data"));
    assert.ok(text.includes("https://creativecommons.org/licenses/by/4.0/"));
  }
  assert.ok(readme.includes("/data-source-credits.html"));
  assert.ok(credits.includes("51c740174110e958a895dbe326cfdcb5bd0cd3e7"));
  assert.ok(credits.includes("/data/snapshots.csv"));
  assert.ok(credits.includes("latest valid snapshot"));
  assert.ok(credits.includes("not unique event participants"));
  assert.ok(credits.includes("not a new collection by MD Atlas"));
  assert.ok(credits.includes("2026-11-08 05:00:05"));
});

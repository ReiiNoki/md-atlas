import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CITY_NAMES_ZH } from "../src/domain/geography/cityNames.zh.js";
import { citySearchAliases, displayCityName } from "../src/domain/geography/locations.js";
import { filterEvents, INITIAL_FILTERS } from "../src/domain/archive.js";

const archive = JSON.parse(readFileSync(new URL("../public/data/archive.json", import.meta.url), "utf8"));

test("city display names localize while English preserves original labels", () => {
  for (const [code, original, chinese] of [
    ["JP", "Asahikawa", "旭川市"], ["GB", "Oban", "奥本"],
    ["FR", "Paris", "巴黎"], ["CN", "Beijing", "北京市"],
    ["JP", "Kure", "吴市"], ["TW", "桃園市", "桃园市"],
    ["TW", "澎湖縣", "澎湖县"],
  ]) {
    assert.equal(displayCityName(code, original, "zh"), chinese);
    assert.equal(displayCityName(code, original, "en"), original);
  }
});

test("unknown cities and mismatched country codes never borrow another city's name", () => {
  assert.equal(displayCityName("US", "Paris"), "Paris");
  assert.equal(displayCityName(null, "Paris"), "Paris");
  assert.equal(displayCityName("FR", "Unmapped town"), "Unmapped town");
  assert.equal(displayCityName("CA", "Detroit"), "Detroit");
  assert.equal(displayCityName("BN", "City Centre"), "City Centre");
  assert.equal(displayCityName("KZ", "Nur-Sultan 020000"), "Nur-Sultan 020000");
  assert.equal(displayCityName("FR", "__proto__"), "__proto__");
  assert.equal(displayCityName("FR", null), "—");
  assert.equal(displayCityName("FR", "  "), "—");
  assert.equal(displayCityName(" fr ", " paris "), "巴黎");
  assert.deepEqual(citySearchAliases(null, null), []);
});

test("Chinese aliases and source names find the same events without mutating them", () => {
  const before = JSON.stringify(archive);
  // Isolate the location fields: a mission title can also contain "Paris"
  // (or "Parish"), and that broader existing search behavior must remain.
  const cities = archive.events.map(({ id, countryCode, city }) => ({ id, countryCode, city }));
  for (const [chinese, english] of [["旭川", "Asahikawa"], ["巴黎", "Paris"], ["吴市", "Kure"]]) {
    const ids = (query) => filterEvents(cities, { ...INITIAL_FILTERS, query }).map((event) => event.id);
    assert.ok(ids(chinese).length);
    assert.deepEqual(ids(chinese), ids(english));
  }
  assert.equal(JSON.stringify(archive), before);
  const aliases = citySearchAliases("FR", "Paris");
  aliases.push("fake");
  assert.equal(citySearchAliases("FR", "Paris").includes("fake"), false);
});

test("every dictionary entry has provenance and preserves its source key", () => {
  const source = JSON.parse(readFileSync(new URL("../docs/data/city-name-sources.json", import.meta.url), "utf8"));
  const evidence = new Map(source.entries.map((row) => [`${row[0]}|${row[1]}`, row]));
  const dictionaryKeys = new Set();
  for (const [code, places] of Object.entries(CITY_NAMES_ZH)) {
    for (const [city, [name]] of Object.entries(places)) {
      const key = `${code}|${city}`;
      dictionaryKeys.add(key);
      assert.match(name, /\p{Script=Han}/u, key);
      assert.equal(displayCityName(code, city, "en"), city);
      assert.equal(displayCityName(code, city, "zh"), name);
      assert.ok(citySearchAliases(code, city).includes(name));
      const row = evidence.get(key);
      assert.ok(row, `Missing provenance for ${key}`);
      assert.equal(row[2], name);
      assert.ok(row[3].length || row[4].length || row[5] === "archive", key);
    }
  }
  assert.equal(dictionaryKeys.size, evidence.size);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  countrySearchAliases,
  displayCityName,
  displayCountryName,
  normalizeCountryCode,
} from "../src/utils/locations.js";
import { filterEvents, INITIAL_FILTERS, matchesQuery } from "../src/utils/archive.js";

const overrides = [
  ["CN", "China", "中国大陆"],
  ["TW", "Taiwan", "台湾地区"],
  ["HK", "Hong Kong", "香港地区"],
  ["MO", "Macao", "澳门地区"],
];

test("country names use simplified Chinese in the Chinese interface", () => {
  for (const [code, source, expected] of [
    ["JP", "Japan", "日本"],
    ["KR", "South Korea", "韩国"],
    ["GB", "United Kingdom", "英国"],
    ["DE", "Germany", "德国"],
    ["US", "United States", "美国"],
    ["FR", "France", "法国"],
  ]) {
    assert.equal(displayCountryName(code, source, "zh"), expected);
    assert.equal(displayCountryName(code, source, "en"), source);
  }
});

test("approved CN, TW, HK and MO display names override standard translations", () => {
  for (const [code, english, chinese] of overrides) {
    assert.equal(displayCountryName(code, english, "zh"), chinese);
    assert.equal(displayCountryName(code, english, "en"), english);
  }
  assert.equal(displayCountryName(undefined, "Macau", "en"), "Macao");
  assert.equal(displayCountryName(null, "Hong Kong", "zh"), "香港地区");
  assert.equal(displayCountryName("CN", "China", "ja"), "中国");
  assert.equal(displayCountryName("TW", "Taiwan", "ja"), "台湾");
  assert.equal(displayCountryName("HK", "Hong Kong", "ja"), "香港");
  assert.equal(displayCountryName("MO", "Macao", "ja"), "マカオ");
});

test("code normalization and unknown names have safe fallbacks", () => {
  assert.equal(normalizeCountryCode(" jp ", "Japan"), "JP");
  assert.equal(normalizeCountryCode("invalid", "Taiwan"), "TW");
  assert.equal(displayCountryName("JP", "", "en"), "Japan");
  assert.equal(displayCountryName("ZZ", "Unmapped location", "zh"), "Unmapped location");
  assert.equal(displayCountryName("XX", "Unmapped location", "zh"), "Unmapped location");
  assert.equal(displayCountryName("not a code", "Unmapped location", "zh"), "Unmapped location");
  assert.equal(displayCountryName(null, null), "—");
  assert.equal(normalizeCountryCode(null, "__proto__"), undefined);
  assert.deepEqual(countrySearchAliases(null, null), []);
});

test("Japanese country labels use Japanese region names while cities retain source text", () => {
  assert.equal(displayCountryName("DE", "Germany", "ja"), "ドイツ");
  assert.equal(displayCountryName("JP", "Japan", "ja"), "日本");
  assert.equal(displayCityName("JP", "Tokyo", "ja"), "Tokyo");
});

test("English source labels are preserved even when the standard name differs", () => {
  assert.equal(displayCountryName("BN", "Brunei Darussalam", "en"), "Brunei Darussalam");
  assert.equal(displayCountryName("TR", "Türkiye", "en"), "Türkiye");
});

test("Chinese country names, source English and codes all remain searchable", () => {
  const events = [
    Object.freeze({ id: "jp", countryCode: "JP", country: "Japan" }),
    Object.freeze({ id: "de", countryCode: "DE", country: "Germany" }),
  ];
  for (const query of ["日本", "Japan", "jp"]) {
    assert.deepEqual(filterEvents(events, { ...INITIAL_FILTERS, query }).map(({ id }) => id), ["jp"]);
  }
  assert.equal(matchesQuery(events[0], "德国"), false);
  assert.equal(matchesQuery(events[1], "德国"), true);
  for (const [code, english, chinese] of overrides) {
    const event = { countryCode: code, country: english };
    assert.equal(matchesQuery(event, chinese), true);
    assert.equal(matchesQuery(event, english), true);
    assert.equal(matchesQuery(event, code), true);
  }
  assert.equal(matchesQuery({ countryCode: "TW", country: "Taiwan" }, "臺灣"), true);
  assert.equal(matchesQuery({ countryCode: "MO", country: "Macao" }, "Macau"), true);
  const aliases = countrySearchAliases("JP", "Japan");
  aliases.push("not-a-real-alias");
  assert.equal(countrySearchAliases("JP", "Japan").includes("not-a-real-alias"), false);
});

test("every published country/region has a Chinese label without changing source data", () => {
  const { events } = JSON.parse(readFileSync(new URL("../public/data/archive.json", import.meta.url), "utf8"));
  const countries = [...new Map(events.map((event) => [event.countryCode, event])).values()];
  const before = JSON.stringify(countries);
  assert.ok(countries.length > 0);
  for (const { countryCode, country } of countries) {
    const chinese = displayCountryName(countryCode, country, "zh");
    assert.match(chinese, /\p{Script=Han}/u, `Missing Chinese display name for ${countryCode}: ${country}`);
    assert.equal(displayCountryName(countryCode, country, "en"), country);
    assert.equal(matchesQuery({ countryCode, country }, chinese), true);
  }
  assert.equal(JSON.stringify(countries), before);
});

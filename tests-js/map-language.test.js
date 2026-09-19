import test from "node:test";
import assert from "node:assert/strict";
import { createExpression, validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import {
  applyMapLanguage,
  createIntelMapStyle,
  intelMapStyle,
  MAP_LABEL_LAYERS,
  MAP_LABEL_SOURCE,
  mapPlaceName,
} from "../src/data/intelMapStyle.js";

function label(language, properties) {
  // Compile with the same expression parser used by MapLibre, rather than
  // merely comparing source strings (branch type inference matters here).
  const compiled = createExpression(mapPlaceName(language), "layout.text-field");
  assert.equal(compiled.result, "success", JSON.stringify(compiled.value));
  return compiled.value.evaluate({ zoom: 4 }, { type: 1, properties });
}

test("map labels prefer translated fields and skip missing or empty names", () => {
  const names = { "name:zh-Hans": "东京", "name:zh": "東京", "name:ja": "東京都", "name:en": "Tokyo", "name:latin": "Tōkyō", name: "東京" };
  assert.equal(label("zh", names), "东京");
  assert.equal(label("en", names), "Tokyo");
  assert.equal(label("ja", names), "東京都");
  assert.equal(label("zh", { ...names, "name:zh-Hans": "" }), "東京");
  assert.equal(label("zh", { "name:zh-Hant": "臺北" }), "臺北");
  assert.equal(label("zh", { "name:zh": "", name: "Source town" }), "Source town");
  assert.equal(label("en", { "name:en": "", name_en: "Legacy English" }), "Legacy English");
  assert.equal(label("en", { name: "Source town" }), "Source town");
  assert.equal(label("ja", { "name:ja": "", name: "現地名" }), "現地名");
  assert.equal(label("zh", {}), "");
});

test("localized styles do not mutate the shared style or non-label layers", () => {
  const before = JSON.stringify(intelMapStyle);
  const english = createIntelMapStyle("en");
  const chinese = createIntelMapStyle("zh");
  const japanese = createIntelMapStyle("ja");
  assert.deepEqual(validateStyleMin(english).map((error) => error.message), []);
  assert.deepEqual(validateStyleMin(chinese).map((error) => error.message), []);
  assert.deepEqual(validateStyleMin(japanese).map((error) => error.message), []);
  assert.equal(JSON.stringify(intelMapStyle), before);
  for (const id of MAP_LABEL_LAYERS) {
    assert.deepEqual(english.layers.find((layer) => layer.id === id).layout["text-field"], mapPlaceName("en"));
    assert.deepEqual(chinese.layers.find((layer) => layer.id === id).layout["text-field"], mapPlaceName("zh"));
    assert.deepEqual(japanese.layers.find((layer) => layer.id === id).layout["text-field"], mapPlaceName("ja"));
  }
  assert.equal(english.glyphs, undefined, "Language switching must not wait for remote glyph downloads");
  assert.equal(chinese.glyphs, undefined);
  assert.equal(japanese.glyphs, undefined);
  assert.equal(english.sources, intelMapStyle.sources);
  assert.equal(english.layers[0], intelMapStyle.layers[0]);
});

test("label changes do not invalidate the geometry source", () => {
  const style = createIntelMapStyle("zh");
  assert.notEqual(MAP_LABEL_SOURCE, "openmaptiles");
  assert.deepEqual(style.sources[MAP_LABEL_SOURCE], style.sources.openmaptiles);
  assert.notEqual(style.sources[MAP_LABEL_SOURCE], style.sources.openmaptiles);
  for (const layer of style.layers) {
    if (MAP_LABEL_LAYERS.includes(layer.id)) {
      assert.equal(layer.source, MAP_LABEL_SOURCE);
    } else {
      assert.notEqual(layer.source, MAP_LABEL_SOURCE, layer.id);
    }
  }
  const invalidated = new Set();
  const map = {
    getLayer: (id) => style.layers.find((layer) => layer.id === id),
    setLayoutProperty(id) { invalidated.add(this.getLayer(id).source); },
  };
  for (const language of ["en", "zh", "ja"]) applyMapLanguage(map, language);
  assert.deepEqual([...invalidated], [MAP_LABEL_SOURCE]);
});

test("language changes update labels in place and tolerate a not-yet-loaded style", () => {
  const updates = [];
  let loaded = false;
  const map = {
    getLayer: () => loaded,
    setLayoutProperty: (...args) => updates.push(args),
  };
  applyMapLanguage(map, "zh");
  assert.deepEqual(updates, []);
  loaded = true;
  applyMapLanguage(map, "en");
  assert.deepEqual(updates, MAP_LABEL_LAYERS.map((id) => [id, "text-field", mapPlaceName("en")]));
});

// Offline multilingual vector tiles for actual WebGL label-rendering checks.
// vt-pbf is pinned transitively by maplibre-gl; this is test-only code.
import { fromGeojsonVt } from "@maplibre/vt-pbf";

export const FIXTURE_NAMES = {
  "name:zh-Hans": "中文",
  "name:en": "English",
  "name:ja": "日本語",
  "name:latin": "Original",
  name: "Original",
};

function point(y, id) {
  return {
    features: [{ id, type: 1, geometry: [[2048, y]], tags: { ...FIXTURE_NAMES, class: "city" } }],
  };
}

// Repeated in each requested tile so the viewport always contains labels.
// Glyphs are rendered locally by MapLibre, just as in the production style.
export const labelTile = Buffer.from(fromGeojsonVt({
  place: point(2048, 1),
  water_name: point(3072, 2),
}, { version: 2, extent: 4096 }));

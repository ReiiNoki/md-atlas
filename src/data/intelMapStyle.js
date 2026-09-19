export const MAP_LABEL_LAYERS = ["water-labels", "place-labels"];
export const MAP_LABEL_SOURCE = "openmaptiles-labels";

export function mapPlaceName(language = "zh") {
  // Empty translations must fall back instead of hiding the label.
  const fields = language === "en"
    ? ["name:en", "name_en", "name:latin", "name"]
    : language === "ja"
      ? ["name:ja", "name", "name:latin", "name:en", "name_en"]
      : ["name:zh-Hans", "name:zh", "name:zh-Hant", "name", "name:latin", "name:en", "name_en"];
  return [
    "case",
    ...fields.flatMap((field) => [
      ["!=", ["coalesce", ["get", field], ""], ""],
      ["to-string", ["get", field]],
    ]),
    "",
  ];
}

export function applyMapLanguage(map, language) {
  for (const id of MAP_LABEL_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "text-field", mapPlaceName(language));
  }
}

export function createIntelMapStyle(language = "zh") {
  return {
    ...intelMapStyle,
    layers: intelMapStyle.layers.map((layer) => MAP_LABEL_LAYERS.includes(layer.id)
      ? { ...layer, layout: { ...layer.layout, "text-field": mapPlaceName(language) } }
      : layer),
  };
}

const roadWidth = [
  "interpolate",
  ["exponential", 1.35],
  ["zoom"],
  4,
  0.15,
  8,
  0.7,
  13,
  2.2,
  18,
  12,
];

const basemapSource = {
  type: "vector",
  url: "https://tiles.openfreemap.org/planet",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://openfreemap.org">OpenFreeMap</a>',
};

export const intelMapStyle = {
  version: 8,
  name: "Intel Map",
  // MapLibre 6 renders glyphs locally when no glyph URL is specified. This
  // avoids a cold remote font-range request holding the old language on screen.
  // Noto stacks retain their weights, with the browser's sans-serif fallback.
  sources: {
    openmaptiles: basemapSource,
    // A text-field change reparses every layer using that vector source.
    // Keep labels separate so switching language does not rebuild road,
    // building and land polygons or hold old text while that work finishes.
    // Both sources use the same cacheable tile URLs; the Map stays intact.
    [MAP_LABEL_SOURCE]: { ...basemapSource },
  },
  layers: [
    {
      id: "land",
      type: "background",
      paint: { "background-color": "#15262c" },
    },
    {
      id: "landcover",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      paint: {
        "fill-color": [
          "match",
          ["get", "class"],
          "wood",
          "#1b302f",
          "grass",
          "#203533",
          "wetland",
          "#1c3232",
          "ice",
          "#4b6970",
          "sand",
          "#344444",
          "#1b2e34",
        ],
        "fill-opacity": 0.72,
      },
    },
    {
      id: "landuse",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      paint: {
        "fill-color": [
          "match",
          ["get", "class"],
          "residential",
          "#1b3036",
          "cemetery",
          "#1d3531",
          "hospital",
          "#243238",
          "school",
          "#22353a",
          "#1b3035",
        ],
        "fill-opacity": 0.64,
      },
    },
    {
      id: "park",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "park",
      paint: {
        "fill-color": "#254039",
        "fill-opacity": 0.82,
      },
    },
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "fill-color": "#2b5862" },
    },
    {
      id: "waterways",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      paint: {
        "line-color": "#4a8992",
        "line-opacity": 0.92,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          7,
          0.35,
          13,
          1.4,
          18,
          5,
        ],
      },
    },
    {
      id: "aeroway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "aeroway",
      minzoom: 9,
      paint: {
        "line-color": "#52757a",
        "line-opacity": 0.72,
        "line-width": roadWidth,
      },
    },
    {
      id: "road-casing",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: [
        "match",
        ["get", "class"],
        ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"],
        true,
        false,
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#0c1b20",
        "line-opacity": 0.86,
        "line-width": [
          "interpolate",
          ["exponential", 1.35],
          ["zoom"],
          4,
          1.55,
          8,
          2.1,
          13,
          3.6,
          18,
          13.4,
        ],
      },
    },
    {
      id: "roads",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: [
        "match",
        ["get", "class"],
        ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"],
        true,
        false,
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": [
          "match",
          ["get", "class"],
          ["motorway", "trunk"],
          "#6e969b",
          ["primary", "secondary"],
          "#52777b",
          "#3b5b60",
        ],
        "line-opacity": 0.82,
        "line-width": roadWidth,
      },
    },
    {
      id: "rail",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 8,
      filter: ["==", ["get", "class"], "rail"],
      paint: {
        "line-color": "#52757a",
        "line-dasharray": [2, 2],
        "line-opacity": 0.65,
        "line-width": 0.8,
      },
    },
    {
      id: "buildings",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 13,
      paint: {
        "fill-color": "#2d474b",
        "fill-outline-color": "#416267",
        "fill-opacity": 0.76,
      },
    },
    {
      id: "boundaries",
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      filter: ["match", ["get", "admin_level"], [2, 3, 4], true, false],
      paint: {
        "line-color": "#6a8589",
        "line-dasharray": [3, 2],
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          0.42,
          7,
          0.8,
        ],
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          0.45,
          8,
          1.1,
        ],
      },
    },
    {
      id: "water-labels",
      type: "symbol",
      source: MAP_LABEL_SOURCE,
      "source-layer": "water_name",
      layout: {
        "text-field": mapPlaceName(),
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 9, 13],
        "text-max-width": 7,
      },
      paint: {
        "text-color": "#57808a",
        "text-halo-color": "rgba(21,38,44,0.88)",
        "text-halo-width": 1,
      },
    },
    {
      id: "place-labels",
      type: "symbol",
      source: MAP_LABEL_SOURCE,
      "source-layer": "place",
      minzoom: 2,
      filter: [
        "match",
        ["get", "class"],
        ["country", "state", "city", "town", "village"],
        true,
        false,
      ],
      layout: {
        "text-field": mapPlaceName(),
        "text-font": [
          "match",
          ["get", "class"],
          "country",
          ["literal", ["Noto Sans Bold"]],
          ["literal", ["Noto Sans Regular"]],
        ],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          9,
          6,
          11,
          12,
          14,
        ],
        "text-max-width": 8,
      },
      paint: {
        "text-color": "#b3c2c5",
        "text-halo-color": "rgba(12,27,32,0.92)",
        "text-halo-width": 1.2,
      },
    },
  ],
};

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { LocateFixed, Minus, Plus } from "lucide-react";
import { applyMapLanguage, createIntelMapStyle } from "../data/intelMapStyle";
import { useLanguage } from "../i18n.jsx";
import { eventMapLocation, eventMapTitle } from "../utils/eventMapLabel";

// MapLibre 6 ships its worker separately; let Vite bundle its imports and
// resolve the URL for both root and subdirectory deployments.
maplibregl.setWorkerUrl(mapWorkerUrl);

function toGeoJson(events, selectedId) {
  return {
    type: "FeatureCollection",
    features: events
      .filter((event) => typeof event.lat === "number" && typeof event.lng === "number")
      .map((event) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [event.lng, event.lat] },
        properties: {
          id: event.id,
          title: event.title,
          city: event.city,
          country: event.country,
          countryCode: event.countryCode,
          address: event.address ?? "",
          date: event.date ?? "—",
          selected: event.id === selectedId,
        },
      })),
  };
}

function createPopupContent(properties, language) {
  const content = document.createElement("div");
  content.className = "mission-map-popup__body";
  const title = document.createElement("strong");
  const meta = document.createElement("span");
  title.textContent = eventMapTitle(properties);
  title.title = eventMapTitle(properties);
  meta.textContent = `${eventMapLocation(properties, language)} / ${properties.date}`;
  content.append(title, meta);
  return content;
}

function addEventLayers(map, events, selectedId) {
  map.addSource("mission-days", {
    type: "geojson",
    data: toGeoJson(events, selectedId),
  });

  map.addLayer({
    id: "mission-points",
    type: "circle",
    source: "mission-days",
    filter: ["!=", ["get", "selected"], true],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 2.4, 8, 4.2, 14, 6],
      "circle-color": "#42d6df",
      "circle-opacity": 0.78,
      "circle-stroke-color": "#193b41",
      "circle-stroke-width": 1,
    },
  });

  map.addLayer({
    id: "mission-selected",
    type: "circle",
    source: "mission-days",
    filter: ["==", ["get", "selected"], true],
    paint: {
      "circle-radius": 8,
      "circle-color": "#f2c14e",
      "circle-opacity": 0.38,
      "circle-stroke-color": "#f2c14e",
      "circle-stroke-width": 2,
    },
  });
}

export function MissionMap({ events, selectedEvent, onSelect }) {
  const { language, t } = useLanguage();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const popupPropertiesRef = useRef(null);
  const languageRef = useRef(language);
  const eventsRef = useRef(events);
  const selectedRef = useRef(selectedEvent);
  const onSelectRef = useRef(onSelect);
  const [mapState, setMapState] = useState("loading");

  useEffect(() => {
    eventsRef.current = events;
    selectedRef.current = selectedEvent;
    onSelectRef.current = onSelect;
  }, [events, onSelect, selectedEvent]);

  useEffect(() => {
    languageRef.current = language;
    if (mapRef.current) applyMapLanguage(mapRef.current, language);
    if (popupRef.current && popupPropertiesRef.current) {
      popupRef.current.setDOMContent(createPopupContent(popupPropertiesRef.current, language));
    }
  }, [language]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    let map;
    try {
      // MapLibre 6 requires WebGL2. Check before construction: an unsupported
      // GPU can leave a partially initialized Map that cannot be safely used.
      const probe = document.createElement("canvas").getContext("webgl2");
      if (!probe) {
        setMapState("unavailable");
        return undefined;
      }
      probe.getExtension("WEBGL_lose_context")?.loseContext();
      map = new maplibregl.Map({
        container: containerRef.current,
        style: createIntelMapStyle(languageRef.current),
        center: [55, 38],
        zoom: 3,
        minZoom: 2,
        maxZoom: 17,
        // Commit newly shaped labels in their first frame instead of keeping
        // the previous language through incremental placement and fading.
        fadeDuration: 0,
        attributionControl: false,
      });
    } catch {
      setMapState("unavailable");
      return undefined;
    }

    map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
    mapRef.current = map;
    // Search/filter rows can resize the workspace without a window resize.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    const openPopup = (event) => {
      map.getCanvas().style.cursor = "pointer";
      const feature = event.features?.[0];
      if (!feature) return;

      popupPropertiesRef.current = feature.properties;
      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 9,
      })
        .setLngLat(feature.geometry.coordinates)
        .setDOMContent(createPopupContent(feature.properties, languageRef.current))
        .addTo(map);
    };

    const closePopup = () => {
      map.getCanvas().style.cursor = "";
      popupRef.current?.remove();
      popupRef.current = null;
      popupPropertiesRef.current = null;
    };

    const selectPoint = (event) => {
      const id = event.features?.[0]?.properties?.id;
      if (id) onSelectRef.current(id);
    };

    const loadTimeout = window.setTimeout(() => setMapState("error"), 15_000);
    map.on("error", () => {
      if (!map.loaded()) setMapState("error");
    });

    map.on("load", () => {
      window.clearTimeout(loadTimeout);
      setMapState("ready");
      applyMapLanguage(map, languageRef.current);
      addEventLayers(map, eventsRef.current, selectedRef.current?.id);
      ["mission-points", "mission-selected"].forEach((layer) => {
        map.on("mouseenter", layer, openPopup);
        map.on("mouseleave", layer, closePopup);
        map.on("click", layer, selectPoint);
      });

      const selected = selectedRef.current;
      if (typeof selected?.lat === "number" && typeof selected?.lng === "number") {
        map.flyTo({
          center: [selected.lng, selected.lat],
          zoom: Math.max(map.getZoom(), 4),
          duration: 800,
        });
      }
    });

    return () => {
      resizeObserver.disconnect();
      window.clearTimeout(loadTimeout);
      popupRef.current?.remove();
      popupRef.current = null;
      popupPropertiesRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("mission-days");
    if (source) source.setData(toGeoJson(events, selectedEvent?.id));
  }, [events, selectedEvent?.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      typeof selectedEvent?.lat !== "number" ||
      typeof selectedEvent?.lng !== "number"
    ) {
      return;
    }

    map.flyTo({
      center: [selectedEvent.lng, selectedEvent.lat],
      zoom: Math.max(map.getZoom(), 4),
      duration: 800,
    });
  }, [selectedEvent?.id, selectedEvent?.lat, selectedEvent?.lng]);

  const locate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      mapRef.current?.flyTo({
        center: [coords.longitude, coords.latitude],
        zoom: 7,
        duration: 800,
      });
    });
  };

  return (
    <div className="mission-map">
      <div className="mission-map__canvas" ref={containerRef} />
      {mapState !== "ready" ? (
        <div className={`map-state map-state--${mapState}`} role={mapState === "loading" ? "status" : "alert"}>
          {mapState === "unavailable"
            ? t("mapUnavailable")
            : mapState === "error"
              ? t("mapTilesFailed")
              : t("loadingMapTiles")}
        </div>
      ) : null}
      <div className="map-control-dock" onDoubleClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          aria-label={t("zoomInMap")}
          title={t("zoomInMap")}
          onClick={() => mapRef.current?.zoomIn()}
        >
          <Plus size={21} />
        </button>
        <button
          type="button"
          aria-label={t("zoomOutMap")}
          title={t("zoomOutMap")}
          onClick={() => mapRef.current?.zoomOut()}
        >
          <Minus size={21} />
        </button>
        <button
          type="button"
          aria-label={t("locateCurrentPosition")}
          title={t("locateCurrentPosition")}
          onClick={locate}
        >
          <LocateFixed size={20} strokeWidth={1.35} />
        </button>
      </div>
    </div>
  );
}

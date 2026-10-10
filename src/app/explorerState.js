import { INITIAL_FILTERS, isFiniteCoordinate } from "../domain/archive.js";
import { nearestUpcomingEvent } from "../domain/calendarDates.js";
import { OFFICIAL_MISSION_TYPES } from "../domain/activityTypes.js";
import { parseUrlState, serializeUrlState } from "../utils/urlState.js";

export function initialExplorerState(location) {
  return { ...parseUrlState(location), defaultScope: "archive", writeMode: "replace", revision: 0, routeVersion: 0 };
}

export function leavesArchiveOnlyState(state, view, officialEvents = []) {
  return view !== "archive" && (
    OFFICIAL_MISSION_TYPES.includes(state.filters.missionDayType) ||
    officialEvents.some(({ id }) => id === state.event)
  );
}

// Only explicitly requested IDs live in state. Default items are derived
// rendering fallbacks, never implicit selections or history parameters.
export function explorerReducer(state, action) {
  const revision = action.revision ?? state.revision + 1;
  switch (action.type) {
    case "filter":
      return { ...state, filters: { ...state.filters, [action.key]: action.value },
        event: null, defaultScope: "filtered", writeMode: action.key === "query" ? "replace" : "push", revision };
    case "reset":
      return { ...state, filters: INITIAL_FILTERS, event: null, defaultScope: "filtered", writeMode: "push", revision };
    case "select":
      return { ...state, view: action.view ?? state.view, event: action.id,
        defaultScope: "filtered", writeMode: "push", revision };
    case "view": {
      const clear = leavesArchiveOnlyState(state, action.view, action.officialEvents);
      return { ...state, view: action.view,
        filters: clear ? { ...state.filters, missionDayType: "all" } : state.filters,
        // A primary-page action leaves the resource route, even for MD items.
        event: null,
        defaultScope: clear ? "filtered" : state.defaultScope, writeMode: "push", revision };
    }
    case "restore": {
      const restored = parseUrlState(action.location);
      if (restored.event && ["map", "archive"].includes(action.historyState?.mdAtlasView)) {
        restored.view = action.historyState.mdAtlasView;
      }
      return { ...restored, defaultScope: "filtered", writeMode: "replace", revision, routeVersion: revision };
    }
    case "invalidate":
      // Data becoming ready cannot undo a more recent user/history action.
      return action.expectedRevision === state.revision
        ? { ...state, event: null, writeMode: "replace", revision, routeVersion: revision }
        : state;
    default:
      return state;
  }
}

export function resolveExplorerSelection(state, archive, officialArchive) {
  const ready = Boolean(archive) && (state.view !== "archive" || Boolean(officialArchive));
  const exists = archive?.events.some(({ id }) => id === state.event) ||
    (state.view === "archive" && officialArchive?.events.some(({ id }) => id === state.event));
  return { ready, selectedId: !ready || exists ? state.event : null,
    invalid: ready && Boolean(state.event) && !exists };
}

// Map defaults target the nearest upcoming visible point, without writing a
// selection to the URL. Other views retain their boot/interaction fallbacks.
export function resolveExplorerEvent(state, selectedId, source, filtered, archive, today) {
  // A pending/invalid explicit route must not show or fetch the fallback's
  // detail while its own datasets are still being validated.
  if (state.event) return source.find(({ id }) => id === selectedId);
  if (state.view === "map") {
    const points = filtered.filter(({ lat, lng }) =>
      isFiniteCoordinate(lat, 90) && isFiniteCoordinate(lng, 180));
    return nearestUpcomingEvent(points, today) ?? filtered[0];
  }
  return state.defaultScope === "archive" ? archive?.events[0] : filtered[0];
}

export function writeExplorerUrl(state, browser) {
  const { pathname, search } = serializeUrlState(state);
  if (pathname === browser.location.pathname && search === browser.location.search) return false;
  const url = `${pathname}${search}${browser.location.hash}`;
  // Retain the originating screen for in-session Back/Forward to selections.
  // A refresh intentionally resolves the resource route to the archive screen.
  const historyState = { mdAtlasView: state.view };
  if (state.writeMode === "push") browser.history.pushState(historyState, "", url);
  else browser.history.replaceState(historyState, "", url);
  return true;
}

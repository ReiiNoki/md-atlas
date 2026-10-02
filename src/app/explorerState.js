import { INITIAL_FILTERS } from "../domain/archive.js";
import { OFFICIAL_MISSION_TYPES } from "../domain/activityTypes.js";
import { parseUrlState, serializeUrlState } from "../utils/urlState.js";

export function initialExplorerState(search) {
  return { ...parseUrlState(search), defaultScope: "archive", writeMode: "replace", revision: 0 };
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
        event: clear ? null : state.event,
        defaultScope: clear ? "filtered" : state.defaultScope, writeMode: "push", revision };
    }
    case "restore":
      return { ...parseUrlState(action.search), defaultScope: "filtered", writeMode: "replace", revision };
    case "invalidate":
      // Data becoming ready cannot undo a more recent user/history action.
      return action.expectedRevision === state.revision
        ? { ...state, event: null, writeMode: "replace", revision }
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

// Preserve the existing boot fallback (first main-archive item), even when
// URL filters hide it. After filtering/reset/history, default to the first
// filtered result instead. This provenance is not an explicit event ID.
export function resolveExplorerEvent(state, selectedId, source, filtered, archive) {
  return source.find(({ id }) => id === selectedId) ??
    (state.defaultScope === "archive" ? archive?.events[0] : filtered[0]);
}

export function writeExplorerUrl(state, browser) {
  const search = serializeUrlState(state);
  if (search === browser.location.search) return false;
  const url = `${browser.location.pathname}${search}${browser.location.hash}`;
  if (state.writeMode === "push") browser.history.pushState(null, "", url);
  else browser.history.replaceState(null, "", url);
  return true;
}

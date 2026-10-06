import { useCallback, useReducer } from "react";

// Only UI state/commands that must survive or coordinate view switches.
// Local feed region, pagination value and calendar navigation stay in screens.
function panelsReducer(state, action) {
  switch (action.type) {
    case "select": return { ...state, detailOpen: true, routeVersion: action.routeVersion };
    case "closeDetail": return { ...state, detailOpen: false, routeVersion: action.routeVersion };
    case "resetPagination": return { ...state, paginationVersion: state.paginationVersion + 1 };
    case "navigate": return {
      ...state,
      navigationVersion: state.navigationVersion + 1,
      feedCloseVersion: state.feedCloseVersion + (action.view !== "map" ? 1 : 0),
      detailOpen: false,
      routeVersion: action.routeVersion,
      paginationVersion: state.paginationVersion + (action.clearArchive ? 1 : 0),
    };
    default: return state;
  }
}

export function useExplorerPanels(explorerState) {
  const { routeVersion, event } = explorerState;
  const [state, dispatch] = useReducer(panelsReducer, {
    detailOpen: false, routeVersion: -1, paginationVersion: 0, navigationVersion: 0, feedCloseVersion: 0,
  });
  const resetPagination = useCallback(() => dispatch({ type: "resetPagination" }), []);
  const select = useCallback(() => dispatch({ type: "select", routeVersion }), [routeVersion]);
  const closeDetail = useCallback(() => dispatch({ type: "closeDetail", routeVersion }), [routeVersion]);
  const navigate = useCallback((view, clearArchive) => dispatch({ type: "navigate", view, clearArchive, routeVersion }), [routeVersion]);
  // Boot/history/invalid selection reset route-owned detail state without an
  // effect (or a flash of the previously selected drawer). Local close remains
  // respected until the next route restoration or explicit selection.
  return { ...state,
    detailOpen: state.routeVersion === routeVersion ? state.detailOpen : Boolean(event),
    paginationVersion: state.paginationVersion + routeVersion,
    resetPagination, select, closeDetail, navigate };
}

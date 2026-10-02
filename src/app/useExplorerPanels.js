import { useCallback, useReducer } from "react";

// Only UI state/commands that must survive or coordinate view switches.
// Local feed region, pagination value and calendar navigation stay in screens.
function panelsReducer(state, action) {
  switch (action.type) {
    case "select": return { ...state, detailOpen: true };
    case "closeDetail": return { ...state, detailOpen: false };
    case "resetPagination": return { ...state, paginationVersion: state.paginationVersion + 1 };
    case "navigate": return {
      ...state,
      navigationVersion: state.navigationVersion + 1,
      feedCloseVersion: state.feedCloseVersion + (action.view !== "map" ? 1 : 0),
      detailOpen: action.clearArchive ? false : state.detailOpen,
      paginationVersion: state.paginationVersion + (action.clearArchive ? 1 : 0),
    };
    default: return state;
  }
}

export function useExplorerPanels() {
  const [state, dispatch] = useReducer(panelsReducer, {
    detailOpen: false, paginationVersion: 0, navigationVersion: 0, feedCloseVersion: 0,
  });
  const resetPagination = useCallback(() => dispatch({ type: "resetPagination" }), []);
  const select = useCallback(() => dispatch({ type: "select" }), []);
  const closeDetail = useCallback(() => dispatch({ type: "closeDetail" }), []);
  const navigate = useCallback((view, clearArchive) => dispatch({ type: "navigate", view, clearArchive }), []);
  return { ...state, resetPagination, select, closeDetail, navigate };
}

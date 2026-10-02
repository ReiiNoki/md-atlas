import { useCallback, useEffect, useMemo, useReducer, useRef, useTransition } from "react";
import {
  explorerReducer,
  initialExplorerState,
  leavesArchiveOnlyState,
  resolveExplorerSelection,
  writeExplorerUrl,
} from "./explorerState";

export function useExplorerState(onRestore) {
  const [state, dispatch] = useReducer(explorerReducer, undefined,
    () => initialExplorerState(window.location.search));
  const revisionRef = useRef(0);
  const [isPending, startTransition] = useTransition();
  const send = useCallback((action) => {
    dispatch({ ...action, revision: ++revisionRef.current });
  }, []);
  const currentRevision = useCallback(() => revisionRef.current, []);

  useEffect(() => {
    const restore = () => {
      // Read history immediately, before scheduling a transition. Revision is
      // advanced immediately too, so an older URL effect cannot write it back.
      const action = { type: "restore", search: window.location.search,
        revision: ++revisionRef.current };
      startTransition(() => {
        dispatch(action);
        onRestore();
      });
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [onRestore]);

  const updateFilter = (key, value) => startTransition(() => send({ type: "filter", key, value }));
  const resetFilters = () => startTransition(() => send({ type: "reset" }));
  const selectEvent = (id, view) => send({ type: "select", id, view });
  const changeView = (view, officialEvents) => {
    const clearedArchiveState = leavesArchiveOnlyState(state, view, officialEvents);
    send({ type: "view", view, officialEvents });
    return clearedArchiveState;
  };
  return { state, isPending, updateFilter, resetFilters, selectEvent, changeView, send, currentRevision };
}

// Called after App has enabled its datasets using state.view. Keeping this
// second hook explicit avoids putting requests/history in each other's layer.
export function useExplorerUrlSync(explorer, archive, officialArchive) {
  const { state, send, currentRevision } = explorer;
  const selection = useMemo(
    () => resolveExplorerSelection(state, archive, officialArchive),
    [state, archive, officialArchive],
  );
  useEffect(() => {
    if (!selection.ready || state.revision !== currentRevision()) return;
    if (selection.invalid) {
      send({ type: "invalidate", expectedRevision: state.revision });
      return;
    }
    writeExplorerUrl(state, window);
  }, [state, selection.ready, selection.invalid, send, currentRevision]);
  return selection.selectedId;
}

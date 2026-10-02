import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { createEventDetailStore } from "./eventDetails";
import { readStaticJson } from "./staticJson";

const DetailContext = createContext(null);

export function EventDetailProvider({ children }) {
  const [store] = useState(() => createEventDetailStore(readStaticJson));
  return <DetailContext.Provider value={store}>{children}</DetailContext.Provider>;
}

// The hook and provider intentionally share this private context.
// eslint-disable-next-line react-refresh/only-export-components
export function useEventDetail(event, enabled = true) {
  const store = useContext(DetailContext);
  if (!store) throw new Error("useEventDetail requires EventDetailProvider");
  const id = enabled ? event?.id : null;
  const subscribe = useCallback((notify) => store.subscribe(id, notify), [store, id]);
  const getSnapshot = useCallback(() => store.snapshot(id), [store, id]);
  const entry = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const detailPath = event?.detailPath;
  useEffect(() => {
    if (!id || !detailPath) return undefined;
    return store.acquire({ id, detailPath });
  }, [store, id, detailPath]);
  const retry = useCallback(() => store.retry(event), [store, event]);
  return { data: entry.data, status: entry.status, error: entry.error, retry };
}

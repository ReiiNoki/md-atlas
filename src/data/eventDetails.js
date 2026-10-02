// One store per mounted App; snapshots are immutable and stable between updates.
const IDLE = Object.freeze({ data: null, status: "idle", error: "" });

export function createEventDetailStore(request) {
  const entries = new Map();
  const listeners = new Map();
  const users = new Map();
  const inFlight = new Map();
  const snapshot = (id) => entries.get(id) ?? IDLE;
  const publish = (id, entry) => {
    entries.set(id, entry);
    listeners.get(id)?.forEach((notify) => notify());
  };
  const subscribe = (id, notify) => {
    const set = listeners.get(id) ?? new Set();
    set.add(notify);
    listeners.set(id, set);
    return () => {
      set.delete(notify);
      if (!set.size) listeners.delete(id);
    };
  };
  const cancel = (id) => {
    const pending = inFlight.get(id);
    if (!pending) return;
    inFlight.delete(id);
    pending.abort();
    publish(id, IDLE);
  };
  const load = (event) => {
    if (!event?.detailPath || snapshot(event.id).status === "ready" || inFlight.has(event.id)) return;
    const { id, detailPath } = event;
    const controller = new AbortController();
    inFlight.set(id, controller);
    publish(id, { data: null, status: "loading", error: "" });
    Promise.resolve().then(() => request(detailPath, controller.signal)).then((data) => {
      if (inFlight.get(id) !== controller) return;
      if (data.id !== id) throw new Error("Event detail ID mismatch");
      inFlight.delete(id);
      publish(id, { data, status: "ready", error: "" });
    }).catch((error) => {
      if (inFlight.get(id) !== controller) return;
      inFlight.delete(id);
      if (error.name === "AbortError") publish(id, IDLE);
      else publish(id, { data: null, status: "error", error: error.message });
    });
  };
  const acquire = (event) => {
    if (!event?.detailPath) return () => {};
    const id = event.id;
    users.set(id, (users.get(id) ?? 0) + 1);
    // Reopening a failed detail historically retried its request. Keep the
    // error snapshot while unselected, but don't turn it into a permanent cache.
    if (["idle", "error"].includes(snapshot(id).status)) load(event);
    return () => {
      const remaining = users.get(id) - 1;
      if (remaining) users.set(id, remaining);
      else {
        users.delete(id);
        cancel(id);
      }
    };
  };
  const retry = (event) => {
    if (!event?.detailPath) return;
    cancel(event.id);
    load(event);
  };
  return { snapshot, subscribe, acquire, retry };
}

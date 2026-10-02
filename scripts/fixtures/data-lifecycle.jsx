/* eslint-disable react-refresh/only-export-components -- standalone test entry, not an HMR library */
// Test-only fixture: real hooks/React StrictMode with manually completed fetches.
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useArchive, useSearchIndex, useOfficialMissions, useXmAnomalies, useAnalytics } from "../../src/data/useStaticDatasets";
import { EventDetailProvider, useEventDetail } from "../../src/data/useEventDetail";

const calls = [];
window.fetch = (url, { signal } = {}) => new Promise((resolve, reject) => {
  // Deliberately ignore abort here. Hooks must discard late completions even
  // when cancellation isn't respected by a fetch implementation/body parser.
  calls.push({ path: new URL(url, location.href).pathname, signal,
    complete: (data, status = 200) => resolve({ ok: status >= 200 && status < 300, status, json: async () => data }), reject });
});
const api = window.__lifecycle = {
  snapshots: {},
  calls: () => calls.map(({ path, signal }) => ({ path, aborted: signal?.aborted ?? false })),
  complete: (index, data, status) => calls[index].complete(data, status),
  fail: (index, message) => calls[index].reject(new Error(message)),
};
function useReport(name, request) {
  useEffect(() => {
    api.snapshots[name] = { data: request.data, status: request.status, error: request.error };
    api.retry = request.retry;
  }, [name, request]);
}
function Search({ enabled }) { useReport("dataset", useSearchIndex(enabled)); return null; }
function Official({ enabled }) { useReport("dataset", useOfficialMissions(enabled)); return null; }
function Xm({ enabled }) { useReport("dataset", useXmAnomalies(enabled)); return null; }
function Analytics({ enabled }) { useReport("dataset", useAnalytics(enabled)); return null; }
function Archive() { useReport("dataset", useArchive()); return null; }
const PROBES = { search: Search, official: Official, xm: Xm, analytics: Analytics, archive: Archive };
function Detail({ id, index }) {
  const event = id ? { id, detailPath: `data/events/${id}.json` } : null;
  const detail = useEventDetail(event);
  useReport(`detail-${index}`, detail);
  return null;
}
function Harness() {
  const [probe, setProbe] = useState({ type: "search", enabled: false, epoch: 0 });
  const [ids, setIds] = useState([]);
  useEffect(() => {
    api.mount = (type, enabled = true) => {
      api.snapshots = {};
      setIds([]);
      setProbe((current) => ({ type, enabled, epoch: current.epoch + 1 }));
    };
    api.enable = (enabled) => setProbe((current) => ({ ...current, enabled }));
    api.details = (nextIds) => { setIds(nextIds); setProbe((current) => ({ ...current, type: "details" })); };
  }, []);
  const Probe = PROBES[probe.type];
  return <EventDetailProvider>
    {Probe ? <Probe key={probe.epoch} enabled={probe.enabled} /> : null}
    {ids.map((id, index) => <Detail key={index} id={id} index={index} />)}
  </EventDetailProvider>;
}
createRoot(document.getElementById("root")).render(<React.StrictMode><Harness /></React.StrictMode>);

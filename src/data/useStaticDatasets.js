import { useCallback, useEffect, useState } from "react";
import { expandAnalytics } from "../domain/archive";
import { normalizeXmAnomalies } from "../domain/calendarActivities";
import { normalizeOfficialMissionArchive } from "../domain/officialMissions";

import { readStaticJson } from "./staticJson";

// The owner (App) stays mounted across view changes. Disabling a dataset
// aborts its pending request, but never discards a successful result.
function useStaticDataset(enabled, load) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setStatus("loading");
    setError("");
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled || data !== null) return undefined;
    const controller = new AbortController();
    let current = true;
    setStatus("loading");
    setError("");
    // Async completion from an older attempt must not publish into this one.
    load(controller.signal).then((payload) => {
      if (!current) return;
      setData(payload);
      setStatus("ready");
      setError("");
    }).catch((failure) => {
      if (!current || failure.name === "AbortError") return;
      setError(failure.message);
      setStatus("error");
    });
    return () => {
      current = false;
      controller.abort();
    };
  }, [enabled, data, attempt, load]);

  // Present a newly enabled request as loading before its effect runs. The
  // effect also clears a previous failure when an aborted/failed load restarts.
  return { data, status: data !== null ? "ready" : !enabled ? "idle" : status === "error" ? "error" : "loading", error, retry };
}

const loadArchive = (signal) => readStaticJson("data/archive.json", signal);
const loadSearchIndex = (signal) => readStaticJson("data/search-index.json", signal);
const loadOfficialMissions = async (signal) => {
  const [archive, index] = await Promise.all([
    readStaticJson("data/official-missions.json", signal),
    readStaticJson("data/official-mission-search-index.json", signal),
  ]);
  return normalizeOfficialMissionArchive(archive, index);
};
const loadXmAnomalies = async (signal) => normalizeXmAnomalies(await readStaticJson("data/xm-anomalies.json", signal));
const loadAnalytics = async (signal) => expandAnalytics(await readStaticJson("data/analytics.json", signal));

export function useArchive() { return useStaticDataset(true, loadArchive); }
export function useSearchIndex(enabled) { return useStaticDataset(enabled, loadSearchIndex); }
export function useOfficialMissions(enabled) { return useStaticDataset(enabled, loadOfficialMissions); }
export function useXmAnomalies(enabled) { return useStaticDataset(enabled, loadXmAnomalies); }
export function useAnalytics(enabled) { return useStaticDataset(enabled, loadAnalytics); }

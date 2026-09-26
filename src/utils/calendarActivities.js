import { matchesQuery } from "./archive.js";
import { normalizeCountryCode } from "./locations.js";

const SITE_ROLES = new Set([
  "primary",
  "satellite",
  "site",
  "shard-game",
  "impact-zone",
  "global",
]);
const STATUSES = new Set(["completed", "scheduled"]);

export function normalizeXmAnomalies(payload) {
  if (!Array.isArray(payload) || !payload.length) {
    throw new TypeError("XM Anomaly data must be a non-empty array");
  }

  const ids = new Set();
  return payload.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new TypeError("XM Anomaly rows must be objects");
    }
    if (!record.id || ids.has(record.id)) {
      throw new TypeError(`Duplicate or missing XM Anomaly ID: ${record.id ?? "unknown"}`);
    }
    ids.add(record.id);
    if (
      record.type !== "xm-anomaly" ||
      record.title !== `XM Anomaly: ${record.series}` ||
      !/^\d{4}-\d{2}-\d{2}$/.test(record.date) ||
      !SITE_ROLES.has(record.siteRole) ||
      !STATUSES.has(record.status)
    ) {
      throw new TypeError(`Invalid XM Anomaly record: ${record.id}`);
    }
    const year = Number(record.date.slice(0, 4));
    if (!Number.isFinite(year)) throw new TypeError(`Invalid XM Anomaly date: ${record.id}`);
    return { ...record, year };
  });
}

export function filterXmAnomalies(records, filters, query = filters.query) {
  // These two controls describe Mission Day records specifically. A selected
  // value must not silently leak unrelated Anomalies into the calendar.
  if (filters.missionDayType !== "all") return [];

  return records.filter((event) => {
    if (filters.year !== "all" && String(event.year) !== filters.year) return false;
    if (filters.region !== "all" && event.region !== filters.region) return false;
    if (
      filters.country !== "all" &&
      normalizeCountryCode(event.countryCode, event.country) !== filters.country
    ) return false;
    if (filters.status !== "all" && event.status !== filters.status) return false;
    return matchesQuery(event, query, event.series);
  });
}

export function calendarActivityType(event) {
  return event.type === "xm-anomaly" ? "xm-anomaly" : "mission-day";
}

export function calendarActivityMarker(event, locationLabel) {
  return calendarActivityType(event) === "xm-anomaly" ? event.series : locationLabel;
}

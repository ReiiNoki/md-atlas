import { citySearchAliases, countrySearchAliases, normalizeCountryCode } from "./locations.js";

export const INITIAL_FILTERS = {
  query: "",
  year: "all",
  region: "all",
  country: "all",
  missionDayType: "all",
  status: "all",
};

export function matchesQuery(event, query, indexedText = event.searchText) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [
    ...citySearchAliases(event.countryCode, event.city),
    ...countrySearchAliases(event.countryCode, event.country),
    event.title,
    indexedText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalized);
}

export function filterEvents(
  events,
  filters,
  deferredQuery = filters.query,
  searchIndex = null,
) {
  return events.filter((event) => {
    if (filters.year !== "all" && String(event.year) !== filters.year) return false;
    if (filters.region !== "all" && event.region !== filters.region) return false;
    if (
      filters.country !== "all" &&
      normalizeCountryCode(event.countryCode, event.country) !== filters.country
    ) return false;
    if (
      filters.missionDayType !== "all" &&
      event.missionDayType !== filters.missionDayType
    ) return false;
    if (filters.status !== "all" && event.status !== filters.status) return false;
    return matchesQuery(event, deferredQuery, searchIndex?.[event.id] ?? event.searchText);
  });
}

export function countEventsByYear(events) {
  return events.reduce((counts, event) => {
    if (typeof event.year !== "number") return counts;
    counts[event.year] = (counts[event.year] ?? 0) + 1;
    return counts;
  }, {});
}

export function getYearRange(events) {
  const years = events.map((event) => event.year).filter(Number.isFinite);
  if (!years.length) return null;
  return { min: Math.min(...years), max: Math.max(...years) };
}

/** Unique country filter options with event counts, most active first. */
export function countEventsByCountry(events) {
  const counts = new Map();
  for (const event of events) {
    const code = normalizeCountryCode(event.countryCode, event.country);
    if (!code) continue;
    const entry = counts.get(code) ?? { code, country: event.country, count: 0 };
    entry.count += 1;
    counts.set(code, entry);
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.code.localeCompare(b.code),
  );
}

export function expandAnalytics(data) {
  if (!Array.isArray(data?.events)) throw new TypeError("Invalid analytics payload");
  return {
    events: data.events.map(
      ([id, year, city, country, countryCode, region, missionDayType, missionCount, missions]) => ({
        id,
        year,
        city,
        country,
        countryCode,
        region,
        missionDayType,
        missionCount,
        missions: (missions ?? []).map(
          ([
            missionId,
            title,
            author,
            authorFaction,
            rating,
            completions,
            distanceMeters,
            timeMilliseconds,
            offline,
          ]) => ({
            id: missionId,
            title,
            author,
            authorFaction,
            rating,
            completions,
            distanceMeters,
            timeMilliseconds,
            offline,
          }),
        ),
      }),
    ),
  };
}

export function isFiniteCoordinate(value, limit) {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

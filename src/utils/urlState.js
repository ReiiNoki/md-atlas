import { BASE_PATH } from "../../site.config.js";
import { INITIAL_FILTERS } from "../domain/archive.js";
import { ACTIVITY_TYPES, OFFICIAL_MISSION_TYPES } from "../domain/activityTypes.js";

/** Views and filter enums mirrored from the UI so links can be validated lazily. */
export const URL_VIEWS = ["map", "archive", "calendar", "data"];
export const URL_REGIONS = ["APAC", "EMEA", "AMER"];
export const URL_STATUSES = ["online", "partially_offline", "scheduled", "offline"];
export const URL_MISSION_DAY_TYPES = ACTIVITY_TYPES;

const YEAR_PATTERN = /^\d{4}$/;
const COUNTRY_PATTERN = /^[A-Za-z]{2}$/;

// Remove the configured base before interpreting routes. With BASE_PATH = /
// the application owns the dedicated host's root; subpath mounts remain safe.
function parsePathname(pathname) {
  const base = BASE_PATH.slice(0, -1);
  if (pathname === base || pathname === BASE_PATH) return { view: "map", event: null };
  if (!pathname.startsWith(BASE_PATH)) return { view: "map", event: null };
  const path = pathname.slice(BASE_PATH.length).replace(/\/$/, "");
  if (URL_VIEWS.includes(path) && path !== "map") return { view: path, event: null };
  const match = /^md\/([^/]+)$/.exec(path);
  if (match) {
    try {
      const event = decodeURIComponent(match[1]);
      if (event) return { view: "archive", event };
    } catch { /* Malformed encoding is an invalid route, not a boot error. */ }
  }
  return { view: "map", event: null };
}

/** Pathname owns navigation/selection; query parameters own filters only. */
export function parseUrlState({ pathname = BASE_PATH, search = "" } = {}) {
  const params = new URLSearchParams(search);
  const route = parsePathname(pathname);
  const yearParam = params.get("year");
  const regionParam = params.get("region");
  const countryParam = params.get("country");
  const statusParam = params.get("status");
  const missionDayTypeParam = params.get("type");
  return {
    view: route.view,
    filters: {
      query: params.get("q") ?? "",
      // Any 4-digit value parses; years without events simply yield no matches
      // and remain clearable through the normal filter UI.
      year: yearParam && YEAR_PATTERN.test(yearParam) ? yearParam : "all",
      region: URL_REGIONS.includes(regionParam) ? regionParam : "all",
      // ISO alpha-2 codes are validated by shape; unknown codes merely match
      // no events and stay clearable.
      country: countryParam && COUNTRY_PATTERN.test(countryParam)
        ? countryParam.toUpperCase()
        : "all",
      missionDayType:
        URL_MISSION_DAY_TYPES.includes(missionDayTypeParam) &&
        (route.view === "archive" || !OFFICIAL_MISSION_TYPES.includes(missionDayTypeParam))
          ? missionDayTypeParam
          : "all",
      status: URL_STATUSES.includes(statusParam) ? statusParam : "all",
    },
    event: route.event,
  };
}

/** Generate canonical mounted paths and omit default filter parameters. */
export function serializeUrlState({ view = "map", filters = INITIAL_FILTERS, event = null } = {}) {
  const params = new URLSearchParams();
  const pathname = event ? `${BASE_PATH}md/${encodeURIComponent(event)}`
    : URL_VIEWS.includes(view) && view !== "map" ? `${BASE_PATH}${view}` : BASE_PATH;
  const { query, year, region, country, missionDayType, status } = filters;
  if (query && query.trim()) params.set("q", query);
  if (year && year !== "all" && YEAR_PATTERN.test(year)) params.set("year", year);
  if (region && region !== "all" && URL_REGIONS.includes(region)) params.set("region", region);
  if (country && country !== "all" && /^[A-Z]{2}$/.test(country)) params.set("country", country);
  if (
    missionDayType &&
    missionDayType !== "all" &&
    URL_MISSION_DAY_TYPES.includes(missionDayType)
  ) params.set("type", missionDayType);
  if (status && status !== "all" && URL_STATUSES.includes(status)) params.set("status", status);
  const querystring = params.toString();
  return { pathname, search: querystring ? `?${querystring}` : "" };
}

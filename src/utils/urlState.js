import { INITIAL_FILTERS } from "./archive.js";

/** Views and filter enums mirrored from the UI so links can be validated lazily. */
export const URL_VIEWS = ["map", "archive", "calendar", "data"];
export const URL_REGIONS = ["APAC", "EMEA", "AMER"];
export const URL_STATUSES = ["online", "partially_offline", "scheduled", "offline"];

const YEAR_PATTERN = /^\d{4}$/;
const COUNTRY_PATTERN = /^[A-Za-z]{2}$/;

/**
 * Decode shareable query state. Invalid or unknown values fall back to their
 * defaults instead of breaking first paint; defaults are never emitted by
 * serializeUrlState, so decoded state round-trips to the same query string.
 */
export function parseUrlState(search = window.location.search) {
  const params = new URLSearchParams(search);
  const viewParam = params.get("view");
  const yearParam = params.get("year");
  const regionParam = params.get("region");
  const countryParam = params.get("country");
  const statusParam = params.get("status");
  return {
    view: URL_VIEWS.includes(viewParam) ? viewParam : "map",
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
      status: URL_STATUSES.includes(statusParam) ? statusParam : "all",
    },
    event: params.get("event") || null,
  };
}

/**
 * Encode app state into a query string, omitting defaults so everyday browsing
 * keeps short URLs. Returns "" (not "?") when nothing differs from the default.
 */
export function serializeUrlState({ view = "map", filters = INITIAL_FILTERS, event = null } = {}) {
  const params = new URLSearchParams();
  if (URL_VIEWS.includes(view) && view !== "map") params.set("view", view);
  const { query, year, region, country, status } = filters;
  if (query && query.trim()) params.set("q", query);
  if (year && year !== "all" && YEAR_PATTERN.test(year)) params.set("year", year);
  if (region && region !== "all" && URL_REGIONS.includes(region)) params.set("region", region);
  if (country && country !== "all" && /^[A-Z]{2}$/.test(country)) params.set("country", country);
  if (status && status !== "all" && URL_STATUSES.includes(status)) params.set("status", status);
  if (event) params.set("event", event);
  const querystring = params.toString();
  return querystring ? `?${querystring}` : "";
}

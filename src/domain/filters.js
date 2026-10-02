import { INITIAL_FILTERS } from "./archive.js";

export function activeFilterEntries(filters) {
  return Object.entries(filters).filter(
    ([key, value]) => value !== INITIAL_FILTERS[key] && String(value).trim() !== "",
  );
}

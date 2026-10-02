import { OFFICIAL_MISSION_TYPES } from "./activityTypes.js";

const OFFICIAL_TYPES = new Set(OFFICIAL_MISSION_TYPES);

export function normalizeOfficialMissionArchive(payload, searchIndex) {
  if (!payload || !Array.isArray(payload.events) || !payload.events.length) {
    throw new TypeError("Additional archive data must contain events");
  }
  if (!searchIndex || typeof searchIndex !== "object" || Array.isArray(searchIndex)) {
    throw new TypeError("Additional archive search index is invalid");
  }
  if (payload.meta?.eventCount !== payload.events.length) {
    throw new TypeError("Additional archive event count does not match");
  }

  const ids = new Set();
  for (const event of payload.events) {
    if (!event?.id || ids.has(event.id) || !OFFICIAL_TYPES.has(event.activityType)) {
      throw new TypeError(`Invalid additional archive event: ${event?.id ?? "unknown"}`);
    }
    if (
      typeof searchIndex[event.id] !== "string" ||
      !event.detailPath?.startsWith("data/official-mission-events/")
    ) {
      throw new TypeError(`Incomplete additional archive event: ${event.id}`);
    }
    ids.add(event.id);
  }
  if (
    Object.keys(searchIndex).length !== ids.size ||
    Object.keys(searchIndex).some((id) => !ids.has(id))
  ) {
    throw new TypeError("Additional archive search index IDs do not match events");
  }

  return { archive: payload, searchIndex };
}

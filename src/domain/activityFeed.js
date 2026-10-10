import { eventActivityType } from "./activityTypes.js";
import { sortEventsByDate } from "./archive.js";
import { nearestUpcomingEvent } from "./calendarDates.js";

const MISSION_DAY_TYPES = new Set(["md-standard", "md-xma", "md-lite"]);

/** Feed input is already filtered by the explorer and the feed's region tabs. */
export function activityFeedSections(events, today = new Date().toISOString().slice(0, 10)) {
  const missionDays = events.filter((event) => MISSION_DAY_TYPES.has(eventActivityType(event)));
  const past = missionDays.filter((event) =>
    typeof event.date === "string" && event.date < today &&
    (event.endDate ?? event.date) < today);
  return {
    upcoming: nearestUpcomingEvent(missionDays, today),
    recent: sortEventsByDate(past).slice(0, 2),
  };
}

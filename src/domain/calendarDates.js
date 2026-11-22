export function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Viewer-local calendar date, not the UTC date (which may still be yesterday). */
export function localIsoDate(now = new Date()) {
  return isoDate(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Schedule the next local midnight, including 23/25-hour daylight-saving days. */
export function millisecondsUntilNextLocalDay(now = new Date()) {
  return Math.max(1, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime());
}

/** Earliest activity with `date >= today`; ties keep the source order. */
export function nearestUpcomingEvent(events, today = new Date().toISOString().slice(0, 10)) {
  return events.reduce((nearest, event) => {
    if (typeof event.date !== "string" || event.date < today) return nearest;
    return !nearest || event.date < nearest.date ? event : nearest;
  }, undefined);
}

/** The calendar opens on today; upcoming events have a separate marker. */
export function defaultCalendarDate(today = localIsoDate()) {
  return today;
}

/** Next future MD in the filtered calendar; today and standalone Anomalies are not "next". */
export function nextMissionDayDate(activities, today = localIsoDate()) {
  return nearestUpcomingEvent(activities.filter((event) =>
    event.calendarType === "mission-day" && typeof event.date === "string" && event.date > today), today)?.date;
}

export function monthCells(year, month) {
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [
    ...Array.from({ length: firstWeekday }, (_, index) => ({ key: `empty-start-${index}`, day: null })),
    ...Array.from({ length: dayCount }, (_, index) => ({ key: `day-${index + 1}`, day: index + 1 })),
  ];
  while (cells.length % 7) cells.push({ key: `empty-end-${cells.length}`, day: null });
  return cells;
}

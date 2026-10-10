export function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Earliest activity with `date >= today`; ties keep the source order. */
export function nearestUpcomingEvent(events, today = new Date().toISOString().slice(0, 10)) {
  return events.reduce((nearest, event) => {
    if (typeof event.date !== "string" || event.date < today) return nearest;
    return !nearest || event.date < nearest.date ? event : nearest;
  }, undefined);
}

/**
 * Date a calendar should open on: the earliest activity that has not started
 * yet (`date >= today`), or the current date when none is upcoming.
 */
export function defaultCalendarDate(events, today = new Date().toISOString().slice(0, 10)) {
  return nearestUpcomingEvent(events, today)?.date ?? today;
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

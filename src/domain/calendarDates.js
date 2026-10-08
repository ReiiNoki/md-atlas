export function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Date a calendar should open on: the earliest activity that has not started
 * yet (`date >= today`), or the current date when none is upcoming.
 */
export function defaultCalendarDate(events, today = new Date().toISOString().slice(0, 10)) {
  const upcoming = events
    .map((event) => event.date)
    .filter((date) => typeof date === "string" && date >= today)
    .sort();
  return upcoming[0] ?? today;
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

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useLanguage } from "../../i18n.jsx";
import { defaultCalendarDate, nextMissionDayDate } from "../../domain/calendarDates";
import { useCalendarToday } from "./useCalendarToday";
import { activityLocation } from "./calendarLabels";
import { CalendarNavigation } from "./CalendarNavigation";
import { CalendarGrid } from "./CalendarGrid";
import { CalendarAgenda } from "./CalendarAgenda";

export function CalendarView({ events, xmAnomalies = [] }) {
  const { locale, language, t } = useLanguage();
  const today = useCalendarToday();
  const months = useMemo(() => Array.from({ length: 12 }, (_, month) =>
    new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, month, 1)))), [locale]);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, day) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, day + 1)))), [locale]);
  const [activityType, setActivityType] = useState("all");
  const sourceActivities = useMemo(() => {
    const missionDays = events.map((event) => ({ ...event, calendarType: "mission-day" }));
    const anomalies = xmAnomalies.map((event) => ({ ...event, calendarType: "xm-anomaly" }));
    if (activityType === "mission-day") return missionDays;
    if (activityType === "xm-anomaly") return anomalies;
    return [...missionDays, ...anomalies];
  }, [activityType, events, xmAnomalies]);
  const datedEvents = useMemo(() => sourceActivities.filter((event) => event.date && Number.isFinite(event.year)), [sourceActivities]);
  const defaultDate = defaultCalendarDate(today);
  const defaultYear = Number(defaultDate.slice(0, 4));
  const defaultMonth = Number(defaultDate.slice(5, 7)) - 1;
  // Keep the current year navigable even if its events have not been announced.
  const years = useMemo(() => datedEvents.length
    ? [...new Set([...datedEvents.map((event) => event.year), defaultYear])].sort((a, b) => b - a)
    : [], [datedEvents, defaultYear]);
  const nextMdDate = useMemo(() => nextMissionDayDate(datedEvents, today), [datedEvents, today]);
  // Null means follow today, including after midnight, until the user browses.
  const [requestedYear, setRequestedYear] = useState(null);
  const [requestedMonth, setRequestedMonth] = useState(null);
  const [requestedDate, setRequestedDate] = useState(null);
  const [selectedActivityId, setSelectedActivityId] = useState(null);
  const [wheelDirection, setWheelDirection] = useState(null);
  const wheelLockedRef = useRef(false);
  const wheelTimerRef = useRef(null);
  const requestedYearAvailable = years.includes(requestedYear);
  const activeYear = requestedYearAvailable ? requestedYear : defaultYear;
  const activeMonth = requestedYearAvailable && Number.isInteger(requestedMonth) && requestedMonth >= 0 && requestedMonth < 12
    ? requestedMonth : defaultMonth;
  const eventsByDate = useMemo(() => {
    const groups = new Map();
    for (const event of datedEvents) {
      if (event.year !== activeYear || Number(event.date.slice(5, 7)) - 1 !== activeMonth) continue;
      const group = groups.get(event.date) ?? [];
      group.push(event);
      groups.set(event.date, group);
    }
    for (const group of groups.values()) group.sort((a, b) =>
      (a.calendarType === b.calendarType ? 0 : a.calendarType === "xm-anomaly" ? -1 : 1) ||
      activityLocation(a, language, t).localeCompare(activityLocation(b, language, t), locale));
    return groups;
  }, [activeMonth, activeYear, datedEvents, language, locale, t]);
  const dates = [...eventsByDate.keys()].sort((a, b) => b.localeCompare(a));
  const activeMonthKey = `${activeYear}-${String(activeMonth + 1).padStart(2, "0")}`;
  // Selection is independent of the today/next-MD markers. Today can have no events.
  const activeDate = requestedDate && requestedDate.startsWith(activeMonthKey)
    ? requestedDate
    : (defaultDate.startsWith(activeMonthKey) ? defaultDate : (dates[0] ?? null));
  const agendaEvents = activeDate ? (eventsByDate.get(activeDate) ?? []) : [];
  const selectedActivity = agendaEvents.find((event) => event.id === selectedActivityId && event.calendarType === "mission-day") ?? null;
  const activeYearIndex = years.indexOf(activeYear);
  const canGoPrevious = activeMonth > 0 || activeYearIndex < years.length - 1;
  const canGoNext = activeMonth < 11 || activeYearIndex > 0;
  const monthEventCount = [...eventsByDate.values()].reduce((total, group) => total + group.length, 0);

  const changePeriod = (year, month) => {
    setRequestedYear(year);
    setRequestedMonth(month);
    setRequestedDate(null);
    setSelectedActivityId(null);
  };
  const moveMonth = (direction) => {
    let year = activeYear;
    let month = activeMonth + direction;
    if (month < 0) { year = years[activeYearIndex + 1]; month = 11; }
    else if (month > 11) { year = years[activeYearIndex - 1]; month = 0; }
    if (Number.isFinite(year)) changePeriod(year, month);
  };
  const changeYear = (year) => {
    const monthsWithEvents = datedEvents.filter((event) => event.year === year).map((event) => Number(event.date.slice(5, 7)) - 1);
    changePeriod(year, monthsWithEvents.length ? Math.max(...monthsWithEvents) : defaultMonth);
  };
  const changeActivityType = (type) => {
    setActivityType(type);
    setRequestedYear(null);
    setRequestedMonth(null);
    setRequestedDate(null);
    setSelectedActivityId(null);
  };
  const handleCalendarWheel = (event) => {
    if (Math.abs(event.deltaY) < 10) return;
    const direction = event.deltaY > 0 ? 1 : -1;
    if ((direction < 0 && !canGoPrevious) || (direction > 0 && !canGoNext)) return;
    event.preventDefault();
    if (wheelLockedRef.current) return;
    wheelLockedRef.current = true;
    setWheelDirection(direction > 0 ? "next" : "previous");
    moveMonth(direction);
    wheelTimerRef.current = window.setTimeout(() => {
      wheelLockedRef.current = false;
      setWheelDirection(null);
    }, 320);
  };
  useEffect(() => () => {
    if (wheelTimerRef.current) window.clearTimeout(wheelTimerRef.current);
  }, []);

  if (!years.length) return (
    <section className="calendar-view"><div className="empty-state">
      <CalendarDays size={24} /><strong>{t("noDatedEvents")}</strong><p>{t("noDatedEventsDescription")}</p>
    </div></section>
  );
  return (
    <section className="calendar-view">
      <CalendarNavigation activityType={activityType} onActivityType={changeActivityType}
        years={years} months={months} activeYear={activeYear} activeMonth={activeMonth}
        canGoPrevious={canGoPrevious} canGoNext={canGoNext} onMoveMonth={moveMonth} onYear={changeYear} onPeriod={changePeriod} />
      <div className="calendar-split">
        <CalendarGrid months={months} weekdays={weekdays} activeYear={activeYear} activeMonth={activeMonth}
          eventsByDate={eventsByDate} activeDate={activeDate} today={today} nextMdDate={nextMdDate} monthEventCount={monthEventCount}
          undatedCount={sourceActivities.length - datedEvents.length} wheelDirection={wheelDirection} onWheel={handleCalendarWheel}
          onDate={(date) => { setRequestedDate(date); setSelectedActivityId(null); }} />
        <CalendarAgenda activeDate={activeDate} events={agendaEvents} selectedActivity={selectedActivity}
          onSelect={setSelectedActivityId} onClose={() => setSelectedActivityId(null)} />
      </div>
    </section>
  );
}

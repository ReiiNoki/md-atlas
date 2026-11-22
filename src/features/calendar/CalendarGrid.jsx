import { useLayoutEffect, useRef } from "react";
import { useLanguage } from "../../i18n.jsx";
import { calendarActivityMarker } from "../../domain/calendarActivities";
import { isoDate, monthCells } from "../../domain/calendarDates";
import { activityLocation } from "./calendarLabels";

export function CalendarGrid({ months, weekdays, activeYear, activeMonth, eventsByDate, activeDate, today, nextMdDate, monthEventCount, undatedCount, wheelDirection, onWheel, onDate }) {
  const { formatNumber, language, t } = useLanguage();
  const panelRef = useRef(null);
  // React delegates wheel events passively; month gestures must prevent scrolling.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    panel.addEventListener("wheel", onWheel, { passive: false });
    return () => panel.removeEventListener("wheel", onWheel);
  }, [onWheel]);
  return (
    <section className={`calendar-panel ${wheelDirection ? `is-wheel-${wheelDirection}` : ""}`}
      ref={panelRef} aria-label={`${months[activeMonth]} ${activeYear}`}>
      <header className="calendar-panel__heading">
        <div><span>{activeYear}</span><h2>{months[activeMonth]}</h2></div>
        <span className="calendar-panel__meta">
          <strong>{formatNumber(monthEventCount)} {t("events")}</strong>
          <small>{t("scrollToChangeMonth")}</small>
          <span className="calendar-key">
            <span className="calendar-key__today">{t("calendarToday")}</span>
            <span className="calendar-key__next">{t("nextMissionDay")}</span>
          </span>
        </span>
      </header>
      <div className="calendar-weekdays" aria-hidden="true">
        {weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}
      </div>
      <div className="calendar-days">
        {monthCells(activeYear, activeMonth).map(({ key, day }) => {
          if (!day) return <span className="calendar-day is-empty" key={key} />;
          const date = isoDate(activeYear, activeMonth, day);
          const dayEvents = eventsByDate.get(date) ?? [];
          const isToday = date === today;
          const isNextMd = date === nextMdDate;
          const markers = [...new Map(dayEvents.map((event) => {
            const label = calendarActivityMarker(event, activityLocation(event, language, t));
            return [`${event.calendarType}:${label}`, { event, label }];
          })).values()];
          const labels = markers.map(({ label }) => label).join(", ");
          const types = new Set(dayEvents.map((event) => event.calendarType));
          const typeClass = types.size > 1 ? "has-mixed-activities" : types.has("xm-anomaly") ? "has-xm-anomalies" : types.has("mission-day") ? "has-mission-days" : "";
          const description = dayEvents.length
            ? t("calendarDayEvents", { date, count: formatNumber(dayEvents.length), locations: labels })
            : t("calendarDayEmpty", { date });
          const accessibleLabel = [description, isToday ? t("calendarToday") : "", isNextMd ? t("nextMissionDay") : ""].filter(Boolean).join(", ");
          return (
            <button className={`calendar-day ${dayEvents.length ? "has-events" : ""} ${typeClass} ${date === activeDate ? "is-selected" : ""} ${isToday ? "is-today" : ""} ${isNextMd ? "is-next-md" : ""}`}
              type="button" key={key} data-date={date} title={accessibleLabel}
              aria-label={accessibleLabel} aria-current={isToday ? "date" : undefined} aria-pressed={date === activeDate}
              onClick={() => onDate(date)}>
              <span>{day}</span>
              {dayEvents.length ? (
                <>
                  <span className="calendar-day__markers">
                    {markers.slice(0, 2).map(({ event, label }) => (
                      <span className={`is-${event.calendarType}`} key={`${event.calendarType}:${label}`} title={label}>{label}</span>
                    ))}
                    {markers.length > 2 ? <span>+{formatNumber(markers.length - 2)}</span> : null}
                  </span>
                  <b>{formatNumber(dayEvents.length)}</b>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
      {undatedCount ? <p className="calendar-undated">{formatNumber(undatedCount)} {t("noConfirmedDate")}</p> : null}
    </section>
  );
}

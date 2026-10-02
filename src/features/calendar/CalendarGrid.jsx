import { useLanguage } from "../../i18n.jsx";
import { calendarActivityMarker } from "../../domain/calendarActivities";
import { isoDate, monthCells } from "../../domain/calendarDates";
import { activityLocation } from "./calendarLabels";

export function CalendarGrid({ months, weekdays, activeYear, activeMonth, eventsByDate, activeDate, monthEventCount, undatedCount, wheelDirection, onWheel, onDate }) {
  const { formatNumber, language, t } = useLanguage();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section className={`calendar-panel ${wheelDirection ? `is-wheel-${wheelDirection}` : ""}`}
      aria-label={`${months[activeMonth]} ${activeYear}`} onWheel={onWheel}>
      <header className="calendar-panel__heading">
        <div><span>{activeYear}</span><h2>{months[activeMonth]}</h2></div>
        <span className="calendar-panel__meta">
          <strong>{formatNumber(monthEventCount)} {t("events")}</strong>
          <small>{t("scrollToChangeMonth")}</small>
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
          if (!dayEvents.length) return (
            <span className={`calendar-day ${date === today ? "is-today" : ""}`} key={key}><span>{day}</span></span>
          );
          const markers = [...new Map(dayEvents.map((event) => {
            const label = calendarActivityMarker(event, activityLocation(event, language, t));
            return [`${event.calendarType}:${label}`, { event, label }];
          })).values()];
          const labels = markers.map(({ label }) => label).join(", ");
          const types = new Set(dayEvents.map((event) => event.calendarType));
          const typeClass = types.size > 1 ? "has-mixed-activities" : types.has("xm-anomaly") ? "has-xm-anomalies" : "has-mission-days";
          return (
            <button className={`calendar-day has-events ${typeClass} ${date === activeDate ? "is-selected" : ""} ${date === today ? "is-today" : ""}`}
              type="button" key={key}
              title={t("calendarDayTitle", { count: formatNumber(dayEvents.length), locations: labels })}
              aria-label={t("calendarDayEvents", { date, count: formatNumber(dayEvents.length), locations: labels })}
              onClick={() => onDate(date)}>
              <span>{day}</span>
              <span className="calendar-day__markers">
                {markers.slice(0, 2).map(({ event, label }) => (
                  <span className={`is-${event.calendarType}`} key={`${event.calendarType}:${label}`} title={label}>{label}</span>
                ))}
                {markers.length > 2 ? <span>+{formatNumber(markers.length - 2)}</span> : null}
              </span>
              <b>{formatNumber(dayEvents.length)}</b>
            </button>
          );
        })}
      </div>
      {undatedCount ? <p className="calendar-undated">{formatNumber(undatedCount)} {t("noConfirmedDate")}</p> : null}
    </section>
  );
}

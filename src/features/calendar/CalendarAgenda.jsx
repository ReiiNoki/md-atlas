import { CalendarDays, ChevronRight, MapPin, Star, Users } from "lucide-react";
import { EventDetail } from "../../components/EventDetail";
import { MissionImage } from "../../components/MissionImage";
import { StatusBadge } from "../../components/StatusBadge";
import { useEventDetail } from "../../data/useEventDetail";
import { useLanguage } from "../../i18n.jsx";
import { groupXmAnomaliesBySeries } from "../../domain/calendarActivities";
import { displayCityName, displayCountryName } from "../../domain/geography/locations";
import { XmAnomalySeries } from "./XmAnomalySeries";

function formatAgendaDate(date, locale, t) {
  if (!date) return t("noActivityThisMonth");
  return new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function CalendarAgenda({ activeDate, events, selectedActivity, onSelect, onClose }) {
  const { locale, formatNumber, language, t } = useLanguage();
  const detail = useEventDetail(selectedActivity);
  const anomalyGroups = groupXmAnomaliesBySeries(events);
  const missionDays = events.filter((event) => event.calendarType === "mission-day");
  const anomalyOnly = anomalyGroups.length > 0 && missionDays.length === 0;
  return (
    <section className={`calendar-activity-panel ${selectedActivity ? "has-detail" : ""}`} aria-live="polite">
      {selectedActivity ? (
        <EventDetail event={detail.data ?? selectedActivity} open loading={detail.status === "loading"}
          loadError={detail.status === "error"} onClose={onClose} />
      ) : (
        <>
          <header>
            <span>{t("activitySchedule")}</span><h2>{formatAgendaDate(activeDate, locale, t)}</h2>
            <small>{formatNumber(events.length)} {t(anomalyOnly ? "xmaSites" : "calendarEvents")}</small>
          </header>
          <div className="calendar-activity-list">
            {!events.length ? <div className="calendar-activity-empty">
              <CalendarDays size={26} strokeWidth={1.2} /><strong>{t("noActivity")}</strong><p>{t("selectHighlightedDate")}</p>
            </div> : null}
            {anomalyGroups.map((group, index) => <XmAnomalySeries key={group.key} group={group}
              eager={index === 0} formatNumber={formatNumber} language={language} t={t} />)}
            {missionDays.map((event, index) => (
              <button className="calendar-activity-card" type="button" key={event.id} onClick={() => onSelect(event.id)}>
                <MissionImage event={event} eager={index < 2} />
                <span className="calendar-activity-card__main">
                  <small><MapPin size={11} /> {displayCountryName(event.countryCode, event.country, language)}</small>
                  <strong title={event.city}>{displayCityName(event.countryCode, event.city, language)}</strong><span>{event.title}</span>
                </span>
                <span className="calendar-activity-card__metrics">
                  <b>{event.missionCount != null ? `${formatNumber(event.missionCount)} ${t("missions")}` : t("unknownMissionCount")}</b>
                  <b><Star size={11} fill="currentColor" />{typeof event.averageRating === "number" ? `${event.averageRating.toFixed(1)}%` : t("noRating")}</b>
                  <b><Users size={11} />{event.completions != null ? formatNumber(event.completions) : t("noRating")}</b>
                </span>
                <StatusBadge status={event.status} /><ChevronRight className="calendar-activity-card__arrow" size={17} />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

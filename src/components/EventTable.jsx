import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, MapPin, Star } from "lucide-react";
import { MissionDayTypeBadge } from "./MissionDayTypeBadge";
import { MissionImage } from "./MissionImage";
import { StatusBadge } from "./StatusBadge";
import { useLanguage } from "../i18n.jsx";
import { displayCityName, displayCountryName } from "../utils/locations";
import { sortEventsByDate } from "../utils/archive";

export function EventTable({
  events,
  selectedId,
  onSelect,
  visibleCount,
  onLoadMore,
  onResetFilters,
}) {
  const { formatNumber, language, t } = useLanguage();
  const [dateSortDirection, setDateSortDirection] = useState("desc");
  const sortedEvents = useMemo(
    () => sortEventsByDate(events, dateSortDirection),
    [events, dateSortDirection],
  );
  const visibleEvents = sortedEvents.slice(0, visibleCount);
  const nextDateSortLabel = dateSortDirection === "desc"
    ? t("sortDateAscending")
    : t("sortDateDescending");

  if (!events.length) {
    return (
      <div className="empty-state">
        <span className="empty-state__target" />
        <strong>{t("noSignal")}</strong>
        <p>{t("noSignalDescription")}</p>
        {onResetFilters ? (
          <button className="command-button" type="button" onClick={onResetFilters}>
            {t("clearAllFilters")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="event-table">
      <div className="event-table__header">
        <span>{t("image")}</span>
        <span>{t("cityCountry")}</span>
        <span
          className="event-table__date-heading"
          role="columnheader"
          aria-sort={dateSortDirection === "desc" ? "descending" : "ascending"}
        >
          <button
            className="event-table__date-sort"
            type="button"
            aria-label={nextDateSortLabel}
            title={nextDateSortLabel}
            onClick={() => setDateSortDirection((current) => current === "desc" ? "asc" : "desc")}
          >
            {t("date")}
            {dateSortDirection === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        </span>
        <span>{t("completionCount")}</span>
        <span>{t("missionCount")}</span>
        <span>{t("averageRating")}</span>
        <span>{t("status")}</span>
      </div>

      <div className="event-table__body">
        {visibleEvents.map((event, index) => (
          <button
            type="button"
            className={`event-row ${event.id === selectedId ? "is-selected" : ""}`}
            key={event.id}
            aria-pressed={event.id === selectedId}
            onClick={() => onSelect(event.id)}
          >
            <MissionImage event={event} className="event-row__image" eager={index < 8} />
            <span className="event-row__place">
              <strong title={event.city}>{displayCityName(event.countryCode, event.city, language)}</strong>
              <small>
                <MapPin size={11} aria-hidden="true" />
                {displayCountryName(event.countryCode, event.country, language)}{event.region ? ` · ${event.region}` : ""}
                <MissionDayTypeBadge type={event.missionDayType} />
              </small>
            </span>
            <time dateTime={event.date ?? undefined}>{event.date ?? t("dateUnknown")}</time>
            <span className="event-row__completions">
              {event.completions != null ? formatNumber(event.completions) : "—"}
              <small>{t("completionCount")}</small>
            </span>
            <span className="event-row__count">
              {event.missionCount != null ? formatNumber(event.missionCount) : "—"}
              <small>{t("missions")}</small>
            </span>
            <span className="event-row__rating">
              <Star size={13} fill="currentColor" />
              {typeof event.averageRating === "number"
                ? `${event.averageRating.toFixed(1)}%`
                : t("noRating")}
            </span>
            <StatusBadge status={event.status} />
          </button>
        ))}
      </div>

      {visibleEvents.length < events.length ? (
        <button className="load-more" type="button" onClick={onLoadMore}>
          {t("loadNext")}
          <span>
            {formatNumber(visibleEvents.length)} / {formatNumber(events.length)}
          </span>
        </button>
      ) : null}
    </div>
  );
}

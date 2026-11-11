import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, MapPin, Star } from "lucide-react";
import { ActivityTypeBadge } from "../../components/ActivityTypeBadge";
import { MissionImage } from "../../components/MissionImage";
import { StatusBadge } from "../../components/StatusBadge";
import { useLanguage } from "../../i18n.jsx";
import { displayCityName, displayCountryName } from "../../domain/geography/locations";
import { sortEventsByDate } from "../../domain/archive";
import { eventActivityType } from "../../domain/activityTypes";
import { formatAverageMissionDistance, formatAverageMissionTime } from "../../utils/missionAverages";

export function EventTable({
  events,
  selectedId,
  onSelect,
  page = 1,
  onPageChange,
  onResetFilters,
}) {
  const { formatNumber, language, t } = useLanguage();
  const [dateSortDirection, setDateSortDirection] = useState("desc");
  const sortedEvents = useMemo(
    () => sortEventsByDate(events, dateSortDirection),
    [events, dateSortDirection],
  );
  const bodyRef = useRef(null);
  const pageSize = 60;
  const pageCount = Math.max(1, Math.ceil(sortedEvents.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const startIndex = (currentPage - 1) * pageSize;
  const visibleEvents = sortedEvents.slice(startIndex, startIndex + pageSize);
  function changePage(number) {
    onPageChange?.(number);
    bodyRef.current?.scrollTo({ top: 0 });
    bodyRef.current?.closest(".primary-surface")?.scrollTo({ top: 0 });
  }
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
            onClick={() => {
              setDateSortDirection((current) => current === "desc" ? "asc" : "desc");
              changePage(1);
            }}
          >
            {t("date")}
            {dateSortDirection === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        </span>
        <span>{t("missionCount")}</span>
        <span className="event-table__average-distance-heading">{t("averageMissionDistance")}</span>
        <span className="event-table__average-time-heading">{t("averageMissionTime")}</span>
        <span>{t("averageRating")}</span>
        <span>{t("status")}</span>
      </div>

      <div className="event-table__body" ref={bodyRef}>
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
                <ActivityTypeBadge type={eventActivityType(event)} />
              </small>
            </span>
            <time dateTime={event.date ?? undefined}>{event.date ?? t("dateUnknown")}</time>
            <span className="event-row__count">
              {event.missionCount != null ? formatNumber(event.missionCount) : "—"}
              <small>{t("missions")}</small>
            </span>
            <span className="event-row__average event-row__average-distance" title={event.missionDistanceSampleCount != null ? t("missionAverageSamples", { count: formatNumber(event.missionDistanceSampleCount) }) : undefined}>
              <small>{t("averageMissionDistance")}</small>
              <b>{formatAverageMissionDistance(event.averageMissionDistanceMeters, language)}</b>
            </span>
            <span className="event-row__average event-row__average-time" title={event.missionTimeSampleCount != null ? t("missionAverageSamples", { count: formatNumber(event.missionTimeSampleCount) }) : undefined}>
              <small>{t("averageMissionTime")}</small>
              <b>{formatAverageMissionTime(event.averageMissionTimeMilliseconds, language)}</b>
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

      <nav className="archive-pagination" aria-label={t("archivePagination")}>
        <span className="archive-pagination__summary" role="status">
          {t("archivePageRange", {
            start: formatNumber(startIndex + 1),
            end: formatNumber(startIndex + visibleEvents.length),
            total: formatNumber(events.length),
          })}
        </span>
        <div className="archive-pagination__controls">
          <button type="button" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}>
            {t("previousPage")}
          </button>
          <select aria-label={t("goToPage")} value={currentPage} onChange={(event) => changePage(Number(event.target.value))}>
            {Array.from({ length: pageCount }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {t("archivePageNumber", { page: formatNumber(index + 1), total: formatNumber(pageCount) })}
              </option>
            ))}
          </select>
          <button type="button" disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}>
            {t("nextPage")}
          </button>
        </div>
      </nav>
    </div>
  );
}

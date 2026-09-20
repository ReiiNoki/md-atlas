import { ChevronDown, MapPin, Star } from "lucide-react";
import { MissionImage } from "./MissionImage";
import { StatusBadge } from "./StatusBadge";
import { useLanguage } from "../i18n.jsx";
import { displayCityName, displayCountryName } from "../utils/locations";

export function EventTable({
  events,
  selectedId,
  onSelect,
  visibleCount,
  onLoadMore,
  onResetFilters,
}) {
  const { formatNumber, language, t } = useLanguage();
  const visibleEvents = events.slice(0, visibleCount);

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
      <div className="event-table__header" aria-hidden="true">
        <span>{t("image")}</span>
        <span>{t("cityCountry")}</span>
        <span>
          {t("date")} <ChevronDown size={12} />
        </span>
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
              </small>
            </span>
            <time dateTime={event.date ?? undefined}>{event.date ?? t("dateUnknown")}</time>
            <span className="event-row__count">
              {event.missionCount != null ? formatNumber(event.missionCount) : "—"}
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

import { ExternalLink, Pin, Radio, X } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { useLanguage } from "../i18n.jsx";
import { displayCityName, displayCountryName } from "../domain/geography/locations";
import { activityFeedSections } from "../domain/activityFeed.js";

const regions = ["all", "APAC", "EMEA", "AMER"];

export function EventFeed({
  events,
  region,
  onRegionChange,
  onSelect,
  onOpenArchive,
  onClose,
  open,
}) {
  const { formatNumber, language, t } = useLanguage();
  const { upcoming, recent } = activityFeedSections(events);
  const locationLabel = (event) =>
    `${displayCityName(event.countryCode, event.city, language)}, ${displayCountryName(event.countryCode, event.country, language)}`;

  return (
    <section
      id="event-feed"
      className={`event-feed ${open ? "is-open" : ""}`}
      aria-label={t("activityFeed")}
      aria-hidden={!open}
      inert={!open}
    >
      <header>
        <span>
          <Radio size={14} strokeWidth={1.35} />
          {t("activityFeed")}
        </span>
        <nav aria-label={t("activityRegions")}>
          {regions.map((item) => (
            <button
              type="button"
              className={region === item ? "is-active" : ""}
              key={item}
              onClick={() => onRegionChange(item)}
            >
              {item === "all" ? t("all") : item}
            </button>
          ))}
        </nav>
        <button
          className="event-feed__close"
          type="button"
          title={t("closeActivityFeed")}
          aria-label={t("closeActivityFeed")}
          onClick={onClose}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </header>

      <div className="event-feed__content">
        <section className="event-feed__upcoming" aria-labelledby="feed-upcoming-title">
          <h3 id="feed-upcoming-title"><Pin size={12} aria-hidden="true" />{t("nextMissionDay")}</h3>
          {upcoming ? (
            <button className="event-feed__upcoming-card" type="button"
              data-event-id={upcoming.id} title={`${upcoming.date} · ${upcoming.title}`}
              onClick={() => onSelect(upcoming.id)}>
              <time dateTime={upcoming.date}>{upcoming.date}</time>
              <StatusBadge status={upcoming.status} />
              <strong title={locationLabel(upcoming)}>{locationLabel(upcoming)}</strong>
              <span>{upcoming.missionCount != null
                ? `${formatNumber(upcoming.missionCount)} ${t("missions")}`
                : t("unknownMissionCount")}</span>
            </button>
          ) : <p className="event-feed__empty">{t("noUpcomingMissionDay")}</p>}
        </section>

        <section className="event-feed__recent" aria-labelledby="feed-recent-title">
          <h3 id="feed-recent-title">{t("recentMissionDays")}</h3>
          <div className="event-feed__rows">
            {recent.map((event) => (
              <button type="button" key={event.id} data-event-id={event.id}
                title={`${event.date} · ${event.title}`} onClick={() => onSelect(event.id)}>
                <i aria-hidden="true" />
                <time dateTime={event.date}>{event.date}</time>
                <strong title={locationLabel(event)}>{locationLabel(event)}</strong>
                <span>
                  {event.missionCount != null
                    ? `${formatNumber(event.missionCount)} ${t("missions")}`
                    : t("unknownMissionCount")}
                </span>
                <span>
                  {typeof event.averageRating === "number"
                    ? `${event.averageRating.toFixed(1)}%`
                    : t("noRating")}
                </span>
                <StatusBadge status={event.status} />
              </button>
            ))}
          </div>
          {!recent.length ? <p className="event-feed__empty">{t("noRecentMissionDay")}</p> : null}
        </section>
      </div>

      <button className="event-feed__archive" type="button" onClick={onOpenArchive}>
        {t("viewAllArchive")}
        <ExternalLink size={13} />
      </button>
    </section>
  );
}

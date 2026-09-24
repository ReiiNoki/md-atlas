import { ExternalLink, Radio, X } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { useLanguage } from "../i18n.jsx";
import { displayCityName, displayCountryName } from "../utils/locations";

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

      <div className="event-feed__rows">
        {events.slice(0, 4).map((event) => (
          <button type="button" key={event.id} onClick={() => onSelect(event.id)}>
            <i />
            <time>{event.date ?? t("dateUnknown")}</time>
            <strong>
              {displayCityName(event.countryCode, event.city, language)}, {displayCountryName(event.countryCode, event.country, language)}
            </strong>
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

      <button className="event-feed__archive" type="button" onClick={onOpenArchive}>
        {t("viewAllArchive")}
        <ExternalLink size={13} />
      </button>
    </section>
  );
}

import { useEffect, useRef } from "react";
import {
  Clock3,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Route,
  Star,
  Users,
  X,
} from "lucide-react";
import { MissionDayTypeBadge } from "./MissionDayTypeBadge";
import { MissionImage } from "./MissionImage";
import { StatusBadge } from "./StatusBadge";
import { useLanguage } from "../i18n.jsx";
import { displayCityName, displayCountryName } from "../utils/locations";

const formatCoordinate = (value, positive, negative, fallback) => {
  if (typeof value !== "number") return fallback;
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
};

const hasCoordinates = (event) =>
  typeof event.lat === "number" &&
  Number.isFinite(event.lat) &&
  Math.abs(event.lat) <= 90 &&
  typeof event.lng === "number" &&
  Number.isFinite(event.lng) &&
  Math.abs(event.lng) <= 180;

export function EventDetail({
  event,
  open,
  onClose,
  compact = false,
  loading = false,
  loadError = false,
  onRetryDetail,
}) {
  const { formatNumber, language, t } = useLanguage();
  const panelRef = useRef(null);
  const previousOpenRef = useRef(false);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    if (open && !previousOpenRef.current) {
      restoreFocusRef.current = document.activeElement;
      panelRef.current?.focus();
    } else if (!open && previousOpenRef.current) {
      const trigger = restoreFocusRef.current;
      if (trigger?.isConnected) trigger.focus();
      restoreFocusRef.current = null;
    }
    previousOpenRef.current = open;
  }, [open]);

  useEffect(
    () => () => {
      const trigger = restoreFocusRef.current;
      if (trigger?.isConnected) trigger.focus();
    },
    [],
  );

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (keyboardEvent) => {
      if (keyboardEvent.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!event) return null;
  const missions = event.missions ?? [];
  const coordinatesAvailable = hasCoordinates(event);

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      className={`detail-panel ${open ? "is-open" : ""}`}
      aria-label={t("eventDossier")}
      aria-labelledby="event-detail-title"
      aria-hidden={!open}
      inert={!open}
    >
      <div className="detail-panel__heading">
        <div className="detail-panel__identity">
          <span className="section-code">{compact ? t("selectedEvent") : t("eventDossier")}</span>
          <h2 id="event-detail-title" title={event.city}>{displayCityName(event.countryCode, event.city, language)}</h2>
          <p>{displayCountryName(event.countryCode, event.country, language)}</p>
        </div>
        <div className="detail-actions">
          {event.url ? (
            <a
              className="icon-button detail-actions__banner"
              href={event.url}
              target="_blank"
              rel="noreferrer"
              aria-label={event.status === "scheduled" ? t("viewOfficialSchedule") : t("viewBanner")}
              title={event.status === "scheduled" ? t("viewOfficialSchedule") : t("viewBanner")}
            >
              {event.status === "scheduled" ? (
                <ExternalLink size={18} aria-hidden="true" />
              ) : (
                <img src={`${import.meta.env.BASE_URL}bannergress-logo.png`} alt="" aria-hidden="true" />
              )}
            </a>
          ) : (
            <span className="icon-button detail-actions__banner is-disabled" role="img" aria-label={t("bannerUnavailable")} title={t("bannerUnavailable")}>
              <img src={`${import.meta.env.BASE_URL}bannergress-logo.png`} alt="" aria-hidden="true" />
            </span>
          )}
          {coordinatesAvailable ? (
            <a
              className="icon-button detail-actions__map"
              href={`https://www.google.com/maps?q=${event.lat},${event.lng}`}
              target="_blank"
              rel="noreferrer"
              aria-label={t("openInMap")}
              title={t("openInMap")}
            >
              <MapPin size={18} strokeWidth={1.45} />
            </a>
          ) : null}
        </div>
        <button
          className="icon-button icon-button--quiet"
          type="button"
          aria-label={t("closeDetails")}
          title={t("closeDetails")}
          onClick={onClose}
        >
          <X size={19} strokeWidth={1.3} />
        </button>
      </div>

      <div className="detail-panel__body" key={event.id}>
      <div className="detail-art">
        <span className="detail-art__axis detail-art__axis--x" />
        <span className="detail-art__axis detail-art__axis--y" />
        <MissionImage event={event} eager={open} retryable />
        {event.picture ? (
          <a
            className="detail-art__open"
            href={event.picture}
            target="_blank"
            rel="noreferrer"
          >
            {t("viewOriginalImage")}
          </a>
        ) : null}
        <span className="detail-art__coordinate">SIG // {event.countryCode ?? "XX"}</span>
      </div>

      <dl className="event-facts">
        <div>
          <dt>{t("date")}</dt>
          <dd>{event.date ?? t("dateUnknown")}</dd>
        </div>
        <div>
          <dt>{t("region")}</dt>
          <dd>{event.region}</dd>
        </div>
        <div>
          <dt>{t("missionDayType")}</dt>
          <dd><MissionDayTypeBadge type={event.missionDayType} /></dd>
        </div>
        <div>
          <dt>{t("missionCount")}</dt>
          <dd>
            {event.missionCount != null
              ? formatNumber(event.missionCount)
              : t("unknownMissionCount")}
          </dd>
        </div>
        <div>
          <dt>{t("status")}</dt>
          <dd>
            <StatusBadge status={event.status} />
          </dd>
        </div>
        <div>
          <dt>{t("averageRating")}</dt>
          <dd className="fact-rating">
            <Star size={13} fill="currentColor" />
            {typeof event.averageRating === "number"
              ? `${event.averageRating.toFixed(1)}%`
              : t("noRating")}
          </dd>
        </div>
        <div>
          <dt>{t("completions")}</dt>
          <dd>{event.completions != null ? formatNumber(event.completions) : t("noRating")}</dd>
        </div>
        <div className="event-facts__wide">
          <dt>{t("coordinates")}</dt>
          <dd>
            {formatCoordinate(event.lat, "N", "S", t("noRating"))}, {formatCoordinate(event.lng, "E", "W", t("noRating"))}
          </dd>
        </div>
      </dl>

      {!compact ? (
        <div className="mission-list" aria-busy={loading}>
          <div className="mission-list__header">
            <span>
              {t("missionListHeading", {
                count:
                  event.missionCount != null
                    ? formatNumber(event.missionCount)
                    : t("unknownMissionCount"),
              })}
            </span>
            <span>{t("rating")}</span>
          </div>
          {loading ? (
            <div className="detail-loading" role="status">
              <LoaderCircle size={18} /> {t("loadingMissions")}
            </div>
          ) : null}
          {loadError ? (
            <div className="detail-loading detail-loading--error" role="alert">
              <span>{t("missionDetailsLoadFailed")}</span>
              {onRetryDetail ? (
                <button className="command-button" type="button" onClick={onRetryDetail}>
                  {t("retry")}
                </button>
              ) : null}
            </div>
          ) : null}
          {!loading && !loadError && !missions.length ? (
            <div className="detail-loading">{t("missionDetailsPending")}</div>
          ) : null}
          {!loading && !loadError
            ? missions.map((mission) => {
                const MissionRow = mission.intelUrl ? "a" : "div";
                const linkProps = mission.intelUrl
                  ? { href: mission.intelUrl, target: "_blank", rel: "noreferrer" }
                  : {};
                return (
                  <MissionRow className="mission-row" {...linkProps} key={mission.id}>
                    <span className="mission-row__index">
                      {String(mission.index).padStart(2, "0")}
                    </span>
                    <span className="mission-row__main">
                      <strong title={mission.title}>{mission.title}</strong>
                      <small>
                        {mission.distanceText ? (
                          <>
                            <Route size={11} /> {mission.distanceText}
                          </>
                        ) : null}
                        {mission.timeText ? (
                          <>
                            <Clock3 size={11} /> {mission.timeText}
                          </>
                        ) : null}
                        {mission.completions != null ? (
                          <>
                            <Users size={11} /> {formatNumber(mission.completions)}
                          </>
                        ) : null}
                      </small>
                    </span>
                    <span className="mission-row__rating">
                      <Star size={11} fill="currentColor" />
                      {typeof mission.rating === "number" ? mission.rating.toFixed(1) : "—"}
                    </span>
                  </MissionRow>
                );
              })
            : null}
        </div>
      ) : null}
      </div>
    </aside>
  );
}

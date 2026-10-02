import { formatLocalizedNumber } from "../../../i18n/formatters.js";
import { displayCityName, displayCountryName } from "../../../domain/geography/locations.js";

function ratingText(value, t) {
  return typeof value === "number" ? `${value.toFixed(1)}%` : t("noRating");
}

function locationText(row, language) {
  return `${displayCityName(row.countryCode, row.city, language)}, ${displayCountryName(row.countryCode, row.country, language)}`;
}

function RankingTable({ title, subtitle, rows, type, language, onSelect, t }) {
  const isEvent = type === "event";
  return (
    <section className="data-panel data-rating-panel">
      <header>
        <div>
          <span>{t("ratingRanking")}</span>
          <h2>{title}</h2>
        </div>
        <small>{subtitle}</small>
      </header>
      <div className={`data-rating-head ${isEvent ? "data-rating-head--event" : ""}`}>
        <span>{t("rank")}</span>
        <span>{isEvent ? t("events") : t("mission")}</span>
        <span>{t("location")}</span>
        {isEvent ? <span>{t("ratedMissions")}</span> : null}
        <span>{t("rating")}</span>
        <span>{t("completions")}</span>
      </div>
      {rows.map((row, index) => (
        <button
          className={`data-rating-row ${isEvent ? "data-rating-row--event" : ""}`}
          type="button"
          key={isEvent ? row.id : row.id}
          onClick={() => onSelect(isEvent ? row.id : row.eventId)}
        >
          <b>{String(index + 1).padStart(2, "0")}</b>
          <strong>{isEvent ? row.title || row.city : row.title}</strong>
          <span title={locationText(row, language)}>{locationText(row, language)}</span>
          {isEvent ? <span>{formatLocalizedNumber(row.ratedMissions, language)}</span> : null}
          <span>{ratingText(row.rating, t)}</span>
          <em>{formatLocalizedNumber(row.completions ?? 0, language)}</em>
        </button>
      ))}
    </section>
  );
}

export function RatingRankingsPanel({ stats, language, onSelect, t }) {
  return (
    <div className="data-rating-grid">
      <RankingTable
        title={t("topRatedEvents")}
        subtitle={t("averageMissionRating")}
        rows={stats.topRatedEvents}
        type="event"
        language={language}
        onSelect={onSelect}
        t={t}
      />
      <RankingTable
        title={t("lowestRatedEvents")}
        subtitle={t("averageMissionRating")}
        rows={stats.lowestRatedEvents}
        type="event"
        language={language}
        onSelect={onSelect}
        t={t}
      />
      <RankingTable
        title={t("topRatedMissions")}
        subtitle={t("singleMissionRating")}
        rows={stats.topRatedMissions}
        type="mission"
        language={language}
        onSelect={onSelect}
        t={t}
      />
      <RankingTable
        title={t("lowestRatedMissions")}
        subtitle={t("singleMissionRating")}
        rows={stats.lowestRatedMissions}
        type="mission"
        language={language}
        onSelect={onSelect}
        t={t}
      />
    </div>
  );
}

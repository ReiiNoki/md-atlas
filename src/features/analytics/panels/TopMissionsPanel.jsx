import { formatLocalizedNumber } from "../../../i18n/formatters.js";
import { displayCityName, displayCountryName } from "../../../domain/geography/locations.js";

export function TopMissionsPanel({ missions, language, onSelect, t }) {
  return (
    <section className="data-panel data-top-missions">
      <header>
        <div>
          <span>{t("activityRanking")}</span>
          <h2>{t("mostCompletedMissions")}</h2>
        </div>
        <small>{t("recordedCompletions")}</small>
      </header>
      <div className="data-mission-head">
        <span>{t("rank")}</span>
        <span>{t("mission")}</span>
        <span>{t("location")}</span>
        <span>{t("rating")}</span>
        <span>{t("completions")}</span>
      </div>
      {missions.map((mission, index) => (
        <button
          className="data-mission-row"
          type="button"
          key={mission.id}
          onClick={() => onSelect(mission.eventId)}
        >
          <b>{String(index + 1).padStart(2, "0")}</b>
          <strong>{mission.title}</strong>
          <span title={`${mission.city}, ${displayCountryName(mission.countryCode, mission.country, language)}`}>
            {displayCityName(mission.countryCode, mission.city, language)}, {displayCountryName(mission.countryCode, mission.country, language)}
          </span>
          <span>
            {typeof mission.rating === "number"
              ? `${mission.rating.toFixed(1)}%`
              : t("noRating")}
          </span>
          <em>{formatLocalizedNumber(mission.completions, language)}</em>
        </button>
      ))}
    </section>
  );
}

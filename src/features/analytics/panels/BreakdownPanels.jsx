import { Globe2 } from "lucide-react";
import { formatLocalizedNumber } from "../../../i18n/formatters.js";
import { BreakdownDonut } from "./BreakdownDonut";
import { compactNumber } from "../../../domain/statistics";
import { displayCountryName } from "../../../domain/geography/locations";

function buildBreakdownItems(stats, t, language) {
  const years = stats.years.map((year) => ({
    id: String(year.year ?? "unknown"),
    label: String(year.label),
    missions: year.missions,
    events: year.events,
    completions: year.completions,
  }));
  const leadingCountries = stats.allCountries.slice(0, 10).map((country) => ({
    id: country.code || country.country,
    label: displayCountryName(country.code, country.country, language),
    missions: country.missions,
    events: country.events,
    completions: country.completions,
  }));
  const remainingCountries = stats.allCountries.slice(10);
  const countries = remainingCountries.length
    ? [
        ...leadingCountries,
        {
          id: "other-countries",
          label: t("otherCountries"),
          missions: remainingCountries.reduce(
            (total, country) => total + country.missions,
            0,
          ),
          events: remainingCountries.reduce(
            (total, country) => total + country.events,
            0,
          ),
          completions: remainingCountries.reduce(
            (total, country) => total + country.completions,
            0,
          ),
          color: "#687a83",
        },
      ]
    : leadingCountries;
  const regions = stats.regions.map((region, index) => ({
    id: region.region,
    label: region.region,
    missions: region.missions,
    events: region.events,
    completions: region.completions,
    color: ["#42d6df", "#72a9df", "#f2c14e"][index],
  }));
  return { years, countries, regions };
}

export function BreakdownPanels({ stats, language, t }) {
  const items = buildBreakdownItems(stats, t, language);
  const maxYearMissions = Math.max(1, ...stats.years.map((year) => year.missions));
  const maxCountryMissions = Math.max(
    1,
    ...stats.countries.map((country) => country.missions),
  );
  const maxSetCount = Math.max(1, ...stats.setSizes.map((set) => set.count));

  return (
    <>
      <div className="data-grid data-grid--primary">
        <section className="data-panel data-trend">
          <header>
            <div>
              <span>{t("byYear")}</span>
              <h2>{t("missionVolume")}</h2>
            </div>
            <small>{t("missionsByYearBar")}</small>
          </header>
          <div className="data-year-chart">
            {stats.years.map((year) => (
              <div className="data-year-row" key={year.year}>
                <time>{year.label}</time>
                <div className="data-track">
                  <i style={{ width: `${(year.missions / maxYearMissions) * 100}%` }} />
                </div>
                <strong>{formatLocalizedNumber(year.missions, language)}</strong>
                <span>{formatLocalizedNumber(year.events, language)} {t("events")}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="data-panel data-countries">
          <header>
            <div>
              <span>{t("byCountry")}</span>
              <h2>{t("topCountries")}</h2>
            </div>
            <Globe2 size={18} strokeWidth={1.2} />
          </header>
          <div className="data-country-list">
            {stats.countries.map((country, index) => (
              <div className="data-country-row" key={country.country}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <span>
                  <strong>{displayCountryName(country.code, country.country, language)}</strong>
                  <small>{formatLocalizedNumber(country.events, language)} {t("events")}</small>
                </span>
                <div className="data-track">
                  <i
                    style={{
                      width: `${(country.missions / maxCountryMissions) * 100}%`,
                    }}
                  />
                </div>
                <em>{formatLocalizedNumber(country.missions, language)}</em>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="data-grid data-grid--secondary">
        <section className="data-panel data-region-panel">
          <header>
            <div>
              <span>{t("byRegion")}</span>
              <h2>{t("regionalCoverage")}</h2>
            </div>
            <small>{t("currentFilterScope")}</small>
          </header>
          <BreakdownDonut
            items={items.regions}
            total={stats.missionCount}
            label={t("regionMissionDistribution")}
            language={language}
            t={t}
          />
          <div className="data-region-table">
            <div className="data-region-head">
              <span>{t("region")}</span>
              <span>{t("events")}</span>
              <span>{t("missions")}</span>
              <span>{t("rating")}</span>
              <span>{t("completions")}</span>
            </div>
            {stats.regions.map((region) => (
              <div className="data-region-row" key={region.region}>
                <strong>{region.region}</strong>
                <span>{formatLocalizedNumber(region.events, language)}</span>
                <span>{formatLocalizedNumber(region.missions, language)}</span>
                <span>
                  {region.rated
                    ? `${(region.ratings / region.rated).toFixed(1)}%`
                    : t("noRating")}
                </span>
                <span>{compactNumber(region.completions, language)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="data-panel data-set-panel">
          <header>
            <div>
              <span>{t("setProfile")}</span>
              <h2>{t("missionsPerEvent")}</h2>
            </div>
            <small>{t("commonSizes")}</small>
          </header>
          <div className="data-set-list">
            {stats.setSizes.map((set) => (
              <div className="data-set-row" key={set.size}>
                <strong>{formatLocalizedNumber(set.size, language)}</strong>
                <span>{t("missions")}</span>
                <div className="data-track">
                  <i style={{ width: `${(set.count / maxSetCount) * 100}%` }} />
                </div>
                <em>{formatLocalizedNumber(set.count, language)} {t("events")}</em>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

import { Filter, X } from "lucide-react";
import { useLanguage } from "../i18n.jsx";
import { displayCountryName } from "../utils/locations";

export function FilterConsole({ filters, years, countries = [], onFilterChange, onReset, onClose }) {
  const { language, formatNumber, t } = useLanguage();
  // Present countries by their localized display name instead of archive order.
  const sortedCountries = [...countries].sort((a, b) =>
    displayCountryName(a.code, a.country, language)
      .localeCompare(displayCountryName(b.code, b.country, language), language === "en" ? "en" : "zh-Hans-CN"),
  );

  return (
    <section className="filter-console" id="filter-console" aria-label={t("filters")}>
      <header>
        <span>
          <Filter size={14} />
          {t("filterConsole")}
        </span>
        <div>
          <button type="button" onClick={onReset}>
            {t("resetAll")}
          </button>
          <button type="button" aria-label={t("closeFilters")} onClick={onClose}>
            <X size={15} />
          </button>
        </div>
      </header>
      <label>
        {t("year")}
        <select
          value={filters.year}
          onChange={(event) => onFilterChange("year", event.target.value)}
        >
          <option value="all">{t("allYears")}</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("region")}
        <select
          value={filters.region}
          onChange={(event) => onFilterChange("region", event.target.value)}
        >
          <option value="all">{t("allRegions")}</option>
          <option value="APAC">APAC</option>
          <option value="EMEA">EMEA</option>
          <option value="AMER">AMER</option>
        </select>
      </label>
      <label>
        {t("country")}
        <select
          value={filters.country}
          onChange={(event) => onFilterChange("country", event.target.value)}
        >
          <option value="all">{t("allCountries")}</option>
          {sortedCountries.map(({ code, country, count }) => (
            <option key={code} value={code}>
              {displayCountryName(code, country, language)} ({formatNumber(count)})
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("status")}
        <select
          value={filters.status}
          onChange={(event) => onFilterChange("status", event.target.value)}
        >
          <option value="all">{t("allStatus")}</option>
          <option value="online">{t("online")}</option>
          <option value="partially_offline">{t("partiallyOffline")}</option>
          <option value="scheduled">{t("scheduled")}</option>
          <option value="offline">{t("offline")}</option>
        </select>
      </label>
    </section>
  );
}

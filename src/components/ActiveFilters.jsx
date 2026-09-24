import { useRef } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../i18n.jsx";
import { displayCountryName } from "../utils/locations";
import { activeFilterEntries } from "../utils/filters";

const filterLabels = {
  year: (value, t) => value,
  region: (value, t) => value,
  country: (value, t, language) => displayCountryName(value, undefined, language),
  missionDayType: (value, t) =>
    ({
      "md-xma": t("mdTypeXma"),
      "md-standard": t("mdTypeStandard"),
      "md-lite": t("mdTypeLite"),
    })[value] ?? value,
  status: (value, t) =>
    ({
      online: t("online"),
      offline: t("offline"),
      partially_offline: t("partiallyOffline"),
      scheduled: t("scheduled"),
    })[value] ?? value,
  query: (value, t) => t("searchFilterLabel", { value }),
};

export function ActiveFilters({ filters, resultCount, searchState = "ready", pending = false, onClear, onReset }) {
  const { formatNumber, language, t } = useLanguage();
  const chipsRef = useRef(null);
  const entries = activeFilterEntries(filters);
  if (!entries.length) return null;

  return (
    <section className="active-filters" aria-label={t("activeFilters")}>
      <div className="active-filters__chips" ref={chipsRef}>
        {entries.map(([key, value]) => (
          <button
            className="filter-chip"
            type="button"
            key={key}
            onClick={(event) => {
              const remaining = [...chipsRef.current.querySelectorAll("button")]
                .filter((button) => button !== event.currentTarget);
              remaining[0]?.focus();
              onClear(key);
            }}
            title={filterLabels[key]?.(value, t, language) ?? value}
            aria-label={t("clearFilter", {
              label: filterLabels[key]?.(value, t, language) ?? value,
            })}
          >
            <span>{filterLabels[key]?.(value, t, language) ?? value}</span>
            <X size={13} aria-hidden="true" />
          </button>
        ))}
      </div>
      <strong role="status" aria-live="polite" aria-atomic="true" aria-busy={pending || searchState === "loading"}>
        {searchState === "ready"
          ? t("filteredResults", { count: formatNumber(resultCount) })
          : t(searchState === "error" ? "searchResultsUnavailable" : "searchResultsPending")}
      </strong>
      <button className="active-filters__reset" type="button" onClick={onReset}>
        {t("clearAllFilters")}
      </button>
    </section>
  );
}

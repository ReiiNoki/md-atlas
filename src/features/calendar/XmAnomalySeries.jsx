import { useState } from "react";
import { Globe2, MapPin } from "lucide-react";
import { useLanguage } from "../../i18n.jsx";
import { XM_ANOMALY_FALLBACK_LOGO, xmAnomalyLogoPath } from "../../utils/xmAnomalyLogos";
import { activityCountry, activityLocation } from "./calendarLabels";

function roleLabel(role, t) {
  const keys = { primary: "xmaRolePrimary", satellite: "xmaRoleSatellite", site: "xmaRoleSite",
    "shard-game": "xmaRoleShardGame", "impact-zone": "xmaRoleImpactZone", global: "xmaRoleGlobal" };
  return t(keys[role] ?? "xmaRoleSite");
}

function XmAnomalyLogo({ series, eager = false }) {
  const { t } = useLanguage();
  const preferredPath = xmAnomalyLogoPath(series);
  const [failedPath, setFailedPath] = useState(null);
  const imagePath = failedPath === preferredPath ? XM_ANOMALY_FALLBACK_LOGO : preferredPath;
  return (
    <span className="calendar-xma-logo">
      <img src={`${import.meta.env.BASE_URL}${imagePath}`} alt={t("xmAnomalyLogoAlt", { series })}
        loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"}
        width="256" height="256" decoding="async" onError={() => setFailedPath(preferredPath)} />
    </span>
  );
}

export function XmAnomalySeries({ group, eager, formatNumber, language, t }) {
  const statuses = [...new Set(group.sites.map((site) => site.status))];
  const scopes = [...new Set(group.sites.map((site) => site.region === "GLOBAL" ? t("globalActivityScope") : site.region))];
  return (
    <article className="calendar-xma-series">
      <header className="calendar-xma-series__hero">
        <XmAnomalyLogo series={group.series} eager={eager} />
        <div className="calendar-xma-series__identity">
          <span>{t("xmAnomalySeries")}</span><h3>{group.series}</h3>
          <p>{formatNumber(group.sites.length)} {t("xmaSites")} · {scopes.join(" / ")}</p>
        </div>
        <div className="calendar-xma-series__statuses">
          {statuses.map((status) => <small className={`is-${status}`} key={status}>{t(status)}</small>)}
        </div>
      </header>
      <ol className="calendar-xma-sites">
        {group.sites.map((site, index) => (
          <li key={site.id}>
            <span className="calendar-xma-site__index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <span className="calendar-xma-site__place">
              <small>{site.siteRole === "global" ? <Globe2 size={11} /> : <MapPin size={11} />}{activityCountry(site, language, t)}</small>
              <strong>{activityLocation(site, language, t)}</strong>
            </span>
            <span className="calendar-xma-site__role">{roleLabel(site.siteRole, t)}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}

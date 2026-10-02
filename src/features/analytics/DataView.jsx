import { useMemo } from "react";
import {
  Activity,
  CalendarDays,
  Database,
  Route,
  Signal,
  Star,
  Users,
} from "lucide-react";
import { useLanguage } from "../../i18n.jsx";
import { BreakdownPanels } from "./panels/BreakdownPanels";
import { PublisherPanel } from "./panels/PublisherPanel";
import { RatingRankingsPanel } from "./panels/RatingRankingsPanel";
import { StatBlock } from "./panels/StatBlock";
import {
  buildStatistics,
  compactNumber,
  formatDistance,
  formatDuration,
} from "../../domain/statistics";
import { TopMissionsPanel } from "./panels/TopMissionsPanel";

export function DataView({ events, onSelect }) {
  const { formatNumber, language, t } = useLanguage();
  const unknownYearLabel = t("unknownYear");
  const stats = useMemo(
    () => buildStatistics(events, unknownYearLabel),
    [events, unknownYearLabel],
  );
  const onlineRate = stats.missionCount
    ? (stats.activeMissions / stats.missionCount) * 100
    : 0;

  return (
    <section className="data-view">
      <div className="surface-heading">
        <div>
          <span className="section-code">{t("archiveTelemetry")}</span>
          <h1>{t("missionData")}</h1>
        </div>
        <span className="surface-heading__metric">
          {formatNumber(stats.eventCount)} {t("events")} /{" "}
          {formatNumber(stats.missionCount)} {t("missions")}
        </span>
      </div>

      <div className="data-dashboard">
        <section className="data-stat-grid data-stat-grid--primary" aria-label={t("coreStats")}>
          <StatBlock
            icon={CalendarDays}
            label={t("events")}
            value={formatNumber(stats.eventCount)}
            meta={t("missionArchive")}
            color="var(--cyan)"
          />
          <StatBlock
            icon={Database}
            label={t("missionCount")}
            value={formatNumber(stats.missionCount)}
            meta={t("currentFilterScope")}
            color="var(--cyan)"
          />
          <StatBlock
            icon={Star}
            label={t("averageRating")}
            value={stats.averageRating ? `${stats.averageRating.toFixed(1)}%` : t("noRating")}
            meta={t("weightedScore")}
            color="var(--amber)"
          />
          <StatBlock
            icon={Activity}
            label={t("completions")}
            value={compactNumber(stats.totalCompletions, language)}
            meta={formatNumber(stats.totalCompletions)}
            color="var(--color-blue)"
          />
        </section>
        <section className="data-stat-grid data-stat-grid--secondary" aria-label={t("supportingStats")}>
          <StatBlock
            icon={Signal}
            label={t("availability")}
            value={`${onlineRate.toFixed(1)}%`}
            meta={t("onlineMissionSummary", {
              count: formatNumber(stats.activeMissions),
            })}
            color="var(--green)"
          />
          <StatBlock
            icon={Route}
            label={t("combinedRoute")}
            value={formatDistance(stats.totalDistance, language)}
            meta={`${formatDuration(stats.totalTime, language)} ${t("estimatedTime")}`}
            color="var(--cyan)"
          />
          <StatBlock
            icon={Users}
            label={t("missionAuthors")}
            value={formatNumber(stats.authorCount)}
            meta={t("uniqueAgentNames")}
            color="var(--color-blue)"
          />
        </section>

        <BreakdownPanels stats={stats} language={language} t={t} />
        <PublisherPanel stats={stats} language={language} t={t} />
        <TopMissionsPanel
          missions={stats.topMissions}
          language={language}
          onSelect={onSelect}
          t={t}
        />
        <RatingRankingsPanel
          stats={stats}
          language={language}
          onSelect={onSelect}
          t={t}
        />
      </div>
    </section>
  );
}

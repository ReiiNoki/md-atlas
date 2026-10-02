import { useState } from "react";
import { Shield } from "lucide-react";
import { formatLocalizedNumber } from "../../../i18n/formatters.js";
import { buildPublisherSlices, formatPublisherShare } from "../../../domain/statistics";

export function PublisherPanel({ stats, language, t }) {
  const [tooltip, setTooltip] = useState(null);
  const twoFactionMissionCount =
    stats.factionMissions.resistance + stats.factionMissions.enlightened;
  const resistanceShare = twoFactionMissionCount
    ? (stats.factionMissions.resistance / twoFactionMissionCount) * 100
    : 0;
  const enlightenedShare = twoFactionMissionCount ? 100 - resistanceShare : 0;
  const publisherSlices = buildPublisherSlices(stats);

  const showTooltip = (event, publisher, rank) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX || bounds.right;
    const pointerY = event.clientY || bounds.top + bounds.height / 2;
    const tooltipWidth = 224;
    const tooltipHeight = 204;
    const left = Math.max(
      8,
      Math.min(pointerX + 14, window.innerWidth - tooltipWidth - 8),
    );
    const top = Math.max(
      8,
      pointerY + tooltipHeight + 20 > window.innerHeight
        ? pointerY - tooltipHeight - 12
        : pointerY + 14,
    );
    setTooltip({ ...publisher, rank, left, top });
  };

  return (
    <section className="data-panel data-publishers">
      <header>
        <div>
          <span>{t("publisherAccounts")}</span>
          <h2>{t("missionsByPublisher")}</h2>
        </div>
        <span className="data-publisher-summary">
          <Shield size={16} strokeWidth={1.2} />
          {formatLocalizedNumber(stats.publishedMissionCount, language)} / {formatLocalizedNumber(stats.missionCount, language)} {t("publisherIdentified")}
        </span>
      </header>
      <div className="data-publisher-charts">
        <section className="data-chart-group">
          <h3>{t("factionDistribution")}</h3>
          <div className="data-chart-layout">
            <div
              className="data-faction-chart"
              role="img"
              aria-label={`${t("resistance")} ${resistanceShare.toFixed(1)}%, ${t("enlightened")} ${enlightenedShare.toFixed(1)}%`}
              style={{ "--resistance-share": `${resistanceShare}%` }}
            >
              <div>
                <strong>{formatLocalizedNumber(twoFactionMissionCount, language)}</strong>
                <small>{t("missions")}</small>
              </div>
            </div>
            <div className="data-faction-breakdown" aria-label={t("factionLegend")}>
              {[
                ["resistance", stats.factionMissions.resistance, resistanceShare],
                ["enlightened", stats.factionMissions.enlightened, enlightenedShare],
              ].map(([faction, count, percentage]) => (
                <div key={faction}>
                  <span className={`faction faction--${faction}`}>
                    <i /> {t(faction)}
                  </span>
                  <strong>{formatLocalizedNumber(count, language)}</strong>
                  <small>{percentage.toFixed(1)}%</small>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="data-chart-group data-chart-group--publishers">
          <h3>{t("publisherDistribution")}</h3>
          <div className="data-chart-layout">
            <div
              className="data-publisher-share-chart"
              role="img"
              aria-label={t("publisherShare")}
            >
              <svg viewBox="0 0 120 120">
                <circle className="data-publisher-share-track" cx="60" cy="60" r="46" />
                {publisherSlices.map((publisher, index) => (
                  <circle
                    aria-label={`${publisher.author}: ${formatLocalizedNumber(publisher.missions, language)} ${t("missions")}, ${formatPublisherShare(publisher.percentage)}`}
                    className={`data-publisher-share-slice ${
                      tooltip
                        ? tooltip.author === publisher.author
                          ? "is-active"
                          : "is-muted"
                        : ""
                    }`}
                    cx="60"
                    cy="60"
                    key={publisher.author}
                    onBlur={() => setTooltip(null)}
                    onFocus={(event) => showTooltip(event, publisher, index + 1)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setTooltip(null);
                    }}
                    onPointerEnter={(event) => showTooltip(event, publisher, index + 1)}
                    onPointerLeave={() => setTooltip(null)}
                    onPointerMove={(event) => showTooltip(event, publisher, index + 1)}
                    pathLength="100"
                    r="46"
                    role="img"
                    stroke={publisher.color}
                    strokeDasharray={`${publisher.dashPercentage} ${100 - publisher.dashPercentage}`}
                    strokeDashoffset={-publisher.offset}
                    tabIndex="0"
                  />
                ))}
              </svg>
              <div>
                <strong>{stats.authorCount}</strong>
                <small>{t("publisherAccounts")}</small>
              </div>
              {tooltip ? (
                <aside
                  className="data-publisher-tooltip"
                  role="tooltip"
                  style={{
                    "--publisher-color": tooltip.color,
                    left: tooltip.left,
                    top: tooltip.top,
                  }}
                >
                  <header>
                    <i />
                    <strong>{tooltip.author}</strong>
                  </header>
                  <dl>
                    <div>
                      <dt>{t("faction")}</dt>
                      <dd>{t(tooltip.faction)}</dd>
                    </div>
                    <div>
                      <dt>{t("missions")}</dt>
                      <dd>{formatLocalizedNumber(tooltip.missions, language)}</dd>
                    </div>
                    <div>
                      <dt>{t("missionShare")}</dt>
                      <dd>{formatPublisherShare(tooltip.percentage)}</dd>
                    </div>
                    <div>
                      <dt>{t("events")}</dt>
                      <dd>{formatLocalizedNumber(tooltip.events, language)}</dd>
                    </div>
                    <div>
                      <dt>{t("rank")}</dt>
                      <dd>#{tooltip.rank}</dd>
                    </div>
                  </dl>
                </aside>
              ) : null}
            </div>
            <div className="data-publisher-share-legend">
              {publisherSlices.map((publisher) => (
                <span key={publisher.author} style={{ "--publisher-color": publisher.color }}>
                  <i />
                  <b>{publisher.author}</b>
                  <small>{formatPublisherShare(publisher.percentage)}</small>
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>
      <div className="data-publisher-head">
        <span>{t("rank")}</span>
        <span>{t("publisherAccount")}</span>
        <span>{t("faction")}</span>
        <span>{t("missions")}</span>
        <span>{t("events")}</span>
      </div>
      {stats.publishers.map((publisher, index) => (
        <div className="data-publisher-row" key={publisher.author}>
          <b>{String(index + 1).padStart(2, "0")}</b>
          <span className="data-publisher-account">
            <strong className={`faction-text faction-text--${publisher.faction}`}>
              {publisher.author}
            </strong>
            <span className="data-track">
              <i
                className={`faction-bar faction-bar--${publisher.faction}`}
                style={{
                  width: `${
                    stats.publishedMissionCount
                      ? (publisher.missions / stats.publishedMissionCount) * 100
                      : 0
                  }%`,
                }}
              />
            </span>
          </span>
          <span className={`faction faction--${publisher.faction}`}>
            <i />
            {t(
              publisher.faction === "unknown"
                ? "factionUnknown"
                : publisher.faction,
            )}
          </span>
          <em>{formatLocalizedNumber(publisher.missions, language)}</em>
          <em>{formatLocalizedNumber(publisher.events, language)}</em>
        </div>
      ))}
    </section>
  );
}

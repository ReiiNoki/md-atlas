import { useState } from "react";
import { formatLocalizedNumber } from "../../../i18n/formatters.js";
import {
  BREAKDOWN_COLORS,
  compactNumber,
  formatPublisherShare,
} from "../../../domain/statistics";

function createBreakdownSlices(items, total) {
  return items.map((item, index, allItems) => {
    const percentage = total ? (item.missions / total) * 100 : 0;
    const offset = allItems.slice(0, index).reduce(
      (sum, candidate) => sum + (total ? (candidate.missions / total) * 100 : 0),
      0,
    );
    return {
      ...item,
      color: item.color ?? BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length],
      percentage,
      dashPercentage: percentage > 0.5 ? percentage - 0.2 : percentage,
      offset,
    };
  });
}

export function BreakdownDonut({ items, total, label, language, t }) {
  const [tooltip, setTooltip] = useState(null);
  const slices = createBreakdownSlices(items, total);

  const showTooltip = (event, slice) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX || bounds.right;
    const pointerY = event.clientY || bounds.top + bounds.height / 2;
    const width = 216;
    const height = 174;
    setTooltip({
      ...slice,
      left: Math.max(8, Math.min(pointerX + 14, window.innerWidth - width - 8)),
      top: Math.max(
        8,
        pointerY + height + 20 > window.innerHeight
          ? pointerY - height - 12
          : pointerY + 14,
      ),
    });
  };

  return (
    <div className="data-breakdown-visual">
      <div className="data-breakdown-donut" role="img" aria-label={label}>
        <svg viewBox="0 0 120 120">
          <circle className="data-breakdown-track" cx="60" cy="60" r="46" />
          {slices.map((slice) => (
            <circle
              aria-label={`${slice.label}: ${formatLocalizedNumber(slice.missions, language)} ${t("missions")}, ${formatPublisherShare(slice.percentage)}`}
              className={`data-breakdown-slice ${
                tooltip
                  ? tooltip.id === slice.id
                    ? "is-active"
                    : "is-muted"
                  : ""
              }`}
              cx="60"
              cy="60"
              key={slice.id}
              onBlur={() => setTooltip(null)}
              onFocus={(event) => showTooltip(event, slice)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setTooltip(null);
              }}
              onPointerEnter={(event) => showTooltip(event, slice)}
              onPointerLeave={() => setTooltip(null)}
              onPointerMove={(event) => showTooltip(event, slice)}
              pathLength="100"
              r="46"
              role="img"
              stroke={slice.color}
              strokeDasharray={`${slice.dashPercentage} ${100 - slice.dashPercentage}`}
              strokeDashoffset={-slice.offset}
              tabIndex="0"
            />
          ))}
        </svg>
        <div>
          <strong>{formatLocalizedNumber(total, language)}</strong>
          <small>{t("missions")}</small>
        </div>
      </div>
      <div className="data-breakdown-legend">
        {slices.map((slice) => (
          <span key={slice.id} style={{ "--slice-color": slice.color }}>
            <i />
            <b>{slice.label}</b>
            <small>{formatPublisherShare(slice.percentage)}</small>
          </span>
        ))}
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
            <strong>{tooltip.label}</strong>
          </header>
          <dl>
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
              <dt>{t("completions")}</dt>
              <dd>{compactNumber(tooltip.completions, language)}</dd>
            </div>
          </dl>
        </aside>
      ) : null}
    </div>
  );
}

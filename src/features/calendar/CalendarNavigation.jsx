import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "../../i18n.jsx";

export function CalendarNavigation({ activityType, onActivityType, years, months, activeYear, activeMonth, canGoPrevious, canGoNext, onMoveMonth, onYear, onPeriod }) {
  const { t } = useLanguage();
  return (
    <div className="surface-heading calendar-heading">
      <div>
        <span className="section-code">{t("archiveCalendar")}</span>
        <h1>{t("activityCalendar")}</h1>
      </div>
      <div className="calendar-heading__controls">
        <div className="calendar-type-control" aria-label={t("calendarActivityTypes")}>
          {[["all", "allActivities"], ["mission-day", "missionDayActivities"], ["xm-anomaly", "xmAnomalyActivities"]].map(([type, label]) => (
            <button type="button" className={activityType === type ? "is-active" : ""}
              aria-pressed={activityType === type} key={type} onClick={() => onActivityType(type)}>
              {t(label)}
            </button>
          ))}
        </div>
        <div className="calendar-period-control" aria-label={t("selectYearMonth")}>
          <button type="button" aria-label={t("previousMonth")} disabled={!canGoPrevious} onClick={() => onMoveMonth(-1)}>
            <ChevronLeft size={17} />
          </button>
          <select value={activeYear} onChange={(event) => onYear(Number(event.target.value))}>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
          <select value={activeMonth} onChange={(event) => onPeriod(activeYear, Number(event.target.value))}>
            {months.map((month, index) => <option key={month} value={index}>{month}</option>)}
          </select>
          <button type="button" aria-label={t("nextMonth")} disabled={!canGoNext} onClick={() => onMoveMonth(1)}>
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

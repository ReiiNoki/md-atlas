import { useLanguage } from "../i18n.jsx";
import { ACTIVITY_TYPE_MESSAGES, activityTypeLabel } from "../utils/activityTypes.js";

export function ActivityTypeBadge({ type }) {
  const { t } = useLanguage();
  const normalizedType = ACTIVITY_TYPE_MESSAGES[type] ? type : null;

  return (
    <span className={`activity-type${normalizedType ? ` activity-type--${normalizedType}` : ""}`}>
      {normalizedType ? activityTypeLabel(normalizedType, t) : t("unknown")}
    </span>
  );
}

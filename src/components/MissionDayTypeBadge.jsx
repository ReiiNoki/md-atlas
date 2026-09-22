import { useLanguage } from "../i18n.jsx";

const typeMessages = {
  "md-xma": "mdTypeXma",
  "md-lite": "mdTypeLite",
  "md-standard": "mdTypeStandard",
};

export function MissionDayTypeBadge({ type }) {
  const { t } = useLanguage();
  const normalizedType = typeMessages[type] ? type : "md-standard";

  return (
    <span className={`md-type md-type--${normalizedType}`}>
      {t(typeMessages[normalizedType])}
    </span>
  );
}

import { useLanguage } from "../i18n.jsx";
import { EVENT_TAG_MESSAGES, knownEventTags } from "../domain/eventTags.js";

export function EventTagBadges({ event }) {
  const { t } = useLanguage();
  const tags = knownEventTags(event);
  if (!tags.length) return null;
  return (
    <span className="event-tags" aria-label={t("eventTags")}>
      {tags.map((tag) => (
        <span className={`activity-type event-tag event-tag--${tag}`} key={tag} title={t("eventTagMosaicMdDescription")}>
          {t(EVENT_TAG_MESSAGES[tag])}
        </span>
      ))}
    </span>
  );
}

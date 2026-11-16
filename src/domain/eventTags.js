// Labels supplement (never replace) md-standard / md-xma / md-lite.
export const EVENT_TAG_MESSAGES = Object.freeze({ "mosaic-md": "eventTagMosaicMd" });
export const EVENT_TAG_IDS = Object.freeze(Object.keys(EVENT_TAG_MESSAGES));
const searchTerms = Object.freeze({
  "mosaic-md": ["mosaic-md", "Mosaic MD", "拼图 MD", "拼图MD", "拼圖 MD", "拼圖MD", "メダルアートMD"],
});

export function knownEventTags(event) {
  return Array.isArray(event?.tags)
    ? [...new Set(event.tags.filter((tag) => Object.hasOwn(EVENT_TAG_MESSAGES, tag)))]
    : [];
}

export function eventTagLabel(tag, t) {
  return Object.hasOwn(EVENT_TAG_MESSAGES, tag) ? t(EVENT_TAG_MESSAGES[tag]) : t("unknown");
}

export function eventTagSearchTerms(event) {
  return knownEventTags(event).flatMap((tag) => searchTerms[tag]);
}

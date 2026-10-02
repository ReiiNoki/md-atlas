export const OFFICIAL_MISSION_TYPES = Object.freeze([
  "goruck",
  "intel_ops",
  "brand_campaign",
  "anime_collaboration",
  "special_event",
]);

export const ACTIVITY_TYPES = Object.freeze([
  "md-xma",
  "md-standard",
  "md-lite",
  ...OFFICIAL_MISSION_TYPES,
]);

export const ACTIVITY_TYPE_MESSAGES = Object.freeze({
  "md-xma": "mdTypeXma",
  "md-standard": "mdTypeStandard",
  "md-lite": "mdTypeLite",
  goruck: "officialTypeGoruck",
  intel_ops: "officialTypeIntelOps",
  brand_campaign: "officialTypeBrandCampaign",
  anime_collaboration: "officialTypeAnimeCollaboration",
  special_event: "officialTypeSpecialEvent",
});

export function eventActivityType(event) {
  return event?.activityType ?? event?.missionDayType ?? null;
}

export function activityTypeLabel(type, t) {
  const key = ACTIVITY_TYPE_MESSAGES[type];
  return key ? t(key) : t("unknown");
}

import { displayCityName, displayCountryName } from "../../domain/geography/locations";

export function activityLocation(event, language, t) {
  if (event.calendarType === "xm-anomaly" && event.siteRole === "global") return t("globalActivity");
  return displayCityName(event.countryCode, event.city, language);
}

export function activityCountry(event, language, t) {
  if (event.calendarType === "xm-anomaly" && event.siteRole === "global") return t("globalActivityScope");
  return displayCountryName(event.countryCode, event.country, language);
}

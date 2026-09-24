import { displayCityName, displayCountryName } from "./locations.js";

// A banner address identifies its map pin, not necessarily the reach of its
// missions. These events cover multiple municipalities, prefectures or countries.
const REGIONAL_LOCATIONS = {
  "md-2024-恆春-efd9": { zh: "屏东县·恒春半岛", en: "Hengchun Peninsula, Pingtung County, Taiwan", ja: "台湾・屏東県恒春半島" },
  "md-洄瀾-6e16": { zh: "台湾地区·花莲县", en: "Hualien County, Taiwan", ja: "台湾・花蓮県" },
  "md2019-澎湖-c8f7": { zh: "台湾地区·澎湖县", en: "Penghu County, Taiwan", ja: "台湾・澎湖県" },
  "md-嘉義縣-61aa": { zh: "台湾地区·嘉义县", en: "Chiayi County, Taiwan", ja: "台湾・嘉義県" },
  "mdsss-mission-day-埼玉六宿-f249": { zh: "日本·埼玉县", en: "Saitama Prefecture, Japan", ja: "埼玉県" },
  "mdsgt-mission-day-杉戸-53df": { zh: "日本·埼玉县杉户町一带", en: "Sugito area, Saitama Prefecture, Japan", ja: "埼玉県杉戸町周辺" },
  "md-2023-kanmon-kaikyo-ab81": { zh: "日本·关门海峡（山口县、福冈县）", en: "Kanmon Straits (Yamaguchi and Fukuoka), Japan", ja: "関門海峡（山口県・福岡県）" },
  "mdas-missionday-at-sea-f883": { zh: "美国—开曼群岛—墨西哥", en: "United States – Cayman Islands – Mexico", ja: "アメリカ―ケイマン諸島―メキシコ" },
};

export function eventMapTitle(event) {
  return event.title?.trim() || event.city || "—";
}

export function eventMapLocation(event, language = "zh") {
  const regional = REGIONAL_LOCATIONS[event.id];
  if (regional) return regional[language] ?? regional.zh;
  // The original Bannergress address retains its administrative detail. Do not
  // derive an event-wide municipality from one pin or reverse-geocode at runtime.
  if (typeof event.address === "string" && event.address.trim()) return event.address.trim();
  return `${displayCityName(event.countryCode, event.city, language)}, ${displayCountryName(event.countryCode, event.country, language)}`;
}

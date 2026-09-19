import { CITY_NAMES_ZH } from "../data/cityNames.zh.js";

// Product-specific names take precedence over the runtime's region translations.
const COUNTRY_NAME_OVERRIDES = {
  CN: {
    zh: "中国大陆",
    en: "China",
    ja: "中国",
    aliases: ["China", "中国", "中國", "中国大陆", "中國大陸", "大陆", "大陸", "CN"],
  },
  TW: {
    zh: "台湾地区",
    en: "Taiwan",
    ja: "台湾",
    aliases: ["Taiwan", "台湾", "台灣", "臺灣", "中国台湾", "中國台灣", "台湾地区", "台灣地區", "TW"],
  },
  HK: {
    zh: "香港地区",
    en: "Hong Kong",
    ja: "香港",
    aliases: ["Hong Kong", "香港", "中国香港", "中國香港", "香港地区", "香港地區", "香港特别行政区", "香港特別行政區", "HK"],
  },
  MO: {
    zh: "澳门地区",
    en: "Macao",
    ja: "マカオ",
    aliases: ["Macao", "Macau", "澳门", "澳門", "中国澳门", "中國澳門", "澳门地区", "澳門地區", "澳门特别行政区", "澳門特別行政區", "MO"],
  },
};

const COUNTRY_TO_CODE = {
  taiwan: "TW",
  "hong kong": "HK",
  macao: "MO",
  macau: "MO",
};

const regionFormatters = {
  zh: new Intl.DisplayNames(["zh-CN"], { type: "region", fallback: "none" }),
  en: new Intl.DisplayNames(["en"], { type: "region", fallback: "none" }),
  ja: new Intl.DisplayNames(["ja"], { type: "region", fallback: "none" }),
};
const translatedNames = new Map();

export function normalizeCountryCode(countryCode, country) {
  const code = typeof countryCode === "string" ? countryCode.trim().toUpperCase() : "";
  if (/^[A-Z]{2}$/.test(code)) return code;
  const countryKey = typeof country === "string" ? country.trim().toLowerCase() : "";
  return Object.hasOwn(COUNTRY_TO_CODE, countryKey) ? COUNTRY_TO_CODE[countryKey] : undefined;
}

function namesForCode(code) {
  // ZZ is a placeholder, not a country to substitute for a source name.
  if (!code || code === "ZZ") return undefined;
  if (COUNTRY_NAME_OVERRIDES[code]) return COUNTRY_NAME_OVERRIDES[code];
  if (!translatedNames.has(code)) {
    translatedNames.set(code, {
      zh: regionFormatters.zh.of(code),
      en: regionFormatters.en.of(code),
      ja: regionFormatters.ja.of(code),
    });
  }
  return translatedNames.get(code);
}

export function displayCountryName(countryCode, country, language = "zh") {
  const code = normalizeCountryCode(countryCode, country);
  const names = namesForCode(code);
  const original = typeof country === "string" && country.trim() ? country : undefined;
  if (code && COUNTRY_NAME_OVERRIDES[code]) {
    return names[language] ?? names.zh;
  }
  // Keep source English labels; localize only the display, never aggregation keys.
  if (language === "en") return original ?? names?.en ?? "—";
  if (language === "ja") return names?.ja ?? original ?? "—";
  return names?.zh ?? original ?? "—";
}

const cityKey = (city) => typeof city === "string" ? city.normalize("NFC").trim().toLowerCase() : "";
const cityNames = new Map(Object.entries(CITY_NAMES_ZH).flatMap(([code, places]) =>
  Object.entries(places).map(([city, names]) => [`${code}|${cityKey(city)}`, names]),
));

function namesForCity(countryCode, city) {
  const code = normalizeCountryCode(countryCode);
  return code ? cityNames.get(`${code}|${cityKey(city)}`) : undefined;
}

export function displayCityName(countryCode, city, language = "zh") {
  const original = typeof city === "string" && city.trim() ? city : "—";
  return language === "zh" ? namesForCity(countryCode, city)?.[0] ?? original : original;
}

export function citySearchAliases(countryCode, city) {
  return [...new Set([city, ...(namesForCity(countryCode, city) ?? [])]
    .filter((value) => typeof value === "string" && value.trim()))];
}

export function countrySearchAliases(countryCode, country) {
  const code = normalizeCountryCode(countryCode, country);
  const names = namesForCode(code);
  return [...new Set([
    country,
    countryCode,
    code,
    names?.zh,
    names?.en,
    ...(names?.aliases ?? []),
  ].filter((value) => typeof value === "string" && value.trim()))];
}

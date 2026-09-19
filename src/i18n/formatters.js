export const LANGUAGE_LOCALES = {
  zh: "zh-CN",
  en: "en-US",
  ja: "ja-JP",
};

export function localeForLanguage(language) {
  return LANGUAGE_LOCALES[language] ?? LANGUAGE_LOCALES.zh;
}

export function formatLocalizedNumber(value, language, options) {
  return new Intl.NumberFormat(localeForLanguage(language), options).format(value);
}

export function formatLocalizedUnit(value, language, unit, options = {}) {
  return formatLocalizedNumber(value, language, {
    style: "unit",
    unit,
    unitDisplay: "short",
    ...options,
  });
}

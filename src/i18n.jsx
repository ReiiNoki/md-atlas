/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { localeForLanguage } from "./i18n/formatters.js";
import { translate } from "./i18n/messages.js";

const STORAGE_KEY = "mission-day-language";
const SUPPORTED_LANGUAGES = ["zh", "en", "ja"];
const DOCUMENT_LANGUAGES = { zh: "zh-CN", en: "en", ja: "ja" };
const LanguageContext = createContext(null);

function normalizeLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(language) ? language : "zh";
}

function persistLanguage(language) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Ignore unavailable storage in privacy-restricted browsers.
  }
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      return normalizeLanguage(localStorage.getItem(STORAGE_KEY));
    } catch {
      return "zh";
    }
  });

  useEffect(() => {
    document.documentElement.lang = DOCUMENT_LANGUAGES[language];
    document.title = translate(language, "pageTitle");
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", translate(language, "pageDescription"));
  }, [language]);

  const value = useMemo(() => {
    const locale = localeForLanguage(language);
    const numberFormatter = new Intl.NumberFormat(locale);
    const setLanguage = (nextLanguage) => {
      const next = normalizeLanguage(nextLanguage);
      setLanguageState(next);
      persistLanguage(next);
    };

    return {
      language,
      locale,
      setLanguage,
      toggleLanguage: () => {
        const index = SUPPORTED_LANGUAGES.indexOf(language);
        setLanguage(SUPPORTED_LANGUAGES[(index + 1) % SUPPORTED_LANGUAGES.length]);
      },
      t: (key, params) => translate(language, key, params),
      formatNumber: (number) => numberFormatter.format(number),
    };
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}

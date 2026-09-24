import { useEffect, useRef, useState } from "react";
import {
  Check,
  Languages,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useLanguage } from "../i18n.jsx";

const views = [
  { id: "map", label: "map" },
  { id: "archive", label: "archive" },
  { id: "calendar", label: "calendar" },
  { id: "data", label: "data" },
];

const languageOptions = [
  { id: "zh", label: "简体中文" },
  { id: "en", label: "English" },
  { id: "ja", label: "日本語" },
];

export function TopBar({
  activeView,
  onViewChange,
  filters,
  onFilterChange,
  filtersOpen,
  onToggleFilters,
  activeFilterCount = 0,
  filterButtonRef,
}) {
  const { language, setLanguage, t } = useLanguage();
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const searchInputRef = useRef(null);
  const searchToggleRef = useRef(null);
  const languagePickerRef = useRef(null);
  const languageButtonRef = useRef(null);
  const searchVisible = searchExpanded || filters.query.length > 0;

  useEffect(() => {
    if (searchExpanded) searchInputRef.current?.focus();
  }, [searchExpanded]);

  useEffect(() => {
    if (!languageMenuOpen) return undefined;

    const closeLanguageMenu = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "pointerdown" && languagePickerRef.current?.contains(event.target)) return;
      setLanguageMenuOpen(false);
      if (event.type === "keydown") languageButtonRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeLanguageMenu);
    document.addEventListener("keydown", closeLanguageMenu);
    return () => {
      document.removeEventListener("pointerdown", closeLanguageMenu);
      document.removeEventListener("keydown", closeLanguageMenu);
    };
  }, [languageMenuOpen]);

  const toggleSearch = () => {
    if (filters.query) {
      searchInputRef.current?.focus();
    } else {
      setSearchExpanded((expanded) => !expanded);
    }
  };

  return (
    <header className={`intel-topbar ${searchVisible ? "has-search" : ""}`}>
      <button
        className="intel-brand"
        type="button"
        aria-label={`MD Atlas — ${t("backToMap")}`}
        title={t("brandDescription")}
        onClick={() => onViewChange("map")}
      >
        <img
          className="intel-brand__mark"
          src={`${import.meta.env.BASE_URL}favicon.svg`}
          alt=""
          aria-hidden="true"
        />
        <span className="intel-brand__text">
          <strong>MD Atlas</strong>
          <small>{t("brandDescription")}</small>
        </span>
      </button>

      <nav className="intel-tabs" aria-label={t("mainViews")}>
        {views.map((view) => (
          <button
            type="button"
            key={view.id}
            className={activeView === view.id ? "is-active" : ""}
            aria-current={activeView === view.id ? "page" : undefined}
            onClick={() => onViewChange(view.id)}
          >
            {t(view.label)}
          </button>
        ))}
      </nav>

      <button
        ref={searchToggleRef}
        className="icon-button intel-search-toggle"
        type="button"
        aria-label={t(
          filters.query ? "editSearch" : searchVisible ? "closeSearch" : "openSearch",
        )}
        aria-expanded={searchVisible}
        aria-controls="archive-search"
        onClick={toggleSearch}
      >
        {searchVisible && !filters.query ? <X size={18} /> : <Search size={18} />}
      </button>

      <div className="intel-search" id="archive-search" role="search">
        <Search size={17} strokeWidth={1.4} aria-hidden="true" />
        <label className="sr-only" htmlFor="archive-search-input">
          {t("searchPlaceholder")}
        </label>
        <input
          ref={searchInputRef}
          id="archive-search-input"
          value={filters.query}
          onKeyDown={(event) => {
            if (
              event.key === "Escape" &&
              !filters.query &&
              searchToggleRef.current?.getClientRects().length
            ) {
              event.stopPropagation();
              setSearchExpanded(false);
              searchToggleRef.current.focus();
            }
          }}
          onChange={(event) => onFilterChange("query", event.target.value)}
          placeholder={t("searchPlaceholder")}
        />
        {filters.query ? (
          <button
            type="button"
            title={t("clearSearch")}
            aria-label={t("clearSearch")}
            onClick={() => {
              setSearchExpanded(true);
              onFilterChange("query", "");
              searchInputRef.current?.focus();
            }}
          >
            <X size={15} />
          </button>
        ) : null}
      </div>

      <button
        ref={filterButtonRef}
        className="intel-tool-button intel-filter-button"
        type="button"
        title={t("openFilters")}
        aria-label={t("openFilters")}
        aria-expanded={filtersOpen}
        aria-controls="filter-console"
        onClick={onToggleFilters}
      >
        <SlidersHorizontal size={18} strokeWidth={1.35} />
        {activeFilterCount ? <span>{activeFilterCount}</span> : null}
      </button>

      <div className="intel-language-picker" ref={languagePickerRef}>
        <button
          ref={languageButtonRef}
          className="intel-language-button"
          type="button"
          title={t("switchLanguage")}
          aria-label={t("switchLanguage")}
          aria-expanded={languageMenuOpen}
          aria-haspopup="menu"
          aria-controls="language-menu"
          onClick={() => setLanguageMenuOpen((open) => !open)}
        >
          <Languages size={18} strokeWidth={1.35} />
        </button>
        {languageMenuOpen ? (
          <div className="intel-language-menu" id="language-menu" role="menu">
            {languageOptions.map((option) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={language === option.id}
                className={language === option.id ? "is-active" : ""}
                key={option.id}
                lang={option.id === "zh" ? "zh-CN" : option.id}
                onClick={() => {
                  setLanguage(option.id);
                  setLanguageMenuOpen(false);
                }}
              >
                <span>{option.label}</span>
                {language === option.id ? <Check size={15} aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}

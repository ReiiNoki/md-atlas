import { useCallback, useEffect, useRef, useState } from "react";
import { TopBar } from "../components/TopBar";
import { ActiveFilters } from "../components/ActiveFilters";
import { ArchiveStatusBar } from "../components/ArchiveStatusBar";
import { FilterConsole } from "../components/FilterConsole";
import { ViewLoading } from "../shared/ui/ViewLoading";
import { activeFilterEntries } from "../domain/filters";
import { useLanguage } from "../i18n.jsx";

function FilterOverlay({ onClose, ...props }) {
  useEffect(() => {
    const trigger = document.activeElement;
    const close = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
      trigger?.focus?.();
    };
  }, [onClose]);
  return <FilterConsole {...props} onClose={onClose} />;
}

export function ExplorerLayout({ view, filters, years, countries, resultCount, pending, searchBlocked, searchFailed, onRetrySearch, onChangeView, onUpdateFilter, onClearFilter, onResetFilters, navigationVersion, children }) {
  const { t } = useLanguage();
  const trigger = useRef(null);
  const [consoleState, setConsoleState] = useState({ open: false, version: navigationVersion });
  const open = consoleState.version === navigationVersion && consoleState.open;
  const entries = activeFilterEntries(filters);
  // A stable closer prevents the Escape listener's cleanup from restoring
  // focus on every filter render while the overlay is still open.
  const closeConsole = useCallback(() => setConsoleState((state) => ({ ...state, open: false })), []);
  const clear = (key) => {
    onClearFilter(key);
    if (entries.length === 1) trigger.current?.focus();
  };
  const resetFromBar = () => { onResetFilters(); trigger.current?.focus(); };
  return (
    <div className={`intel-shell intel-shell--${view}`}>
      <TopBar activeView={view} onViewChange={onChangeView} filters={filters}
        onFilterChange={onUpdateFilter} filtersOpen={open}
        onToggleFilters={() => setConsoleState({ version: navigationVersion, open: !open })}
        activeFilterCount={entries.length} filterButtonRef={trigger}
      />
      <ActiveFilters filters={filters} resultCount={resultCount}
        searchState={searchBlocked ? (searchFailed ? "error" : "loading") : "ready"}
        pending={pending} onClear={clear} onReset={resetFromBar}
      />
      <main className={`intel-workspace intel-workspace--${view}`}>
        {searchBlocked ? <ViewLoading label={t(searchFailed ? "searchIndexLoadFailed" : "loadingSearchIndex")}
          onRetry={searchFailed ? onRetrySearch : undefined} /> : null}
        {children}
        {open ? <FilterOverlay filters={filters} years={years} countries={countries}
          includeOfficialTypes={view === "archive"} onFilterChange={onUpdateFilter}
          onReset={onResetFilters} onClose={closeConsole} /> : null}
      </main>
      <ArchiveStatusBar />
    </div>
  );
}

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Database, LoaderCircle, RotateCcw } from "lucide-react";
import { ArchiveStatusBar } from "./components/ArchiveStatusBar";
import { ArchiveView } from "./components/ArchiveView";
import { ActiveFilters } from "./components/ActiveFilters";
import { activeFilterEntries } from "./utils/filters";
import { FilterConsole } from "./components/FilterConsole";
import { ViewErrorBoundary, ViewCrashFallback } from "./components/ErrorBoundary";
import { RetryableLazyView } from "./components/RetryableLazyView";
import { MapWorkspace } from "./components/MapWorkspace";
import { TopBar } from "./components/TopBar";
import { ViewLoading } from "./components/ViewLoading";
import { useLanguage } from "./i18n.jsx";
import {
  countEventsByCountry,
  expandAnalytics,
  filterEvents,
  INITIAL_FILTERS,
} from "./utils/archive";
import { parseUrlState, serializeUrlState } from "./utils/urlState";

// Chunk loaders stay resolvable outside render so a failed fetch can be
// retried with a fresh import() call.
const loadCalendarView = () =>
  import("./components/CalendarView").then((module) => ({ default: module.CalendarView }));
const loadDataView = () =>
  import("./components/DataView").then((module) => ({ default: module.DataView }));

const assetUrl = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;

const EMPTY_META = {
  eventCount: 0,
  missionCount: 0,
  countryCount: 0,
  yearCounts: {},
  yearRange: null,
  dataQuality: {},
  source: "Niantic official missions via Bannergress",
};

export default function App() {
  const { t } = useLanguage();
  // Shareable state (view, filters, selected event) initializes from the URL so
  // deep links survive refreshes; UI-only state (drawer and feed) does not.
  const [initialUrlState] = useState(() => parseUrlState(window.location.search));
  const [archive, setArchive] = useState({ meta: EMPTY_META, events: [] });
  const [loadState, setLoadState] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [analyticsState, setAnalyticsState] = useState("idle");
  const [analyticsError, setAnalyticsError] = useState("");
  const [analyticsAttempt, setAnalyticsAttempt] = useState(0);
  const [eventDetails, setEventDetails] = useState({});
  const [detailLoadState, setDetailLoadState] = useState("idle");
  const [activeView, setActiveView] = useState(initialUrlState.view);
  const [filters, setFilters] = useState(initialUrlState.filters);
  const [feedRegion, setFeedRegion] = useState("all");
  const [selectedId, setSelectedId] = useState(initialUrlState.event);
  const [detailOpen, setDetailOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(true);
  const [filterConsoleOpen, setFilterConsoleOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(60);
  // Per-view retry epochs: bumping reruns the chunk import and remounts the
  // view's error boundary, giving a failed chunk a genuinely fresh fetch.
  const [viewEpochs, setViewEpochs] = useState(() => ({ map: 0, archive: 0, calendar: 0, data: 0 }));
  const retryView = (view) =>
    setViewEpochs((current) => ({ ...current, [view]: current[view] + 1 }));
  const [isPending, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(filters.query);
  const filterButtonRef = useRef(null);
  // URL bookkeeping: whether the current selection was user/url requested, and
  // how the next effect-driven write should land in history (typing replaces,
  // discrete actions push).
  const urlSelectionIsExplicitRef = useRef(Boolean(initialUrlState.event));
  const urlWriteModeRef = useRef("replace");

  useEffect(() => {
    const controller = new AbortController();

    async function loadArchive() {
      try {
        const response = await fetch(assetUrl("data/archive.json"), {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setArchive(data);
        // Honor a URL-selected event once the archive can validate it; never
        // let the default first item override a deep link.
        const requestedValid =
          initialUrlState.event &&
          data.events.some((event) => event.id === initialUrlState.event);
        urlWriteModeRef.current = "replace";
        urlSelectionIsExplicitRef.current = Boolean(requestedValid);
        setSelectedId(requestedValid ? initialUrlState.event : (data.events[0]?.id ?? null));
        setLoadState("ready");
      } catch (error) {
        if (error.name === "AbortError") return;
        setLoadError(error.message);
        setLoadState("error");
      }
    }

    loadArchive();
    return () => controller.abort();
    // initialUrlState.event is a stable boot-time constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const years = useMemo(
    () =>
      Object.keys(archive.meta.yearCounts)
        .map(Number)
        .sort((a, b) => b - a),
    [archive.meta.yearCounts],
  );

  // Country options come from the full archive so the list stays stable while
  // other filters are active; counts reflect the whole archive.
  const countries = useMemo(() => countEventsByCountry(archive.events), [archive.events]);

  const filteredEvents = useMemo(
    () => filterEvents(archive.events, filters, deferredQuery),
    [archive.events, deferredQuery, filters],
  );

  // A URL-selected event resolves against the full archive so a shared link
  // keeps showing its event even when the sharer's filters would hide it.
  // Filter changes clear selectedId, so normal browsing falls back to the
  // first event in the filtered result set.
  const selectedEvent = useMemo(
    () =>
      archive.events.find((event) => event.id === selectedId) ??
      filteredEvents[0],
    [archive.events, filteredEvents, selectedId],
  );
  const selectedEventDetail = selectedEvent
    ? (eventDetails[selectedEvent.id] ?? selectedEvent)
    : null;
  const feedEvents = useMemo(
    () =>
      filteredEvents.filter((event) => feedRegion === "all" || event.region === feedRegion),
    [feedRegion, filteredEvents],
  );

  useEffect(() => {
    if (activeView !== "archive" || !detailOpen || !selectedEvent?.detailPath) return;
    if (eventDetails[selectedEvent.id]) {
      setDetailLoadState("ready");
      return;
    }

    const controller = new AbortController();
    setDetailLoadState("loading");
    fetch(assetUrl(selectedEvent.detailPath), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Event detail request failed: ${response.status}`);
        return response.json();
      })
      .then((detail) => {
        setEventDetails((current) => ({ ...current, [selectedEvent.id]: detail }));
        setDetailLoadState("ready");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setDetailLoadState("error");
      });
    return () => controller.abort();
  }, [activeView, detailOpen, eventDetails, selectedEvent]);

  useEffect(() => {
    if (activeView !== "data" || analytics) return;
    const controller = new AbortController();
    setAnalyticsState("loading");
    fetch(assetUrl("data/analytics.json"), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        setAnalytics(expandAnalytics(data));
        setAnalyticsState("ready");
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setAnalyticsError(error.message);
        setAnalyticsState("error");
      });
    return () => controller.abort();
  }, [activeView, analytics, analyticsAttempt]);

  useEffect(() => {
    if (!filterConsoleOpen) return undefined;
    const trigger = document.activeElement;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setFilterConsoleOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      trigger?.focus?.();
    };
  }, [filterConsoleOpen]);

  const archiveReady = loadState !== "loading";

  // Keep the query string in step with shareable state. Discrete actions push a
  // history entry; search typing and boot-time normalization replace in place.
  useEffect(() => {
    if (!archiveReady) return;
    const serialized = serializeUrlState({
      view: activeView,
      filters,
      event: urlSelectionIsExplicitRef.current ? selectedId : null,
    });
    if (serialized === window.location.search) return;
    const nextUrl = `${window.location.pathname}${serialized}${window.location.hash}`;
    if (urlWriteModeRef.current === "push") window.history.pushState(null, "", nextUrl);
    else window.history.replaceState(null, "", nextUrl);
  }, [activeView, archiveReady, filters, selectedId]);

  // Back/forward restores view, filters and selection; the detail drawer stays
  // as-is so returning through history never forces panels open.
  useEffect(() => {
    const onPopState = () => {
      const parsed = parseUrlState(window.location.search);
      urlWriteModeRef.current = "replace";
      urlSelectionIsExplicitRef.current = Boolean(parsed.event);
      startTransition(() => {
        setActiveView(parsed.view);
        setFilters(parsed.filters);
        setSelectedId(parsed.event);
        setVisibleCount(60);
        setDetailLoadState(parsed.event && eventDetails[parsed.event] ? "ready" : "idle");
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [eventDetails]);

  const updateFilter = (key, value) => {
    urlWriteModeRef.current = key === "query" ? "replace" : "push";
    urlSelectionIsExplicitRef.current = false;
    startTransition(() => {
      setFilters((current) => ({ ...current, [key]: value }));
      setSelectedId(null);
      setVisibleCount(60);
    });
  };

  const clearFilter = (key) => {
    updateFilter(key, INITIAL_FILTERS[key]);
    if (activeFilterEntries(filters).length === 1) filterButtonRef.current?.focus();
  };

  const changeView = (view) => {
    urlWriteModeRef.current = "push";
    setActiveView(view);
    setFilterConsoleOpen(false);
    if (view !== "map") setFeedOpen(false);
  };

  const resetFilters = () => {
    urlWriteModeRef.current = "push";
    urlSelectionIsExplicitRef.current = false;
    startTransition(() => {
      setFilters(INITIAL_FILTERS);
      setSelectedId(null);
      setVisibleCount(60);
    });
  };

  const resetFromFilterBar = () => {
    resetFilters();
    filterButtonRef.current?.focus();
  };

  const selectEvent = (id) => {
    urlWriteModeRef.current = "push";
    urlSelectionIsExplicitRef.current = true;
    setSelectedId(id);
    setDetailLoadState(eventDetails[id] ? "ready" : "idle");
    setDetailOpen(true);
  };

  const filteredAnalyticsEvents = useMemo(() => {
    if (!analytics?.events) return [];
    const visibleEvents = new Map(filteredEvents.map((event) => [event.id, event]));
    return analytics.events
      .filter((event) => visibleEvents.has(event.id))
      .map((event) => ({ ...visibleEvents.get(event.id), ...event }));
  }, [analytics, filteredEvents]);

  if (loadState === "loading") {
    return (
      <main className="boot-screen">
        <LoaderCircle size={34} strokeWidth={1.1} />
        <strong>{t("establishingLink")}</strong>
        <span>{t("indexingArchive")}</span>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main className="boot-screen boot-screen--error">
        <Database size={34} strokeWidth={1.1} />
        <strong>{t("archiveLinkFailed")}</strong>
        <span>{t("requestErrorDetail", { detail: loadError })}</span>
        <button className="command-button" type="button" onClick={() => window.location.reload()}>
          {t("retryLink")} <RotateCcw size={16} />
        </button>
      </main>
    );
  }

  return (
    <div className="intel-shell">
      <TopBar
        activeView={activeView}
        onViewChange={changeView}
        filters={filters}
        onFilterChange={updateFilter}
        filtersOpen={filterConsoleOpen}
        onToggleFilters={() => setFilterConsoleOpen((open) => !open)}
        feedOpen={feedOpen}
        onToggleFeed={() => {
          urlWriteModeRef.current = "push";
          setActiveView("map");
          setFeedOpen((open) => !open);
        }}
        activeFilterCount={activeFilterEntries(filters).length}
        filterButtonRef={filterButtonRef}
      />
      <ActiveFilters
        filters={filters}
        resultCount={filteredEvents.length}
        pending={isPending || deferredQuery !== filters.query}
        onClear={clearFilter}
        onReset={resetFromFilterBar}
      />

      <main className={`intel-workspace intel-workspace--${activeView}`}>
        {activeView === "map" ? (
          <ViewErrorBoundary key={`map-${viewEpochs.map}`} fallback={ViewCrashFallback}>
            <MapWorkspace
              events={filteredEvents}
              selectedEvent={selectedEvent}
              onSelect={selectEvent}
              feedEvents={feedEvents}
              feedRegion={feedRegion}
              onFeedRegionChange={setFeedRegion}
              onOpenArchive={() => changeView("archive")}
              feedOpen={feedOpen}
              detailOpen={detailOpen}
              onCloseDetail={() => setDetailOpen(false)}
            />
          </ViewErrorBoundary>
        ) : null}

        {activeView === "archive" ? (
          <ViewErrorBoundary key={`archive-${viewEpochs.archive}`} fallback={ViewCrashFallback}>
            <ArchiveView
              events={filteredEvents}
              selectedEvent={selectedEvent}
              selectedEventDetail={selectedEventDetail}
              onSelect={selectEvent}
              detailOpen={detailOpen}
              onCloseDetail={() => setDetailOpen(false)}
              detailLoadState={detailLoadState}
              visibleCount={visibleCount}
              onLoadMore={() => setVisibleCount((count) => count + 60)}
              isPending={isPending}
              onResetFilters={resetFilters}
            />
          </ViewErrorBoundary>
        ) : null}

        {activeView === "calendar" ? (
          <RetryableLazyView
            load={loadCalendarView}
            epoch={viewEpochs.calendar}
            onRetry={() => retryView("calendar")}
            render={(CalendarView) => <CalendarView events={filteredEvents} />}
          />
        ) : null}

        {activeView === "data" ? (
          analyticsState === "ready" ? (
            <RetryableLazyView
              load={loadDataView}
              epoch={viewEpochs.data}
              onRetry={() => retryView("data")}
              render={(DataView) => (
                <DataView
                  events={filteredAnalyticsEvents}
                  onSelect={(id) => {
                    selectEvent(id);
                    setActiveView("archive");
                  }}
                />
              )}
            />
          ) : (
            <ViewLoading
              label={
                analyticsState === "error"
                  ? t("analyticsLoadFailed", { detail: analyticsError })
                  : t("loadingAnalytics")
              }
              onRetry={
                analyticsState === "error"
                  ? () => {
                      setAnalyticsError("");
                      setAnalyticsAttempt((attempt) => attempt + 1);
                    }
                  : undefined
              }
            />
          )
        ) : null}

        {filterConsoleOpen ? (
          <FilterConsole
            filters={filters}
            years={years}
            countries={countries}
            onFilterChange={updateFilter}
            onReset={resetFilters}
            onClose={() => setFilterConsoleOpen(false)}
          />
        ) : null}
      </main>

      <ArchiveStatusBar />
    </div>
  );
}

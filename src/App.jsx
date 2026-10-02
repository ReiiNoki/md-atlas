import { useDeferredValue, useMemo } from "react";
import { ExplorerLayout } from "./app/ExplorerLayout";
import { useExplorerState, useExplorerUrlSync } from "./app/useExplorerState";
import { useExplorerPanels } from "./app/useExplorerPanels";
import { resolveExplorerEvent } from "./app/explorerState";
import { ArchiveBoot } from "./shared/ui/ArchiveBoot";
import { MapScreen } from "./features/map/MapScreen";
import { ArchiveScreen } from "./features/archive/ArchiveScreen";
import { CalendarScreen } from "./features/calendar/CalendarScreen";
import { AnalyticsScreen } from "./features/analytics/AnalyticsScreen";
import { countEventsByCountry, filterEvents, INITIAL_FILTERS } from "./domain/archive";
import { filterXmAnomalies } from "./domain/calendarActivities";
import { useArchive, useSearchIndex, useOfficialMissions, useXmAnomalies, useAnalytics } from "./data/useStaticDatasets";
import { EventDetailProvider } from "./data/useEventDetail";

const EMPTY_ARCHIVE = { events: [] };

export default function App() {
  return <EventDetailProvider><Explorer /></EventDetailProvider>;
}

function Explorer() {
  const panels = useExplorerPanels();
  const explorer = useExplorerState(panels.resetPagination);
  const { view, filters } = explorer.state;
  const archiveRequest = useArchive();
  const archive = archiveRequest.data ?? EMPTY_ARCHIVE;
  const deferredQuery = useDeferredValue(filters.query);
  const searchRequested = Boolean(filters.query.trim());
  const searchRequest = useSearchIndex(searchRequested);
  const officialRequest = useOfficialMissions(view === "archive");
  const officialArchive = officialRequest.data?.archive;
  const selectedId = useExplorerUrlSync(explorer, archiveRequest.data, officialArchive);
  const xmRequest = useXmAnomalies(view === "calendar");
  const analyticsRequest = useAnalytics(view === "data");
  const searchBlocked = searchRequested && (
    !searchRequest.data || (view === "archive" && !officialRequest.data?.searchIndex)
  );
  const searchFailed = searchRequest.status === "error" || (
    view === "archive" && officialRequest.status === "error"
  );
  const retrySearch = () => {
    if (!searchRequest.data) searchRequest.retry();
    if (view === "archive" && !officialRequest.data?.searchIndex) officialRequest.retry();
  };
  const archiveEvents = useMemo(
    () => [...archive.events, ...(officialArchive?.events ?? [])],
    [archive.events, officialArchive],
  );
  const source = view === "archive" ? archiveEvents : archive.events;
  const searchIndex = useMemo(
    () => view === "archive" && officialRequest.data?.searchIndex
      ? { ...(searchRequest.data ?? {}), ...officialRequest.data.searchIndex }
      : searchRequest.data,
    [view, officialRequest.data, searchRequest.data],
  );
  const years = useMemo(
    () => [...new Set(source.map((event) => event.year).filter(Number.isFinite))].sort((a, b) => b - a),
    [source],
  );
  const countries = useMemo(() => countEventsByCountry(source), [source]);
  const filteredEvents = useMemo(
    () => filterEvents(source, filters, deferredQuery, searchIndex),
    [source, filters, deferredQuery, searchIndex],
  );
  const selectedEvent = useMemo(
    () => resolveExplorerEvent(explorer.state, selectedId, source, filteredEvents, archive),
    [explorer.state, selectedId, source, filteredEvents, archive],
  );
  const filteredXmAnomalies = useMemo(
    () => filterXmAnomalies(xmRequest.data ?? [], filters, deferredQuery),
    [xmRequest.data, filters, deferredQuery],
  );
  const updateFilter = (key, value) => {
    explorer.updateFilter(key, value);
    panels.resetPagination();
  };
  const resetFilters = () => {
    explorer.resetFilters();
    panels.resetPagination();
  };
  const changeView = (nextView) => {
    const clearArchive = explorer.changeView(nextView, officialArchive?.events);
    panels.navigate(nextView, clearArchive);
  };
  const selectEvent = (id, nextView) => {
    explorer.selectEvent(id, nextView);
    panels.select();
  };

  if (archiveRequest.status !== "ready") return <ArchiveBoot request={archiveRequest} />;

  return (
    <ExplorerLayout view={view} filters={filters} years={years} countries={countries}
      resultCount={filteredEvents.length + (view === "calendar" ? filteredXmAnomalies.length : 0)}
      pending={explorer.isPending || deferredQuery !== filters.query}
      searchBlocked={searchBlocked} searchFailed={searchFailed} onRetrySearch={retrySearch}
      onChangeView={changeView} onUpdateFilter={updateFilter}
      onClearFilter={(key) => updateFilter(key, INITIAL_FILTERS[key])}
      onResetFilters={resetFilters} navigationVersion={panels.navigationVersion}
    >
      {/* Lightweight owners stay mounted; expensive view subtrees do not.
          This preserves feed region/count while calendar/table-local state resets. */}
      <MapScreen active={!searchBlocked && view === "map"} events={filteredEvents}
        selectedEvent={selectedEvent} onSelect={selectEvent}
        onOpenArchive={() => changeView("archive")} panels={panels} />
      <ArchiveScreen active={!searchBlocked && view === "archive"} detailEnabled={view === "archive"}
        request={officialRequest} events={filteredEvents} selectedEvent={selectedEvent}
        onSelect={selectEvent} panels={panels} isPending={explorer.isPending} onResetFilters={resetFilters} />
      <CalendarScreen active={!searchBlocked && view === "calendar"} request={xmRequest}
        events={filteredEvents} xmAnomalies={filteredXmAnomalies} />
      <AnalyticsScreen active={!searchBlocked && view === "data"} request={analyticsRequest}
        events={filteredEvents} onSelect={(id) => selectEvent(id, "archive")} />
    </ExplorerLayout>
  );
}

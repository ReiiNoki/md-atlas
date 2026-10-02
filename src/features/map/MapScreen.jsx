import { useMemo, useState } from "react";
import { MapWorkspace } from "./MapWorkspace";
import { ViewErrorBoundary, ViewCrashFallback } from "../../shared/ui/ErrorBoundary";
import { initialMapFeedOpen } from "./feedState";

// This lightweight owner remains mounted. Only the workspace/map unmounts:
// feed region and phone/desktop open state keep their original lifetime.
export function MapScreen({ active, events, selectedEvent, onSelect, onOpenArchive, panels }) {
  const [feedRegion, setFeedRegion] = useState("all");
  const [feed, setFeed] = useState(() => ({
    version: panels.feedCloseVersion,
    open: initialMapFeedOpen(window.matchMedia?.bind(window)),
  }));
  const feedOpen = feed.version === panels.feedCloseVersion && feed.open;
  const setFeedOpen = (open) => setFeed({ version: panels.feedCloseVersion, open });
  const feedEvents = useMemo(
    () => events.filter((event) => feedRegion === "all" || event.region === feedRegion),
    [events, feedRegion],
  );
  if (!active) return null;
  return (
    <ViewErrorBoundary fallback={ViewCrashFallback}>
      <MapWorkspace
        events={events}
        selectedEvent={selectedEvent}
        onSelect={onSelect}
        feedEvents={feedEvents}
        feedRegion={feedRegion}
        onFeedRegionChange={setFeedRegion}
        onOpenArchive={onOpenArchive}
        feedOpen={feedOpen}
        onOpenFeed={() => setFeedOpen(true)}
        onCloseFeed={() => setFeedOpen(false)}
        detailOpen={panels.detailOpen}
        onCloseDetail={panels.closeDetail}
      />
    </ViewErrorBoundary>
  );
}

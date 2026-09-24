import { lazy, Suspense } from "react";
import { ListFilter } from "lucide-react";
import { useLanguage } from "../i18n.jsx";
import { eventMapTitle } from "../utils/eventMapLabel";
import { EventDetail } from "./EventDetail";
import { EventFeed } from "./EventFeed";
import { ViewLoading } from "./ViewLoading";

const MissionMap = lazy(() =>
  import("./MissionMap").then((module) => ({ default: module.MissionMap })),
);

export function MapWorkspace({
  events,
  selectedEvent,
  onSelect,
  feedEvents,
  feedRegion,
  onFeedRegionChange,
  onOpenArchive,
  feedOpen,
  onOpenFeed,
  onCloseFeed,
  detailOpen,
  onCloseDetail,
}) {
  const { formatNumber, t } = useLanguage();

  return (
    <>
      <Suspense fallback={<ViewLoading label={t("loadingMap")} />}>
        <MissionMap
          events={events}
          selectedEvent={selectedEvent}
          onSelect={onSelect}
        />
      </Suspense>

      {selectedEvent ? (
        <div className="selection-strip">
          <i />
          <strong title={eventMapTitle(selectedEvent)}>{eventMapTitle(selectedEvent)}</strong>
          <span>/</span>
          <time>{selectedEvent.date ?? t("dateUnknown")}</time>
          <span>/</span>
          <b>
            {selectedEvent.missionCount != null
              ? `${formatNumber(selectedEvent.missionCount)} ${t("missions")}`
              : t("unknownMissionCount")}
          </b>
          <span>/</span>
          <b>
            {typeof selectedEvent.averageRating === "number"
              ? `${selectedEvent.averageRating.toFixed(1)}%`
              : t("noRating")}
          </b>
        </div>
      ) : null}

      {!feedOpen ? (
        <button
          className="intel-tool-button map-activity-button"
          type="button"
          title={t("activity")}
          aria-label={t("activity")}
          aria-controls="event-feed"
          aria-expanded="false"
          onClick={onOpenFeed}
        >
          <ListFilter size={18} strokeWidth={1.35} />
        </button>
      ) : null}

      <EventFeed
        events={feedEvents}
        region={feedRegion}
        onRegionChange={onFeedRegionChange}
        onSelect={onSelect}
        onOpenArchive={onOpenArchive}
        onClose={onCloseFeed}
        open={feedOpen}
      />

      <EventDetail
        event={selectedEvent}
        open={detailOpen}
        onClose={onCloseDetail}
        compact
      />
    </>
  );
}

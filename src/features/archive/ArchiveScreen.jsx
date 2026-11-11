import { useState } from "react";
import { ArchiveView } from "./ArchiveView";
import { ViewErrorBoundary, ViewCrashFallback } from "../../shared/ui/ErrorBoundary";
import { ViewLoading } from "../../shared/ui/ViewLoading";
import { useEventDetail } from "../../data/useEventDetail";
import { useLanguage } from "../../i18n.jsx";

// The page survives view switches; a version change resets it without an
// effect or an extra paint. Sorting remains in the table and resets on unmount.
export function ArchiveScreen({ active, detailEnabled, request, events, selectedEvent, onSelect, panels, isPending, onResetFilters }) {
  const { t } = useLanguage();
  const [page, setPage] = useState({ version: panels.paginationVersion, number: 1 });
  const currentPage = page.version === panels.paginationVersion ? page.number : 1;
  const detail = useEventDetail(selectedEvent, detailEnabled && panels.detailOpen);
  if (!active) return null;
  if (request.status !== "ready") return (
    <ViewLoading
      label={t(request.status === "error" ? "additionalArchiveLoadFailed" : "loadingAdditionalArchive")}
      onRetry={request.status === "error" ? request.retry : undefined}
    />
  );
  return (
    <ViewErrorBoundary fallback={ViewCrashFallback}>
      <ArchiveView
        events={events}
        selectedEvent={selectedEvent}
        selectedEventDetail={detail.data ?? selectedEvent}
        onSelect={onSelect}
        detailOpen={panels.detailOpen}
        onCloseDetail={panels.closeDetail}
        detailLoadState={detail.status}
        onRetryDetail={detail.retry}
        page={currentPage}
        onPageChange={(number) => setPage({ version: panels.paginationVersion, number })}
        isPending={isPending}
        onResetFilters={onResetFilters}
      />
    </ViewErrorBoundary>
  );
}

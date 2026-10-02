import { useMemo, useState } from "react";
import { RetryableLazyView } from "../../shared/ui/RetryableLazyView";
import { ViewLoading } from "../../shared/ui/ViewLoading";
import { useLanguage } from "../../i18n.jsx";

const loadDataView = () => import("./DataView")
  .then((module) => ({ default: module.DataView }));

export function AnalyticsScreen({ active, request, events, onSelect }) {
  const { t } = useLanguage();
  const [epoch, setEpoch] = useState(0);
  const analyticsEvents = useMemo(() => {
    if (!request.data?.events) return [];
    const visible = new Map(events.map((event) => [event.id, event]));
    return request.data.events.filter((event) => visible.has(event.id))
      .map((event) => ({ ...visible.get(event.id), ...event }));
  }, [request.data, events]);
  if (!active) return null;
  if (request.status !== "ready") return (
    <ViewLoading
      label={request.status === "error" ? t("analyticsLoadFailed", { detail: request.error }) : t("loadingAnalytics")}
      onRetry={request.status === "error" ? request.retry : undefined}
    />
  );
  return <RetryableLazyView load={loadDataView} epoch={epoch}
    onRetry={() => setEpoch((value) => value + 1)}
    render={(DataView) => <DataView events={analyticsEvents} onSelect={onSelect} />}
  />;
}

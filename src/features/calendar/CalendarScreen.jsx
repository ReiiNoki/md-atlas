import { useState } from "react";
import { RetryableLazyView } from "../../shared/ui/RetryableLazyView";
import { ViewLoading } from "../../shared/ui/ViewLoading";
import { useLanguage } from "../../i18n.jsx";

const loadCalendarView = () => import("./CalendarView")
  .then((module) => ({ default: module.CalendarView }));

export function CalendarScreen({ active, request, events, xmAnomalies }) {
  const { t } = useLanguage();
  const [epoch, setEpoch] = useState(0);
  if (!active) return null;
  if (request.status !== "ready") return (
    <ViewLoading
      label={t(request.status === "error" ? "xmAnomalyCalendarLoadFailed" : "loadingXmAnomalyCalendar")}
      onRetry={request.status === "error" ? request.retry : undefined}
    />
  );
  return <RetryableLazyView load={loadCalendarView} epoch={epoch}
    onRetry={() => setEpoch((value) => value + 1)}
    render={(CalendarView) => <CalendarView events={events} xmAnomalies={xmAnomalies} />}
  />;
}

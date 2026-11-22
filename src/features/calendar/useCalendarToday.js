import { useEffect, useState } from "react";
import { localIsoDate, millisecondsUntilNextLocalDay } from "../../domain/calendarDates.js";

export function useCalendarToday() {
  const [today, setToday] = useState(() => localIsoDate());
  useEffect(() => {
    let timer;
    const refresh = () => {
      window.clearTimeout(timer);
      const now = new Date();
      setToday(localIsoDate(now));
      timer = window.setTimeout(refresh, millisecondsUntilNextLocalDay(now) + 50);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return today;
}

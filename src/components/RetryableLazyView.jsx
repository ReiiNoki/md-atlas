import { useEffect, useState } from "react";
import { ViewErrorBoundary, ViewCrashFallback } from "./ErrorBoundary";
import { ViewLoading } from "./ViewLoading";

/**
 * Mounts a lazily imported view with independent retry semantics:
 * - chunk fetch failures (import rejection) are handled here as a load state,
 *   with retry re-running the import after `epoch` changes;
 * - render errors inside the loaded view stay with ViewErrorBoundary.
 * React.lazy was avoided on purpose: it caches rejections, so a boundary reset
 * alone cannot retry a failed chunk. The resolved component is stored in state
 * and stays identity-stable because the module cache fulfils later imports.
 */
export function RetryableLazyView({ load, epoch, onRetry, render }) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    load().then(
      (module) => {
        if (!cancelled) setState({ status: "ready", Component: module.default });
      },
      (error) => {
        if (!cancelled) setState({ status: "error", error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [epoch, load]);

  if (state.status === "loading") return <ViewLoading />;
  if (state.status === "error") {
    return (
      <ViewCrashFallback error={state.error} onRetry={onRetry} onReload={() => window.location.reload()} />
    );
  }

  const Loaded = state.Component;
  return (
    <ViewErrorBoundary key={epoch} fallback={ViewCrashFallback} onRequestRetry={onRetry}>
      {render(Loaded)}
    </ViewErrorBoundary>
  );
}

import { Component } from "react";
import { RefreshCw, RotateCcw, TriangleAlert } from "lucide-react";
import { useLanguage } from "../i18n.jsx";

/**
 * Localized in-place fallback for a crashed view. Retry remounts the subtree;
 * a full reload is kept as the guaranteed fallback because a failed lazy chunk
 * can stay rejected in the module map after the offending deployment is fixed.
 */
export function ViewCrashFallback({ error, onRetry, onReload }) {
  const { t } = useLanguage();
  return (
    <div className="empty-state" role="alert">
      <div className="empty-state__target" aria-hidden="true" />
      <strong>{t("viewCrashedTitle")}</strong>
      <p>{t("viewCrashedHint")}</p>
      <small className="mono">{error?.message ? `${t("errorDetail")}: ${error.message}` : null}</small>
      <div className="view-crash__actions">
        <button className="command-button" type="button" onClick={onRetry}>
          <RotateCcw size={15} /> {t("retryView")}
        </button>
        <button className="command-button" type="button" onClick={onReload}>
          <RefreshCw size={15} /> {t("reloadPage")}
        </button>
      </div>
    </div>
  );
}

/** Last-resort full-screen fallback for errors outside isolated views. */
export function AppCrashFallback({ error }) {
  const { t } = useLanguage();
  return (
    <main className="boot-screen boot-screen--error" role="alert">
      <TriangleAlert size={34} strokeWidth={1.1} />
      <strong>{t("appCrashedTitle")}</strong>
      <span>{t("appCrashedHint")}</span>
      {error?.message ? <small className="mono">{`${t("errorDetail")}: ${error.message}`}</small> : null}
      <button className="command-button" type="button" onClick={() => window.location.reload()}>
        {t("reloadPage")} <RefreshCw size={16} />
      </button>
    </main>
  );
}

/**
 * Render-error isolation only. Request failures keep using their views' own
 * load-state handling and never reach this boundary. `onError` exists for
 * callers that want diagnostics; the fallback itself stays silent so normal
 * production runs add no console noise.
 */
export class ViewErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.props.onError?.(error, info);
  }

  retry() {
    this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const Fallback = this.props.fallback ?? ViewCrashFallback;
    // With onRequestRetry the parent recreates this whole subtree (fresh lazy
    // component included); otherwise clearing the error remounts children only.
    return (
      <Fallback
        error={this.state.error}
        onRetry={this.props.onRequestRetry ?? this.retry}
        onReload={() => window.location.reload()}
      />
    );
  }
}

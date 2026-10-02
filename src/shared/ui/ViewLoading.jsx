import { Database, LoaderCircle } from "lucide-react";
import { useLanguage } from "../../i18n.jsx";

export function ViewLoading({ label, onRetry }) {
  const { t } = useLanguage();
  const loadingLabel = label ?? t("loadingView");

  return (
    <div className="view-loading" role={onRetry ? "alert" : "status"}>
      {onRetry ? (
        <Database size={24} />
      ) : (
        <LoaderCircle className="view-loading__spinner" size={24} />
      )}
      <span>{loadingLabel}</span>
      {onRetry ? (
        <button className="command-button" type="button" onClick={onRetry}>
          {t("retry")}
        </button>
      ) : null}
    </div>
  );
}

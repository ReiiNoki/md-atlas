import { Database, LoaderCircle, RotateCcw } from "lucide-react";
import { useLanguage } from "../../i18n.jsx";

export function ArchiveBoot({ request }) {
  const { t } = useLanguage();
  if (request.status === "error") return (
    <main className="boot-screen boot-screen--error">
      <Database size={34} strokeWidth={1.1} />
      <strong>{t("archiveLinkFailed")}</strong>
      <span>{t("requestErrorDetail", { detail: request.error })}</span>
      <button className="command-button" type="button" onClick={() => window.location.reload()}>
        {t("retryLink")} <RotateCcw size={16} />
      </button>
    </main>
  );
  return (
    <main className="boot-screen">
      <LoaderCircle size={34} strokeWidth={1.1} />
      <strong>{t("establishingLink")}</strong>
      <span>{t("indexingArchive")}</span>
    </main>
  );
}

import { Github } from "lucide-react";
import { useLanguage } from "../i18n.jsx";

export function ArchiveStatusBar() {
  const { t } = useLanguage();

  return (
    <footer className="intel-statusbar">
      <div className="intel-statusbar__legal">
        <p>{t("fanSiteDisclaimer")} {t("dataSourceNotice")}</p>
        <p>{t("ingressTrademarkNotice")}</p>
      </div>
      <nav className="intel-statusbar__links" aria-label={t("footerLinks")}>
        <a href="https://t.me/missiondayatlas" target="_blank" rel="noreferrer" title={t("telegramGroup")}>
          <img src={`${import.meta.env.BASE_URL}telegram-logo.svg`} alt="" aria-hidden="true" />
          <span className="sr-only">{t("telegramGroup")}</span>
        </a>
        <a href="https://ingress.com/" target="_blank" rel="noreferrer" title={t("ingressOfficialSite")}>
          <img src={`${import.meta.env.BASE_URL}ingress-logo.svg`} alt="" aria-hidden="true" />
          <span className="sr-only">{t("ingressOfficialSite")}</span>
        </a>
        <a href="https://bannergress.com/" target="_blank" rel="noreferrer" title={t("bannergressSite")}>
          <img src={`${import.meta.env.BASE_URL}bannergress-logo.png`} alt="" aria-hidden="true" />
          <span className="sr-only">{t("bannergressSite")}</span>
        </a>
        <a href="https://github.com/ReiiNoki/md-atlas" target="_blank" rel="noreferrer" title={t("githubRepository")}>
          <Github size={24} aria-hidden="true" />
          <span className="sr-only">{t("githubRepository")}</span>
        </a>
        <a href="https://reiinoki.dpdns.org/" target="_blank" rel="noreferrer" title={t("personalBlog")}>
          <img src={`${import.meta.env.BASE_URL}blog-logo.ico`} alt="" aria-hidden="true" />
          <span className="sr-only">{t("personalBlog")}</span>
        </a>
      </nav>
    </footer>
  );
}

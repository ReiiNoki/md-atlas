import { useState } from "react";
import { ImageOff, RotateCcw } from "lucide-react";
import { useLanguage } from "../i18n.jsx";
import { displayCityName } from "../domain/geography/locations";

export function MissionImage({ event, className = "", eager = false, retryable = false }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const [loadedUrl, setLoadedUrl] = useState(null);
  const [retryToken, setRetryToken] = useState(0);
  const { language, t } = useLanguage();
  const label = t("missionImageAlt", { city: displayCityName(event.countryCode, event.city, language) });
  const failed = event.picture === failedUrl;
  const loaded = event.picture === loadedUrl;

  if (!event.picture) {
    return (
      <span className={`mission-image mission-image--placeholder ${className}`}>
        <img
          src={`${import.meta.env.BASE_URL}event-placeholder.webp`}
          alt={t("eventImagePlaceholder", { city: displayCityName(event.countryCode, event.city, language) })}
          title={t("noImage")}
          loading={eager ? "eager" : "lazy"}
          width="256"
          height="256"
          decoding="async"
        />
      </span>
    );
  }

  if (failed) {
    return (
      <span className={`mission-image mission-image--fallback ${className}`} aria-label={label}>
        <ImageOff size={20} strokeWidth={1.25} />
        <small>{t("imageLoadFailed")}</small>
        {retryable ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setFailedUrl(null);
              setRetryToken((token) => token + 1);
            }}
          >
            <RotateCcw size={13} /> {t("retry")}
          </button>
        ) : null}
      </span>
    );
  }

  return (
    <span className={`mission-image ${className} ${loaded ? "is-loaded" : "is-loading"}`}>
      {!loaded ? <span className="mission-image__loading">{t("loadingImage")}</span> : null}
      <img
        key={`${event.picture}-${retryToken}`}
        src={event.picture}
        alt={label}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        width="320"
        height="240"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoadedUrl(event.picture)}
        onError={() => setFailedUrl(event.picture)}
      />
    </span>
  );
}

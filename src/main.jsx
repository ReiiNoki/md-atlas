import React from "react";
import { createRoot } from "react-dom/client";
// latin + latin-ext only: the archive data needs latin-ext for Romanian,
// Polish, Turkish and Baltic city names (ă č ė İ ł ń ō š ș ț). Other subsets
// (devanagari, cyrillic, greek, vietnamese) have no matching content and CJK
// text intentionally uses system fonts, so those files are never emitted.
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "@fontsource/ibm-plex-sans/latin-ext-400.css";
import "@fontsource/ibm-plex-sans/latin-ext-500.css";
import "@fontsource/ibm-plex-sans/latin-ext-600.css";
import "@fontsource/ibm-plex-sans/latin-ext-700.css";
import "@fontsource/rajdhani/latin-500.css";
import "@fontsource/rajdhani/latin-600.css";
import "@fontsource/rajdhani/latin-700.css";
import "@fontsource/rajdhani/latin-ext-500.css";
import "@fontsource/rajdhani/latin-ext-600.css";
import "@fontsource/rajdhani/latin-ext-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-ext-400.css";
import "@fontsource/ibm-plex-mono/latin-ext-500.css";
import "maplibre-gl/dist/maplibre-gl.css";
import App from "./App";
import { AppCrashFallback, ViewErrorBoundary } from "./components/ErrorBoundary";
import { LanguageProvider } from "./i18n.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LanguageProvider>
      {/* Last-resort boundary: errors escaping the per-view boundaries still get
          a localized screen instead of an unmount flash. */}
      <ViewErrorBoundary fallback={AppCrashFallback}>
        <App />
      </ViewErrorBoundary>
    </LanguageProvider>
  </React.StrictMode>,
);

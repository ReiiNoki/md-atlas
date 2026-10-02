import { renderToStaticMarkup } from "react-dom/server";
import { LanguageProvider } from "../../src/i18n.jsx";

export function renderLocalized(Component, props) {
  return renderToStaticMarkup(<LanguageProvider><Component {...props} /></LanguageProvider>);
}

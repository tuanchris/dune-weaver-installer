import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import englishTranslations from "./assets/locales/en/translations.json";

// The installer ships in English only. The i18next layer is kept so existing
// t() call sites keep working, but there is no language switching or backend.
i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    debug: false,
    resources: {
        en: { translation: englishTranslations }
    },
    interpolation: {
        escapeValue: false // not needed for react as it escapes by default
    }
});

export default i18n;

import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "cz", "de", "uk"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  // Set this to the final URL before deploying (used for canonical + hreflang tags).
  site: "https://kie-cli.pages.dev",
  integrations: [react()],
  i18n: {
    defaultLocale: "en",
    locales: ["en", "es"],
    routing: { prefixDefaultLocale: false },
  },
  compressHTML: false,
  build: { inlineStylesheets: "auto" },
});

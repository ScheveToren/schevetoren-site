window.SCHEVETOREN_CONFIG = {
  /** Canonical public origin (no repo slug). See docs/data/site-public.json */
  PUBLIC_ORIGIN: "https://schevetoren.github.io",
  PUBLIC_BASE_PATH: "",
  API_URL:
    "https://script.google.com/macros/s/AKfycbxvrh63zVaFHWOthXLCoe9VGDXUEizKo1YQOWlS6LN0DVHka0nUXBA2M1T421Ffzwpn/exec",
  SITE_NAME: "De Scheve Toren",
  SEASON_LABEL: "2026-2027",
  CLUB_TIMEZONE: "Europe/Amsterdam",
  DEFAULT_EVENT_START: "20:00",
  DEFAULT_EVENT_END: "23:00",
  getRedirectUri() {
    return new URL("auth/callback.html", window.location.href).origin +
      new URL("auth/callback.html", window.location.href).pathname;
  },
  getDocsBase() {
    const path = window.location.pathname;
    const marker = "/docs/";
    const idx = path.indexOf(marker);
    if (idx >= 0) return path.slice(0, idx + marker.length - 1);
    return path.endsWith("/docs") ? path : path.replace(/\/[^/]*$/, "") || "/docs";
  }
};

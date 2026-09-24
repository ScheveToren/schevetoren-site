/** Resolve ICS subscribe links from docs/data/calendar-feed.json (CMS can update). */
(() => {
  const FALLBACK = "kalender/scheve-toren-2026-2027.ics";

  async function loadFeed() {
    try {
      const url = new URL("./data/calendar-feed.json", window.location.href).href;
      const response = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return { icsPath: FALLBACK };
      return await response.json();
    } catch {
      return { icsPath: FALLBACK };
    }
  }

  function applyIcsPath(relativePath) {
    const path = relativePath || FALLBACK;
    document.querySelectorAll("[data-ics-link]").forEach(anchor => {
      anchor.setAttribute("href", `./${path}`);
    });
    const webcal = document.getElementById("calendarWebcal");
    if (webcal && window.SCHEVETOREN_CONFIG?.getWebcalUrl) {
      webcal.href = window.SCHEVETOREN_CONFIG.getWebcalUrl(path);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const feed = await loadFeed();
    applyIcsPath(feed.icsPath);
  });

  window.ScheveTorenCalendarFeed = { loadFeed, applyIcsPath };
})();

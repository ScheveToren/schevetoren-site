(() => {
  const LANG_KEY = "schevetoren_lang";
  let strings = {};

  function currentLang() {
    return localStorage.getItem(LANG_KEY) === "en" ? "en" : "nl";
  }

  function activePath() {
    const file = window.location.pathname.split("/").pop() || "index.html";
    return file;
  }

  async function loadStrings(lang) {
    const url = new URL(`./assets/i18n/${lang}.json`, window.location.href).href;
    const response = await fetch(url, { cache: "no-store" });
    strings = await response.json();
  }

  function t(key) {
    return strings[key] || key;
  }

  function applyI18n() {
    document.querySelectorAll("[data-i18n]").forEach(node => {
      const key = node.getAttribute("data-i18n");
      if (key) node.textContent = t(key);
    });
    document.documentElement.lang = currentLang();
    document.querySelectorAll(".lang-toggle button").forEach(button => {
      button.classList.toggle("active", button.dataset.lang === currentLang());
    });
  }

  function renderHeader() {
    const mount = document.getElementById("site-header");
    if (!mount) return;
    const here = activePath();
    const link = (href, key) => {
      const cls = here === href ? "active" : "";
      return `<a class="${cls}" href="${href}" data-i18n="${key}">${t(key)}</a>`;
    };
    mount.innerHTML = `<div class="site-nav-wrap"><nav class="site-nav" aria-label="Hoofdnavigatie">
      <a class="site-brand" href="./index.html">De Scheve Toren</a>
      <div class="site-links">
        ${link("index.html", "nav.home")}
        ${link("interne-competitie.html", "nav.internal")}
        ${link("externe-competitie.html", "nav.external")}
        ${link("jeugd.html", "nav.youth")}
        ${link("kalender.html", "nav.calendar")}
        ${link("nieuws.html", "nav.news")}
        ${link("attendance.html", "nav.attendance")}
        ${link("contact.html", "nav.contact")}
        <div class="lang-toggle" role="group" aria-label="Language">
          <button type="button" data-lang="nl">NL</button>
          <button type="button" data-lang="en">EN</button>
        </div>
      </div>
    </nav></div>`;
    mount.querySelectorAll(".lang-toggle button").forEach(button => {
      button.addEventListener("click", async () => {
        localStorage.setItem(LANG_KEY, button.dataset.lang);
        await loadStrings(currentLang());
        applyI18n();
        renderHeader();
        renderFooter();
      });
    });
  }

  function renderFooter() {
    const mount = document.getElementById("site-footer");
    if (!mount) return;
    mount.className = "site-footer";
    mount.innerHTML = `<p data-i18n="footer.copy">${t("footer.copy")}</p>
      <p class="site-footer-links"><a href="./gedragsregels.html">Gedragsregels</a> · <a href="./beheer.html">Beheer</a></p>`;
  }

  function injectJsonLd() {
    if (document.getElementById("org-jsonld")) return;
    const script = document.createElement("script");
    script.id = "org-jsonld";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SportsOrganization",
      name: "Schaakvereniging De Scheve Toren",
      sport: "Chess",
      url: window.location.origin + window.location.pathname.replace(/[^/]+$/, "")
    });
    document.head.appendChild(script);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await loadStrings(currentLang());
    renderHeader();
    renderFooter();
    applyI18n();
    if (document.body.dataset.jsonld === "org") injectJsonLd();
  });
})();

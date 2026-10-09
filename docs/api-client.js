/**
 * Shared API client with primary + optional failover URL.
 * Used by attendance, admin, and CMS pages.
 */
(function (global) {
  const cfg = global.SCHEVETOREN_CONFIG || {};
  const PRIMARY =
    cfg.API_URL ||
    "https://script.google.com/macros/s/AKfycbxvrh63zVaFHWOthXLCoe9VGDXUEizKo1YQOWlS6LN0DVHka0nUXBA2M1T421Ffzwpn/exec";
  const FALLBACK = String(cfg.API_FALLBACK_URL || "").trim();
  const TIMEOUT_MS = Number(cfg.API_TIMEOUT_MS || 3000);

  const BUSINESS_ERRORS = new Set([
    "forbidden",
    "not_linked",
    "unauthorized",
    "invalid or used invite code",
    "missing token",
    "invalid token",
    "missing code",
    "missing player or rows",
    "no_valid_rows",
    "empty_attendance",
    "unknown action",
    "github_not_configured",
    "invalid_news_fields",
    "invalid_path",
    "not_found",
    "missing page_key",
    "missing ics_base64",
    "invalid_base64",
    "invalid_ics",
    "auth_required",
    "missing_slug",
    "missing_media_base64",
    "empty_media",
    "invalid_pdf",
    "invalid_image",
    "unsupported_media",
    "media_too_large",
    "invalid_cover_path",
    "invalid_pdf_path"
  ]);

  function endpoints() {
    const list = [PRIMARY];
    if (FALLBACK && FALLBACK !== PRIMARY) list.push(FALLBACK);
    return list;
  }

  function token() {
    return global.ScheveTorenAuth?.getAccessToken?.() || "";
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
    } finally {
      clearTimeout(timer);
    }
  }

  function isRetryableStatus(status) {
    return [408, 429, 500, 502, 503, 504].includes(status);
  }

  async function postJson(payload, options = {}) {
    const retriesPerUrl = options.retries ?? 1;
    const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
    let lastError;

    for (const url of endpoints()) {
      for (let attempt = 0; attempt <= retriesPerUrl; attempt++) {
        try {
          const response = await fetchWithTimeout(
            url,
            {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({ ...payload, token: token() }),
              redirect: "follow"
            },
            timeoutMs
          );
          let data;
          try {
            data = await response.json();
          } catch {
            throw Error(`API ${response.status}`);
          }

          if (response.ok && data.ok !== false) return data;

          if (
            data.message &&
            (data.error === "backend_urlfetch" ||
              data.error === "no_valid_rows" ||
              data.error === "empty_attendance")
          ) {
            throw Error(data.message);
          }

          const errCode = data.error || `API ${response.status}`;
          if (BUSINESS_ERRORS.has(data.error) || response.status === 403) {
            throw Error(errCode);
          }

          lastError = Error(data.message || errCode);
          if (!isRetryableStatus(response.status) && data.ok === false) {
            // Non-retryable application error — do not try fallback
            throw lastError;
          }
        } catch (error) {
          if (error.name === "AbortError") {
            lastError = Error("API timeout");
          } else {
            lastError = error;
          }
          const msg = String(lastError.message || lastError);
          if (BUSINESS_ERRORS.has(msg) || /Geen toegang|forbidden|not_linked/i.test(msg)) {
            throw lastError;
          }
        }
        if (attempt < retriesPerUrl) {
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        }
      }
    }
    throw lastError || Error("Opslaan mislukt");
  }

  async function getJson(query) {
    let lastError;
    for (const base of endpoints()) {
      try {
        const response = await fetchWithTimeout(
          `${base}?${query}&_=${Date.now()}`,
          { redirect: "follow" },
          TIMEOUT_MS
        );
        if (!response.ok) throw Error(`API ${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error.name === "AbortError" ? Error("API timeout") : error;
      }
    }
    throw lastError || Error("API mislukt");
  }

  global.ScheveTorenApi = { postJson, getJson, endpoints, PRIMARY, FALLBACK };
})(window);

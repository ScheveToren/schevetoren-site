const CMS_API = window.SCHEVETOREN_CONFIG?.API_URL || "";

async function cmsPost(action, extra = {}) {
  const token = window.ScheveTorenAuth?.getAccessToken?.() || "";
  const response = await fetch(CMS_API, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, token, ...extra })
  });
  return response.json();
}

function setStatus(el, text, ok = true) {
  if (!el) return;
  el.textContent = text;
  el.className = `api-status ${ok ? "ok" : "error"}`;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function initTabs() {
  const buttons = document.querySelectorAll("[data-cms-tab]");
  const panels = document.querySelectorAll("[data-cms-panel]");
  buttons.forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.cmsTab;
      buttons.forEach(b => b.classList.toggle("active", b === button));
      panels.forEach(p => { p.hidden = p.dataset.cmsPanel !== id; });
    });
  });
}

async function initNewsForm(statusEl) {
  const form = document.getElementById("cmsNewsForm");
  if (!form) return;
  const dateInput = form.querySelector('[name="date"]');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }
  form.querySelector('[name="slug"]')?.addEventListener("blur", event => {
    if (!event.target.value && form.querySelector('[name="title"]')?.value) {
      event.target.value = slugify(form.querySelector('[name="title"]').value);
    }
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.draft = form.querySelector('[name="draft"]')?.checked ?? false;
    setStatus(statusEl, "Nieuws publiceren…");
    try {
      const result = await cmsPost("cms-publish-news", data);
      if (!result.ok) throw new Error(result.message || result.error || "Publiceren mislukt");
      setStatus(statusEl, `Gepubliceerd naar GitHub (${result.path}). CI duurt 1–3 min.`, true);
    } catch (error) {
      setStatus(statusEl, error.message, false);
    }
  });
}

const PAGE_KEYS = [
  { key: "contact", label: "Contact" },
  { key: "jeugd", label: "Jeugd" },
  { key: "gedragsregels", label: "Gedragsregels" }
];

async function loadPageEditor(key, editorEl, statusEl) {
  setStatus(statusEl, "Pagina laden…");
  try {
    const result = await cmsPost("cms-get-page", { page_key: key });
    if (!result.ok) throw new Error(result.error || "Laden mislukt");
    editorEl.value = JSON.stringify(result.page, null, 2);
    setStatus(statusEl, `Geladen: ${key}.json`, true);
  } catch (error) {
    editorEl.value = "";
    setStatus(statusEl, error.message, false);
  }
}

function initPageForm(statusEl) {
  const select = document.getElementById("cmsPageKey");
  const editor = document.getElementById("cmsPageJson");
  const loadBtn = document.getElementById("cmsPageLoad");
  const saveBtn = document.getElementById("cmsPageSave");
  if (!select || !editor) return;
  PAGE_KEYS.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.key;
    opt.textContent = p.label;
    select.appendChild(opt);
  });
  loadBtn?.addEventListener("click", () => loadPageEditor(select.value, editor, statusEl));
  saveBtn?.addEventListener("click", async () => {
    setStatus(statusEl, "Pagina opslaan…");
    try {
      const page = JSON.parse(editor.value);
      const result = await cmsPost("cms-publish-page", { page_key: select.value, page });
      if (!result.ok) throw new Error(result.message || result.error || "Opslaan mislukt");
      setStatus(statusEl, `Opgeslagen (${result.path}). CI genereert HTML.`, true);
    } catch (error) {
      setStatus(statusEl, error.message, false);
    }
  });
  loadPageEditor(select.value, editor, statusEl);
}

function initIcsForm(statusEl) {
  const form = document.getElementById("cmsIcsForm");
  if (!form) return;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const file = form.querySelector('[name="ics"]')?.files?.[0];
    if (!file) return setStatus(statusEl, "Kies een .ics bestand.", false);
    setStatus(statusEl, "ICS uploaden…");
    try {
      const ics_base64 = await fileToBase64(file);
      const result = await cmsPost("cms-upload-ics", { ics_base64 });
      if (!result.ok) throw new Error(result.message || result.error || "Upload mislukt");
      setStatus(statusEl, `ICS geüpload (${result.icsPath}). Abonneer-links volgen calendar-feed.json.`, true);
    } catch (error) {
      setStatus(statusEl, error.message, false);
    }
  });
}

function initSystem(statusEl) {
  document.getElementById("cmsTestCommit")?.addEventListener("click", async () => {
    setStatus(statusEl, "Test-commit…");
    try {
      const result = await cmsPost("cms-test-commit");
      if (!result.ok) throw new Error(result.message || result.error || "Test mislukt");
      setStatus(statusEl, `GitHub OK (commit ${result.commit || "ok"}).`, true);
    } catch (error) {
      setStatus(statusEl, error.message, false);
    }
  });
  document.getElementById("cmsRefreshStatus")?.addEventListener("click", () => refreshAdmin(statusEl));
}

async function refreshAdmin(statusEl) {
  const shell = document.getElementById("cmsShell");
  if (!window.ScheveTorenAuth?.getAccessToken?.()) {
    setStatus(statusEl, "Log in met Lichess (admin).", false);
    if (shell) shell.hidden = true;
    return;
  }
  try {
    const who = await cmsPost("whoami");
    if (!who.is_admin) {
      setStatus(statusEl, "Geen admin-rechten (is_admin in spreadsheet).", false);
      if (shell) shell.hidden = true;
      return;
    }
    const cms = await cmsPost("cms-status");
    const gh = cms.github_configured
      ? (cms.github_reachable ? "GitHub bereikbaar" : "GitHub PAT gezet, API-fout")
      : "GITHUB_PAT nog niet gezet in Apps Script";
    setStatus(statusEl, `Ingelogd als ${who.lichess_username}. ${gh}.`, true);
    if (shell) shell.hidden = false;
  } catch (error) {
    setStatus(statusEl, error.message, false);
    if (shell) shell.hidden = true;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("cmsStatus");
  initTabs();
  initNewsForm(statusEl);
  initPageForm(statusEl);
  initIcsForm(statusEl);
  initSystem(statusEl);
  window.addEventListener("lichess-auth-changed", () => refreshAdmin(statusEl));
  refreshAdmin(statusEl);
});

async function cmsPost(action, extra = {}) {
  return window.ScheveTorenApi.postJson({ action, ...extra }, { retries: 1 });
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

function getNewsSlug() {
  const form = document.getElementById("cmsNewsForm");
  if (!form) return "";
  const slug = slugify(form.querySelector('[name="slug"]')?.value);
  if (slug) return slug;
  return slugify(form.querySelector('[name="title"]')?.value);
}

function ensureSlugOrWarn(statusEl) {
  const form = document.getElementById("cmsNewsForm");
  let slug = getNewsSlug();
  if (!slug) {
    setStatus(statusEl, "Vul eerst een titel of slug in.", false);
    return "";
  }
  const slugInput = form.querySelector('[name="slug"]');
  if (slugInput && !slugInput.value.trim()) slugInput.value = slug;
  return slug;
}

function updateMediaHints() {
  const cover = document.getElementById("newsCover")?.value || "";
  const pdf = document.getElementById("newsPdf")?.value || "";
  const coverHint = document.getElementById("newsCoverHint");
  const pdfHint = document.getElementById("newsPdfHint");
  if (coverHint) {
    coverHint.hidden = !cover;
    coverHint.textContent = cover ? `Cover: ${cover}` : "";
  }
  if (pdfHint) {
    pdfHint.hidden = !pdf;
    pdfHint.textContent = pdf ? `PDF: ${pdf}` : "";
  }
}

function fillNewsForm(post) {
  const form = document.getElementById("cmsNewsForm");
  if (!form) return;
  form.querySelector('[name="title"]').value = post.title || "";
  form.querySelector('[name="slug"]').value = post.slug || "";
  form.querySelector('[name="date"]').value = post.date || "";
  form.querySelector('[name="author"]').value = post.author || "Bestuur";
  form.querySelector('[name="excerpt"]').value = post.excerpt || "";
  form.querySelector('[name="draft"]').checked = Boolean(post.draft);
  form.querySelector("#newsBody").value = post.body || "";
  const coverInput = form.querySelector("#newsCover");
  if (coverInput) coverInput.value = post.cover || "";
  const pdfInput = form.querySelector("#newsPdf");
  if (pdfInput) pdfInput.value = post.pdf || "";
  const pathInput = form.querySelector("#newsRepoPath");
  if (pathInput) pathInput.value = post.repo_path || "";
  const hint = document.getElementById("cmsNewsEditHint");
  if (hint) {
    if (post.repo_path) {
      hint.hidden = false;
      hint.textContent = `Bewerken: ${post.repo_path} (slug/datum wijzigen maakt een nieuw bestand tenzij je opnieuw laadt).`;
    } else {
      hint.hidden = true;
      hint.textContent = "";
    }
  }
  updateMediaHints();
  updateNewsPreview();
}

function clearNewsForm() {
  fillNewsForm({
    title: "",
    slug: "",
    date: new Date().toISOString().slice(0, 10),
    author: "Bestuur",
    excerpt: "",
    draft: false,
    body: "",
    cover: "",
    pdf: "",
    repo_path: ""
  });
  const pick = document.getElementById("cmsNewsPick");
  if (pick) pick.value = "";
  ["newsCoverFile", "newsImageFile", "newsPdfFile"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

function insertAtCursor(textarea, text) {
  if (!textarea) return;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const value = textarea.value;
  textarea.value = value.slice(0, start) + text + value.slice(end);
  const pos = start + text.length;
  textarea.focus();
  textarea.setSelectionRange(pos, pos);
  updateNewsPreview();
}

function wrapSelection(textarea, before, after = before, placeholder = "tekst") {
  if (!textarea) return;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const value = textarea.value;
  const selected = value.slice(start, end) || placeholder;
  const next = before + selected + after;
  textarea.value = value.slice(0, start) + next + value.slice(end);
  textarea.focus();
  if (value.slice(start, end)) {
    textarea.setSelectionRange(start, start + next.length);
  } else {
    textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
  }
  updateNewsPreview();
}

function lichessAnalysisUrl(fen, color = "white") {
  const fenParam = fen.trim().replace(/ /g, "_");
  const q = new URLSearchParams({
    fen: fenParam,
    color: color === "black" ? "black" : "white",
    theme: "brown",
    pieceSet: "merida"
  });
  return `https://lichess.org/embed/analysis?${q}`;
}

function extractFenFromText(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;

  const fenRe = /([rnbqkpRNBQKP1-8/]+)\s+([wb])\s+([KQkq-]+)\s+([a-h1-8-]+)\s+(\d+)\s+(\d+)/;
  try {
    if (/^https?:\/\//i.test(text)) {
      const url = new URL(text);
      const fenParam = url.searchParams.get("fen");
      if (fenParam) {
        const fen = fenParam.replace(/_/g, " ");
        if (fenRe.test(fen)) return fen.match(fenRe)[0];
      }
      const path = decodeURIComponent(url.pathname);
      const editor = path.match(/\/editor\/([^/?#]+)/i);
      if (editor) {
        const fen = editor[1].replace(/_/g, " ");
        if (fenRe.test(fen)) return fen.match(fenRe)[0];
      }
      const analysis = path.match(/\/analysis\/([^/?#]+)/i);
      if (analysis && !/^pgn$/i.test(analysis[1])) {
        const fen = analysis[1].replace(/_/g, " ");
        if (fenRe.test(fen)) return fen.match(fenRe)[0];
      }
    }
  } catch {
    /* ignore */
  }

  const underscored = text.replace(/_/g, " ");
  const match = underscored.match(fenRe);
  return match ? match[0] : null;
}

function extractGameId(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  if (/^[a-zA-Z0-9]{8}$/.test(text)) return text;
  try {
    if (/^https?:\/\//i.test(text)) {
      const url = new URL(text);
      if (!/lichess\.org$/i.test(url.hostname.replace(/^www\./, ""))) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      if (!parts.length) return null;
      if (["embed", "game", "analysis"].includes(parts[0]) && parts[1]) {
        const id = parts[1].slice(0, 8);
        return /^[a-zA-Z0-9]{8}$/.test(id) ? id : null;
      }
      const id = parts[0].slice(0, 8);
      return /^[a-zA-Z0-9]{8}$/.test(id) ? id : null;
    }
  } catch {
    return null;
  }
  return null;
}

function looksLikePgn(raw) {
  const text = String(raw || "").trim();
  if (!text) return false;
  if (/\[Event\s+/i.test(text) || /\[FEN\s+/i.test(text)) return true;
  return /^\s*1\./.test(text) || /\b1\.\s*\S+/.test(text);
}

function renderPreviewMarkdown(src) {
  let body = String(src || "");
  body = body.replace(/```fen\s*(?:\n| )([\s\S]*?)```/g, (_, raw) => {
    const fen = extractFenFromText(raw) || extractFenFromText(raw.split(/\n/).find(l => !/^(caption|orientation):/i.test(l)) || "");
    if (!fen) return `<div class="fen-placeholder">FEN-diagram (ongeldig of leeg)</div>`;
    let orientation = "white";
    for (const line of raw.split(/\n/)) {
      if (line.toLowerCase().startsWith("orientation:")) {
        orientation = line.split(":").slice(1).join(":").trim().toLowerCase();
      }
    }
    const srcUrl = lichessAnalysisUrl(fen, orientation);
    return `<figure class="chess-diagram"><iframe title="Schaakdiagram" src="${srcUrl}" loading="lazy"></iframe></figure>`;
  });
  body = body.replace(/```game\s*(?:\n| )([\s\S]*?)```/g, (_, raw) => {
    const id = extractGameId(raw.trim().split(/\n/)[0] || "");
    if (!id) return `<div class="game-placeholder">Lichess-partij (ongeldige id/url)</div>`;
    const srcUrl = `https://lichess.org/embed/${id}?theme=brown&pieceSet=merida`;
    return `<figure class="chess-diagram chess-game"><iframe title="Lichess-partij" src="${srcUrl}" loading="lazy"></iframe></figure>`;
  });
  body = body.replace(/```pgn\s*(?:\n| )([\s\S]*?)```/g, (_, raw) => {
    const lines = raw.trim().split(/\n/).filter(l => !/^(caption|orientation):/i.test(l.trim()));
    const preview = lines.slice(0, 4).join(" ").slice(0, 160);
    return `<div class="pgn-placeholder">PGN-viewer (na publicatie met navigatie)<br><code>${escapeHtml(preview)}${preview.length >= 160 ? "…" : ""}</code></div>`;
  });
  if (window.marked?.parse) {
    return window.marked.parse(body, { breaks: true });
  }
  return `<pre>${escapeHtml(body)}</pre>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let previewTimer = null;
function updateNewsPreview() {
  const preview = document.getElementById("newsPreview");
  const body = document.getElementById("newsBody");
  if (!preview || !body) return;
  preview.innerHTML = renderPreviewMarkdown(body.value);
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updateNewsPreview, 180);
}

function initMarkdownToolbar() {
  const toolbar = document.getElementById("newsToolbar");
  const body = document.getElementById("newsBody");
  if (!toolbar || !body) return;
  toolbar.addEventListener("click", event => {
    const btn = event.target.closest("button[data-md]");
    if (!btn) return;
    const action = btn.dataset.md;
    if (action === "bold") wrapSelection(body, "**", "**", "vet");
    else if (action === "italic") wrapSelection(body, "*", "*", "cursief");
    else if (action === "heading") wrapSelection(body, "## ", "", "Kop");
    else if (action === "link") {
      const url = window.prompt("URL", "https://");
      if (!url) return;
      wrapSelection(body, "[", `](${url})`, "linktekst");
    } else if (action === "list") wrapSelection(body, "- ", "", "punt");
    else if (action === "fen") {
      insertAtCursor(body, "\n```fen\n\norientation: white\n```\n");
      document.getElementById("chessHelperInput")?.focus();
    } else if (action === "game") {
      insertAtCursor(body, "\n```game\n\n```\n");
      document.getElementById("chessHelperInput")?.focus();
    } else if (action === "pgn") {
      insertAtCursor(body, "\n```pgn\n\n```\n");
      document.getElementById("chessHelperInput")?.focus();
    }
  });
  body.addEventListener("input", schedulePreview);
}

function initChessHelper(statusEl) {
  const input = document.getElementById("chessHelperInput");
  const body = document.getElementById("newsBody");
  if (!input || !body) return;

  document.getElementById("chessInsertFen")?.addEventListener("click", () => {
    const fen = extractFenFromText(input.value);
    if (!fen) return setStatus(statusEl, "Geen geldige FEN of Lichess-URL gevonden.", false);
    insertAtCursor(body, `\n\`\`\`fen\n${fen}\norientation: white\n\`\`\`\n`);
    setStatus(statusEl, "FEN-diagram ingevoegd.", true);
  });

  document.getElementById("chessInsertGame")?.addEventListener("click", () => {
    const id = extractGameId(input.value);
    if (!id) return setStatus(statusEl, "Geen geldige Lichess-partij-URL of game-id.", false);
    insertAtCursor(body, `\n\`\`\`game\n${id}\n\`\`\`\n`);
    setStatus(statusEl, `Partij ${id} ingevoegd.`, true);
  });

  document.getElementById("chessInsertPgn")?.addEventListener("click", () => {
    const raw = input.value.trim();
    if (!looksLikePgn(raw) && !extractFenFromText(raw)) {
      return setStatus(statusEl, "Plak een PGN (of zettenlijst) om in te voegen.", false);
    }
    insertAtCursor(body, `\n\`\`\`pgn\n${raw}\n\`\`\`\n`);
    setStatus(statusEl, "PGN ingevoegd.", true);
  });
}

async function uploadNewsMedia(file, kind, statusEl) {
  const slug = ensureSlugOrWarn(statusEl);
  if (!slug) return null;
  if (!file) {
    setStatus(statusEl, "Kies eerst een bestand.", false);
    return null;
  }
  setStatus(statusEl, "Media uploaden…");
  const media_base64 = await fileToBase64(file);
  const result = await cmsPost("cms-upload-news-media", {
    slug,
    filename: file.name,
    media_base64,
    kind
  });
  if (!result.ok) throw new Error(result.message || result.error || "Upload mislukt");
  return result;
}

function initMediaControls(statusEl) {
  document.getElementById("newsCoverUpload")?.addEventListener("click", async () => {
    try {
      const file = document.getElementById("newsCoverFile")?.files?.[0];
      const result = await uploadNewsMedia(file, "image", statusEl);
      if (!result) return;
      const coverInput = document.getElementById("newsCover");
      if (coverInput) coverInput.value = result.relative_path || result.path.replace(/^docs\/nieuws\/berichten\//, "");
      updateMediaHints();
      setStatus(statusEl, `Cover geüpload (${result.path}).`, true);
    } catch (error) {
      setStatus(statusEl, error.message, false);
    }
  });

  document.getElementById("newsCoverClear")?.addEventListener("click", () => {
    const coverInput = document.getElementById("newsCover");
    if (coverInput) coverInput.value = "";
    const file = document.getElementById("newsCoverFile");
    if (file) file.value = "";
    updateMediaHints();
    setStatus(statusEl, "Cover gewist (publiceren om op te slaan).", true);
  });

  document.getElementById("newsImageInsert")?.addEventListener("click", async () => {
    try {
      const file = document.getElementById("newsImageFile")?.files?.[0];
      const result = await uploadNewsMedia(file, "image", statusEl);
      if (!result) return;
      const md = result.relative_md || `![${file.name}](${result.relative_path})`;
      insertAtCursor(document.getElementById("newsBody"), `\n${md}\n`);
      setStatus(statusEl, `Afbeelding ingevoegd (${result.path}).`, true);
    } catch (error) {
      setStatus(statusEl, error.message, false);
    }
  });

  document.getElementById("newsPdfUpload")?.addEventListener("click", async () => {
    try {
      const file = document.getElementById("newsPdfFile")?.files?.[0];
      const result = await uploadNewsMedia(file, "pdf", statusEl);
      if (!result) return;
      const pdfInput = document.getElementById("newsPdf");
      if (pdfInput) pdfInput.value = result.relative_path || result.path.replace(/^docs\/nieuws\/berichten\//, "");
      updateMediaHints();
      setStatus(statusEl, `PDF geüpload (${result.path}).`, true);
    } catch (error) {
      setStatus(statusEl, error.message, false);
    }
  });

  document.getElementById("newsPdfClear")?.addEventListener("click", () => {
    const pdfInput = document.getElementById("newsPdf");
    if (pdfInput) pdfInput.value = "";
    const file = document.getElementById("newsPdfFile");
    if (file) file.value = "";
    updateMediaHints();
    setStatus(statusEl, "PDF gewist (publiceren om op te slaan).", true);
  });
}

async function loadNewsList() {
  const select = document.getElementById("cmsNewsPick");
  if (!select) return;
  const result = await cmsPost("cms-list-news");
  if (!result.ok) return;
  while (select.options.length > 1) select.remove(1);
  (result.posts || []).forEach(post => {
    const opt = document.createElement("option");
    opt.value = post.repo_path;
    opt.textContent = `${post.date} — ${post.title}`;
    select.appendChild(opt);
  });
}

async function initNewsForm(statusEl) {
  const form = document.getElementById("cmsNewsForm");
  if (!form) return;
  clearNewsForm();
  initMarkdownToolbar();
  initChessHelper(statusEl);
  initMediaControls(statusEl);
  form.querySelector('[name="slug"]')?.addEventListener("blur", event => {
    if (!event.target.value && form.querySelector('[name="title"]')?.value) {
      event.target.value = slugify(form.querySelector('[name="title"]').value);
    }
  });
  document.getElementById("cmsNewsLoad")?.addEventListener("click", async () => {
    const path = document.getElementById("cmsNewsPick")?.value;
    if (!path) return setStatus(statusEl, "Kies een bericht of Nieuw.", false);
    setStatus(statusEl, "Bericht laden…");
    try {
      const result = await cmsPost("cms-get-news", { repo_path: path });
      if (!result.ok) throw new Error(result.error || "Laden mislukt");
      fillNewsForm(result);
      setStatus(statusEl, `Geladen: ${path}`, true);
    } catch (error) {
      setStatus(statusEl, error.message, false);
    }
  });
  document.getElementById("cmsNewsNew")?.addEventListener("click", () => {
    clearNewsForm();
    setStatus(statusEl, "Nieuw bericht — vul titel en inhoud in.", true);
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.draft = form.querySelector('[name="draft"]')?.checked ?? false;
    data.cover = form.querySelector("#newsCover")?.value?.trim() || "";
    data.pdf = form.querySelector("#newsPdf")?.value?.trim() || "";
    const repoPath = form.querySelector("#newsRepoPath")?.value?.trim();
    if (repoPath) data.repo_path = repoPath;
    setStatus(statusEl, "Nieuws publiceren…");
    try {
      const result = await cmsPost("cms-publish-news", data);
      if (!result.ok) throw new Error(result.message || result.error || "Publiceren mislukt");
      setStatus(statusEl, `Gepubliceerd naar GitHub (${result.path}). CI duurt 1–3 min.`, true);
      await loadNewsList();
    } catch (error) {
      setStatus(statusEl, error.message, false);
    }
  });
  updateNewsPreview();
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
      : "GITHUB_PAT nog niet gezet (.env op de Pi of Apps Script)";
    setStatus(statusEl, `Ingelogd als ${who.lichess_username}. ${gh}.`, true);
    if (shell) shell.hidden = false;
    loadNewsList().catch(() => {});
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

const { config } = require("./config");

const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const PDF_MAX_BYTES = 8 * 1024 * 1024;

async function githubApiRequest(path, options = {}) {
  const pat = config.githubPat;
  if (!pat) {
    return { ok: false, error: "github_not_configured", message: "GITHUB_PAT ontbreekt in .env." };
  }
  const url = `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}${path}`;
  const headers = {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "schevetoren-api"
  };
  if (options.payload) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.payload ? JSON.stringify(options.payload) : undefined
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text };
  }
  if (response.ok) return { ok: true, status: response.status, body };
  return {
    ok: false,
    error: "github_api",
    status: response.status,
    message: body.message || text || `HTTP ${response.status}`
  };
}

async function githubGetFileMeta(repoPath) {
  const encoded = repoPath.split("/").map(encodeURIComponent).join("/");
  const result = await githubApiRequest(
    `/contents/${encoded}?ref=${encodeURIComponent(config.githubBranch)}`,
    { method: "GET" }
  );
  if (!result.ok) {
    if (result.status === 404) return { ok: true, exists: false };
    return result;
  }
  return { ok: true, exists: true, sha: result.body.sha, content: result.body.content };
}

async function githubPutTextFile(repoPath, content, message) {
  const meta = await githubGetFileMeta(repoPath);
  if (!meta.ok) return meta;
  const encoded = repoPath.split("/").map(encodeURIComponent).join("/");
  const payload = {
    message,
    content: Buffer.from(String(content), "utf8").toString("base64"),
    branch: config.githubBranch
  };
  if (meta.exists && meta.sha) payload.sha = meta.sha;
  const result = await githubApiRequest(`/contents/${encoded}`, { method: "PUT", payload });
  if (!result.ok) return result;
  return {
    ok: true,
    path: repoPath,
    commit: result.body.commit && result.body.commit.sha,
    html_url: result.body.content && result.body.content.html_url
  };
}

async function githubPutBinaryFile(repoPath, base64Content, message) {
  const meta = await githubGetFileMeta(repoPath);
  if (!meta.ok) return meta;
  const encoded = repoPath.split("/").map(encodeURIComponent).join("/");
  const payload = {
    message,
    content: String(base64Content || "").replace(/\s/g, ""),
    branch: config.githubBranch
  };
  if (meta.exists && meta.sha) payload.sha = meta.sha;
  const result = await githubApiRequest(`/contents/${encoded}`, { method: "PUT", payload });
  if (!result.ok) return result;
  return {
    ok: true,
    path: repoPath,
    commit: result.body.commit && result.body.commit.sha,
    html_url: result.body.content && result.body.content.html_url
  };
}

function sanitizeSlug(slug) {
  return String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeFilename(name) {
  const base = String(name || "file")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .pop();
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "file";
}

function detectMediaKind(buffer, filename, kindHint) {
  const hint = String(kindHint || "").toLowerCase();
  const lower = String(filename || "").toLowerCase();
  const isPdfMagic = buffer.length >= 4 && buffer.slice(0, 4).toString("utf8") === "%PDF";
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isGif = buffer.length >= 3 && buffer.slice(0, 3).toString("utf8") === "GIF";
  const isWebp =
    buffer.length >= 12 &&
    buffer.slice(0, 4).toString("utf8") === "RIFF" &&
    buffer.slice(8, 12).toString("utf8") === "WEBP";

  if (hint === "pdf" || lower.endsWith(".pdf") || isPdfMagic) {
    if (!isPdfMagic) return { ok: false, error: "invalid_pdf" };
    return { ok: true, kind: "pdf", ext: "pdf" };
  }
  if (isJpeg || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    if (!isJpeg) return { ok: false, error: "invalid_image" };
    return { ok: true, kind: "image", ext: "jpg" };
  }
  if (isPng || lower.endsWith(".png")) {
    if (!isPng) return { ok: false, error: "invalid_image" };
    return { ok: true, kind: "image", ext: "png" };
  }
  if (isGif || lower.endsWith(".gif")) {
    if (!isGif) return { ok: false, error: "invalid_image" };
    return { ok: true, kind: "image", ext: "gif" };
  }
  if (isWebp || lower.endsWith(".webp")) {
    if (!isWebp) return { ok: false, error: "invalid_image" };
    return { ok: true, kind: "image", ext: "webp" };
  }
  return { ok: false, error: "unsupported_media" };
}

function normalizePdfList(fields) {
  const out = [];
  const push = (raw) => {
    const path = String(raw || "")
      .trim()
      .replace(/^\.\//, "");
    if (!path) return;
    if (!/^media\/[a-z0-9._/-]+\.pdf$/i.test(path)) return;
    if (!out.includes(path)) out.push(path);
  };
  if (Array.isArray(fields.pdfs)) fields.pdfs.forEach(push);
  else if (typeof fields.pdfs === "string" && fields.pdfs.trim()) {
    try {
      const parsed = JSON.parse(fields.pdfs);
      if (Array.isArray(parsed)) parsed.forEach(push);
      else push(fields.pdfs);
    } catch {
      String(fields.pdfs)
        .split(",")
        .forEach(push);
    }
  }
  push(fields.pdf);
  return out;
}

function buildNewsMarkdown(fields) {
  const title = String(fields.title || "").trim();
  const slug = sanitizeSlug(fields.slug || title);
  const date = String(fields.date || "").trim();
  const author = String(fields.author || "Bestuur").trim();
  const excerpt = String(fields.excerpt || "").trim();
  const draft = fields.draft === true || String(fields.draft).toLowerCase() === "true";
  const body = String(fields.body || "").trim();
  const cover = String(fields.cover || "").trim();
  const pdfs = normalizePdfList(fields);
  if (!title || !slug || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "invalid_news_fields" };
  }
  if (cover && !/^(\.\/)?media\/[a-z0-9._/-]+$/i.test(cover)) {
    return { ok: false, error: "invalid_cover_path" };
  }
  if (fields.pdf || fields.pdfs) {
    const requested = Array.isArray(fields.pdfs)
      ? fields.pdfs.length
      : String(fields.pdfs || fields.pdf || "").trim()
        ? 1
        : 0;
    if (requested && !pdfs.length) return { ok: false, error: "invalid_pdf_path" };
  }
  const front = [
    "---",
    `title: "${title.replace(/"/g, '\\"')}"`,
    `slug: ${slug}`,
    `excerpt: "${excerpt.replace(/"/g, '\\"')}"`,
    `date: ${date}`,
    `author: "${author.replace(/"/g, '\\"')}"`,
    `draft: ${draft}`
  ];
  if (cover) front.push(`cover: ${cover.replace(/^\.\//, "")}`);
  if (pdfs.length) {
    front.push(`pdf: ${pdfs[0]}`);
    front.push(`pdfs: ${JSON.stringify(pdfs)}`);
  }
  front.push("---", "", body, "");
  return { ok: true, path: `docs/nieuws/berichten/${date}-${slug}.md`, content: front.join("\n") };
}

function parseNewsMarkdown(raw) {
  const text = String(raw || "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!match) return { ok: false, error: "invalid_frontmatter" };
  const front = match[1];
  const body = match[2].replace(/^\s+/, "");
  const fields = { draft: false };
  front.split("\n").forEach((line) => {
    const m = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (!m) return;
    const key = m[1];
    let val = m[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
    if (key === "draft") fields.draft = val === "true";
    else if (key === "pdfs") {
      try {
        const parsed = JSON.parse(val);
        fields.pdfs = Array.isArray(parsed) ? parsed : [val];
      } catch {
        fields.pdfs = val.split(",").map((s) => s.trim()).filter(Boolean);
      }
    } else fields[key] = val;
  });
  fields.pdfs = normalizePdfList(fields);
  fields.pdf = fields.pdfs[0] || "";
  return { ok: true, fields, body: body.replace(/\s+$/, "") };
}

async function cmsStatus() {
  if (!config.githubPat) {
    return {
      ok: true,
      github_configured: false,
      repo: `${config.githubOwner}/${config.githubRepo}`
    };
  }
  const ping = await githubApiRequest("", { method: "GET" });
  return {
    ok: true,
    github_configured: true,
    github_reachable: ping.ok,
    repo: `${config.githubOwner}/${config.githubRepo}`,
    branch: config.githubBranch
  };
}

async function cmsTestCommit(auth) {
  const stamp = new Date().toISOString();
  const content =
    JSON.stringify({ ok: true, last_cms_test: stamp, by: auth.lichess_username }, null, 2) + "\n";
  return githubPutTextFile(
    "docs/content/.cms-health.json",
    content,
    `CMS test commit (${auth.lichess_username})`
  );
}

async function cmsListNews() {
  const meta = await githubGetFileMeta("docs/nieuws/posts-index.json");
  if (!meta.ok) return meta;
  if (!meta.exists) return { ok: true, posts: [] };
  const b64 = String(meta.content || "").replace(/\s/g, "");
  const decoded = Buffer.from(b64, "base64").toString("utf8");
  try {
    const posts = JSON.parse(decoded);
    const list = (Array.isArray(posts) ? posts : []).map((p) => ({
      title: p.title,
      slug: p.slug,
      date: p.date,
      repo_path: `docs/nieuws/berichten/${p.date}-${p.slug}.md`
    }));
    return { ok: true, posts: list };
  } catch {
    return { ok: false, error: "invalid_posts_index" };
  }
}

async function cmsGetNews(repoPathRaw) {
  const repoPath = String(repoPathRaw || "").trim();
  if (!repoPath || !/^docs\/nieuws\/berichten\/[^/]+\.md$/.test(repoPath)) {
    return { ok: false, error: "invalid_path" };
  }
  const meta = await githubGetFileMeta(repoPath);
  if (!meta.ok) return meta;
  if (!meta.exists) return { ok: false, error: "not_found" };
  const b64 = String(meta.content || "").replace(/\s/g, "");
  const decoded = Buffer.from(b64, "base64").toString("utf8");
  const parsed = parseNewsMarkdown(decoded);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    repo_path: repoPath,
    title: parsed.fields.title || "",
    slug: parsed.fields.slug || "",
    date: parsed.fields.date || "",
    author: parsed.fields.author || "",
    excerpt: parsed.fields.excerpt || "",
    draft: parsed.fields.draft === true,
    cover: parsed.fields.cover || "",
    pdf: parsed.fields.pdf || "",
    pdfs: parsed.fields.pdfs || [],
    body: parsed.body
  };
}

async function cmsPublishNews(payload) {
  const built = buildNewsMarkdown(payload);
  if (!built.ok) return built;
  const overridePath = String(payload.repo_path || "").trim();
  const path =
    overridePath && /^docs\/nieuws\/berichten\/[^/]+\.md$/.test(overridePath)
      ? overridePath
      : built.path;
  return githubPutTextFile(path, built.content, `CMS: nieuws ${path}`);
}

async function cmsPublishPage(payload) {
  const key = sanitizeSlug(payload.page_key || payload.key);
  if (!key) return { ok: false, error: "missing page_key" };
  const page = payload.page;
  if (!page || typeof page !== "object") return { ok: false, error: "missing page json" };
  const content = JSON.stringify(page, null, 2) + "\n";
  return githubPutTextFile(`docs/content/pages/${key}.json`, content, `CMS: pagina ${key}`);
}

async function cmsGetPage(keyRaw) {
  const key = sanitizeSlug(keyRaw);
  if (!key) return { ok: false, error: "missing page_key" };
  const meta = await githubGetFileMeta(`docs/content/pages/${key}.json`);
  if (!meta.ok) return meta;
  if (!meta.exists) return { ok: false, error: "not_found" };
  const b64 = String(meta.content || "").replace(/\s/g, "");
  const decoded = Buffer.from(b64, "base64").toString("utf8");
  try {
    return { ok: true, page_key: key, page: JSON.parse(decoded) };
  } catch {
    return { ok: false, error: "invalid_json" };
  }
}

function normalizeSeasonEvent(item) {
  if (Array.isArray(item) && item.length >= 2) {
    const date = String(item[0] || "").trim();
    const label = String(item[1] || "").trim();
    const kind = String(item[2] || "regular").trim() || "regular";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !label) return null;
    return [date, label, kind];
  }
  if (item && typeof item === "object") {
    const date = String(item.date || "").trim();
    const label = String(item.label || "").trim();
    const kind = String(item.kind || "regular").trim() || "regular";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !label) return null;
    return [date, label, kind];
  }
  return null;
}

function normalizeExtraEvent(item) {
  if (Array.isArray(item) && item.length >= 2) {
    const date = String(item[0] || "").trim();
    const label = String(item[1] || "").trim();
    const kind = String(item[2] || "event").trim() || "event";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !label) return null;
    return { date, label, kind };
  }
  if (item && typeof item === "object") {
    const date = String(item.date || "").trim();
    const label = String(item.label || "").trim();
    const kind = String(item.kind || "event").trim() || "event";
    const newsSlug = sanitizeSlug(item.newsSlug || item.news_slug || "");
    const url = String(item.url || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !label) return null;
    const out = { date, label, kind };
    if (newsSlug) out.newsSlug = newsSlug;
    if (url) out.url = url;
    return out;
  }
  return null;
}

async function cmsGetSeason() {
  const meta = await githubGetFileMeta("docs/data/season.json");
  if (!meta.ok) return meta;
  if (!meta.exists) return { ok: false, error: "not_found" };
  const b64 = String(meta.content || "").replace(/\s/g, "");
  const decoded = Buffer.from(b64, "base64").toString("utf8");
  try {
    const season = JSON.parse(decoded);
    return { ok: true, season };
  } catch {
    return { ok: false, error: "invalid_json" };
  }
}

async function cmsPublishSeason(payload) {
  const season = payload.season;
  if (!season || typeof season !== "object") return { ok: false, error: "missing season json" };
  const events = Array.isArray(season.events)
    ? season.events.map(normalizeSeasonEvent).filter(Boolean)
    : [];
  if (!events.length && Array.isArray(season.events) && season.events.length) {
    return { ok: false, error: "invalid_season_events" };
  }
  const next = {
    season: String(season.season || "").trim() || "season",
    timezone: String(season.timezone || "Europe/Amsterdam").trim(),
    default_start: String(season.default_start || "20:00").trim(),
    default_end: String(season.default_end || "23:00").trim(),
    location: String(season.location || "").trim(),
    events
  };
  if (!/^\d{1,2}:\d{2}$/.test(next.default_start) || !/^\d{1,2}:\d{2}$/.test(next.default_end)) {
    return { ok: false, error: "invalid_season_times" };
  }
  const content = JSON.stringify(next, null, 2) + "\n";
  return githubPutTextFile("docs/data/season.json", content, "CMS: clubavonden (season.json)");
}

async function cmsGetCalendarEvents() {
  const meta = await githubGetFileMeta("docs/data/calendar-events.json");
  if (!meta.ok) return meta;
  if (!meta.exists) return { ok: true, calendar: { season: "", range: {}, events: [] } };
  const b64 = String(meta.content || "").replace(/\s/g, "");
  const decoded = Buffer.from(b64, "base64").toString("utf8");
  try {
    return { ok: true, calendar: JSON.parse(decoded) };
  } catch {
    return { ok: false, error: "invalid_json" };
  }
}

function normalizeRapidPlayer(entry) {
  if (!entry || typeof entry !== "object") return null;
  const name = String(entry.name || "").trim();
  if (!name) return null;
  const ratingRaw = entry.rating;
  const rating =
    ratingRaw === undefined || ratingRaw === null || ratingRaw === ""
      ? undefined
      : Number(ratingRaw);
  const out = { name };
  if (Number.isFinite(rating)) out.rating = rating;
  return out;
}

async function cmsGetRapidLadder() {
  const meta = await githubGetFileMeta("docs/data/rapid-ladder.json");
  if (!meta.ok) return meta;
  if (!meta.exists) return { ok: false, error: "not_found" };
  const b64 = String(meta.content || "").replace(/\s/g, "");
  const decoded = Buffer.from(b64, "base64").toString("utf8");
  try {
    const ladder = JSON.parse(decoded);
    return { ok: true, ladder };
  } catch {
    return { ok: false, error: "invalid_json" };
  }
}

async function cmsPublishRapidLadder(payload) {
  const ladder = payload.ladder;
  if (!ladder || typeof ladder !== "object") return { ok: false, error: "missing rapid ladder json" };
  const players = Array.isArray(ladder.players)
    ? ladder.players.map(normalizeRapidPlayer).filter(Boolean)
    : [];
  if (!players.length && Array.isArray(ladder.players) && ladder.players.length) {
    return { ok: false, error: "invalid_rapid_ladder" };
  }
  const next = {
    season: String(ladder.season || "").trim() || "2026-2027",
    source: String(ladder.source || "").trim(),
    updated: String(ladder.updated || "").trim() || new Date().toISOString().slice(0, 10),
    players
  };
  const content = JSON.stringify(next, null, 2) + "\n";
  return githubPutTextFile("docs/data/rapid-ladder.json", content, "CMS: rapid-ladder.json");
}

async function cmsPublishCalendarEvents(payload) {
  const calendar = payload.calendar || payload;
  if (!calendar || typeof calendar !== "object") return { ok: false, error: "missing calendar json" };
  const events = Array.isArray(calendar.events)
    ? calendar.events.map(normalizeExtraEvent).filter(Boolean)
    : [];
  if (!events.length && Array.isArray(calendar.events) && calendar.events.length) {
    return { ok: false, error: "invalid_calendar_events" };
  }
  const range = calendar.range && typeof calendar.range === "object" ? calendar.range : {};
  const next = {
    season: String(calendar.season || "").trim(),
    range: {
      start: String(range.start || "").trim(),
      end: String(range.end || "").trim()
    },
    events
  };
  if (next.range.start && !/^\d{4}-\d{2}-\d{2}$/.test(next.range.start)) {
    return { ok: false, error: "invalid_range" };
  }
  if (next.range.end && !/^\d{4}-\d{2}-\d{2}$/.test(next.range.end)) {
    return { ok: false, error: "invalid_range" };
  }
  const content = JSON.stringify(next, null, 2) + "\n";
  return githubPutTextFile(
    "docs/data/calendar-events.json",
    content,
    "CMS: extra kalender-events"
  );
}

async function cmsUploadIcs(payload) {
  const b64 = String(payload.ics_base64 || "").trim();
  if (!b64) return { ok: false, error: "missing ics_base64" };
  let icsText;
  try {
    icsText = Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return { ok: false, error: "invalid_base64" };
  }
  if (!/BEGIN:VCALENDAR/i.test(icsText)) return { ok: false, error: "invalid_ics" };
  const putIcs = await githubPutTextFile(
    "docs/kalender/club-upload.ics",
    icsText,
    "CMS: kalender ICS upload"
  );
  if (!putIcs.ok) return putIcs;
  const feed =
    JSON.stringify(
      { icsPath: "kalender/club-upload.ics", updatedAt: new Date().toISOString() },
      null,
      2
    ) + "\n";
  const putFeed = await githubPutTextFile(
    "docs/data/calendar-feed.json",
    feed,
    "CMS: kalender feed pointer"
  );
  if (!putFeed.ok) return putFeed;
  return { ok: true, icsPath: "kalender/club-upload.ics", commits: [putIcs.commit, putFeed.commit] };
}

async function cmsUploadNewsMedia(payload) {
  const slug = sanitizeSlug(payload.slug);
  if (!slug) return { ok: false, error: "missing_slug" };
  const b64 = String(payload.media_base64 || "").replace(/\s/g, "");
  if (!b64) return { ok: false, error: "missing_media_base64" };
  let buffer;
  try {
    buffer = Buffer.from(b64, "base64");
  } catch {
    return { ok: false, error: "invalid_base64" };
  }
  if (!buffer.length) return { ok: false, error: "empty_media" };

  const detected = detectMediaKind(buffer, payload.filename, payload.kind);
  if (!detected.ok) return detected;

  const max = detected.kind === "pdf" ? PDF_MAX_BYTES : IMAGE_MAX_BYTES;
  if (buffer.length > max) {
    return {
      ok: false,
      error: "media_too_large",
      message: `Max ${Math.round(max / (1024 * 1024))} MB voor ${detected.kind}.`
    };
  }

  let filename = sanitizeFilename(payload.filename);
  if (!filename.includes(".")) filename = `${filename}.${detected.ext}`;
  else {
    const parts = filename.split(".");
    parts[parts.length - 1] = detected.ext;
    filename = parts.join(".");
  }

  const relative_path = `media/${slug}/${filename}`;
  const repoPath = `docs/nieuws/berichten/${relative_path}`;
  const put = await githubPutBinaryFile(
    repoPath,
    buffer.toString("base64"),
    `CMS: media ${relative_path}`
  );
  if (!put.ok) return put;

  const relative_md =
    detected.kind === "image"
      ? `![${filename}](./${relative_path})`
      : `[${filename}](./${relative_path})`;

  return {
    ok: true,
    path: repoPath,
    relative_path,
    relative_md,
    kind: detected.kind,
    commit: put.commit
  };
}

module.exports = {
  cmsStatus,
  cmsTestCommit,
  cmsListNews,
  cmsGetNews,
  cmsPublishNews,
  cmsPublishPage,
  cmsGetPage,
  cmsGetSeason,
  cmsPublishSeason,
  cmsGetCalendarEvents,
  cmsPublishCalendarEvents,
  cmsGetRapidLadder,
  cmsPublishRapidLadder,
  cmsUploadIcs,
  cmsUploadNewsMedia
};

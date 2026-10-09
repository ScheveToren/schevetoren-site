const SHEET_ID = "1tj5ZwW3U0D5IsXyuimu7Yv7tAuGAbuoW4-3POTtSwew";

/**
 * Failover backend for the club site. Primary API can run on a Raspberry Pi
 * (see server/ in this repo) with SQLite + Sheets sync. Keep this Apps Script
 * web app deployed and set docs/config.js API_FALLBACK_URL to its /exec URL.
 */

const SEASON = [
  ["2026-08-28", "ALV", "event"], ["2026-09-04", "Speeldag 1", "regular"],
  ["2026-09-11", "Speeldag 2", "regular"], ["2026-09-18", "Speeldag 3", "regular"],
  ["2026-09-25", "Speeldag 4", "regular"], ["2026-10-02", "Speeldag 5", "regular"],
  ["2026-10-09", "Rapid 1", "rapid"], ["2026-10-16", "Rapid 2", "rapid"],
  ["2026-10-30", "Rapid 3", "rapid"], ["2026-11-06", "Speeldag 7", "regular"],
  ["2026-11-13", "Schaak-Off", "regular"], ["2026-11-20", "Speeldag 8", "regular"],
  ["2026-11-27", "Speeldag 9", "regular"], ["2026-12-04", "Speeldag 10", "regular"],
  ["2026-12-11", "Rapid 4", "rapid"], ["2026-12-18", "Rapid 5 / Kerstschaak", "rapid"],
  ["2027-01-08", "Speeldag 11", "regular"], ["2027-01-15", "Speeldag 12", "regular"],
  ["2027-01-22", "Speeldag 13", "regular"], ["2027-01-29", "Speeldag 14", "regular"],
  ["2027-02-05", "Speeldag 15", "regular"], ["2027-02-12", "Speeldag 16", "regular"],
  ["2027-02-19", "Speeldag 17", "regular"], ["2027-03-05", "Speeldag 18", "regular"],
  ["2027-03-12", "Rapid 6", "rapid"], ["2027-03-19", "Rapid 7", "rapid"],
  ["2027-04-02", "Speeldag 19", "regular"], ["2027-04-09", "Speeldag 20", "regular"],
  ["2027-04-16", "Speeldag 21", "regular"], ["2027-04-23", "Speeldag 22", "regular"],
  ["2027-05-14", "Speeldag 23", "regular"], ["2027-05-21", "Speeldag 24", "regular"],
  ["2027-05-28", "Speeldag 25", "regular"], ["2027-06-04", "Speeldag 26", "regular"],
  ["2027-06-11", "Speeldag 27", "regular"], ["2027-06-18", "Speeldag 28", "regular"],
  ["2027-06-25", "Speeldag 29", "regular"]
];

const SHEET_HEADERS = {
  Players: ["player_name", "lichess_username", "invite_code", "is_admin", "created_at", "updated_at", "notes"],
  InviteCodes: ["code", "player_name", "used_by", "used_at", "active"],
  Attendance: ["player_name", "date", "status", "note", "updated_at"],
  Admins: ["email", "role", "added_at"],
  Settings: ["key", "value"]
};

function getSheet(name) {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    throw new Error(`Missing sheet "${name}". Existing sheets: ${spreadsheet.getSheets().map(s => `"${s.getName()}"`).join(", ")}`);
  }
  return sheet;
}

function jsonResponse(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}

function authRequiredResponse() {
  return jsonResponse({ ok: false, error: "auth_required" });
}

function isPastDate(dateString) {
  const date = String(dateString || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return true;
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  return date < today;
}

function normaliseSheetDate(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return Utilities.formatDate(parsed, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function sheetRowsAsObjects(sheetName) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  const headers = values[0].map(header => String(header).trim());
  return values.slice(1)
    .filter(row => row.some(value => String(value || "").trim() !== ""))
    .map(row => {
      const object = {};
      headers.forEach((header, index) => {
        if (!header) return;
        let value = row[index] || "";
        if (sheetName === "Attendance" && header === "date") {
          value = normaliseSheetDate(value);
        }
        object[header] = value;
      });
      return object;
    });
}

function parseIsAdmin(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "true" || text === "yes" || text === "1";
}

function verifyLichessToken(accessToken) {
  const token = String(accessToken || "").trim();
  if (!token) return { ok: false, error: "missing token" };
  try {
    const response = UrlFetchApp.fetch("https://lichess.org/api/account", {
      method: "get",
      headers: { Authorization: `Bearer ${token}` },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      return { ok: false, error: "invalid token" };
    }
    const account = JSON.parse(response.getContentText());
    if (!account || !account.username) return { ok: false, error: "invalid account" };
    return { ok: true, id: account.id, username: String(account.username).toLowerCase() };
  } catch (error) {
    const msg = String(error);
    if (/urlfetch|external_request/i.test(msg)) {
      return {
        ok: false,
        error: "backend_urlfetch",
        message:
          "Apps Script mag nog geen externe sites (Lichess) aanroepen. Voer in de script-editor eenmalig authorizeExternalAccess uit en maak daarna een nieuwe webapp-deployment."
      };
    }
    return { ok: false, error: msg };
  }
}

/** Run once in the Apps Script editor (▶) and approve permissions, then redeploy the web app. */
function authorizeExternalAccess() {
  const lichess = UrlFetchApp.fetch("https://lichess.org/api/status", { muteHttpExceptions: true });
  Logger.log("Lichess reachability: HTTP %s", lichess.getResponseCode());
  const github = UrlFetchApp.fetch("https://api.github.com/zen", { muteHttpExceptions: true });
  Logger.log("GitHub API reachability: HTTP %s", github.getResponseCode());
}

function findPlayerByLichess(username) {
  const wanted = String(username || "").trim().toLowerCase();
  if (!wanted) return null;
  const players = sheetRowsAsObjects("Players");
  return players.find(row => String(row.lichess_username || "").trim().toLowerCase() === wanted) || null;
}

function resolveAuth(accessToken) {
  const verified = verifyLichessToken(accessToken);
  if (!verified.ok) return verified;
  const playerRow = findPlayerByLichess(verified.username);
  const linked = Boolean(playerRow);
  return {
    ok: true,
    lichess_username: verified.username,
    player_name: linked ? String(playerRow.player_name || "").trim() : "",
    is_admin: linked ? parseIsAdmin(playerRow.is_admin) : false,
    linked
  };
}

function getAllAttendance() {
  return sheetRowsAsObjects("Attendance");
}

function getPlayers() {
  const players = sheetRowsAsObjects("Players");
  if (players.length) return players;
  const names = [...new Set(getAllAttendance()
    .map(row => String(row.player_name || "").trim())
    .filter(Boolean))];
  return names.map(player_name => ({
    player_name,
    lichess_username: "",
    invite_code: "",
    is_admin: "FALSE",
    created_at: "",
    updated_at: "",
    notes: ""
  }));
}

function getAttendance(playerName) {
  const wantedPlayer = String(playerName || "").trim();
  return getAllAttendance().filter(row => String(row.player_name || "").trim() === wantedPlayer);
}

function doGet(e) {
  const parameters = e && e.parameter ? e.parameter : {};
  const action = String(parameters.action || "").trim();

  if (action === "season") return jsonResponse({ season: SEASON });
  if (action === "players" || action === "export" || (action === "attendance" && parameters.player)) {
    return authRequiredResponse();
  }
  return jsonResponse({ ok: true, message: "Attendance API ready" });
}

function saveAttendanceRows(player, incomingRows) {
  const sheet = getSheet("Attendance");
  const values = sheet.getDataRange().getValues();
  const now = new Date().toISOString();
  const records = new Map();
  let incomingAccepted = 0;

  values.slice(1).forEach(row => {
    const existingPlayer = String(row[0] || "").trim();
    const date = normaliseSheetDate(row[1]);
    if (!existingPlayer || !date) return;
    records.set(`${existingPlayer}|${date}`, [
      existingPlayer,
      date,
      String(row[2] || "absent"),
      String(row[3] || ""),
      row[4] || ""
    ]);
  });

  incomingRows.forEach(row => {
    const date = String(row.date || "").trim();
    const status = String(row.status || "").trim();
    const note = String(row.note || "").trim();
    if (!date || !["present", "absent"].includes(status) || isPastDate(date)) return;
    records.set(`${player}|${date}`, [player, date, status, note, now]);
    incomingAccepted += 1;
  });

  if (incomingRows.length > 0 && incomingAccepted === 0) {
    return {
      ok: false,
      error: "no_valid_rows",
      message: "Geen geldige toekomstige speeldagen in de opslag — tabblad niet gewijzigd."
    };
  }

  const output = Array.from(records.values());
  if (!output.length) {
    return { ok: false, error: "empty_attendance", message: "Geen aanwezigheidsregels om op te slaan." };
  }

  const rowsNeeded = output.length + 1;
  if (sheet.getMaxRows() < rowsNeeded) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rowsNeeded - sheet.getMaxRows());
  }
  const clearRows = Math.max(sheet.getLastRow(), rowsNeeded);
  sheet.getRange(1, 1, clearRows, 5).clearContent();
  sheet.getRange(1, 1, 1, 5).setValues([SHEET_HEADERS.Attendance]);
  sheet.getRange(2, 1, output.length, 5).setValues(output);
  return { ok: true, records: output.length };
}

function linkLichessWithInvite(auth, code) {
  const inviteCode = String(code || "").trim();
  if (!inviteCode) return { ok: false, error: "missing code" };

  const inviteSheet = getSheet("InviteCodes");
  const inviteRows = inviteSheet.getDataRange().getValues();
  const rowIndex = inviteRows.findIndex((row, index) => {
    if (index === 0) return false;
    const rowCode = String(row[0] || "").trim();
    const active = String(row[4] || "").trim().toLowerCase();
    return rowCode === inviteCode && active !== "used" && active !== "false";
  });
  if (rowIndex < 0) return { ok: false, error: "invalid or used invite code" };

  const playerName = String(inviteRows[rowIndex][1] || "").trim();
  if (!playerName) return { ok: false, error: "invite missing player_name" };

  const playersSheet = getSheet("Players");
  const playerRows = playersSheet.getDataRange().getValues();
  let playerRowIndex = playerRows.findIndex((row, index) => index > 0 && String(row[0] || "").trim() === playerName);
  const now = new Date().toISOString();
  if (playerRowIndex < 0) {
    playersSheet.appendRow([playerName, auth.lichess_username, inviteCode, "FALSE", now, now, ""]);
    playerRowIndex = playersSheet.getLastRow() - 1;
  } else {
    playerRowIndex += 1;
    playersSheet.getRange(playerRowIndex, 2).setValue(auth.lichess_username);
    playersSheet.getRange(playerRowIndex, 3).setValue(inviteCode);
    playersSheet.getRange(playerRowIndex, 6).setValue(now);
  }

  const sheetRow = rowIndex + 1;
  inviteSheet.getRange(sheetRow, 2).setValue(playerName);
  inviteSheet.getRange(sheetRow, 3).setValue(auth.lichess_username);
  inviteSheet.getRange(sheetRow, 4).setValue(now);
  inviteSheet.getRange(sheetRow, 5).setValue("used");

  return { ok: true, message: "player linked", player_name: playerName, lichess_username: auth.lichess_username };
}

function doPost(e) {
  try {
    const contents = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    const payload = JSON.parse(contents);
    const action = String(payload.action || "").trim();
    const token = String(payload.token || "").trim();

    if (action === "whoami") {
      const auth = resolveAuth(token);
      if (!auth.ok) return jsonResponse({ ok: false, error: auth.error || "unauthorized" });
      return jsonResponse({
        ok: true,
        lichess_username: auth.lichess_username,
        player_name: auth.player_name,
        is_admin: auth.is_admin,
        linked: auth.linked
      });
    }

    if (action === "my-attendance") {
      const auth = resolveAuth(token);
      if (!auth.ok) return jsonResponse({ ok: false, error: auth.error || "unauthorized" });
      if (!auth.linked) return jsonResponse({ ok: false, error: "not_linked", attendance: [] });
      return jsonResponse({ ok: true, attendance: getAttendance(auth.player_name) });
    }

    if (action === "link-lichess") {
      const auth = resolveAuth(token);
      if (!auth.ok) return jsonResponse({ ok: false, error: auth.error || "unauthorized" });
      return jsonResponse(linkLichessWithInvite(auth, payload.code));
    }

    if (action === "admin-roster") {
      const auth = resolveAuth(token);
      if (!auth.ok || !auth.is_admin) return jsonResponse({ ok: false, error: "forbidden" });
      return jsonResponse({
        ok: true,
        season: SEASON,
        players: getPlayers(),
        rows: getAllAttendance()
      });
    }

    if (action === "save-attendance") {
      const auth = resolveAuth(token);
      if (!auth.ok) return jsonResponse({ ok: false, error: auth.error || "unauthorized" });

      let player = auth.player_name;
      const incoming = Array.isArray(payload.rows) ? payload.rows : [];
      if (auth.is_admin && String(payload.player || "").trim()) {
        player = String(payload.player || "").trim();
      }
      if (!player || !incoming.length) return jsonResponse({ ok: false, error: "missing player or rows" });
      if (!auth.is_admin && player !== auth.player_name) return jsonResponse({ ok: false, error: "forbidden" });
      if (!auth.is_admin && !auth.linked) return jsonResponse({ ok: false, error: "not_linked" });

      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        const saved = saveAttendanceRows(player, incoming);
        if (!saved.ok) return jsonResponse(saved);
        return jsonResponse({ ok: true, message: "attendance saved", records: saved.records });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === "cms-status") {
      const auth = requireCmsAdmin(token);
      if (!auth.ok) return jsonResponse({ ok: false, error: auth.error || "forbidden" });
      return jsonResponse(cmsStatus());
    }

    if (action === "cms-test-commit") {
      const auth = requireCmsAdmin(token);
      if (!auth.ok) return jsonResponse({ ok: false, error: auth.error || "forbidden" });
      return jsonResponse(cmsTestCommit(auth));
    }

    if (action === "cms-list-news") {
      const auth = requireCmsAdmin(token);
      if (!auth.ok) return jsonResponse({ ok: false, error: auth.error || "forbidden" });
      return jsonResponse(cmsListNews());
    }

    if (action === "cms-get-news") {
      const auth = requireCmsAdmin(token);
      if (!auth.ok) return jsonResponse({ ok: false, error: auth.error || "forbidden" });
      return jsonResponse(cmsGetNews(payload.repo_path || payload.path));
    }

    if (action === "cms-publish-news") {
      const auth = requireCmsAdmin(token);
      if (!auth.ok) return jsonResponse({ ok: false, error: auth.error || "forbidden" });
      return jsonResponse(cmsPublishNews(payload));
    }

    if (action === "cms-publish-page") {
      const auth = requireCmsAdmin(token);
      if (!auth.ok) return jsonResponse({ ok: false, error: auth.error || "forbidden" });
      return jsonResponse(cmsPublishPage(payload));
    }

    if (action === "cms-get-page") {
      const auth = requireCmsAdmin(token);
      if (!auth.ok) return jsonResponse({ ok: false, error: auth.error || "forbidden" });
      return jsonResponse(cmsGetPage(payload.page_key || payload.key));
    }

    if (action === "cms-upload-ics") {
      const auth = requireCmsAdmin(token);
      if (!auth.ok) return jsonResponse({ ok: false, error: auth.error || "forbidden" });
      return jsonResponse(cmsUploadIcs(payload));
    }

    if (action === "cms-upload-news-media") {
      const auth = requireCmsAdmin(token);
      if (!auth.ok) return jsonResponse({ ok: false, error: auth.error || "forbidden" });
      return jsonResponse(cmsUploadNewsMedia(payload));
    }

    // Public contact form (no Lichess login)
    if (action === "contact-form") {
      return jsonResponse(contactFormSubmit(payload));
    }

    if (action === "bulk-set") {
      const auth = resolveAuth(token);
      if (!auth.ok || !auth.linked) return jsonResponse({ ok: false, error: "forbidden" });
      const status = String(payload.status || "").trim();
      if (!["present", "absent"].includes(status)) {
        return jsonResponse({ ok: false, error: "missing valid status" });
      }
      const rows = SEASON.filter(([date]) => !isPastDate(date)).map(([date]) => ({ date, status, note: "" }));
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        const saved = saveAttendanceRows(auth.player_name, rows);
        if (!saved.ok) return jsonResponse(saved);
        return jsonResponse({
          ok: true,
          message: "all future dates set",
          records: saved.records
        });
      } finally {
        lock.releaseLock();
      }
    }

    return jsonResponse({ ok: false, error: "unknown action" });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error && error.stack ? error.stack : error) });
  }
}

function authorizeAndCheck() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  Logger.log(`Spreadsheet: ${spreadsheet.getName()}`);
  Logger.log(`Sheets: ${spreadsheet.getSheets().map(sheet => sheet.getName()).join(", ")}`);
}

// --- CMS publish (GitHub) — set Script property GITHUB_PAT (contents:write on schevetoren-site) ---
const GITHUB_OWNER = "ScheveToren";
const GITHUB_REPO = "schevetoren-site";
const GITHUB_BRANCH = "main";

function getGitHubPat() {
  return String(PropertiesService.getScriptProperties().getProperty("GITHUB_PAT") || "").trim();
}

function requireCmsAdmin(token) {
  const auth = resolveAuth(token);
  if (!auth.ok) return auth;
  if (!auth.is_admin) return { ok: false, error: "forbidden" };
  return auth;
}

function githubApiRequest(path, options) {
  const pat = getGitHubPat();
  if (!pat) {
    return { ok: false, error: "github_not_configured", message: "GITHUB_PAT ontbreekt in Script Properties." };
  }
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}${path}`;
  const response = UrlFetchApp.fetch(url, {
    method: options.method || "get",
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    payload: options.payload ? JSON.stringify(options.payload) : undefined,
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const text = response.getContentText();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (e) {
    body = { message: text };
  }
  if (code >= 200 && code < 300) return { ok: true, status: code, body };
  return {
    ok: false,
    error: "github_api",
    status: code,
    message: body.message || text || `HTTP ${code}`
  };
}

function githubGetFileMeta(repoPath) {
  const encoded = repoPath.split("/").map(encodeURIComponent).join("/");
  const result = githubApiRequest(`/contents/${encoded}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { method: "get" });
  if (!result.ok) {
    if (result.status === 404) return { ok: true, exists: false };
    return result;
  }
  return { ok: true, exists: true, sha: result.body.sha, content: result.body.content };
}

function githubPutTextFile(repoPath, content, message) {
  const meta = githubGetFileMeta(repoPath);
  if (!meta.ok) return meta;
  const encoded = repoPath.split("/").map(encodeURIComponent).join("/");
  const payload = {
    message,
    content: Utilities.base64Encode(String(content), Utilities.Charset.UTF_8),
    branch: GITHUB_BRANCH
  };
  if (meta.exists && meta.sha) payload.sha = meta.sha;
  const result = githubApiRequest(`/contents/${encoded}`, { method: "put", payload });
  if (!result.ok) return result;
  return {
    ok: true,
    path: repoPath,
    commit: result.body.commit && result.body.commit.sha,
    html_url: result.body.content && result.body.content.html_url
  };
}

function githubPutBinaryFile(repoPath, base64Content, message) {
  const meta = githubGetFileMeta(repoPath);
  if (!meta.ok) return meta;
  const encoded = repoPath.split("/").map(encodeURIComponent).join("/");
  const payload = {
    message,
    content: String(base64Content || "").replace(/\s/g, ""),
    branch: GITHUB_BRANCH
  };
  if (meta.exists && meta.sha) payload.sha = meta.sha;
  const result = githubApiRequest(`/contents/${encoded}`, { method: "put", payload });
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

function detectMediaKindFromBytes(bytes, filename, kindHint) {
  const hint = String(kindHint || "").toLowerCase();
  const lower = String(filename || "").toLowerCase();
  const asStr = function (arr) {
    return String.fromCharCode.apply(null, arr);
  };
  const isPdf = bytes.length >= 4 && asStr(bytes.slice(0, 4)) === "%PDF";
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isGif = bytes.length >= 3 && asStr(bytes.slice(0, 3)) === "GIF";
  const isWebp =
    bytes.length >= 12 && asStr(bytes.slice(0, 4)) === "RIFF" && asStr(bytes.slice(8, 12)) === "WEBP";

  if (hint === "pdf" || lower.endsWith(".pdf") || isPdf) {
    if (!isPdf) return { ok: false, error: "invalid_pdf" };
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

function buildNewsMarkdown(fields) {
  const title = String(fields.title || "").trim();
  const slug = sanitizeSlug(fields.slug || title);
  const date = String(fields.date || "").trim();
  const author = String(fields.author || "Bestuur").trim();
  const excerpt = String(fields.excerpt || "").trim();
  const draft = fields.draft === true || String(fields.draft).toLowerCase() === "true";
  const body = String(fields.body || "").trim();
  const cover = String(fields.cover || "").trim();
  const pdf = String(fields.pdf || "").trim();
  if (!title || !slug || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "invalid_news_fields" };
  }
  if (cover && !/^(\.\/)?media\/[a-z0-9._\/-]+$/i.test(cover)) {
    return { ok: false, error: "invalid_cover_path" };
  }
  if (pdf && !/^(\.\/)?media\/[a-z0-9._\/-]+\.pdf$/i.test(pdf)) {
    return { ok: false, error: "invalid_pdf_path" };
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
  if (pdf) front.push(`pdf: ${pdf.replace(/^\.\//, "")}`);
  front.push("---", "", body, "");
  return { ok: true, path: `docs/nieuws/berichten/${date}-${slug}.md`, content: front.join("\n") };
}

function cmsStatus() {
  const pat = getGitHubPat();
  if (!pat) return { ok: true, github_configured: false, repo: `${GITHUB_OWNER}/${GITHUB_REPO}` };
  const ping = githubApiRequest("", { method: "get" });
  return {
    ok: true,
    github_configured: true,
    github_reachable: ping.ok,
    repo: `${GITHUB_OWNER}/${GITHUB_REPO}`,
    branch: GITHUB_BRANCH
  };
}

function cmsTestCommit(auth) {
  const stamp = new Date().toISOString();
  const content = JSON.stringify({ ok: true, last_cms_test: stamp, by: auth.lichess_username }, null, 2) + "\n";
  return githubPutTextFile(
    "docs/content/.cms-health.json",
    content,
    `CMS test commit (${auth.lichess_username})`
  );
}

function parseNewsMarkdown(raw) {
  const text = String(raw || "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!match) return { ok: false, error: "invalid_frontmatter" };
  const front = match[1];
  const body = match[2].replace(/^\s+/, "");
  const fields = { draft: false };
  front.split("\n").forEach(line => {
    const m = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (!m) return;
    const key = m[1];
    let val = m[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
    if (key === "draft") fields.draft = val === "true";
    else fields[key] = val;
  });
  return { ok: true, fields, body: body.replace(/\s+$/, "") };
}

function cmsListNews() {
  const meta = githubGetFileMeta("docs/nieuws/posts-index.json");
  if (!meta.ok) return meta;
  if (!meta.exists) return { ok: true, posts: [] };
  const b64 = String(meta.content || "").replace(/\s/g, "");
  const decoded = Utilities.newBlob(Utilities.base64Decode(b64)).getDataAsString();
  try {
    const posts = JSON.parse(decoded);
    const list = (Array.isArray(posts) ? posts : []).map(p => ({
      title: p.title,
      slug: p.slug,
      date: p.date,
      repo_path: `docs/nieuws/berichten/${p.date}-${p.slug}.md`
    }));
    return { ok: true, posts: list };
  } catch (e) {
    return { ok: false, error: "invalid_posts_index" };
  }
}

function cmsGetNews(repoPathRaw) {
  const repoPath = String(repoPathRaw || "").trim();
  if (!repoPath || !/^docs\/nieuws\/berichten\/[^/]+\.md$/.test(repoPath)) {
    return { ok: false, error: "invalid_path" };
  }
  const meta = githubGetFileMeta(repoPath);
  if (!meta.ok) return meta;
  if (!meta.exists) return { ok: false, error: "not_found" };
  const b64 = String(meta.content || "").replace(/\s/g, "");
  const decoded = Utilities.newBlob(Utilities.base64Decode(b64)).getDataAsString();
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
    body: parsed.body
  };
}

function cmsPublishNews(payload) {
  const built = buildNewsMarkdown(payload);
  if (!built.ok) return built;
  const overridePath = String(payload.repo_path || "").trim();
  const path =
    overridePath && /^docs\/nieuws\/berichten\/[^/]+\.md$/.test(overridePath)
      ? overridePath
      : built.path;
  return githubPutTextFile(path, built.content, `CMS: nieuws ${path}`);
}

function cmsPublishPage(payload) {
  const key = sanitizeSlug(payload.page_key || payload.key);
  if (!key) return { ok: false, error: "missing page_key" };
  const page = payload.page;
  if (!page || typeof page !== "object") return { ok: false, error: "missing page json" };
  const content = JSON.stringify(page, null, 2) + "\n";
  return githubPutTextFile(
    `docs/content/pages/${key}.json`,
    content,
    `CMS: pagina ${key}`
  );
}

function cmsGetPage(keyRaw) {
  const key = sanitizeSlug(keyRaw);
  if (!key) return { ok: false, error: "missing page_key" };
  const meta = githubGetFileMeta(`docs/content/pages/${key}.json`);
  if (!meta.ok) return meta;
  if (!meta.exists) return { ok: false, error: "not_found" };
  const b64 = String(meta.content || "").replace(/\s/g, "");
  const decoded = Utilities.newBlob(Utilities.base64Decode(b64)).getDataAsString();
  try {
    return { ok: true, page_key: key, page: JSON.parse(decoded) };
  } catch (e) {
    return { ok: false, error: "invalid_json" };
  }
}

function cmsUploadIcs(payload) {
  const b64 = String(payload.ics_base64 || "").trim();
  if (!b64) return { ok: false, error: "missing ics_base64" };
  let icsText;
  try {
    icsText = Utilities.newBlob(Utilities.base64Decode(b64)).getDataAsString();
  } catch (e) {
    return { ok: false, error: "invalid_base64" };
  }
  if (!/BEGIN:VCALENDAR/i.test(icsText)) return { ok: false, error: "invalid_ics" };
  const putIcs = githubPutTextFile("docs/kalender/club-upload.ics", icsText, "CMS: kalender ICS upload");
  if (!putIcs.ok) return putIcs;
  const feed = JSON.stringify({ icsPath: "kalender/club-upload.ics", updatedAt: new Date().toISOString() }, null, 2) + "\n";
  const putFeed = githubPutTextFile("docs/data/calendar-feed.json", feed, "CMS: kalender feed pointer");
  if (!putFeed.ok) return putFeed;
  return { ok: true, icsPath: "kalender/club-upload.ics", commits: [putIcs.commit, putFeed.commit] };
}

function cmsUploadNewsMedia(payload) {
  const slug = sanitizeSlug(payload.slug);
  if (!slug) return { ok: false, error: "missing_slug" };
  const b64 = String(payload.media_base64 || "").replace(/\s/g, "");
  if (!b64) return { ok: false, error: "missing_media_base64" };
  let bytes;
  try {
    bytes = Utilities.base64Decode(b64);
  } catch (e) {
    return { ok: false, error: "invalid_base64" };
  }
  if (!bytes || !bytes.length) return { ok: false, error: "empty_media" };

  const detected = detectMediaKindFromBytes(bytes, payload.filename, payload.kind);
  if (!detected.ok) return detected;

  const max = detected.kind === "pdf" ? 8 * 1024 * 1024 : 3 * 1024 * 1024;
  if (bytes.length > max) {
    return {
      ok: false,
      error: "media_too_large",
      message: `Max ${Math.round(max / (1024 * 1024))} MB voor ${detected.kind}.`
    };
  }

  let filename = sanitizeFilename(payload.filename);
  if (filename.indexOf(".") < 0) filename = filename + "." + detected.ext;
  else {
    const parts = filename.split(".");
    parts[parts.length - 1] = detected.ext;
    filename = parts.join(".");
  }

  const relative_path = `media/${slug}/${filename}`;
  const repoPath = `docs/nieuws/berichten/${relative_path}`;
  // Re-encode from decoded bytes so GitHub gets raw binary base64
  const put = githubPutBinaryFile(
    repoPath,
    Utilities.base64Encode(bytes),
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

/** Run once after setting GITHUB_PAT in Script Properties → Project settings. */
function setupCmsGitHubPatHint() {
  Logger.log("Set Script property GITHUB_PAT (fine-grained PAT, contents read+write on %s/%s).", GITHUB_OWNER, GITHUB_REPO);
}

// --- Public contact form → e-mail to bestuur (addresses only from Sheets / Script Properties) ---

function isValidEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

/**
 * Recipients stay in the backend only (never on the static site).
 * 1) Optional Script property CONTACT_TO (comma-separated) overrides everything.
 * 2) Else: e-mails from sheet Admins + Players with is_admin and an email column.
 */
function getContactRecipients() {
  const override = String(PropertiesService.getScriptProperties().getProperty("CONTACT_TO") || "").trim();
  if (override) {
    return override
      .split(/[,;\s]+/)
      .map(function (s) { return s.trim().toLowerCase(); })
      .filter(isValidEmailAddress);
  }

  const seen = {};
  const emails = [];
  function add(addr) {
    const e = String(addr || "").trim().toLowerCase();
    if (!isValidEmailAddress(e) || seen[e]) return;
    seen[e] = true;
    emails.push(e);
  }

  try {
    sheetRowsAsObjects("Admins").forEach(function (row) {
      add(row.email);
    });
  } catch (e) {
    // Admins sheet optional
  }

  try {
    sheetRowsAsObjects("Players").forEach(function (row) {
      if (parseIsAdmin(row.is_admin)) add(row.email);
    });
  } catch (e) {
    // ignore
  }

  return emails;
}

function contactFormSubmit(payload) {
  // Honeypot: bots fill hidden "website" field — pretend success
  if (String(payload.website || "").trim()) {
    return { ok: true, message: "sent" };
  }

  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim();
  const subject = String(payload.subject || "").trim() || "Bericht via website";
  const message = String(payload.message || "").trim();

  if (!name || !email || !message) {
    return { ok: false, error: "missing_fields", message: "Vul naam, e-mail en bericht in." };
  }
  if (name.length > 120 || email.length > 200 || subject.length > 200 || message.length > 5000) {
    return { ok: false, error: "invalid_contact", message: "Een of meer velden zijn te lang." };
  }
  if (!isValidEmailAddress(email)) {
    return { ok: false, error: "invalid_contact", message: "Ongeldig e-mailadres." };
  }

  const recipients = getContactRecipients();
  if (!recipients.length) {
    return { ok: false, error: "contact_email_not_configured" };
  }

  const cache = CacheService.getScriptCache();
  const rateKey = "contact:" + email.toLowerCase();
  if (cache.get(rateKey)) {
    return { ok: false, error: "rate_limited", message: "Je hebt zojuist een bericht gestuurd. Probeer het zo opnieuw." };
  }

  const body = [
    "Nieuw bericht via de contactpagina van schevetoren.github.io",
    "",
    "Naam: " + name,
    "E-mail: " + email,
    "Onderwerp: " + subject,
    "",
    message,
    "",
    "—",
    "Je kunt op dit bericht antwoorden (reply-to is het adres van de afzender)."
  ].join("\n");

  try {
    MailApp.sendEmail({
      to: recipients.join(","),
      replyTo: email,
      name: "De Scheve Toren website",
      subject: "[Scheve Toren contact] " + subject,
      body: body
    });
  } catch (error) {
    return {
      ok: false,
      error: "contact_send_failed",
      message: String(error && error.message ? error.message : error)
    };
  }

  cache.put(rateKey, "1", 60);
  return { ok: true, message: "sent" };
}

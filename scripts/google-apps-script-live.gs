const SHEET_ID = "1tj5ZwW3U0D5IsXyuimu7Yv7tAuGAbuoW4-3POTtSwew";

const SEASON = [
  ["2026-08-28", "ALV", "event"], ["2026-09-04", "Speeldag 1", "regular"],
  ["2026-09-11", "Speeldag 2", "regular"], ["2026-09-18", "Speeldag 3", "regular"],
  ["2026-09-25", "Speeldag 4", "regular"], ["2026-10-02", "Speeldag 5", "regular"],
  ["2026-10-09", "Speeldag 6", "regular"], ["2026-10-16", "Rapid 1", "rapid"],
  ["2026-10-30", "Rapid 2", "rapid"], ["2026-11-06", "Speeldag 7", "regular"],
  ["2026-11-13", "Schaak-Off", "regular"], ["2026-11-20", "Speeldag 8", "regular"],
  ["2026-11-27", "Speeldag 9", "regular"], ["2026-12-04", "Speeldag 10", "regular"],
  ["2026-12-11", "Rapid 3", "rapid"], ["2026-12-18", "Rapid 4 / Kerstschaak", "rapid"],
  ["2027-01-08", "Speeldag 11", "regular"], ["2027-01-15", "Speeldag 12", "regular"],
  ["2027-01-22", "Speeldag 13", "regular"], ["2027-01-29", "Speeldag 14", "regular"],
  ["2027-02-05", "Speeldag 15", "regular"], ["2027-02-12", "Speeldag 16", "regular"],
  ["2027-02-19", "Speeldag 17", "regular"], ["2027-03-05", "Speeldag 18", "regular"],
  ["2027-03-12", "Rapid 5", "rapid"], ["2027-03-19", "Rapid 6", "rapid"],
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
  const parts = String(dateString || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return false;
  const [year, month, day] = parts;
  const target = new Date(year, month - 1, day);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return target < startOfToday;
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
    return { ok: false, error: String(error) };
  }
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
  });

  const output = Array.from(records.values());
  const rowsNeeded = output.length + 1;
  if (sheet.getMaxRows() < rowsNeeded) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rowsNeeded - sheet.getMaxRows());
  }
  const clearRows = Math.max(sheet.getLastRow(), rowsNeeded);
  sheet.getRange(1, 1, clearRows, 5).clearContent();
  sheet.getRange(1, 1, 1, 5).setValues([SHEET_HEADERS.Attendance]);
  if (output.length) sheet.getRange(2, 1, output.length + 1, 5).setValues(output);
  return output.length;
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
        return jsonResponse({ ok: true, message: "attendance saved", records: saveAttendanceRows(player, incoming) });
      } finally {
        lock.releaseLock();
      }
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
        return jsonResponse({
          ok: true,
          message: "all future dates set",
          records: saveAttendanceRows(auth.player_name, rows)
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

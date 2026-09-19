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

function ensureHeaders() {
  Object.keys(SHEET_HEADERS).forEach(name => {
    const sheet = getSheet(name);
    const headers = SHEET_HEADERS[name];

    if (sheet.getMaxColumns() < headers.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
    }

    const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const empty = firstRow.every(value => String(value || "").trim() === "");
    if (empty) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  });
}

function jsonResponse(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
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
  const player = String(parameters.player || "").trim();

  if (action === "season") return jsonResponse({ season: SEASON });
  if (action === "players") return jsonResponse({ players: getPlayers() });
  if (action === "attendance" && player) return jsonResponse({ attendance: getAttendance(player) });
  if (action === "export") return jsonResponse({ rows: getAllAttendance() });

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
  if (output.length) sheet.getRange(2, 1, output.length, 5).setValues(output);

  return output.length;
}

function linkPlayer(payload) {
  const code = String(payload.code || "").trim();
  const player = String(payload.player || "").trim();
  if (!code || !player) return { ok: false, error: "missing code or player" };

  const inviteSheet = getSheet("InviteCodes");
  const inviteRows = inviteSheet.getDataRange().getValues();
  const rowIndex = inviteRows.findIndex((row, index) => {
    if (index === 0) return false;
    const rowCode = String(row[0] || "").trim();
    const active = String(row[4] || "").trim().toLowerCase();
    return rowCode === code && active !== "used" && active !== "false";
  });

  if (rowIndex < 0) return { ok: false, error: "invalid or used invite code" };

  const playersSheet = getSheet("Players");
  const playerRows = playersSheet.getDataRange().getValues();
  const exists = playerRows.some((row, index) => index > 0 && String(row[0] || "").trim() === player);
  const now = new Date().toISOString();

  if (!exists) playersSheet.appendRow([player, "", code, "FALSE", now, now, ""]);

  const sheetRow = rowIndex + 1;
  inviteSheet.getRange(sheetRow, 2).setValue(player);
  inviteSheet.getRange(sheetRow, 4).setValue(now);
  inviteSheet.getRange(sheetRow, 5).setValue("used");
  return { ok: true, message: "player linked" };
}

function doPost(e) {
  try {
    const contents = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    const payload = JSON.parse(contents);
    const action = String(payload.action || "").trim();

    if (action === "link-player") return jsonResponse(linkPlayer(payload));

    if (action === "save-attendance") {
      const player = String(payload.player || "").trim();
      const incoming = Array.isArray(payload.rows) ? payload.rows : [];
      if (!player || !incoming.length) return jsonResponse({ ok: false, error: "missing player or rows" });

      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        return jsonResponse({ ok: true, message: "attendance saved", records: saveAttendanceRows(player, incoming) });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === "bulk-set") {
      const player = String(payload.player || "").trim();
      const status = String(payload.status || "").trim();
      if (!player || !["present", "absent"].includes(status)) {
        return jsonResponse({ ok: false, error: "missing player or valid status" });
      }

      const rows = SEASON.filter(([date]) => !isPastDate(date)).map(([date]) => ({ date, status, note: "" }));
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        return jsonResponse({ ok: true, message: "all future dates set", records: saveAttendanceRows(player, rows) });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === "admin-export") return jsonResponse({ rows: getAllAttendance() });
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

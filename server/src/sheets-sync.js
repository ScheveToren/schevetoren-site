const fs = require("fs");
const { google } = require("googleapis");
const { config } = require("./config");
const { normaliseSheetDate } = require("./attendance");
const {
  openDb,
  setMeta,
  drainSyncQueue,
  getAllAttendance,
  upsertPlayer,
  upsertInvite,
  upsertAttendance,
  upsertMagicToken,
  upsertSession,
  mergeByUpdatedAt
} = require("./db");

const SHEET_HEADERS = {
  Players: [
    "player_name",
    "lichess_username",
    "invite_code",
    "is_admin",
    "created_at",
    "updated_at",
    "notes",
    "email"
  ],
  InviteCodes: ["code", "player_name", "used_by", "used_at", "active"],
  Attendance: ["player_name", "date", "status", "note", "updated_at"],
  MagicTokens: [
    "token_hash",
    "purpose",
    "player_name",
    "email",
    "expires_at",
    "used_at",
    "lichess_username",
    "created_at"
  ],
  Sessions: ["token_hash", "player_name", "expires_at", "created_at"]
};

let sheetsClient = null;
let pushTimer = null;
let syncInFlight = false;
let lastSync = {
  ok: true,
  lastPullAt: "",
  lastPushAt: "",
  lastError: "",
  enabled: false
};

function getSyncStatus() {
  return {
    ...lastSync,
    enabled: config.sheetsSyncEnabled && Boolean(sheetsClient),
    sheetId: config.sheetId,
    queueDepth: openDb().prepare("SELECT COUNT(*) AS n FROM sync_queue").get().n
  };
}

async function initSheetsClient() {
  if (!config.sheetsSyncEnabled) {
    lastSync.enabled = false;
    return null;
  }
  if (!config.googleCredentialsPath || !fs.existsSync(config.googleCredentialsPath)) {
    console.warn(
      "[sheets-sync] credentials missing; sync disabled until GOOGLE_APPLICATION_CREDENTIALS is set"
    );
    lastSync.enabled = false;
    lastSync.lastError = "credentials_missing";
    return null;
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: config.googleCredentialsPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  sheetsClient = google.sheets({ version: "v4", auth });
  lastSync.enabled = true;
  lastSync.lastError = "";
  return sheetsClient;
}

function rowsToObjects(headers, values, sheetName) {
  return (values || [])
    .filter((row) => row.some((value) => String(value || "").trim() !== ""))
    .map((row) => {
      const object = {};
      headers.forEach((header, index) => {
        if (!header) return;
        let value = row[index] ?? "";
        if (sheetName === "Attendance" && header === "date") {
          value = normaliseSheetDate(value);
        } else {
          value = String(value ?? "").trim();
        }
        object[header] = value;
      });
      return object;
    });
}

async function readSheetTab(tabName, headers) {
  const range = `${tabName}!A:${String.fromCharCode(64 + headers.length)}`;
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING"
  });
  const values = res.data.values || [];
  if (!values.length) return [];
  const sheetHeaders = values[0].map((h) => String(h).trim());
  const useHeaders = sheetHeaders.some(Boolean) ? sheetHeaders : headers;
  return rowsToObjects(useHeaders, values.slice(1), tabName);
}

async function writeSheetTab(tabName, headers, rows) {
  const values = [headers, ...rows.map((row) => headers.map((h) => row[h] ?? ""))];
  const range = `${tabName}!A1`;
  await sheetsClient.spreadsheets.values.clear({
    spreadsheetId: config.sheetId,
    range: `${tabName}!A:Z`
  });
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: config.sheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values }
  });
}

function applyRemotePlayers(remote) {
  const local = openDb().prepare("SELECT * FROM players").all();
  const merged = mergeByUpdatedAt(
    local,
    remote,
    (r) => String(r.player_name || "").trim(),
    (r) => r.updated_at
  );
  const tx = openDb().transaction(() => {
    openDb().prepare("DELETE FROM players").run();
    for (const row of merged) upsertPlayer(row, { enqueue: false });
  });
  tx();
}

function applyRemoteInvites(remote) {
  const local = openDb().prepare("SELECT * FROM invite_codes").all();
  // Invite codes: prefer remote if active/used differs and used_at is newer; else LWW on used_at
  const map = new Map();
  for (const row of local) map.set(String(row.code || "").trim(), row);
  for (const row of remote) {
    const key = String(row.code || "").trim();
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    const a = String(existing.used_at || existing.updated_at || "");
    const b = String(row.used_at || row.updated_at || "");
    if (b > a) map.set(key, row);
    else if (b === a) {
      // Prefer "used" if either side marked used
      const remoteUsed = String(row.active || "").toLowerCase() === "used";
      const localUsed = String(existing.active || "").toLowerCase() === "used";
      if (remoteUsed && !localUsed) map.set(key, row);
    }
  }
  const tx = openDb().transaction(() => {
    openDb().prepare("DELETE FROM invite_codes").run();
    for (const row of map.values()) upsertInvite(row, { enqueue: false });
  });
  tx();
}

function applyRemoteAttendance(remote) {
  const local = getAllAttendance();
  const merged = mergeByUpdatedAt(
    local,
    remote.map((r) => ({
      ...r,
      date: normaliseSheetDate(r.date)
    })),
    (r) => `${String(r.player_name || "").trim()}|${String(r.date || "").trim()}`,
    (r) => r.updated_at
  );
  const tx = openDb().transaction(() => {
    openDb().prepare("DELETE FROM attendance").run();
    for (const row of merged) {
      if (!row.player_name || !row.date) continue;
      upsertAttendance(row, { enqueue: false });
    }
  });
  tx();
}

async function ensureSheetTab(tabName, headers) {
  if (!sheetsClient) return;
  const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: config.sheetId });
  const existing = (meta.data.sheets || []).some(
    (s) => String(s.properties?.title || "") === tabName
  );
  if (!existing) {
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId: config.sheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName } } }]
      }
    });
    await writeSheetTab(tabName, headers, []);
  }
}

function applyRemoteAuthTab(table, remote, upsertFn) {
  const local = openDb().prepare(`SELECT * FROM ${table}`).all();
  const map = new Map();
  for (const row of local) map.set(String(row.token_hash || "").trim(), row);
  for (const row of remote) {
    const key = String(row.token_hash || "").trim();
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    const a = String(existing.used_at || existing.created_at || existing.expires_at || "");
    const b = String(row.used_at || row.created_at || row.expires_at || "");
    if (b >= a) map.set(key, row);
  }
  const tx = openDb().transaction(() => {
    openDb().prepare(`DELETE FROM ${table}`).run();
    for (const row of map.values()) upsertFn(row, { enqueue: false });
  });
  tx();
}

async function pullAuthTabsFromSheets() {
  if (!sheetsClient) return { ok: false, error: "not_configured" };
  await ensureSheetTab("MagicTokens", SHEET_HEADERS.MagicTokens);
  await ensureSheetTab("Sessions", SHEET_HEADERS.Sessions);
  const [magic, sessions] = await Promise.all([
    readSheetTab("MagicTokens", SHEET_HEADERS.MagicTokens).catch(() => []),
    readSheetTab("Sessions", SHEET_HEADERS.Sessions).catch(() => [])
  ]);
  applyRemoteAuthTab("magic_tokens", magic, upsertMagicToken);
  applyRemoteAuthTab("sessions", sessions, upsertSession);
  return { ok: true, magic: magic.length, sessions: sessions.length };
}

async function pushAuthTabsToSheets() {
  if (!sheetsClient) return { ok: false, error: "not_configured" };
  await ensureSheetTab("MagicTokens", SHEET_HEADERS.MagicTokens);
  await ensureSheetTab("Sessions", SHEET_HEADERS.Sessions);
  const magic = openDb().prepare("SELECT * FROM magic_tokens ORDER BY created_at").all();
  const sessions = openDb().prepare("SELECT * FROM sessions ORDER BY created_at").all();
  await writeSheetTab("MagicTokens", SHEET_HEADERS.MagicTokens, magic);
  await writeSheetTab("Sessions", SHEET_HEADERS.Sessions, sessions);
  return { ok: true };
}

async function pullFromSheets() {
  if (!sheetsClient) return { ok: false, error: "not_configured" };
  const [players, invites, attendance] = await Promise.all([
    readSheetTab("Players", SHEET_HEADERS.Players),
    readSheetTab("InviteCodes", SHEET_HEADERS.InviteCodes),
    readSheetTab("Attendance", SHEET_HEADERS.Attendance)
  ]);
  applyRemotePlayers(players);
  applyRemoteInvites(invites);
  applyRemoteAttendance(attendance);
  await pullAuthTabsFromSheets().catch(() => {});
  const stamp = new Date().toISOString();
  setMeta("last_pull_at", stamp);
  lastSync.lastPullAt = stamp;
  return { ok: true, players: players.length, invites: invites.length, attendance: attendance.length };
}

async function pushAllToSheets() {
  if (!sheetsClient) return { ok: false, error: "not_configured" };
  const players = openDb().prepare("SELECT * FROM players ORDER BY player_name").all();
  const invites = openDb().prepare("SELECT * FROM invite_codes ORDER BY code").all();
  const attendance = getAllAttendance();
  await writeSheetTab("Players", SHEET_HEADERS.Players, players);
  await writeSheetTab("InviteCodes", SHEET_HEADERS.InviteCodes, invites);
  await writeSheetTab(
    "Attendance",
    SHEET_HEADERS.Attendance,
    attendance.map((r) => ({
      player_name: r.player_name,
      date: r.date,
      status: r.status,
      note: r.note,
      updated_at: r.updated_at
    }))
  );
  await pushAuthTabsToSheets();
  const stamp = new Date().toISOString();
  setMeta("last_push_at", stamp);
  lastSync.lastPushAt = stamp;
  drainSyncQueue();
  return { ok: true };
}

async function runSyncCycle({ forcePush = false } = {}) {
  if (!sheetsClient || syncInFlight) return;
  syncInFlight = true;
  try {
    await pullFromSheets();
    const queue = openDb().prepare("SELECT COUNT(*) AS n FROM sync_queue").get().n;
    if (forcePush || queue > 0) {
      await pushAllToSheets();
    }
    lastSync.ok = true;
    lastSync.lastError = "";
  } catch (error) {
    lastSync.ok = false;
    lastSync.lastError = String(error.message || error);
    console.error("[sheets-sync]", lastSync.lastError);
  } finally {
    syncInFlight = false;
  }
}

function schedulePush() {
  if (!sheetsClient) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    runSyncCycle({ forcePush: true }).catch((err) => console.error("[sheets-sync] push", err));
  }, config.sheetsPushDebounceMs);
}

function notifyLocalWrite() {
  schedulePush();
}

async function startSheetsSync() {
  const { setEnqueueListener } = require("./db");
  setEnqueueListener(() => schedulePush());
  await initSheetsClient();
  if (!sheetsClient) return;
  console.log("[sheets-sync] starting startup reconcile");
  await runSyncCycle({ forcePush: true });
  if (process.env.SCHEVETOREN_SEED_ONCE === "1") return;
  setInterval(() => {
    runSyncCycle().catch((err) => console.error("[sheets-sync] interval", err));
  }, config.sheetsSyncIntervalMs);
}

module.exports = {
  startSheetsSync,
  runSyncCycle,
  pullFromSheets,
  pushAllToSheets,
  pullAuthTabsFromSheets,
  pushAuthTabsToSheets,
  getSyncStatus,
  notifyLocalWrite,
  SHEET_HEADERS
};

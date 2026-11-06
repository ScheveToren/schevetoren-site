const Database = require("better-sqlite3");
const { config, ensureDataDir } = require("./config");

let db;

function openDb() {
  if (db) return db;
  ensureDataDir();
  db = new Database(config.sqlitePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS players (
      player_name TEXT PRIMARY KEY,
      lichess_username TEXT NOT NULL DEFAULT '',
      invite_code TEXT NOT NULL DEFAULT '',
      is_admin TEXT NOT NULL DEFAULT 'FALSE',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS invite_codes (
      code TEXT PRIMARY KEY,
      player_name TEXT NOT NULL DEFAULT '',
      used_by TEXT NOT NULL DEFAULT '',
      used_at TEXT NOT NULL DEFAULT '',
      active TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS attendance (
      player_name TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'absent',
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (player_name, date)
    );

    CREATE TABLE IF NOT EXISTS magic_tokens (
      token_hash TEXT PRIMARY KEY,
      purpose TEXT NOT NULL DEFAULT '',
      player_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL DEFAULT '',
      used_at TEXT NOT NULL DEFAULT '',
      lichess_username TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      player_name TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      entity_key TEXT NOT NULL,
      enqueued_at TEXT NOT NULL,
      UNIQUE(entity, entity_key)
    );

    CREATE INDEX IF NOT EXISTS idx_players_lichess ON players(lichess_username);
    CREATE INDEX IF NOT EXISTS idx_players_email ON players(email);
    CREATE INDEX IF NOT EXISTS idx_attendance_player ON attendance(player_name);
  `);

  const cols = database.prepare("PRAGMA table_info(players)").all().map((c) => c.name);
  if (!cols.includes("email")) {
    database.exec(`ALTER TABLE players ADD COLUMN email TEXT NOT NULL DEFAULT ''`);
  }
}

function getMeta(key) {
  const row = openDb().prepare("SELECT value FROM sync_meta WHERE key = ?").get(key);
  return row ? row.value : "";
}

function setMeta(key, value) {
  openDb()
    .prepare(
      `INSERT INTO sync_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, String(value ?? ""));
}

let onEnqueueListener = null;

function setEnqueueListener(fn) {
  onEnqueueListener = typeof fn === "function" ? fn : null;
}

function enqueueSync(entity, entityKey) {
  openDb()
    .prepare(
      `INSERT INTO sync_queue (entity, entity_key, enqueued_at) VALUES (?, ?, ?)
       ON CONFLICT(entity, entity_key) DO UPDATE SET enqueued_at = excluded.enqueued_at`
    )
    .run(entity, entityKey, new Date().toISOString());
  if (onEnqueueListener) {
    try {
      onEnqueueListener(entity, entityKey);
    } catch (error) {
      console.error("[db] enqueue listener", error);
    }
  }
}

function drainSyncQueue() {
  const rows = openDb().prepare("SELECT id, entity, entity_key FROM sync_queue ORDER BY id").all();
  if (rows.length) {
    openDb().prepare("DELETE FROM sync_queue").run();
  }
  return rows;
}

function parseIsAdmin(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "true" || text === "yes" || text === "1";
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function findPlayerByLichess(username) {
  const wanted = String(username || "").trim().toLowerCase();
  if (!wanted) return null;
  return (
    openDb()
      .prepare(`SELECT * FROM players WHERE lower(trim(lichess_username)) = ? LIMIT 1`)
      .get(wanted) || null
  );
}

function findPlayerByEmail(email) {
  const wanted = normalizeEmail(email);
  if (!wanted) return null;
  return (
    openDb()
      .prepare(`SELECT * FROM players WHERE lower(trim(email)) = ? LIMIT 1`)
      .get(wanted) || null
  );
}

function findPlayerByName(playerName) {
  const wanted = String(playerName || "").trim();
  if (!wanted) return null;
  return openDb().prepare("SELECT * FROM players WHERE player_name = ? LIMIT 1").get(wanted) || null;
}

function getPlayers() {
  const players = openDb().prepare("SELECT * FROM players ORDER BY player_name COLLATE NOCASE").all();
  if (players.length) return players;
  const names = openDb()
    .prepare("SELECT DISTINCT player_name FROM attendance ORDER BY player_name COLLATE NOCASE")
    .all()
    .map((r) => r.player_name)
    .filter(Boolean);
  return names.map((player_name) => ({
    player_name,
    lichess_username: "",
    invite_code: "",
    is_admin: "FALSE",
    created_at: "",
    updated_at: "",
    notes: "",
    email: ""
  }));
}

function getAllAttendance() {
  return openDb()
    .prepare("SELECT * FROM attendance ORDER BY player_name, date")
    .all();
}

function getAttendance(playerName) {
  return openDb()
    .prepare("SELECT * FROM attendance WHERE player_name = ? ORDER BY date")
    .all(String(playerName || "").trim());
}

function upsertPlayer(row, { enqueue = true } = {}) {
  const player_name = String(row.player_name || "").trim();
  if (!player_name) return;
  openDb()
    .prepare(
      `INSERT INTO players (player_name, lichess_username, invite_code, is_admin, created_at, updated_at, notes, email)
       VALUES (@player_name, @lichess_username, @invite_code, @is_admin, @created_at, @updated_at, @notes, @email)
       ON CONFLICT(player_name) DO UPDATE SET
         lichess_username = excluded.lichess_username,
         invite_code = excluded.invite_code,
         is_admin = excluded.is_admin,
         created_at = CASE WHEN players.created_at = '' THEN excluded.created_at ELSE players.created_at END,
         updated_at = excluded.updated_at,
         notes = excluded.notes,
         email = excluded.email`
    )
    .run({
      player_name,
      lichess_username: String(row.lichess_username || "").trim(),
      invite_code: String(row.invite_code || "").trim(),
      is_admin: String(row.is_admin ?? "FALSE"),
      created_at: String(row.created_at || ""),
      updated_at: String(row.updated_at || ""),
      notes: String(row.notes || ""),
      email: normalizeEmail(row.email)
    });
  if (enqueue) enqueueSync("players", player_name);
}

function upsertInvite(row, { enqueue = true } = {}) {
  const code = String(row.code || "").trim();
  if (!code) return;
  openDb()
    .prepare(
      `INSERT INTO invite_codes (code, player_name, used_by, used_at, active)
       VALUES (@code, @player_name, @used_by, @used_at, @active)
       ON CONFLICT(code) DO UPDATE SET
         player_name = excluded.player_name,
         used_by = excluded.used_by,
         used_at = excluded.used_at,
         active = excluded.active`
    )
    .run({
      code,
      player_name: String(row.player_name || "").trim(),
      used_by: String(row.used_by || "").trim(),
      used_at: String(row.used_at || ""),
      active: String(row.active || "")
    });
  if (enqueue) enqueueSync("invite_codes", code);
}

function upsertAttendance(row, { enqueue = true } = {}) {
  const player_name = String(row.player_name || "").trim();
  const date = String(row.date || "").trim();
  if (!player_name || !date) return;
  openDb()
    .prepare(
      `INSERT INTO attendance (player_name, date, status, note, updated_at)
       VALUES (@player_name, @date, @status, @note, @updated_at)
       ON CONFLICT(player_name, date) DO UPDATE SET
         status = excluded.status,
         note = excluded.note,
         updated_at = excluded.updated_at`
    )
    .run({
      player_name,
      date,
      status: String(row.status || "absent"),
      note: String(row.note || ""),
      updated_at: String(row.updated_at || "")
    });
  if (enqueue) enqueueSync("attendance", `${player_name}|${date}`);
}

function upsertMagicToken(row, { enqueue = true } = {}) {
  const token_hash = String(row.token_hash || "").trim();
  if (!token_hash) return;
  openDb()
    .prepare(
      `INSERT INTO magic_tokens (token_hash, purpose, player_name, email, expires_at, used_at, lichess_username, created_at)
       VALUES (@token_hash, @purpose, @player_name, @email, @expires_at, @used_at, @lichess_username, @created_at)
       ON CONFLICT(token_hash) DO UPDATE SET
         purpose = excluded.purpose,
         player_name = excluded.player_name,
         email = excluded.email,
         expires_at = excluded.expires_at,
         used_at = excluded.used_at,
         lichess_username = excluded.lichess_username,
         created_at = excluded.created_at`
    )
    .run({
      token_hash,
      purpose: String(row.purpose || "").trim(),
      player_name: String(row.player_name || "").trim(),
      email: normalizeEmail(row.email),
      expires_at: String(row.expires_at || ""),
      used_at: String(row.used_at || ""),
      lichess_username: String(row.lichess_username || "").trim().toLowerCase(),
      created_at: String(row.created_at || "")
    });
  if (enqueue) enqueueSync("magic_tokens", token_hash);
}

function upsertSession(row, { enqueue = true } = {}) {
  const token_hash = String(row.token_hash || "").trim();
  if (!token_hash) return;
  openDb()
    .prepare(
      `INSERT INTO sessions (token_hash, player_name, expires_at, created_at)
       VALUES (@token_hash, @player_name, @expires_at, @created_at)
       ON CONFLICT(token_hash) DO UPDATE SET
         player_name = excluded.player_name,
         expires_at = excluded.expires_at,
         created_at = excluded.created_at`
    )
    .run({
      token_hash,
      player_name: String(row.player_name || "").trim(),
      expires_at: String(row.expires_at || ""),
      created_at: String(row.created_at || "")
    });
  if (enqueue) enqueueSync("sessions", token_hash);
}

function getMagicToken(tokenHash) {
  return (
    openDb()
      .prepare("SELECT * FROM magic_tokens WHERE token_hash = ? LIMIT 1")
      .get(String(tokenHash || "").trim()) || null
  );
}

function getSession(tokenHash) {
  return (
    openDb()
      .prepare("SELECT * FROM sessions WHERE token_hash = ? LIMIT 1")
      .get(String(tokenHash || "").trim()) || null
  );
}

function replaceAllFromSheet(entity, rows) {
  const database = openDb();
  const tx = database.transaction(() => {
    if (entity === "players") {
      database.prepare("DELETE FROM players").run();
      for (const row of rows) upsertPlayer(row, { enqueue: false });
    } else if (entity === "invite_codes") {
      database.prepare("DELETE FROM invite_codes").run();
      for (const row of rows) upsertInvite(row, { enqueue: false });
    } else if (entity === "attendance") {
      database.prepare("DELETE FROM attendance").run();
      for (const row of rows) upsertAttendance(row, { enqueue: false });
    } else if (entity === "magic_tokens") {
      database.prepare("DELETE FROM magic_tokens").run();
      for (const row of rows) upsertMagicToken(row, { enqueue: false });
    } else if (entity === "sessions") {
      database.prepare("DELETE FROM sessions").run();
      for (const row of rows) upsertSession(row, { enqueue: false });
    }
  });
  tx();
}

function mergeByUpdatedAt(local, remote, getKey, getUpdatedAt) {
  const map = new Map();
  for (const row of local) {
    map.set(getKey(row), row);
  }
  for (const row of remote) {
    const key = getKey(row);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    const a = String(getUpdatedAt(existing) || "");
    const b = String(getUpdatedAt(row) || "");
    if (b > a) map.set(key, row);
  }
  return [...map.values()];
}

module.exports = {
  openDb,
  getMeta,
  setMeta,
  setEnqueueListener,
  enqueueSync,
  drainSyncQueue,
  parseIsAdmin,
  normalizeEmail,
  findPlayerByLichess,
  findPlayerByEmail,
  findPlayerByName,
  getPlayers,
  getAllAttendance,
  getAttendance,
  upsertPlayer,
  upsertInvite,
  upsertAttendance,
  upsertMagicToken,
  upsertSession,
  getMagicToken,
  getSession,
  replaceAllFromSheet,
  mergeByUpdatedAt
};

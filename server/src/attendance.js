const { config } = require("./config");
const { SEASON } = require("./season");
const {
  getAttendance,
  getAllAttendance,
  getPlayers,
  upsertAttendance,
  upsertPlayer,
  upsertInvite,
  openDb
} = require("./db");

function todayInClubTz() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function isPastDate(dateString) {
  const date = String(dateString || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return true;
  return date < todayInClubTz();
}

function normaliseSheetDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(value);
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(parsed);
}

function saveAttendanceRows(player, incomingRows) {
  const now = new Date().toISOString();
  let incomingAccepted = 0;
  const database = openDb();

  const tx = database.transaction(() => {
    for (const row of incomingRows) {
      const date = String(row.date || "").trim();
      const status = String(row.status || "").trim();
      const note = String(row.note || "").trim();
      if (!date || !["present", "absent"].includes(status) || isPastDate(date)) continue;
      upsertAttendance(
        { player_name: player, date, status, note, updated_at: now },
        { enqueue: true }
      );
      incomingAccepted += 1;
    }
  });
  tx();

  if (incomingRows.length > 0 && incomingAccepted === 0) {
    return {
      ok: false,
      error: "no_valid_rows",
      message: "Geen geldige toekomstige speeldagen in de opslag — database niet gewijzigd."
    };
  }

  const records = getAllAttendance().length;
  if (!records && incomingAccepted === 0) {
    return { ok: false, error: "empty_attendance", message: "Geen aanwezigheidsregels om op te slaan." };
  }

  return { ok: true, records };
}

function linkLichessWithInvite(auth, code) {
  const inviteCode = String(code || "").trim();
  if (!inviteCode) return { ok: false, error: "missing code" };

  const database = openDb();
  const invite = database.prepare("SELECT * FROM invite_codes WHERE code = ?").get(inviteCode);
  if (!invite) return { ok: false, error: "invalid or used invite code" };
  const active = String(invite.active || "").trim().toLowerCase();
  if (active === "used" || active === "false") {
    return { ok: false, error: "invalid or used invite code" };
  }

  const playerName = String(invite.player_name || "").trim();
  if (!playerName) return { ok: false, error: "invite missing player_name" };

  const now = new Date().toISOString();
  const existing = database.prepare("SELECT * FROM players WHERE player_name = ?").get(playerName);

  const tx = database.transaction(() => {
    upsertPlayer(
      {
        player_name: playerName,
        lichess_username: auth.lichess_username,
        invite_code: inviteCode,
        is_admin: existing ? existing.is_admin : "FALSE",
        created_at: existing ? existing.created_at || now : now,
        updated_at: now,
        notes: existing ? existing.notes : ""
      },
      { enqueue: true }
    );
    upsertInvite(
      {
        code: inviteCode,
        player_name: playerName,
        used_by: auth.lichess_username,
        used_at: now,
        active: "used"
      },
      { enqueue: true }
    );
  });
  tx();

  return {
    ok: true,
    message: "player linked",
    player_name: playerName,
    lichess_username: auth.lichess_username
  };
}

function futureSeasonRows(status) {
  return SEASON.filter(([date]) => !isPastDate(date)).map(([date]) => ({
    date,
    status,
    note: ""
  }));
}

module.exports = {
  isPastDate,
  normaliseSheetDate,
  saveAttendanceRows,
  linkLichessWithInvite,
  futureSeasonRows,
  getAttendance,
  getAllAttendance,
  getPlayers,
  SEASON
};

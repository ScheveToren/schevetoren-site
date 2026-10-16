const crypto = require("crypto");
const { config } = require("./config");
const {
  normalizeEmail,
  findPlayerByEmail,
  findPlayerByName,
  findPlayerByLichess,
  upsertPlayer,
  upsertMagicToken,
  upsertSession,
  getMagicToken,
  getSession,
  parseIsAdmin,
  openDb
} = require("./db");

const MAGIC_TTL_MS = 20 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const rateBuckets = new Map();

function isValidEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function pruneRate(email) {
  const key = normalizeEmail(email);
  const until = rateBuckets.get(key) || 0;
  if (until > Date.now()) return false;
  rateBuckets.set(key, Date.now() + 60_000);
  return true;
}

function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw || ""), "utf8").digest("hex");
}

function newRawToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function publicSiteBase() {
  return String(
    process.env.PUBLIC_SITE_URL || "https://schevetoren.github.io/schevetoren-site"
  ).replace(/\/$/, "");
}

function magicLinkUrl(rawToken) {
  return `${publicSiteBase()}/attendance.html?magic=${encodeURIComponent(rawToken)}`;
}

function whoamiFromPlayer(player, authKind) {
  const hasLichess = Boolean(String(player.lichess_username || "").trim());
  // Session login identifies a club player; "linked" means attendance access is allowed.
  // Lichess may still be empty until they couple accounts.
  const linked = authKind === "session" ? true : hasLichess;
  return {
    ok: true,
    auth: authKind,
    lichess_username: String(player.lichess_username || "").trim().toLowerCase(),
    player_name: String(player.player_name || "").trim(),
    is_admin: parseIsAdmin(player.is_admin),
    linked,
    has_lichess: hasLichess,
    email: normalizeEmail(player.email)
  };
}

async function sendMagicMail({ to, subject, text }) {
  if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
    return {
      ok: false,
      error: "contact_email_not_configured",
      message: "SMTP niet geconfigureerd op de Pi (CONTACT_SMTP_*)."
    };
  }
  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch {
    return {
      ok: false,
      error: "contact_email_not_configured",
      message: "nodemailer ontbreekt."
    };
  }
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPass }
  });
  try {
    await transporter.sendMail({
      from: config.smtpFrom || config.smtpUser,
      to,
      subject,
      text
    });
  } catch (error) {
    return {
      ok: false,
      error: "contact_send_failed",
      message: String(error && error.message ? error.message : error)
    };
  }
  return { ok: true };
}

async function syncAuthTabsToSheet() {
  try {
    const { pushAuthTabsToSheets } = require("./sheets-sync");
    if (typeof pushAuthTabsToSheets === "function") {
      await pushAuthTabsToSheets();
    }
  } catch (error) {
    console.warn("[magic-auth] sheet push skipped:", error.message || error);
  }
}

async function pullAuthTabsFromSheet() {
  try {
    const { pullAuthTabsFromSheets } = require("./sheets-sync");
    if (typeof pullAuthTabsFromSheets === "function") {
      await pullAuthTabsFromSheets();
    }
  } catch (error) {
    console.warn("[magic-auth] sheet pull skipped:", error.message || error);
  }
}

async function requestLoginLink(payload) {
  const email = normalizeEmail(payload.email);
  const generic = {
    ok: true,
    message: "Als dit e-mailadres bij de club bekend is, ontvang je zo een inloglink."
  };
  if (!isValidEmailAddress(email)) return generic;
  if (!pruneRate(email)) {
    return {
      ok: false,
      error: "rate_limited",
      message: "Je hebt zojuist een link aangevraagd. Probeer het zo opnieuw."
    };
  }

  await pullAuthTabsFromSheet();
  const player = findPlayerByEmail(email);
  if (!player) return generic;

  const raw = newRawToken();
  const now = new Date();
  upsertMagicToken(
    {
      token_hash: hashToken(raw),
      purpose: "login",
      player_name: player.player_name,
      email,
      expires_at: new Date(now.getTime() + MAGIC_TTL_MS).toISOString(),
      used_at: "",
      lichess_username: "",
      created_at: now.toISOString()
    },
    { enqueue: true }
  );
  await syncAuthTabsToSheet();

  const link = magicLinkUrl(raw);
  const mail = await sendMagicMail({
    to: email,
    subject: "Inloggen — De Scheve Toren aanwezigheid",
    text: [
      `Hallo ${player.player_name},`,
      "",
      "Klik op deze link om in te loggen voor aanwezigheid (geldig ca. 20 minuten):",
      link,
      "",
      "Als je deze mail niet hebt aangevraagd, kun je hem negeren.",
      "",
      "— De Scheve Toren"
    ].join("\n")
  });
  if (!mail.ok) return mail;
  return generic;
}

async function requestLichessLink(auth, payload) {
  if (!auth.ok || !auth.lichess_username) {
    return { ok: false, error: "unauthorized" };
  }
  if (auth.linked) {
    return { ok: false, error: "already_linked", message: "Dit Lichess-account is al gekoppeld." };
  }
  const email = normalizeEmail(payload.email);
  const generic = {
    ok: true,
    message: "Als dit e-mailadres bij de club bekend is, ontvang je zo een bevestigingslink."
  };
  if (!isValidEmailAddress(email)) return generic;
  if (!pruneRate(email)) {
    return {
      ok: false,
      error: "rate_limited",
      message: "Je hebt zojuist een link aangevraagd. Probeer het zo opnieuw."
    };
  }

  await pullAuthTabsFromSheet();
  const player = findPlayerByEmail(email);
  if (!player) return generic;

  const existingLichess = String(player.lichess_username || "").trim().toLowerCase();
  if (existingLichess && existingLichess !== auth.lichess_username) {
    return generic;
  }

  const raw = newRawToken();
  const now = new Date();
  upsertMagicToken(
    {
      token_hash: hashToken(raw),
      purpose: "link_lichess",
      player_name: player.player_name,
      email,
      expires_at: new Date(now.getTime() + MAGIC_TTL_MS).toISOString(),
      used_at: "",
      lichess_username: auth.lichess_username,
      created_at: now.toISOString()
    },
    { enqueue: true }
  );
  await syncAuthTabsToSheet();

  const link = magicLinkUrl(raw);
  const mail = await sendMagicMail({
    to: email,
    subject: "Lichess koppelen — De Scheve Toren",
    text: [
      `Hallo ${player.player_name},`,
      "",
      `Bevestig de koppeling van Lichess-account “${auth.lichess_username}” via deze link (geldig ca. 20 minuten):`,
      link,
      "",
      "Als je deze mail niet hebt aangevraagd, kun je hem negeren.",
      "",
      "— De Scheve Toren"
    ].join("\n")
  });
  if (!mail.ok) return mail;
  return generic;
}

function createSessionForPlayer(playerName) {
  const raw = newRawToken();
  const now = new Date();
  upsertSession(
    {
      token_hash: hashToken(raw),
      player_name: playerName,
      expires_at: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      created_at: now.toISOString()
    },
    { enqueue: true }
  );
  return raw;
}

async function consumeLoginLink(payload) {
  const raw = String(payload.token || payload.magic || "").trim();
  if (!raw) return { ok: false, error: "missing_magic_token" };

  await pullAuthTabsFromSheet();
  const row = getMagicToken(hashToken(raw));
  if (!row) return { ok: false, error: "invalid_magic_token" };
  if (row.used_at) return { ok: false, error: "invalid_magic_token" };
  if (String(row.expires_at || "") < new Date().toISOString()) {
    return { ok: false, error: "magic_token_expired" };
  }

  const player = findPlayerByName(row.player_name);
  if (!player) return { ok: false, error: "invalid_magic_token" };

  const now = new Date().toISOString();
  const purpose = String(row.purpose || "").trim();

  if (purpose === "link_lichess") {
    const lichess = String(row.lichess_username || "").trim().toLowerCase();
    if (!lichess) return { ok: false, error: "invalid_magic_token" };
    const taken = findPlayerByLichess(lichess);
    if (taken && String(taken.player_name) !== String(player.player_name)) {
      return { ok: false, error: "lichess_taken", message: "Dit Lichess-account is al gekoppeld aan een andere speler." };
    }
    upsertPlayer(
      {
        ...player,
        lichess_username: lichess,
        email: player.email || row.email,
        updated_at: now
      },
      { enqueue: true }
    );
  }

  upsertMagicToken({ ...row, used_at: now }, { enqueue: true });
  const sessionToken = createSessionForPlayer(player.player_name);
  await syncAuthTabsToSheet();

  const fresh = findPlayerByName(player.player_name);
  const who = whoamiFromPlayer(fresh, "session");
  return {
    ...who,
    session: sessionToken,
    message: purpose === "link_lichess" ? "Lichess gekoppeld." : "Ingelogd."
  };
}

async function linkLichessSession(sessionAuth, lichessAuth) {
  if (!sessionAuth.ok || sessionAuth.auth !== "session" || !sessionAuth.linked) {
    return { ok: false, error: "unauthorized" };
  }
  if (!lichessAuth.ok || !lichessAuth.lichess_username) {
    return { ok: false, error: "missing token" };
  }
  if (lichessAuth.linked && lichessAuth.player_name !== sessionAuth.player_name) {
    return { ok: false, error: "lichess_taken", message: "Dit Lichess-account is al gekoppeld." };
  }

  const player = findPlayerByName(sessionAuth.player_name);
  if (!player) return { ok: false, error: "not_found" };

  const taken = findPlayerByLichess(lichessAuth.lichess_username);
  if (taken && String(taken.player_name) !== String(player.player_name)) {
    return { ok: false, error: "lichess_taken" };
  }

  const now = new Date().toISOString();
  upsertPlayer(
    {
      ...player,
      lichess_username: lichessAuth.lichess_username,
      updated_at: now
    },
    { enqueue: true }
  );
  await syncAuthTabsToSheet();
  const fresh = findPlayerByName(player.player_name);
  return {
    ok: true,
    message: "player linked",
    ...whoamiFromPlayer(fresh, "session")
  };
}

function resolveSessionAuth(sessionRaw) {
  const raw = String(sessionRaw || "").trim();
  if (!raw) return { ok: false, error: "missing session" };
  const row = getSession(hashToken(raw));
  if (!row) return { ok: false, error: "invalid session" };
  if (String(row.expires_at || "") < new Date().toISOString()) {
    return { ok: false, error: "session_expired" };
  }
  const player = findPlayerByName(row.player_name);
  if (!player) return { ok: false, error: "invalid session" };
  return whoamiFromPlayer(player, "session");
}

function purgeExpiredAuthRows() {
  const now = new Date().toISOString();
  const database = openDb();
  database.prepare("DELETE FROM magic_tokens WHERE (used_at != '' AND used_at < ?) OR expires_at < ?").run(now, now);
  database.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
}

module.exports = {
  requestLoginLink,
  requestLichessLink,
  consumeLoginLink,
  linkLichessSession,
  resolveSessionAuth,
  pullAuthTabsFromSheet,
  purgeExpiredAuthRows,
  hashToken,
  whoamiFromPlayer
};

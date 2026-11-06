const { findPlayerByLichess, parseIsAdmin } = require("./db");
const { resolveSessionAuth, pullAuthTabsFromSheet } = require("./magic-auth");

async function verifyLichessToken(accessToken) {
  const token = String(accessToken || "").trim();
  if (!token) return { ok: false, error: "missing token" };
  try {
    const response = await fetch("https://lichess.org/api/account", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return { ok: false, error: "invalid token" };
    const account = await response.json();
    if (!account || !account.username) return { ok: false, error: "invalid account" };
    return { ok: true, id: account.id, username: String(account.username).toLowerCase() };
  } catch (error) {
    return { ok: false, error: String(error.message || error) };
  }
}

async function resolveLichessAuth(accessToken) {
  const verified = await verifyLichessToken(accessToken);
  if (!verified.ok) return verified;
  const playerRow = findPlayerByLichess(verified.username);
  const linked = Boolean(playerRow);
  return {
    ok: true,
    auth: "lichess",
    lichess_username: verified.username,
    player_name: linked ? String(playerRow.player_name || "").trim() : "",
    is_admin: linked ? parseIsAdmin(playerRow.is_admin) : false,
    linked,
    email: linked ? String(playerRow.email || "").trim().toLowerCase() : ""
  };
}

/**
 * Accept club session and/or Lichess bearer token.
 * Prefer session when both are present (email-login path).
 */
async function resolveAuth(accessToken, sessionToken) {
  const sessionRaw = String(sessionToken || "").trim();
  if (sessionRaw) {
    await pullAuthTabsFromSheet();
    const sessionAuth = resolveSessionAuth(sessionRaw);
    if (sessionAuth.ok) return sessionAuth;
  }
  const lichessToken = String(accessToken || "").trim();
  if (lichessToken) return resolveLichessAuth(lichessToken);
  if (sessionRaw) return { ok: false, error: "invalid session" };
  return { ok: false, error: "missing token" };
}

async function requireCmsAdmin(token, sessionToken) {
  const auth = await resolveAuth(token, sessionToken);
  if (!auth.ok) return auth;
  if (!auth.is_admin) return { ok: false, error: "forbidden" };
  return auth;
}

module.exports = {
  verifyLichessToken,
  resolveLichessAuth,
  resolveAuth,
  requireCmsAdmin
};

const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

function parseOrigins(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const rootDir = path.join(__dirname, "..");

const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || "127.0.0.1",
  timezone: process.env.TZ || "Europe/Amsterdam",
  sqlitePath: path.resolve(rootDir, process.env.SQLITE_PATH || "./data/schevetoren.sqlite"),
  sheetId: String(process.env.SHEET_ID || "1tj5ZwW3U0D5IsXyuimu7Yv7tAuGAbuoW4-3POTtSwew").trim(),
  googleCredentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(rootDir, process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : "",
  sheetsSyncEnabled: String(process.env.SHEETS_SYNC_ENABLED || "true").toLowerCase() !== "false",
  sheetsSyncIntervalMs: Number(process.env.SHEETS_SYNC_INTERVAL_MS || 120000),
  sheetsPushDebounceMs: Number(process.env.SHEETS_PUSH_DEBOUNCE_MS || 3000),
  githubPat: String(process.env.GITHUB_PAT || "").trim(),
  githubOwner: process.env.GITHUB_OWNER || "ScheveToren",
  githubRepo: process.env.GITHUB_REPO || "schevetoren-site",
  githubBranch: process.env.GITHUB_BRANCH || "main",
  corsOrigins: parseOrigins(
    process.env.CORS_ORIGINS ||
      "https://schevetoren.github.io,http://localhost:8765,http://127.0.0.1:8765"
  ),
  // Optional override; leave empty to load admin e-mails from Google Sheets (Admins / Players)
  contactTo: parseOrigins(process.env.CONTACT_TO || ""),
  smtpHost: String(process.env.CONTACT_SMTP_HOST || "").trim(),
  smtpPort: Number(process.env.CONTACT_SMTP_PORT || 587),
  smtpSecure: String(process.env.CONTACT_SMTP_SECURE || "false").toLowerCase() === "true",
  smtpUser: String(process.env.CONTACT_SMTP_USER || "").trim(),
  smtpPass: String(process.env.CONTACT_SMTP_PASS || "").trim(),
  smtpFrom: String(process.env.CONTACT_SMTP_FROM || "").trim()
};

function ensureDataDir() {
  const dir = path.dirname(config.sqlitePath);
  fs.mkdirSync(dir, { recursive: true });
}

module.exports = { config, ensureDataDir };

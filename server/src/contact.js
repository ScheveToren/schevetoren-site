const { google } = require("googleapis");
const fs = require("fs");
const { config } = require("./config");

const rateBuckets = new Map();

function isValidEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function pruneRate(email) {
  const key = email.toLowerCase();
  const until = rateBuckets.get(key) || 0;
  if (until > Date.now()) return false;
  rateBuckets.set(key, Date.now() + 60_000);
  return true;
}

function parseIsAdmin(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "true" || text === "yes" || text === "1";
}

/**
 * Load admin e-mails from Google Sheets (Admins tab + Players with is_admin + email).
 * Never expose this list to the static site. Optional CONTACT_TO env overrides.
 */
async function getRecipientsFromSheets() {
  if (Array.isArray(config.contactTo) && config.contactTo.length) {
    return config.contactTo.map((e) => String(e).trim().toLowerCase()).filter(isValidEmailAddress);
  }

  if (!config.googleCredentialsPath || !fs.existsSync(config.googleCredentialsPath)) {
    return [];
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: config.googleCredentialsPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });
  const sheets = google.sheets({ version: "v4", auth });
  const seen = new Set();
  const emails = [];

  function add(addr) {
    const e = String(addr || "").trim().toLowerCase();
    if (!isValidEmailAddress(e) || seen.has(e)) return;
    seen.add(e);
    emails.push(e);
  }

  async function readTab(range) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.sheetId,
      range
    });
    const values = res.data.values || [];
    if (values.length < 2) return [];
    const headers = values[0].map((h) => String(h || "").trim());
    return values.slice(1).map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = String(row[i] ?? "").trim();
      });
      return obj;
    });
  }

  try {
    const admins = await readTab("Admins");
    admins.forEach((row) => add(row.email));
  } catch {
    /* tab missing */
  }

  try {
    const players = await readTab("Players");
    players.forEach((row) => {
      if (parseIsAdmin(row.is_admin)) add(row.email);
    });
  } catch {
    /* ignore */
  }

  return emails;
}

/**
 * Send contact form mail via SMTP when configured (CONTACT_SMTP_* in .env).
 * Recipients come from Sheets admins (or CONTACT_TO override) — never from the frontend.
 */
async function contactFormSubmit(payload) {
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

  let recipients;
  try {
    recipients = await getRecipientsFromSheets();
  } catch (error) {
    return {
      ok: false,
      error: "contact_email_not_configured",
      message: String(error && error.message ? error.message : error)
    };
  }

  if (!recipients.length) {
    return {
      ok: false,
      error: "contact_email_not_configured",
      message: "Geen admin-e-mailadressen in spreadsheet (tab Admins of Players.email bij is_admin)."
    };
  }

  if (!pruneRate(email)) {
    return {
      ok: false,
      error: "rate_limited",
      message: "Je hebt zojuist een bericht gestuurd. Probeer het zo opnieuw."
    };
  }

  if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
    return {
      ok: false,
      error: "contact_email_not_configured",
      message: "E-mail is nog niet geconfigureerd op de Pi (SMTP). Gebruik Apps Script als primary/fallback."
    };
  }

  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch {
    return {
      ok: false,
      error: "contact_email_not_configured",
      message: "nodemailer ontbreekt (npm install nodemailer)."
    };
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPass }
  });

  const body = [
    "Nieuw bericht via de contactpagina van schevetoren.github.io",
    "",
    `Naam: ${name}`,
    `E-mail: ${email}`,
    `Onderwerp: ${subject}`,
    "",
    message,
    "",
    "—",
    "Je kunt op dit bericht antwoorden (reply-to is het adres van de afzender)."
  ].join("\n");

  try {
    await transporter.sendMail({
      from: config.smtpFrom || config.smtpUser,
      to: recipients.join(", "),
      replyTo: email,
      subject: `[Scheve Toren contact] ${subject}`,
      text: body
    });
  } catch (error) {
    return {
      ok: false,
      error: "contact_send_failed",
      message: String(error && error.message ? error.message : error)
    };
  }

  return { ok: true, message: "sent" };
}

module.exports = { contactFormSubmit, getRecipientsFromSheets };

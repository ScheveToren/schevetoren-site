const express = require("express");
const cors = require("cors");
const { config } = require("./config");
const { openDb } = require("./db");
const { resolveAuth, requireCmsAdmin } = require("./auth-lichess");
const {
  SEASON,
  saveAttendanceRows,
  linkLichessWithInvite,
  futureSeasonRows,
  getAttendance,
  getAllAttendance,
  getPlayers
} = require("./attendance");
const {
  cmsStatus,
  cmsTestCommit,
  cmsListNews,
  cmsGetNews,
  cmsPublishNews,
  cmsPublishPage,
  cmsGetPage,
  cmsGetSeason,
  cmsPublishSeason,
  cmsGetCalendarEvents,
  cmsPublishCalendarEvents,
  cmsGetRapidLadder,
  cmsPublishRapidLadder,
  cmsUploadIcs,
  cmsUploadNewsMedia
} = require("./cms-github");
const { startSheetsSync, getSyncStatus, runSyncCycle } = require("./sheets-sync");
const { contactFormSubmit } = require("./contact");
const {
  requestLoginLink,
  requestLichessLink,
  consumeLoginLink,
  linkLichessSession
} = require("./magic-auth");
const { resolveLichessAuth } = require("./auth-lichess");

openDb();

const app = express();
app.set("trust proxy", 1);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes(origin)) return callback(null, true);
      // Allow GitHub Pages project paths on same host
      if (/^https:\/\/schevetoren\.github\.io$/.test(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(express.text({ type: "*/*", limit: "2mb" }));

function sendJson(res, object) {
  res.type("application/json").send(JSON.stringify(object));
}

function parseBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const raw = typeof req.body === "string" ? req.body : "";
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

app.get(["/", "/exec"], (req, res) => {
  const action = String(req.query.action || "").trim();
  if (action === "season") return sendJson(res, { season: SEASON });
  if (action === "sync-status") return sendJson(res, { ok: true, sync: getSyncStatus() });
  if (action === "players" || action === "export" || (action === "attendance" && req.query.player)) {
    return sendJson(res, { ok: false, error: "auth_required" });
  }
  return sendJson(res, { ok: true, message: "Attendance API ready (Pi)" });
});

app.post(["/", "/exec"], async (req, res) => {
  try {
    const payload = parseBody(req);
    const action = String(payload.action || "").trim();
    const token = String(payload.token || "").trim();
    const session = String(payload.session || "").trim();

    if (action === "request-login-link") {
      return sendJson(res, await requestLoginLink(payload));
    }

    if (action === "consume-login-link") {
      return sendJson(res, await consumeLoginLink(payload));
    }

    if (action === "request-lichess-link") {
      const auth = await resolveLichessAuth(token);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "unauthorized" });
      return sendJson(res, await requestLichessLink(auth, payload));
    }

    if (action === "link-lichess-session") {
      const sessionAuth = await resolveAuth("", session);
      const lichessAuth = await resolveLichessAuth(token);
      return sendJson(res, await linkLichessSession(sessionAuth, lichessAuth));
    }

    if (action === "whoami") {
      const auth = await resolveAuth(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "unauthorized" });
      return sendJson(res, {
        ok: true,
        auth: auth.auth || "lichess",
        lichess_username: auth.lichess_username,
        player_name: auth.player_name,
        is_admin: auth.is_admin,
        linked: auth.linked,
        has_lichess: Boolean(auth.has_lichess || auth.lichess_username),
        email: auth.email || ""
      });
    }

    if (action === "my-attendance") {
      const auth = await resolveAuth(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "unauthorized" });
      // Session login counts as linked to a club player even without Lichess
      if (!auth.player_name) return sendJson(res, { ok: false, error: "not_linked", attendance: [] });
      return sendJson(res, { ok: true, attendance: getAttendance(auth.player_name) });
    }

    if (action === "link-lichess") {
      const auth = await resolveAuth(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "unauthorized" });
      if (payload.code) return sendJson(res, linkLichessWithInvite(auth, payload.code));
      return sendJson(res, {
        ok: false,
        error: "use_email_link",
        message: "Gebruik e-mailbevestiging om Lichess te koppelen (geen uitnodigingscode meer)."
      });
    }

    if (action === "admin-roster") {
      const auth = await resolveAuth(token, session);
      if (!auth.ok || !auth.is_admin) return sendJson(res, { ok: false, error: "forbidden" });
      return sendJson(res, {
        ok: true,
        season: SEASON,
        players: getPlayers(),
        rows: getAllAttendance()
      });
    }

    if (action === "save-attendance") {
      const auth = await resolveAuth(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "unauthorized" });

      let player = auth.player_name;
      const incoming = Array.isArray(payload.rows) ? payload.rows : [];
      if (auth.is_admin && String(payload.player || "").trim()) {
        player = String(payload.player || "").trim();
      }
      if (!player || !incoming.length) {
        return sendJson(res, { ok: false, error: "missing player or rows" });
      }
      if (!auth.is_admin && player !== auth.player_name) {
        return sendJson(res, { ok: false, error: "forbidden" });
      }
      if (!auth.is_admin && !auth.player_name) {
        return sendJson(res, { ok: false, error: "not_linked" });
      }

      const saved = saveAttendanceRows(player, incoming);
      if (!saved.ok) return sendJson(res, saved);
      return sendJson(res, { ok: true, message: "attendance saved", records: saved.records });
    }

    if (action === "bulk-set") {
      const auth = await resolveAuth(token, session);
      if (!auth.ok || !auth.player_name) return sendJson(res, { ok: false, error: "forbidden" });
      const status = String(payload.status || "").trim();
      if (!["present", "absent"].includes(status)) {
        return sendJson(res, { ok: false, error: "missing valid status" });
      }
      const rows = futureSeasonRows(status);
      const saved = saveAttendanceRows(auth.player_name, rows);
      if (!saved.ok) return sendJson(res, saved);
      return sendJson(res, {
        ok: true,
        message: "all future dates set",
        records: saved.records
      });
    }

    if (action === "cms-status") {
      const auth = await requireCmsAdmin(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "forbidden" });
      return sendJson(res, await cmsStatus());
    }

    if (action === "cms-test-commit") {
      const auth = await requireCmsAdmin(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "forbidden" });
      return sendJson(res, await cmsTestCommit(auth));
    }

    if (action === "cms-list-news") {
      const auth = await requireCmsAdmin(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "forbidden" });
      return sendJson(res, await cmsListNews());
    }

    if (action === "cms-get-news") {
      const auth = await requireCmsAdmin(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "forbidden" });
      return sendJson(res, await cmsGetNews(payload.repo_path || payload.path));
    }

    if (action === "cms-publish-news") {
      const auth = await requireCmsAdmin(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "forbidden" });
      return sendJson(res, await cmsPublishNews(payload));
    }

    if (action === "cms-publish-page") {
      const auth = await requireCmsAdmin(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "forbidden" });
      return sendJson(res, await cmsPublishPage(payload));
    }

    if (action === "cms-get-page") {
      const auth = await requireCmsAdmin(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "forbidden" });
      return sendJson(res, await cmsGetPage(payload.page_key || payload.key));
    }

    if (action === "cms-get-season") {
      const auth = await requireCmsAdmin(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "forbidden" });
      return sendJson(res, await cmsGetSeason());
    }

    if (action === "cms-publish-season") {
      const auth = await requireCmsAdmin(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "forbidden" });
      return sendJson(res, await cmsPublishSeason(payload));
    }

    if (action === "cms-get-calendar-events") {
      const auth = await requireCmsAdmin(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "forbidden" });
      return sendJson(res, await cmsGetCalendarEvents());
    }

    if (action === "cms-publish-calendar-events") {
      const auth = await requireCmsAdmin(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "forbidden" });
      return sendJson(res, await cmsPublishCalendarEvents(payload));
    }

    if (action === "cms-get-rapid-ladder") {
      const auth = await requireCmsAdmin(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "forbidden" });
      return sendJson(res, await cmsGetRapidLadder());
    }

    if (action === "cms-publish-rapid-ladder") {
      const auth = await requireCmsAdmin(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "forbidden" });
      return sendJson(res, await cmsPublishRapidLadder(payload));
    }

    if (action === "cms-upload-ics") {
      const auth = await requireCmsAdmin(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "forbidden" });
      return sendJson(res, await cmsUploadIcs(payload));
    }

    if (action === "cms-upload-news-media") {
      const auth = await requireCmsAdmin(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "forbidden" });
      return sendJson(res, await cmsUploadNewsMedia(payload));
    }

    if (action === "contact-form") {
      return sendJson(res, await contactFormSubmit(payload));
    }

    if (action === "sync-now") {
      const auth = await requireCmsAdmin(token, session);
      if (!auth.ok) return sendJson(res, { ok: false, error: auth.error || "forbidden" });
      await runSyncCycle({ forcePush: true });
      return sendJson(res, { ok: true, sync: getSyncStatus() });
    }

    return sendJson(res, { ok: false, error: "unknown action" });
  } catch (error) {
    return sendJson(res, {
      ok: false,
      error: String(error && error.stack ? error.stack : error)
    });
  }
});

async function main() {
  await startSheetsSync();
  app.listen(config.port, config.host, () => {
    console.log(`Scheve Toren API listening on http://${config.host}:${config.port}`);
    console.log(`SQLite: ${config.sqlitePath}`);
    console.log(`Sheets sync: ${getSyncStatus().enabled ? "enabled" : "disabled"}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

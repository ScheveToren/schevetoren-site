const API_URL = window.SCHEVETOREN_CONFIG?.API_URL ||
  "https://script.google.com/macros/s/AKfycbxvrh63zVaFHWOthXLCoe9VGDXUEizKo1YQOWlS6LN0DVHka0nUXBA2M1T421Ffzwpn/exec";

const FALLBACK_WEEKS = [
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

const CKEY = "schevetoren_code";
const CACHE = "schevetoren_attendance_cache_v4";
const META = "schevetoren_reference_cache_v4";
const CACHE_TTL = 10 * 60 * 1000;

let weeks = [...FALLBACK_WEEKS];
let saveInProgress = false;
let session = { linked: false, player_name: "", lichess_username: "", is_admin: false };

const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function todayStart() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function isPast(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d) < todayStart();
}

function dateText(d) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function setStatus(text, ok = true) {
  const e = document.getElementById("apiStatus");
  if (e) {
    e.textContent = text;
    e.className = `api-status ${ok ? "ok" : "error"}`;
  }
}

function token() {
  return window.ScheveTorenAuth?.getAccessToken?.() || "";
}

async function getJson(query) {
  const r = await fetch(`${API_URL}?${query}&_=${Date.now()}`, { cache: "no-store", redirect: "follow" });
  if (!r.ok) throw Error(`API ${r.status}`);
  return r.json();
}

async function postJson(payload, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...payload, token: token() }),
        cache: "no-store"
      });
      const data = await r.json();
      if (r.ok && data.ok !== false) return data;
      if (r.status === 403 || data.error === "forbidden" || data.error === "not_linked") throw Error(data.error || "Geen toegang");
      if (![404, 429, 500, 502, 503, 504].includes(r.status)) throw Error(data.error || `API ${r.status}`);
      lastError = Error(data.error || `API ${r.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < retries) await sleep(250 * (attempt + 1));
  }
  throw lastError || Error("Opslaan mislukt");
}

function readCache(name) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE) || "{}");
    return all[name] || {};
  } catch {
    return {};
  }
}

function cachePlayerData(name, data) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE) || "{}");
    all[name] = data;
    localStorage.setItem(CACHE, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function setSwitch(button, on) {
  button.setAttribute("aria-pressed", String(on));
  const text = button.querySelector(".switch-text");
  if (text) text.textContent = on ? "Aanwezig" : "Afwezig";
}

function updatePanels() {
  const loggedIn = Boolean(token());
  const memberPanels = document.getElementById("memberPanels");
  const linkPanel = document.getElementById("linkPanel");
  const toolPanel = document.getElementById("toolPanel");
  const listPanel = document.getElementById("listPanel");
  const playerHeading = document.getElementById("playerHeading");
  const loggedOutHint = document.getElementById("loggedOutHint");

  if (memberPanels) memberPanels.hidden = !loggedIn;
  if (loggedOutHint) loggedOutHint.hidden = loggedIn;
  if (linkPanel) linkPanel.hidden = !loggedIn || session.linked;
  if (toolPanel) toolPanel.hidden = !loggedIn || !session.linked;
  if (listPanel) listPanel.hidden = !loggedIn || !session.linked;
  if (playerHeading) {
    playerHeading.hidden = !session.linked;
    playerHeading.textContent = session.linked ? `Jouw aanwezigheid — ${session.player_name}` : "";
  }
}

function render(data = {}) {
  const table = document.getElementById("attendanceTable");
  if (!table) return;
  table.innerHTML = weeks.map(([date, label, kind]) => {
    const on = data[date] === "present";
    const past = isPast(date);
    return `<article class="attendance-row${past ? " past" : ""}" data-kind="${kind}">
      <span class="row-date">${dateText(date)}</span>
      <span class="row-label">${esc(label)}</span>
      <button class="attendance-switch" type="button" data-date="${date}" aria-pressed="${on}" ${past ? "disabled" : ""}>
        <span class="switch-track" aria-hidden="true"></span>
        <span class="switch-text">${on ? "Aanwezig" : "Afwezig"}</span>
      </button>
      <input class="compact-note" data-note="${date}" value="${esc(data[`${date}-note`] || "")}" placeholder="Notitie (optioneel)" ${past ? "disabled" : ""}>
    </article>`;
  }).join("");
  table.querySelectorAll(".attendance-switch:not(:disabled)").forEach(button => {
    button.onclick = () => setSwitch(button, button.getAttribute("aria-pressed") !== "true");
  });
}

function currentRows() {
  return [...document.querySelectorAll("#attendanceTable .attendance-switch")]
    .map(button => ({
      date: button.dataset.date,
      status: button.getAttribute("aria-pressed") === "true" ? "present" : "absent",
      note: document.querySelector(`[data-note="${button.dataset.date}"]`)?.value || ""
    }))
    .filter(row => !isPast(row.date));
}

function setAll(on) {
  document.querySelectorAll("#attendanceTable .attendance-switch:not(:disabled)").forEach(button => setSwitch(button, on));
  const all = document.getElementById("allAttendanceToggle");
  if (all) setSwitch(all, on);
}

async function loadSeason() {
  const meta = (() => {
    try { return JSON.parse(localStorage.getItem(META) || "null"); } catch { return null; }
  })();
  if (meta && Date.now() - meta.savedAt < CACHE_TTL && Array.isArray(meta.weeks) && meta.weeks.length) {
    weeks = meta.weeks;
    return;
  }
  try {
    const season = await getJson("action=season");
    if (Array.isArray(season.season) && season.season.length) weeks = season.season;
    localStorage.setItem(META, JSON.stringify({ savedAt: Date.now(), weeks }));
  } catch {
    setStatus("Speelkalender offline — standaarddatums worden gebruikt.", false);
  }
}

async function refreshSession() {
  if (!token()) {
    session = { linked: false, player_name: "", lichess_username: "", is_admin: false };
    updatePanels();
    setStatus("Log in met Lichess om je aanwezigheid te beheren.", false);
    render({});
    return;
  }
  try {
    const who = await postJson({ action: "whoami" });
    session = {
      linked: Boolean(who.linked),
      player_name: who.player_name || "",
      lichess_username: who.lichess_username || "",
      is_admin: Boolean(who.is_admin)
    };
    updatePanels();
    if (!session.linked) {
      setStatus("Koppel je Lichess-account met een uitnodigingscode van het bestuur.", false);
      render({});
      return;
    }
    await loadPlayer();
  } catch (error) {
    setStatus(`Sessie kon niet worden geladen: ${error.message}`, false);
    updatePanels();
  }
}

async function loadPlayer() {
  if (!session.linked) return;
  const name = session.player_name;
  let data = readCache(name);
  render(data);
  try {
    const result = await postJson({ action: "my-attendance" });
    data = {};
    (result.attendance || []).forEach(row => {
      data[row.date] = row.status;
      data[`${row.date}-note`] = row.note || "";
    });
    cachePlayerData(name, data);
    render(data);
    setStatus("Verbonden met de aanwezigheidsdatabase.");
  } catch (error) {
    setStatus(`Laden mislukt: ${error.message}`, false);
  }
}

async function save() {
  if (saveInProgress || !session.linked) return;
  const button = document.getElementById("saveBtn");
  const originalText = button.textContent;
  const rows = currentRows();
  saveInProgress = true;
  button.disabled = true;
  button.textContent = "Opslaan…";
  setStatus("Aanwezigheid wordt opgeslagen…");
  try {
    const result = await postJson({ action: "save-attendance", rows });
    if (!result.ok) throw Error(result.error || "Opslaan mislukt");
    const data = {};
    rows.forEach(row => {
      data[row.date] = row.status;
      data[`${row.date}-note`] = row.note;
    });
    cachePlayerData(session.player_name, data);
    setStatus("Aanwezigheid opgeslagen in Google Sheets.");
  } catch (error) {
    setStatus(`Opslaan mislukt: ${error.message}`, false);
  } finally {
    saveInProgress = false;
    button.disabled = false;
    button.textContent = originalText;
  }
}

function csv() {
  if (!session.linked) return;
  const name = session.player_name;
  const data = readCache(name);
  const head = ["Speler", ...weeks.map(w => w[0])];
  const values = [name, ...weeks.map(w => (data[w[0]] === "present" ? "1" : "0"))];
  const text = [head, values].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  link.href = url;
  link.download = "attendance.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function bindEvents() {
  const invite = document.getElementById("inviteCode");
  if (invite) invite.value = localStorage.getItem(CKEY) || "";

  document.getElementById("linkPlayerBtn")?.addEventListener("click", async () => {
    const code = invite?.value.trim();
    if (!code) return alert("Vul eerst een uitnodigingscode in.");
    if (!token()) return alert("Log eerst in met Lichess.");
    try {
      const result = await postJson({ action: "link-lichess", code });
      if (!result.ok) throw Error(result.error || "Code ongeldig");
      localStorage.setItem(CKEY, code);
      alert(`Account gekoppeld aan ${result.player_name || "speler"}.`);
      await refreshSession();
    } catch (error) {
      alert(`Koppelen mislukt: ${error.message}`);
    }
  });

  document.getElementById("saveBtn")?.addEventListener("click", save);
  document.getElementById("exportBtn")?.addEventListener("click", csv);
  document.getElementById("allAttendanceToggle")?.addEventListener("click", () => {
    setAll(document.getElementById("allAttendanceToggle").getAttribute("aria-pressed") !== "true");
  });
}

async function initialise() {
  await bindEvents();
  await loadSeason();
  await refreshSession();
  window.addEventListener("lichess-auth-changed", () => refreshSession());
}

window.addEventListener("beforeunload", event => {
  if (saveInProgress) {
    event.preventDefault();
    event.returnValue = "De aanwezigheid wordt nog opgeslagen. Weet je zeker dat je wilt vertrekken?";
  }
});

document.addEventListener("DOMContentLoaded", initialise);

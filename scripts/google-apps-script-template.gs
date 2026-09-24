const PLAYER_ROSTER = [
  "Erik Jan Tromp",
  "Kees Dekker",
  "Rudi De Smit",
  "Stefan Van der Sman",
  "Jeroen Kleijn",
  "Dave Theijn",
  "Sascha Ottenhof",
  "Aad Van Gent",
  "Casper Ruigt",
  "Agus Sutrisno",
  "Piet Perrels",
  "Wim Bergers",
  "Ivo Wilms",
  "Frank Stelwagen",
  "Stijn De Smit",
  "Gerard Rutten",
  "Carlos Koeleman",
  "Wouter Pietersma",
  "Wil Boonman",
  "Floris Van Tilburg",
  "Richard Riemens",
  "Tim de Jong",
  "Ronald Riemens",
  "Denis Pogrebniak",
  "Marcel Lewis",
  "Pepijn Huizer",
  "Priyanshu Joeloemsing",
  "Aleksander Drabarek",
  "Naud Boelens",
  "Arjan Van Buijtene",
  "Miroslaw Wojcik",
  "Bjorn Blankespoor",
  "Vince Van Marwijk",
  "Yufei Huang",
  "Tim Ip",
  "Sam Ip",
  "Thomas Ellerbroek",
  "Thijs van Straalen"
];

const SEASON_WEEKS = [
  { date: "2026-08-28", label: "ALV", kind: "event" },
  { date: "2026-09-04", label: "Speeldag 1", kind: "regular" },
  { date: "2026-09-11", label: "Speeldag 2", kind: "regular" },
  { date: "2026-09-18", label: "Speeldag 3", kind: "regular" },
  { date: "2026-09-25", label: "Speeldag 4", kind: "regular" },
  { date: "2026-10-02", label: "Speeldag 5", kind: "regular" },
  { date: "2026-10-09", label: "Rapid 1", kind: "rapid" },
  { date: "2026-10-16", label: "Rapid 2", kind: "rapid" },
  { date: "2026-10-30", label: "Rapid 3", kind: "rapid" },
  { date: "2026-11-06", label: "Speeldag 7", kind: "regular" },
  { date: "2026-11-13", label: "Schaak-Off", kind: "regular" },
  { date: "2026-11-20", label: "Speeldag 8", kind: "regular" },
  { date: "2026-11-27", label: "Speeldag 9", kind: "regular" },
  { date: "2026-12-04", label: "Speeldag 10", kind: "regular" },
  { date: "2026-12-11", label: "Rapid 4", kind: "rapid" },
  { date: "2026-12-18", label: "Rapid 5 / Kerstschaak", kind: "rapid" },
  { date: "2027-01-08", label: "Speeldag 11", kind: "regular" },
  { date: "2027-01-15", label: "Speeldag 12", kind: "regular" },
  { date: "2027-01-22", label: "Speeldag 13", kind: "regular" },
  { date: "2027-01-29", label: "Speeldag 14", kind: "regular" },
  { date: "2027-02-05", label: "Speeldag 15", kind: "regular" },
  { date: "2027-02-12", label: "Speeldag 16", kind: "regular" },
  { date: "2027-02-19", label: "Speeldag 17", kind: "regular" },
  { date: "2027-03-05", label: "Speeldag 18", kind: "regular" },
  { date: "2027-03-12", label: "Rapid 6", kind: "rapid" },
  { date: "2027-03-19", label: "Rapid 7", kind: "rapid" },
  { date: "2027-04-02", label: "Speeldag 19", kind: "regular" },
  { date: "2027-04-09", label: "Speeldag 20", kind: "regular" },
  { date: "2027-04-16", label: "Speeldag 21", kind: "regular" },
  { date: "2027-04-23", label: "Speeldag 22", kind: "regular" },
  { date: "2027-05-14", label: "Speeldag 23", kind: "regular" },
  { date: "2027-05-21", label: "Speeldag 24", kind: "regular" },
  { date: "2027-05-28", label: "Speeldag 25", kind: "regular" },
  { date: "2027-06-04", label: "Speeldag 26", kind: "regular" },
  { date: "2027-06-11", label: "Speeldag 27", kind: "regular" },
  { date: "2027-06-18", label: "Speeldag 28", kind: "regular" },
  { date: "2027-06-25", label: "Speeldag 29", kind: "regular" }
];

const STORAGE_KEY = "schevetoren_attendance_demo_v1";
const PLAYER_KEY = "schevetoren_player_name";
const CODE_KEY = "schevetoren_invite_code";

window.ATTENDANCE_CONFIG = {
  apiBaseUrl: window.ATTENDANCE_CONFIG && window.ATTENDANCE_CONFIG.apiBaseUrl ? window.ATTENDANCE_CONFIG.apiBaseUrl : "",
  seasonName: "2026-2027"
};

function getAttendanceData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function saveAttendanceData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getPlayerName() {
  return localStorage.getItem(PLAYER_KEY) || PLAYER_ROSTER[0];
}

function setPlayerName(name) {
  localStorage.setItem(PLAYER_KEY, name);
}

function getInviteCode() {
  return localStorage.getItem(CODE_KEY) || "";
}

function setInviteCode(value) {
  localStorage.setItem(CODE_KEY, value.trim());
}

function formatDate(dateString) {
  const d = new Date(dateString + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function selectPlayerOptions() {
  const select = document.getElementById("playerSelect");
  const current = getPlayerName();

  select.innerHTML = PLAYER_ROSTER.map((name) => {
    const selected = name === current ? "selected" : "";
    return `<option value="${name}" ${selected}>${name}</option>`;
  }).join("");

  select.addEventListener("change", (event) => {
    setPlayerName(event.target.value);
    renderAttendanceTable();
  });
}

function renderAttendanceTable() {
  const table = document.getElementById("attendanceTable");
  const data = getAttendanceData();
  const player = getPlayerName();
  const playerData = data[player] || {};

  table.innerHTML = SEASON_WEEKS.map((week) => {
    const key = week.date;
    const selected = playerData[key] || "absent";
    const note = playerData[`${key}-note`] || "";
    const label = week.kind === "rapid" ? "Rapid" : week.kind === "event" ? "Evenement" : "Speeldag";

    return `
      <article class="day-card" data-kind="${week.kind}">
        <h3>${week.label}</h3>
        <span class="date-label">${label} — ${formatDate(key)}</span>
        <div class="inline-controls">
          <select data-date="${key}">
            <option value="present" ${selected === "present" ? "selected" : ""}>Aanwezig</option>
            <option value="absent" ${selected === "absent" ? "selected" : ""}>Afwezig</option>
          </select>
        </div>
        <textarea class="note-box" data-note="${key}" placeholder="Optionele notitie...">${note}</textarea>
      </article>
    `;
  }).join("");
}

function persistTable() {
  const player = getPlayerName();
  const data = getAttendanceData();
  const rows = document.querySelectorAll("[data-date]");
  const next = { ...(data[player] || {}) };

  rows.forEach((element) => {
    const date = element.getAttribute("data-date");
    if (date) {
      next[date] = element.value;
    }
  });

  document.querySelectorAll("[data-note]").forEach((element) => {
    const date = element.getAttribute("data-note");
    next[`${date}-note`] = element.value;
  });

  data[player] = next;
  saveAttendanceData(data);
}

function exportCsv() {
  const player = getPlayerName();
  const data = getAttendanceData();
  const rows = ["date,status,note"];

  SEASON_WEEKS.forEach((week) => {
    const status = (data[player] && data[player][week.date]) || "absent";
    const note = (data[player] && data[player][`${week.date}-note`]) || "";
    rows.push(`${week.date},${status},"${note.replace(/"/g, '""')}"`);
  });

  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${player.replace(/\s+/g, "_")}_${window.ATTENDANCE_CONFIG.seasonName}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function linkPlayerToCode() {
  const codeValue = document.getElementById("inviteCode").value.trim();
  const player = getPlayerName();

  if (!codeValue) {
    alert("Vul eerst een uitnodigingscode in.");
    return;
  }

  setInviteCode(codeValue);
  const target = `${player} (${codeValue})`;
  alert(`Demo: speler gekoppeld aan ${target}. In de echte backend wordt hier Lichess OAuth gebruikt om de account te koppelen.`);
}

function bindEvents() {
  document.getElementById("saveBtn").addEventListener("click", () => {
    persistTable();
    alert("Aanwezigheid opgeslagen in browser opslag. In productie wordt dit naar de Google Sheet/backend gestuurd.");
  });

  document.getElementById("exportBtn").addEventListener("click", exportCsv);
  document.getElementById("linkPlayerBtn").addEventListener("click", linkPlayerToCode);

  document.getElementById("inviteCode").value = getInviteCode();
}

document.addEventListener("DOMContentLoaded", () => {
  selectPlayerOptions();
  renderAttendanceTable();
  bindEvents();
});

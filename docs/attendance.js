const PLAYERS = [
  "Erik Jan Tromp","Kees Dekker","Rudi De Smit","Stefan Van der Sman","Jeroen Kleijn","Dave Theijn",
  "Sascha Ottenhof","Aad Van Gent","Casper Ruigt","Agus Sutrisno","Piet Perrels","Wim Bergers",
  "Ivo Wilms","Frank Stelwagen","Stijn De Smit","Gerard Rutten","Carlos Koeleman","Wouter Pietersma",
  "Wil Boonman","Floris Van Tilburg","Richard Riemens","Tim de Jong","Ronald Riemens","Denis Pogrebniak",
  "Marcel Lewis","Pepijn Huizer","Priyanshu Joeloemsing","Aleksander Drabarek","Naud Boelens",
  "Arjan Van Buijtene","Miroslaw Wojcik","Bjorn Blankespoor","Vince Van Marwijk","Yufei Huang",
  "Tim Ip","Sam Ip","Thomas Ellerbroek","Thijs van Straalen"
];

const WEEKS = [
  ["2026-08-28","ALV","event"],
  ["2026-09-04","Speeldag 1","regular"],
  ["2026-09-11","Speeldag 2","regular"],
  ["2026-09-18","Speeldag 3","regular"],
  ["2026-09-25","Speeldag 4","regular"],
  ["2026-10-02","Speeldag 5","regular"],
  ["2026-10-09","Speeldag 6","regular"],
  ["2026-10-16","Rapid 1","rapid"],
  ["2026-10-30","Rapid 2","rapid"],
  ["2026-11-06","Speeldag 7","regular"],
  ["2026-11-13","Schaak-Off","regular"],
  ["2026-11-20","Speeldag 8","regular"],
  ["2026-11-27","Speeldag 9","regular"],
  ["2026-12-04","Speeldag 10","regular"],
  ["2026-12-11","Rapid 3","rapid"],
  ["2026-12-18","Rapid 4 / Kerstschaak","rapid"],
  ["2027-01-08","Speeldag 11","regular"],
  ["2027-01-15","Speeldag 12","regular"],
  ["2027-01-22","Speeldag 13","regular"],
  ["2027-01-29","Speeldag 14","regular"],
  ["2027-02-05","Speeldag 15","regular"],
  ["2027-02-12","Speeldag 16","regular"],
  ["2027-02-19","Speeldag 17","regular"],
  ["2027-03-05","Speeldag 18","regular"],
  ["2027-03-12","Rapid 5","rapid"],
  ["2027-03-19","Rapid 6","rapid"],
  ["2027-04-02","Speeldag 19","regular"],
  ["2027-04-09","Speeldag 20","regular"],
  ["2027-04-16","Speeldag 21","regular"],
  ["2027-04-23","Speeldag 22","regular"],
  ["2027-05-14","Speeldag 23","regular"],
  ["2027-05-21","Speeldag 24","regular"],
  ["2027-05-28","Speeldag 25","regular"],
  ["2027-06-04","Speeldag 26","regular"],
  ["2027-06-11","Speeldag 27","regular"],
  ["2027-06-18","Speeldag 28","regular"],
  ["2027-06-25","Speeldag 29","regular"]
];

const STORAGE_KEY = "schevetoren_attendance_v1";
const PLAYER_KEY = "schevetoren_player_name";
const CODE_KEY = "schevetoren_code";

function readData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getSelectedPlayer() {
  return localStorage.getItem(PLAYER_KEY) || PLAYERS[0];
}

function formatDate(dateString) {
  const date = new Date(dateString + "T00:00:00");
  return date.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function render() {
  const player = getSelectedPlayer();
  const data = readData()[player] || {};
  const table = document.getElementById("attendanceTable");

  table.innerHTML = WEEKS.map(([date, label, kind]) => {
    const selected = data[date] || "absent";
    const note = data[`${date}-note`] || "";
    return `
      <article class="day-card" data-kind="${kind}">
        <h3>${label}</h3>
        <span class="date-label">${formatDate(date)}</span>
        <select data-date="${date}">
          <option value="present" ${selected === "present" ? "selected" : ""}>Aanwezig</option>
          <option value="absent" ${selected === "absent" ? "selected" : ""}>Afwezig</option>
        </select>
        <textarea class="note-box" data-note="${date}" placeholder="Optionele notitie...">${note}</textarea>
      </article>
    `;
  }).join("");
}

function saveAttendance() {
  const player = getSelectedPlayer();
  const all = readData();
  const next = { ...(all[player] || {}) };

  document.querySelectorAll("[data-date]").forEach((el) => {
    next[el.dataset.date] = el.value;
  });

  document.querySelectorAll("[data-note]").forEach((el) => {
    next[`${el.dataset.note}-note`] = el.value;
  });

  all[player] = next;
  writeData(all);
  alert("Aanwezigheid opgeslagen in deze browser.");
}

function exportCsv() {
  const player = getSelectedPlayer();
  const data = readData()[player] || {};
  const rows = ["date,status,note"];

  WEEKS.forEach(([date]) => {
    const status = data[date] || "absent";
    const note = (data[`${date}-note`] || "").replace(/"/g, '""');
    rows.push(`${date},${status},"${note}"`);
  });

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${player.replace(/\s+/g, "_")}_2026-2027.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  const select = document.getElementById("playerSelect");
  select.innerHTML = PLAYERS.map((name) => `<option value="${name}">${name}</option>`).join("");
  select.value = getSelectedPlayer();
  select.addEventListener("change", (event) => {
    localStorage.setItem(PLAYER_KEY, event.target.value);
    render();
  });

  const inviteInput = document.getElementById("inviteCode");
  inviteInput.value = localStorage.getItem(CODE_KEY) || "";

  document.getElementById("linkPlayerBtn").addEventListener("click", () => {
    const code = inviteInput.value.trim();
    if (!code) {
      alert("Vul eerst een uitnodigingscode in.");
      return;
    }
    localStorage.setItem(CODE_KEY, code);
    alert(`Demo: speler gekoppeld met code ${code}. In productie wordt hier Lichess OAuth gebruikt.`);
  });

  document.getElementById("saveBtn").addEventListener("click", saveAttendance);
  document.getElementById("exportBtn").addEventListener("click", exportCsv);
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  render();
});

const API_URL = "https://script.google.com/macros/s/AKfycbxvrh63zVaFHWOthXLCoe9VGDXUEizKo1YQOWlS6LN0DVHka0nUXBA2M1T421Ffzwpn/exec";

let season = [];
let players = [];
let attendance = [];
let saving = false;

const esc = value => String(value ?? "").replace(/[&<>\"]/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"
}[character]));

function setStatus(message, ok = true) {
  const element = document.getElementById("adminStatus");
  if (element) {
    element.textContent = message;
    element.className = `api-status ${ok ? "ok" : "error"}`;
  }
}

function todayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isPast(dateString) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  return new Date(year, month - 1, day) < todayStart();
}

function dateText(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString("nl-NL", {
    day: "numeric", month: "short"
  });
}

function attendanceFor(playerName, date) {
  const row = attendance.find(item =>
    String(item.player_name || "").trim() === playerName && String(item.date || "").trim() === date
  );
  return row && row.status === "present" ? "present" : "absent";
}

function statusSelect(playerName, date) {
  const value = attendanceFor(playerName, date);
  const locked = isPast(date);
  return `<select data-player="${esc(playerName)}" data-date="${date}" ${locked ? "disabled" : ""} aria-label="${esc(playerName)} ${date}">
    <option value="present" ${value === "present" ? "selected" : ""}>Aanwezig</option>
    <option value="absent" ${value === "absent" ? "selected" : ""}>Afwezig</option>
  </select>`;
}

function render() {
  const head = document.querySelector("#adminTable thead");
  const body = document.querySelector("#adminTable tbody");
  head.innerHTML = `<tr><th>Speler</th>${season.map(([date, label]) =>
    `<th title="${esc(label)}">${esc(dateText(date))}</th>`).join("")}</tr>`;
  body.innerHTML = players.map(player => {
    const name = String(player.player_name || "").trim();
    return `<tr><th scope="row">${esc(name)}</th>${season.map(([date]) =>
      `<td>${statusSelect(name, date)}</td>`).join("")}</tr>`;
  }).join("");
}

async function get(action) {
  const response = await fetch(`${API_URL}?action=${encodeURIComponent(action)}&_=${Date.now()}`, {
    cache: "no-store", redirect: "follow"
  });
  if (!response.ok) throw Error(`API ${response.status}`);
  return response.json();
}

async function post(payload) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    redirect: "follow"
  });
  if (!response.ok) throw Error(`API ${response.status}`);
  return response.json();
}

async function load() {
  try {
    setStatus("Gegevens laden…");
    const [seasonResult, playersResult, attendanceResult] = await Promise.all([
      get("season"), get("players"), get("export")
    ]);
    season = Array.isArray(seasonResult.season) ? seasonResult.season : [];
    players = Array.isArray(playersResult.players) ? playersResult.players : [];
    attendance = Array.isArray(attendanceResult.rows) ? attendanceResult.rows : [];
    render();
    setStatus("Gegevens geladen.");
  } catch (error) {
    setStatus(`Laden mislukt: ${error.message}`, false);
  }
}

async function save() {
  if (saving) return;
  const button = document.getElementById("saveBtn");
  const selects = [...document.querySelectorAll("#adminTable select:not(:disabled)")];
  saving = true;
  button.disabled = true;
  button.textContent = "Opslaan…";
  try {
    const byPlayer = new Map();
    selects.forEach(select => {
      const player = select.dataset.player;
      if (!byPlayer.has(player)) byPlayer.set(player, []);
      byPlayer.get(player).push({ date: select.dataset.date, status: select.value, note: "" });
    });
    for (const [player, rows] of byPlayer) {
      const result = await post({ action: "save-attendance", player, rows });
      if (result.ok === false) throw Error(result.error || "opslaan mislukt");
    }
    await load();
    setStatus("Wijzigingen opgeslagen.");
  } catch (error) {
    setStatus(`Opslaan mislukt: ${error.message}`, false);
  } finally {
    saving = false;
    button.disabled = false;
    button.textContent = "Wijzigingen opslaan";
  }
}

function exportCsv() {
  const rows = [...document.querySelectorAll("#adminTable tr")].map(row =>
    [...row.children].map(cell => `"${cell.innerText.replace(/"/g, '""')}"`).join(",")
  );
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }));
  link.download = "aanwezigheid-admin.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("reloadBtn").addEventListener("click", load);
  document.getElementById("saveBtn").addEventListener("click", save);
  document.getElementById("exportBtn").addEventListener("click", exportCsv);
  load();
});

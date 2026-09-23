const API_URL = window.SCHEVETOREN_CONFIG?.API_URL ||
  "https://script.google.com/macros/s/AKfycbxvrh63zVaFHWOthXLCoe9VGDXUEizKo1YQOWlS6LN0DVHka0nUXBA2M1T421Ffzwpn/exec";

let season = [];
let players = [];
let attendance = [];
let saving = false;
let isAdmin = false;

const esc = value => String(value ?? "").replace(/[&<>\"]/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"
}[character]));

function token() {
  return window.ScheveTorenAuth?.getAccessToken?.() || "";
}

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
  const adminSection = document.getElementById("adminSection");
  if (!isAdmin) {
    if (adminSection) adminSection.hidden = true;
    head.innerHTML = "";
    body.innerHTML = "";
    return;
  }
  if (adminSection) adminSection.hidden = false;
  head.innerHTML = `<tr><th>Speler</th>${season.map(([date, label]) =>
    `<th title="${esc(label)}">${esc(dateText(date))}</th>`).join("")}</tr>`;
  body.innerHTML = players.map(player => {
    const name = String(player.player_name || "").trim();
    return `<tr><th scope="row">${esc(name)}</th>${season.map(([date]) =>
      `<td>${statusSelect(name, date)}</td>`).join("")}</tr>`;
  }).join("");
}

async function post(payload) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, token: token() }),
    redirect: "follow"
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw Error(data.error || `API ${response.status}`);
  return data;
}

async function load() {
  if (!token()) {
    isAdmin = false;
    render();
    setStatus("Log in met Lichess om de admin-pagina te gebruiken.", false);
    return;
  }
  try {
    setStatus("Gegevens laden…");
    const roster = await post({ action: "admin-roster" });
    season = Array.isArray(roster.season) ? roster.season : [];
    players = Array.isArray(roster.players) ? roster.players : [];
    attendance = Array.isArray(roster.rows) ? roster.rows : [];
    isAdmin = true;
    render();
    setStatus("Gegevens geladen.");
  } catch (error) {
    isAdmin = false;
    render();
    setStatus(error.message === "forbidden" ? "Geen admin-toegang voor dit Lichess-account." : `Laden mislukt: ${error.message}`, false);
  }
}

async function save() {
  if (saving || !isAdmin) return;
  const button = document.getElementById("saveBtn");
  const selects = [...document.querySelectorAll("#adminTable select:not(:disabled)")];
  saving = true;
  button.disabled = true;
  button.textContent = "Opslaan…";
  try {
    const byPlayer = new Map();
    selects.forEach(select => {
      const playerName = select.dataset.player;
      if (!byPlayer.has(playerName)) byPlayer.set(playerName, []);
      byPlayer.get(playerName).push({ date: select.dataset.date, status: select.value, note: "" });
    });
    for (const [playerName, rows] of byPlayer) {
      await post({ action: "save-attendance", player: playerName, rows });
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
  if (!isAdmin) return;
  const rows = [...document.querySelectorAll("#adminTable tr")].map(row => {
    const values = [...row.children].map(cell => {
      const select = cell.querySelector("select");
      if (select) return select.value === "present" ? "Aanwezig" : "Afwezig";
      return cell.innerText.trim();
    });
    return values.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",");
  });
  const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "aanwezigheid-admin.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("reloadBtn")?.addEventListener("click", load);
  document.getElementById("saveBtn")?.addEventListener("click", save);
  document.getElementById("exportBtn")?.addEventListener("click", exportCsv);
  window.addEventListener("lichess-auth-changed", () => load());
  load();
});

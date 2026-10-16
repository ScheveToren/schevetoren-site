(function () {
  const STORAGE_PREFIX = "schevetoren_rapid_present_";
  const LADDER_URL = "./data/rapid-ladder.json";
  const SEASON_URL = "./data/season.json";

  let ladderDoc = null;
  let rapidEvenings = [];
  let present = new Set();
  let selectedDate = "";
  let isAdmin = false;

  const $ = (id) => document.getElementById(id);

  function postJson(payload) {
    return window.ScheveTorenApi.postJson(payload, { retries: 1 });
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function playerNames() {
    return (ladderDoc?.players || []).map((p) => String(p.name || "").trim()).filter(Boolean);
  }

  function loadPresentFromStorage(date) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + date);
      if (!raw) return null;
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return null;
      return new Set(list.filter((n) => playerNames().includes(n)));
    } catch {
      return null;
    }
  }

  function savePresentToStorage() {
    if (!selectedDate) return;
    localStorage.setItem(STORAGE_PREFIX + selectedDate, JSON.stringify([...present]));
  }

  function parsePresentFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const date = params.get("date");
    const enc = params.get("present");
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) selectedDate = date;
    if (!enc) return;
    try {
      const json = decodeURIComponent(atob(enc.replace(/-/g, "+").replace(/_/g, "/")));
      const list = JSON.parse(json);
      if (Array.isArray(list)) {
        present = new Set(list.filter((n) => playerNames().includes(n)));
      }
    } catch {
      /* ignore bad share param */
    }
  }

  function buildShareUrl() {
    const names = [...present];
    const enc = btoa(JSON.stringify(names)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const url = new URL(window.location.href);
    url.searchParams.set("date", selectedDate);
    url.searchParams.set("present", enc);
    return url.toString();
  }

  function rapidDatesFromSeason(season) {
    const events = Array.isArray(season?.events) ? season.events : [];
    return events
      .filter((row) => Array.isArray(row) && row[2] === "rapid" && row[0])
      .map((row) => ({ date: row[0], label: row[1] || row[0] }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function previousRapidDate(date) {
    const idx = rapidEvenings.findIndex((e) => e.date === date);
    if (idx <= 0) return "";
    return rapidEvenings[idx - 1].date;
  }

  function presentInLadderOrder() {
    const names = playerNames();
    return names.filter((n) => present.has(n));
  }

  function chunkGroups(orderedPresent) {
    const groups = [];
    let i = 0;
    while (i < orderedPresent.length) {
      const remaining = orderedPresent.length - i;
      if (remaining >= 4) {
        groups.push({ kind: "vierkamp", players: orderedPresent.slice(i, i + 4) });
        i += 4;
      } else if (remaining === 3) {
        groups.push({ kind: "driekamp", players: orderedPresent.slice(i, i + 3) });
        i += 3;
      } else if (remaining === 2) {
        groups.push({ kind: "duel", players: orderedPresent.slice(i, i + 2) });
        i += 2;
      } else {
        groups.push({ kind: "vrij", players: orderedPresent.slice(i) });
        i += remaining;
      }
    }
    return groups;
  }

  function pairingsForGroup(group) {
    const p = group.players;
    if (group.kind === "vierkamp" && p.length === 4) {
      return [
        { round: 1, boards: [`${p[0]} – ${p[1]}`, `${p[2]} – ${p[3]}`] },
        { round: 2, boards: [`${p[0]} – ${p[2]}`, `${p[1]} – ${p[3]}`] },
        { round: 3, boards: [`${p[0]} – ${p[3]}`, `${p[1]} – ${p[2]}`] }
      ];
    }
    if (group.kind === "driekamp" && p.length === 3) {
      return [
        { round: 1, boards: [`${p[0]} – ${p[1]}`] },
        { round: 2, boards: [`${p[0]} – ${p[2]}`] },
        { round: 3, boards: [`${p[1]} – ${p[2]}`] }
      ];
    }
    if (group.kind === "duel" && p.length === 2) {
      return [{ round: 1, boards: [`${p[0]} – ${p[1]}`] }];
    }
    return [];
  }

  function groupTitle(group, index) {
    const letter = String.fromCharCode(65 + index);
    if (group.kind === "vierkamp") return `Vierkamp ${letter}`;
    if (group.kind === "driekamp") return `Driekamp ${letter}`;
    if (group.kind === "duel") return `Partij ${letter}`;
    return "Vrij";
  }

  function buildCopyText(groups) {
    const lines = [];
    const evening = rapidEvenings.find((e) => e.date === selectedDate);
    lines.push(`Rapid indeling — ${evening?.label || selectedDate}`);
    lines.push("");
    groups.forEach((g, i) => {
      if (g.kind === "vrij") {
        lines.push(`Vrij: ${g.players.join(", ")}`);
        return;
      }
      lines.push(groupTitle(g, i));
      g.players.forEach((name, si) => lines.push(`  ${si + 1}. ${name}`));
      pairingsForGroup(g).forEach((r) => {
        lines.push(`  Ronde ${r.round}: ${r.boards.join(" | ")}`);
      });
      lines.push("");
    });
    return lines.join("\n").trim();
  }

  function renderLadder() {
    const list = $("ladderList");
    if (!list || !ladderDoc) return;
    const names = playerNames();
    list.innerHTML = names
      .map((name, i) => {
        const checked = present.has(name) ? "checked" : "";
        return `<li>
          <span class="rapid-rank">${i + 1}</span>
          <input type="checkbox" id="p-${i}" data-index="${i}" ${checked} aria-label="Aanwezig: ${escapeHtml(name)}">
          <label for="p-${i}">${escapeHtml(name)}</label>
        </li>`;
      })
      .join("");
    list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        const name = names[Number(cb.dataset.index)];
        if (cb.checked) present.add(name);
        else present.delete(name);
        savePresentToStorage();
        renderIndeling();
        renderAdminGroups();
      });
    });
  }

  function renderIndeling() {
    const ordered = presentInLadderOrder();
    const groups = chunkGroups(ordered);
    const playable = groups.filter((g) => g.kind !== "vrij");
    const floatGroup = groups.find((g) => g.kind === "vrij");

    $("indelingSummary").textContent =
      ordered.length === 0
        ? "Nog niemand aangevinkt."
        : `${ordered.length} speler(s), ${playable.length} groep(en).`;

    const root = $("groupsRoot");
    root.innerHTML = playable
      .map((g, i) => {
        const rounds = pairingsForGroup(g)
          .map(
            (r) =>
              `<dt>Ronde ${r.round}</dt><dd>${r.boards.map((b) => escapeHtml(b)).join("<br>")}</dd>`
          )
          .join("");
        const seeds = g.players.map((n, si) => `<li>${si + 1}. ${escapeHtml(n)}</li>`).join("");
        return `<article class="rapid-group">
          <h3>${escapeHtml(groupTitle(g, i))}</h3>
          <ol class="rapid-seed">${seeds}</ol>
          <dl class="rapid-rounds">${rounds}</dl>
        </article>`;
      })
      .join("");

    const floatRoot = $("floatRoot");
    if (floatGroup && floatGroup.players.length) {
      floatRoot.hidden = false;
      floatRoot.textContent = `Vrij: ${floatGroup.players.join(", ")}`;
    } else {
      floatRoot.hidden = true;
    }

    const copyBlock = $("copyBlock");
    const text = buildCopyText(groups);
    copyBlock.value = text;
    copyBlock.hidden = !ordered.length;
  }

  function currentGroupsForAdmin() {
    return chunkGroups(presentInLadderOrder()).filter((g) => g.kind !== "vrij" && g.players.length >= 2);
  }

  function defaultLastPlayer(group) {
    return group.players[group.players.length - 1];
  }

  function renderAdminGroups() {
    const root = $("adminGroups");
    if (!root || !isAdmin) return;
    const groups = currentGroupsForAdmin();
    if (!groups.length) {
      root.innerHTML = "<p class=\"meta\">Geen groepen om te rapporteren (minimaal twee aanwezigen per groep).</p>";
      return;
    }
    root.innerHTML = groups
      .map((g, i) => {
        const opts = g.players.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
        const title = groupTitle(g, i);
        return `<div class="admin-group-row" data-group-index="${i}">
          <div><strong>${escapeHtml(title)}</strong></div>
          <label>Winnaar (1e)<select class="admin-winner">${opts}</select></label>
          <label>Laatste<select class="admin-last">${opts}</select></label>
        </div>`;
      })
      .join("");
    root.querySelectorAll(".admin-group-row").forEach((row, i) => {
      const g = groups[i];
      const lastSel = row.querySelector(".admin-last");
      if (lastSel) lastSel.value = defaultLastPlayer(g);
    });
  }

  function collectAdminResults() {
    const groups = currentGroupsForAdmin();
    const results = [];
    $("adminGroups").querySelectorAll(".admin-group-row").forEach((row, i) => {
      const winner = row.querySelector(".admin-winner")?.value || "";
      const last = row.querySelector(".admin-last")?.value || "";
      results.push({ group: groups[i], winner, last });
    });
    return results;
  }

  function applyLadderMoves(players, results) {
    const names = players.map((p) => p.name);
    const moves = [];

    for (const { winner, last } of results) {
      if (!winner || !last || winner === last) continue;

      let wi = names.indexOf(winner);
      if (wi > 0) {
        moves.push(`${winner} ↑ (wissel met ${names[wi - 1]})`);
        const tmp = names[wi - 1];
        names[wi - 1] = names[wi];
        names[wi] = tmp;
      }

      let li = names.indexOf(last);
      if (li >= 0 && li < names.length - 1) {
        moves.push(`${last} ↓ (wissel met ${names[li + 1]})`);
        const tmp = names[li + 1];
        names[li + 1] = names[li];
        names[li] = tmp;
      }
    }

    const byName = new Map(players.map((p) => [p.name, p]));
    const nextPlayers = names.map((n) => byName.get(n)).filter(Boolean);
    return { nextPlayers, moves };
  }

  function previewLadder() {
    const preview = $("adminPreview");
    const results = collectAdminResults();
    const { nextPlayers, moves } = applyLadderMoves(ladderDoc.players, results);
    if (!moves.length) {
      preview.hidden = false;
      preview.textContent = "Geen ladderwijzigingen (controleer winnaar/laatste per groep).";
      return nextPlayers;
    }
    preview.hidden = false;
    preview.innerHTML = `<strong>Preview:</strong><ul>${moves.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>`;
    return nextPlayers;
  }

  async function publishLadder() {
    const status = $("adminStatus");
    const nextPlayers = previewLadder();
    if (!nextPlayers || !isAdmin) return;
    const nextDoc = {
      ...ladderDoc,
      updated: selectedDate || new Date().toISOString().slice(0, 10),
      players: nextPlayers
    };
    status.textContent = "Publiceren…";
    status.className = "api-status";
    try {
      const res = await postJson({ action: "cms-publish-rapid-ladder", ladder: nextDoc });
      if (!res.ok) throw new Error(res.error || "publish failed");
      ladderDoc = nextDoc;
      status.textContent = "Ladder gepubliceerd. Site werkt bij na deploy (1–3 min).";
      status.className = "api-status ok";
      renderLadder();
      renderIndeling();
    } catch (e) {
      status.textContent = String(e.message || e);
      status.className = "api-status error";
    }
  }

  function fillDateSelect() {
    const sel = $("rapidDateSelect");
    sel.innerHTML = rapidEvenings
      .map((e) => `<option value="${e.date}">${escapeHtml(e.label)} (${e.date})</option>`)
      .join("");
    if (!selectedDate && rapidEvenings.length) selectedDate = rapidEvenings[0].date;
    if (selectedDate) sel.value = selectedDate;
    sel.addEventListener("change", () => {
      selectedDate = sel.value;
      const stored = loadPresentFromStorage(selectedDate);
      present = stored || new Set();
      renderLadder();
      renderIndeling();
      renderAdminGroups();
    });
  }

  async function refreshAdminSession() {
    const panel = $("adminPanel");
    const status = $("adminStatus");
    try {
      const who = await postJson({ action: "whoami" });
      isAdmin = Boolean(who.ok && who.is_admin);
    } catch {
      isAdmin = false;
    }
    panel.hidden = !isAdmin;
    if (isAdmin) {
      status.textContent = "Admin ingelogd.";
      status.className = "api-status ok";
      renderAdminGroups();
    }
  }

  function bindLichess() {
    const loginBtn = $("lichessLoginBtn");
    const logoutBtn = $("lichessLogoutBtn");
    const userEl = $("lichessUser");
    if (!window.ScheveTorenAuth) return;

    async function syncAuthUi() {
      const account = await window.ScheveTorenAuth.getAccount?.();
      const username = account?.username || "";
      const loggedIn = Boolean(username);
      if (loginBtn) loginBtn.hidden = loggedIn;
      if (logoutBtn) logoutBtn.hidden = !loggedIn;
      if (userEl) {
        userEl.hidden = !loggedIn;
        userEl.textContent = loggedIn ? `Lichess: ${username}` : "";
      }
      refreshAdminSession();
    }

    window.addEventListener("lichess-auth-changed", () => {
      syncAuthUi();
    });
    syncAuthUi();
  }

  async function init() {
    const status = $("loadStatus");
    try {
      const [ladderRes, seasonRes] = await Promise.all([
        fetch(LADDER_URL, { cache: "no-store" }),
        fetch(SEASON_URL, { cache: "no-store" })
      ]);
      if (!ladderRes.ok) throw new Error("rapid-ladder.json");
      if (!seasonRes.ok) throw new Error("season.json");
      ladderDoc = await ladderRes.json();
      const season = await seasonRes.json();
      rapidEvenings = rapidDatesFromSeason(season);
      parsePresentFromUrl();
      fillDateSelect();
      if (!present.size) {
        const stored = loadPresentFromStorage(selectedDate);
        if (stored) present = stored;
      }
      status.textContent = "";
      status.className = "api-status ok";
      renderLadder();
      renderIndeling();
      bindLichess();

      $("selectAllBtn").addEventListener("click", () => {
        present = new Set(playerNames());
        savePresentToStorage();
        renderLadder();
        renderIndeling();
        renderAdminGroups();
      });
      $("selectNoneBtn").addEventListener("click", () => {
        present = new Set();
        savePresentToStorage();
        renderLadder();
        renderIndeling();
        renderAdminGroups();
      });
      $("copyPrevBtn").addEventListener("click", () => {
        const prev = previousRapidDate(selectedDate);
        if (!prev) return;
        const stored = loadPresentFromStorage(prev);
        if (!stored) return;
        present = new Set(stored);
        savePresentToStorage();
        renderLadder();
        renderIndeling();
        renderAdminGroups();
      });
      $("copyLinkBtn").addEventListener("click", async () => {
        const url = buildShareUrl();
        try {
          await navigator.clipboard.writeText(url);
          $("loadStatus").textContent = "Link gekopieerd.";
        } catch {
          prompt("Kopieer deze link:", url);
        }
      });
      $("copyTextBtn").addEventListener("click", async () => {
        const text = $("copyBlock").value;
        try {
          await navigator.clipboard.writeText(text);
          $("loadStatus").textContent = "Indeling gekopieerd.";
        } catch {
          $("copyBlock").hidden = false;
          $("copyBlock").select();
        }
      });
      $("previewLadderBtn")?.addEventListener("click", previewLadder);
      $("publishLadderBtn")?.addEventListener("click", publishLadder);
    } catch (e) {
      status.textContent = `Laden mislukt: ${e.message || e}`;
      status.className = "api-status error";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

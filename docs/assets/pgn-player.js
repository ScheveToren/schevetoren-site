/**
 * In-page PGN replay using Chessground + chess.js (ESM from CDN).
 * Looks for .pgn-player elements with a nested .pgn-source script.
 */
import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.1.0/+esm";
import { Chessground } from "https://cdn.jsdelivr.net/npm/chessground@9.1.1/+esm";

function ensureStyles() {
  if (document.getElementById("cg-base-css")) return;
  const links = [
    ["cg-base-css", "https://cdn.jsdelivr.net/npm/chessground@9.1.1/assets/chessground.base.css"],
    ["cg-brown-css", "https://cdn.jsdelivr.net/npm/chessground@9.1.1/assets/chessground.brown.css"],
    ["cg-cburnett-css", "https://cdn.jsdelivr.net/npm/chessground@9.1.1/assets/chessground.cburnett.css"]
  ];
  for (const [id, href] of links) {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
}

function parseMeta(raw) {
  const lines = String(raw || "").split(/\r?\n/);
  let orientation = "white";
  const pgnLines = [];
  for (const line of lines) {
    const lower = line.trim().toLowerCase();
    if (lower.startsWith("caption:")) continue;
    if (lower.startsWith("orientation:")) {
      orientation = line.split(":").slice(1).join(":").trim().toLowerCase() === "black" ? "black" : "white";
      continue;
    }
    pgnLines.push(line);
  }
  return { pgn: pgnLines.join("\n").trim(), orientation };
}

function buildUi(root) {
  root.innerHTML = "";
  root.classList.add("pgn-player-ready");
  root.tabIndex = 0;

  const boardWrap = document.createElement("div");
  boardWrap.className = "pgn-board-wrap";
  const boardEl = document.createElement("div");
  boardEl.className = "pgn-board";
  boardWrap.appendChild(boardEl);

  const controls = document.createElement("div");
  controls.className = "pgn-controls";
  controls.innerHTML = `
    <button type="button" data-nav="start" title="Begin" aria-label="Begin">⏮</button>
    <button type="button" data-nav="prev" title="Vorige" aria-label="Vorige">◀</button>
    <button type="button" data-nav="next" title="Volgende" aria-label="Volgende">▶</button>
    <button type="button" data-nav="end" title="Einde" aria-label="Einde">⏭</button>
    <button type="button" data-nav="flip" title="Bord omdraaien" aria-label="Bord omdraaien">↻</button>
  `;

  const moves = document.createElement("div");
  moves.className = "pgn-moves";
  moves.setAttribute("role", "list");

  root.appendChild(boardWrap);
  root.appendChild(controls);
  root.appendChild(moves);
  return { boardEl, controls, moves };
}

function readPgnSource(root) {
  const source = root.querySelector(".pgn-source");
  if (source) return source.textContent || "";
  return root.getAttribute("data-pgn") || "";
}

function initPlayer(root) {
  const { pgn, orientation: initialOrientation } = parseMeta(readPgnSource(root));
  if (!pgn) {
    root.textContent = "Geen PGN.";
    return;
  }

  const replay = new Chess();
  try {
    replay.loadPgn(pgn, { strict: false });
  } catch {
    root.textContent = "Ongeldige PGN.";
    return;
  }

  const verbose = replay.history({ verbose: true });
  const startFen = verbose.length ? verbose[0].before : replay.fen();
  let ply = 0;
  let orientation = initialOrientation;

  const { boardEl, controls, moves } = buildUi(root);
  const ground = Chessground(boardEl, {
    fen: startFen,
    orientation,
    viewOnly: true,
    coordinates: true,
    animation: { enabled: true, duration: 160 },
    drawable: { enabled: false }
  });

  function fenAt(index) {
    if (index <= 0) return startFen;
    return verbose[index - 1].after;
  }

  function lastMoveAt(index) {
    if (index <= 0) return undefined;
    const m = verbose[index - 1];
    return m ? [m.from, m.to] : undefined;
  }

  function renderMoves() {
    moves.innerHTML = "";
    for (let i = 0; i < verbose.length; i += 1) {
      const m = verbose[i];
      if (i % 2 === 0) {
        const num = document.createElement("span");
        num.className = "pgn-move-num";
        num.textContent = `${Math.floor(i / 2) + 1}.`;
        moves.appendChild(num);
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pgn-move";
      btn.setAttribute("role", "listitem");
      btn.dataset.ply = String(i + 1);
      btn.textContent = m.san;
      btn.addEventListener("click", () => {
        ply = i + 1;
        sync();
      });
      moves.appendChild(btn);
    }
  }

  function sync() {
    ground.set({
      fen: fenAt(ply),
      lastMove: lastMoveAt(ply),
      orientation
    });
    moves.querySelectorAll(".pgn-move").forEach(btn => {
      btn.classList.toggle("active", Number(btn.dataset.ply) === ply);
    });
    const active = moves.querySelector(".pgn-move.active");
    if (active) active.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  controls.addEventListener("click", event => {
    const btn = event.target.closest("button[data-nav]");
    if (!btn) return;
    const nav = btn.dataset.nav;
    if (nav === "start") ply = 0;
    else if (nav === "prev") ply = Math.max(0, ply - 1);
    else if (nav === "next") ply = Math.min(verbose.length, ply + 1);
    else if (nav === "end") ply = verbose.length;
    else if (nav === "flip") orientation = orientation === "white" ? "black" : "white";
    sync();
  });

  root.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      ply = Math.max(0, ply - 1);
      sync();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      ply = Math.min(verbose.length, ply + 1);
      sync();
    } else if (event.key === "Home") {
      event.preventDefault();
      ply = 0;
      sync();
    } else if (event.key === "End") {
      event.preventDefault();
      ply = verbose.length;
      sync();
    }
  });

  renderMoves();
  sync();
}

ensureStyles();
document.querySelectorAll(".pgn-player").forEach(initPlayer);

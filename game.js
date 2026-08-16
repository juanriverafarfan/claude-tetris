"use strict";

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const WILDCARD = 8;

const COLORS = [
  null,
  "#4dd0e1", // I - cyan
  "#ffd54f", // O - yellow
  "#ba68c8", // T - purple
  "#81c784", // S - green
  "#e57373", // Z - red
  "#7986cb", // J - indigo
  "#90caf9", // L - pale blue
  "#f06292",
];

const PIECES = [
  null,
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], // I
  [
    [2, 2],
    [2, 2],
  ], // O
  [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0],
  ], // T
  [
    [0, 4, 4],
    [4, 4, 0],
    [0, 0, 0],
  ], // S
  [
    [5, 5, 0],
    [0, 5, 5],
    [0, 0, 0],
  ], // Z
  [
    [6, 0, 0],
    [6, 6, 6],
    [0, 0, 0],
  ], // J
  [
    [0, 0, 7],
    [7, 7, 7],
    [0, 0, 0],
  ], // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const POWER_UPS = ["bomb", "ray", "tint", "gravity", "freeze"];
const SPECIAL_LINES_THRESHOLD = 3;
const SPECIAL_PITY_LINES = 12;
const SPECIAL_BASE_CHANCE = 0.15;
const FREEZE_DURATION_MS = 5000;

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("next-canvas");
const nextCtx = nextCanvas.getContext("2d");
const scoreEl = document.getElementById("score");
const linesEl = document.getElementById("lines");
const levelEl = document.getElementById("level");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayScore = document.getElementById("overlay-score");
const restartBtn = document.getElementById("restart-btn");
const specialCurrentEl = document.getElementById("special-current");
const specialNextEl = document.getElementById("special-next");
const freezeEl = document.getElementById("freeze");

let board,
  current,
  next,
  score,
  lines,
  level,
  paused,
  gameOver,
  lastTime,
  dropAccum,
  dropInterval,
  animId;
let linesSinceSpecial, freezeRemainingMs, nextRayIsRow;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map((row) => [...row]);
  return {
    type,
    shape,
    x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
    y: 0,
    powerUpKind: null,
  };
}

function pickRandomPowerUp() {
  return POWER_UPS[Math.floor(Math.random() * POWER_UPS.length)];
}

function getSpecialSpawnChance() {
  const overflowLines = Math.max(
    0,
    linesSinceSpecial - SPECIAL_LINES_THRESHOLD,
  );
  const stepBonus = Math.floor(overflowLines / 5) * 0.08;
  return Math.min(0.8, SPECIAL_BASE_CHANCE + stepBonus);
}

function shouldSpawnSpecialPiece() {
  if (linesSinceSpecial < SPECIAL_LINES_THRESHOLD) return false;
  if (linesSinceSpecial >= SPECIAL_PITY_LINES) return true;
  return Math.random() < getSpecialSpawnChance();
}

function createNextPiece() {
  const piece = randomPiece();
  if (shouldSpawnSpecialPiece()) {
    piece.powerUpKind = pickRandomPowerUp();
    linesSinceSpecial = 0;
  }
  return piece;
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length,
    cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every((v) => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    linesSinceSpecial += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  applyPowerUpEffect();
  clearLines();
  spawn();
}

function getPieceCells(piece) {
  const cells = [];
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      cells.push({ x: piece.x + c, y: piece.y + r });
    }
  }
  return cells;
}

function getPieceAnchor(piece) {
  const cells = getPieceCells(piece);
  if (!cells.length) return { x: piece.x, y: piece.y };
  const pivot = cells[Math.floor(cells.length / 2)];
  return { x: pivot.x, y: pivot.y };
}

function applyBombEffect(anchor) {
  for (let y = anchor.y - 1; y <= anchor.y + 1; y++) {
    if (y < 0 || y >= ROWS) continue;
    for (let x = anchor.x - 1; x <= anchor.x + 1; x++) {
      if (x < 0 || x >= COLS) continue;
      board[y][x] = 0;
    }
  }
}

function applyRayEffect(anchor) {
  if (nextRayIsRow) {
    if (anchor.y >= 0 && anchor.y < ROWS) {
      for (let c = 0; c < COLS; c++) board[anchor.y][c] = 0;
    }
  } else if (anchor.x >= 0 && anchor.x < COLS) {
    for (let r = 0; r < ROWS; r++) board[r][anchor.x] = 0;
  }
  nextRayIsRow = !nextRayIsRow;
}

function applyTintEffect(targetColor) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === targetColor) board[r][c] = WILDCARD;
    }
  }
}

function applyGravityEffect() {
  for (let c = 0; c < COLS; c++) {
    const filled = [];
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c] !== 0) filled.push(board[r][c]);
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      board[r][c] = filled.length ? filled.pop() : 0;
    }
  }
}

function applyFreezeEffect() {
  freezeRemainingMs = FREEZE_DURATION_MS;
}

function applyPowerUpEffect() {
  if (!current.powerUpKind) return;
  const anchor = getPieceAnchor(current);
  if (current.powerUpKind === "bomb") applyBombEffect(anchor);
  if (current.powerUpKind === "ray") applyRayEffect(anchor);
  if (current.powerUpKind === "tint") applyTintEffect(current.type);
  if (current.powerUpKind === "gravity") applyGravityEffect();
  if (current.powerUpKind === "freeze") applyFreezeEffect();
}

function spawn() {
  current = next;
  next = createNextPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  updateHUD();
  drawNext();
}

function formatPowerName(kind) {
  if (!kind) return "NINGUNO";
  if (kind === "bomb") return "BOMBA";
  if (kind === "ray") return nextRayIsRow ? "RAYO FILA" : "RAYO COLUMNA";
  if (kind === "tint") return "TINTE";
  if (kind === "gravity") return "GRAVEDAD";
  return "CONGELAR";
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  if (specialCurrentEl)
    specialCurrentEl.textContent = formatPowerName(
      current?.powerUpKind || null,
    );
  if (specialNextEl)
    specialNextEl.textContent = formatPowerName(next?.powerUpKind || null);
  if (freezeEl)
    freezeEl.textContent =
      freezeRemainingMs > 0
        ? `${(freezeRemainingMs / 1000).toFixed(1)}s`
        : "0.0s";
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = "rgba(255,255,255,0.12)";
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = "#22222e";
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.powerUpKind) {
    nextCtx.strokeStyle = "#f06292";
    nextCtx.lineWidth = 3;
    nextCtx.strokeRect(2, 2, nextCanvas.width - 4, nextCanvas.height - 4);
  }
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = "GAME OVER";
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove("hidden");
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = "PAUSA";
    overlayScore.textContent = "";
    overlay.classList.remove("hidden");
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  const wasFrozen = freezeRemainingMs > 0;
  if (freezeRemainingMs > 0) {
    freezeRemainingMs = Math.max(0, freezeRemainingMs - dt);
  }
  if (wasFrozen || freezeRemainingMs > 0) updateHUD();

  if (freezeRemainingMs > 0) {
    dropAccum = 0;
  } else {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  linesSinceSpecial = 0;
  freezeRemainingMs = 0;
  nextRayIsRow = true;
  lastTime = performance.now();
  next = createNextPiece();
  spawn();
  updateHUD();
  overlay.classList.add("hidden");
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener("keydown", (e) => {
  if (e.code === "KeyP") {
    togglePause();
    return;
  }
  if (gameOver) {
    if (e.code === "Enter" || e.code === "NumpadEnter") {
      e.preventDefault();
      init();
    }
    return;
  }
  if (paused) return;
  switch (e.code) {
    case "ArrowLeft":
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case "ArrowRight":
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case "ArrowDown":
      softDrop();
      break;
    case "ArrowUp":
    case "KeyX":
      tryRotate();
      break;
    case "Space":
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener("click", init);

init();

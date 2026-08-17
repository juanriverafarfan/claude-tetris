"use strict";

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const WILDCARD = 8;
const TETROMINO_MAX_TYPE = 7;
const TYPE_PLUS = 9;
const TYPE_U = 10;
const TYPE_Y = 11;
const TYPE_SINGLE = 12;
const TYPE_HOLLOW = 13;

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
  "#ffb74d", // + - orange
  "#4db6ac", // U - teal
  "#aed581", // Y - lime
  "#fff176", // 1x1 - bright yellow
  "#ef5350", // 3x3 hollow - challenge red
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
  [
    [0, TYPE_PLUS, 0],
    [TYPE_PLUS, TYPE_PLUS, TYPE_PLUS],
    [0, TYPE_PLUS, 0],
  ], // +
  [
    [TYPE_U, 0, TYPE_U],
    [TYPE_U, TYPE_U, TYPE_U],
  ], // U
  [
    [0, TYPE_Y, 0],
    [TYPE_Y, TYPE_Y, 0],
    [0, TYPE_Y, 0],
    [0, TYPE_Y, 0],
  ], // Y
  [[TYPE_SINGLE]], // 1x1
  [
    [TYPE_HOLLOW, TYPE_HOLLOW, TYPE_HOLLOW],
    [TYPE_HOLLOW, 0, TYPE_HOLLOW],
    [TYPE_HOLLOW, TYPE_HOLLOW, TYPE_HOLLOW],
  ], // 3x3 hollow
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const HIGHSCORES_KEY = "tetris-highscores";
const MAX_HIGHSCORES = 5;
const POWER_UPS = ["bomb", "ray", "tint", "gravity", "freeze"];
const SPECIAL_LINES_THRESHOLD = 3;
const SPECIAL_PITY_LINES = 12;
const SPECIAL_BASE_CHANCE = 0.15;
const FREEZE_DURATION_MS = 5000;
const SPECIAL_SHAPE_THRESHOLD_LINES = 6;
const SPECIAL_SHAPE_PITY_LINES = 9;
const SPECIAL_SHAPE_BASE_CHANCE = 0.25;
const SPECIAL_SHAPE_STEP_CHANCE = 0.2;
const SPECIAL_SHAPE_MAX_CHANCE = 0.8;
const HOLLOW_COOLDOWN_SPAWNS = 6;
const SINGLE_REWARD_WINDOW_SPAWNS = 3;
const T_SPIN_BONUS_BY_LINES = [400, 800, 1200, 1600];
const PERFECT_CLEAR_BONUS = 2000;
const B2B_TETRIS_BONUS_FACTOR = 0.5;

const SPECIAL_SHAPE_WEIGHTS = [
  { type: TYPE_PLUS, weight: 35 },
  { type: TYPE_U, weight: 30 },
  { type: TYPE_Y, weight: 20 },
  { type: TYPE_HOLLOW, weight: 15 },
];

const NON_ROTATABLE_TYPES = new Set([TYPE_PLUS, TYPE_SINGLE]);

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("next-canvas");
const nextCtx = nextCanvas.getContext("2d");
const scoreEl = document.getElementById("score");
const linesEl = document.getElementById("lines");
const levelEl = document.getElementById("level");
const comboEl = document.getElementById("combo");
const b2bEl = document.getElementById("b2b");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayScore = document.getElementById("overlay-score");
const restartBtn = document.getElementById("restart-btn");
const fxLayer = document.getElementById("fx-layer");
const boardStack = document.getElementById("board-stack");
const specialCurrentEl = document.getElementById("special-current");
const specialNextEl = document.getElementById("special-next");
const freezeEl = document.getElementById("freeze");
const pauseOverlay = document.getElementById("pause-overlay");
const resumeBtn = document.getElementById("resume-btn");
const pauseRestartBtn = document.getElementById("pause-restart-btn");
const startLevelSelect = document.getElementById("start-level-select");
const highscoresListEl = document.getElementById("highscores-list");
const overlayHighscoresEl = document.getElementById("overlay-highscores");
const resetScoresBtn = document.getElementById("reset-scores-btn");
const highscoreEntryEl = document.getElementById("highscore-entry");
const playerNameInput = document.getElementById("player-name-input");
const saveScoreBtn = document.getElementById("save-score-btn");

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
let linesSinceSpecialShape,
  pendingSingleRewards,
  singleRewardSpawnsLeft,
  hollowCooldownSpawns;
let comboChain,
  backToBackTetris,
  lastMoveWasRotation,
  lastRotationUsedKick,
  audioContext,
  audioReady;
let selectedStartLevel = 1;
let activeStartLevel = 1;
let bestCombo;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function createPieceByType(type) {
  const shape = PIECES[type].map((row) => [...row]);
  return {
    type,
    shape,
    x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
    y: 0,
    powerUpKind: null,
  };
}

function randomTetrominoPiece() {
  const type = Math.floor(Math.random() * TETROMINO_MAX_TYPE) + 1;
  return createPieceByType(type);
}

function rollWeightedType(options) {
  const totalWeight = options.reduce((acc, item) => acc + item.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option.type;
  }
  return options[options.length - 1].type;
}

function getSpecialShapeSpawnChance() {
  const overflow = Math.max(
    0,
    linesSinceSpecialShape - SPECIAL_SHAPE_THRESHOLD_LINES,
  );
  return Math.min(
    SPECIAL_SHAPE_MAX_CHANCE,
    SPECIAL_SHAPE_BASE_CHANCE + overflow * SPECIAL_SHAPE_STEP_CHANCE,
  );
}

function shouldSpawnSpecialShape() {
  if (linesSinceSpecialShape < SPECIAL_SHAPE_THRESHOLD_LINES) return false;
  if (linesSinceSpecialShape >= SPECIAL_SHAPE_PITY_LINES) return true;
  return Math.random() < getSpecialShapeSpawnChance();
}

function pickSpecialShapeType() {
  const options =
    hollowCooldownSpawns > 0
      ? SPECIAL_SHAPE_WEIGHTS.filter((entry) => entry.type !== TYPE_HOLLOW)
      : SPECIAL_SHAPE_WEIGHTS;
  return rollWeightedType(options);
}

function shouldSpawnRewardSingle() {
  if (pendingSingleRewards <= 0 || singleRewardSpawnsLeft <= 0) return false;
  if (singleRewardSpawnsLeft === 1) return true;
  return Math.random() < 1 / singleRewardSpawnsLeft;
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
  if (hollowCooldownSpawns > 0) hollowCooldownSpawns--;

  if (shouldSpawnRewardSingle()) {
    pendingSingleRewards--;
    if (pendingSingleRewards > 0) {
      singleRewardSpawnsLeft = SINGLE_REWARD_WINDOW_SPAWNS;
    } else {
      singleRewardSpawnsLeft = 0;
    }
    return createPieceByType(TYPE_SINGLE);
  }

  if (singleRewardSpawnsLeft > 0) singleRewardSpawnsLeft--;

  if (shouldSpawnSpecialShape()) {
    const type = pickSpecialShapeType();
    const piece = createPieceByType(type);
    linesSinceSpecialShape = 0;
    if (type === TYPE_HOLLOW) hollowCooldownSpawns = HOLLOW_COOLDOWN_SPAWNS;
    return piece;
  }

  const piece = randomTetrominoPiece();
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

function clearRotationContext() {
  lastMoveWasRotation = false;
  lastRotationUsedKick = false;
}

function tryRotate() {
  if (NON_ROTATABLE_TYPES.has(current.type)) return;
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      lastMoveWasRotation = true;
      lastRotationUsedKick = kick !== 0;
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

  let didPerfectClear = false;
  if (cleared) {
    lines += cleared;
    linesSinceSpecial += cleared;
    linesSinceSpecialShape += cleared;
    if (cleared === 4) {
      pendingSingleRewards = Math.min(2, pendingSingleRewards + 1);
      if (singleRewardSpawnsLeft === 0)
        singleRewardSpawnsLeft = SINGLE_REWARD_WINDOW_SPAWNS;
    }
    didPerfectClear = board.every((row) => row.every((cell) => cell === 0));
    level = activeStartLevel + Math.floor(lines / 10);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }

  return { cleared, didPerfectClear };
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
    clearRotationContext();
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function countBlockedTSpinCorners(piece) {
  const centerX = piece.x + 1;
  const centerY = piece.y + 1;
  const corners = [
    { x: centerX - 1, y: centerY - 1 },
    { x: centerX + 1, y: centerY - 1 },
    { x: centerX - 1, y: centerY + 1 },
    { x: centerX + 1, y: centerY + 1 },
  ];

  let blocked = 0;
  for (const corner of corners) {
    if (
      corner.x < 0 ||
      corner.x >= COLS ||
      corner.y < 0 ||
      corner.y >= ROWS ||
      board[corner.y][corner.x] !== 0
    ) {
      blocked++;
    }
  }

  return blocked;
}

function detectTSpin(piece) {
  if (piece.type !== 3) return false;
  if (!lastMoveWasRotation) return false;
  return countBlockedTSpinCorners(piece) >= 3;
}

function getComboMultiplier() {
  return comboChain >= 1 ? comboChain + 1 : 1;
}

function getLineBaseScore(clearedLines) {
  if (clearedLines <= 0) return 0;
  if (clearedLines < LINE_SCORES.length)
    return LINE_SCORES[clearedLines] * level;
  return LINE_SCORES[LINE_SCORES.length - 1] * level;
}

function resolveLockScoring(lockPieceRef, clearResult, wasTSpin) {
  const clearedLines = clearResult.cleared;
  const wasTetris = clearedLines === 4;
  const hadBackToBackBefore = backToBackTetris;

  if (clearedLines > 0) {
    comboChain += 1;
  } else {
    comboChain = -1;
  }

  const comboMultiplier = getComboMultiplier();
  if (comboMultiplier > bestCombo) bestCombo = comboMultiplier;
  const baseLineScore = getLineBaseScore(clearedLines);
  const tspinBonus = wasTSpin
    ? (T_SPIN_BONUS_BY_LINES[Math.min(clearedLines, 3)] || 0) * level
    : 0;
  const b2bBonus =
    wasTetris && hadBackToBackBefore
      ? Math.floor(baseLineScore * B2B_TETRIS_BONUS_FACTOR)
      : 0;
  const perfectClearBonus = clearResult.didPerfectClear
    ? PERFECT_CLEAR_BONUS * level
    : 0;

  let lockScore = baseLineScore + tspinBonus + b2bBonus + perfectClearBonus;
  if (clearedLines > 0) {
    lockScore = Math.floor(lockScore * comboMultiplier);
  }
  score += lockScore;

  if (wasTetris) {
    backToBackTetris = true;
  } else if (clearedLines > 0) {
    backToBackTetris = false;
  }

  const events = [];
  if (comboMultiplier > 1 && clearedLines > 0) {
    events.push({
      text: `COMBO x${comboMultiplier}`,
      kind: "combo",
      intensity: Math.min(1, 0.4 + comboMultiplier * 0.1),
    });
  }
  if (wasTSpin) {
    const suffix = clearedLines > 0 ? ` ${clearedLines}` : "";
    events.push({
      text: `T-SPIN${suffix}`,
      kind: "tspin",
      intensity: 0.85,
    });
  }
  if (wasTetris && hadBackToBackBefore) {
    events.push({ text: "B2B TETRIS", kind: "b2b", intensity: 0.9 });
  }
  if (clearResult.didPerfectClear) {
    events.push({ text: "PERFECT CLEAR", kind: "pc", intensity: 1 });
  }

  return {
    clearedLines,
    lockScore,
    comboMultiplier,
    wasTSpin,
    wasTetris,
    didPerfectClear: clearResult.didPerfectClear,
    events,
  };
}

function ensureAudioContext() {
  if (audioContext) {
    if (audioContext.state === "suspended") audioContext.resume();
    return;
  }
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  audioContext = new Context();
  if (audioContext.state === "suspended") audioContext.resume();
}

function playTone(frequency, durationMs, volume, waveType) {
  if (!audioContext || !audioReady) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;
  oscillator.type = waveType;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + durationMs / 1000 + 0.02);
}

function playEventSound(eventKind, intensity) {
  if (!audioReady) return;
  if (eventKind === "combo") {
    playTone(360 + intensity * 320, 120, 0.05, "triangle");
    return;
  }
  if (eventKind === "tspin") {
    playTone(420, 130, 0.055, "sawtooth");
    playTone(560, 180, 0.05, "triangle");
    return;
  }
  if (eventKind === "b2b") {
    playTone(300, 120, 0.055, "square");
    playTone(450, 140, 0.05, "square");
    return;
  }
  if (eventKind === "pc") {
    playTone(300, 120, 0.06, "triangle");
    playTone(500, 170, 0.06, "triangle");
    playTone(700, 210, 0.05, "triangle");
  }
}

function triggerBoardFlash(kind) {
  if (!boardStack) return;
  const className = `flash-${kind}`;
  boardStack.classList.remove(className);
  void boardStack.offsetWidth;
  boardStack.classList.add(className);
  window.setTimeout(() => boardStack.classList.remove(className), 260);
}

function showFxToast(text, kind, delayMs) {
  if (!fxLayer) return;
  const toast = document.createElement("div");
  toast.className = `fx-toast ${kind}`;
  toast.textContent = text;
  toast.style.animationDelay = `${delayMs}ms`;
  toast.addEventListener("animationend", () => toast.remove());
  fxLayer.appendChild(toast);
}

function dispatchLockEvents(lockSummary) {
  if (!lockSummary.events.length) return;
  lockSummary.events.forEach((eventItem, index) => {
    const delayMs = index * 150;
    showFxToast(eventItem.text, eventItem.kind, delayMs);
    window.setTimeout(
      () => playEventSound(eventItem.kind, eventItem.intensity),
      delayMs,
    );
    window.setTimeout(() => triggerBoardFlash(eventItem.kind), delayMs);
  });
}

function lockPiece() {
  const lockPieceRef = current;
  merge();
  const wasTSpin = detectTSpin(lockPieceRef);
  applyPowerUpEffect();
  const clearResult = clearLines();
  const lockSummary = resolveLockScoring(lockPieceRef, clearResult, wasTSpin);
  dispatchLockEvents(lockSummary);
  clearRotationContext();
  updateHUD();
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
  clearRotationContext();
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
  if (comboEl) comboEl.textContent = `x${Math.max(1, getComboMultiplier())}`;
  if (b2bEl) b2bEl.textContent = backToBackTetris ? "ON" : "OFF";
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

function loadHighscores() {
  try {
    const raw = localStorage.getItem(HIGHSCORES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveHighscoresList(list) {
  try {
    localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(list));
  } catch (e) {
    // localStorage no disponible o llena: se ignora silenciosamente
  }
}

function qualifiesForHighscore(candidateScore) {
  const list = loadHighscores();
  if (list.length < MAX_HIGHSCORES) return true;
  return candidateScore > list[list.length - 1].score;
}

function addHighscore(name, candidateScore, candidateBestCombo, candidateMaxLines) {
  const list = loadHighscores();
  const entry = {
    name: name || "Jugador",
    score: candidateScore,
    bestCombo: candidateBestCombo,
    maxLines: candidateMaxLines,
  };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX_HIGHSCORES);
  saveHighscoresList(trimmed);
  return { list: trimmed, index: trimmed.indexOf(entry) };
}

function resetHighscores() {
  try {
    localStorage.removeItem(HIGHSCORES_KEY);
  } catch (e) {
    // ignore
  }
  renderHighscores(null);
}

function renderHighscoresRows(container, list, highlightIndex) {
  if (!container) return;
  container.innerHTML = "";
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "highscore-empty";
    li.textContent = "Sin récords aún";
    container.appendChild(li);
    return;
  }
  list.forEach((entry, index) => {
    const li = document.createElement("li");
    li.className = "highscore-row";
    if (index === highlightIndex) li.classList.add("highlight");

    const rank = document.createElement("span");
    rank.className = "hs-rank";
    rank.textContent = `${index + 1}.`;

    const name = document.createElement("span");
    name.className = "hs-name";
    name.textContent = entry.name;

    const scoreSpan = document.createElement("span");
    scoreSpan.className = "hs-score";
    scoreSpan.textContent = (entry.score || 0).toLocaleString();

    const meta = document.createElement("span");
    meta.className = "hs-meta";
    meta.textContent = `x${entry.bestCombo || 1} combo · ${entry.maxLines || 0} líneas`;

    li.append(rank, name, scoreSpan, meta);
    container.appendChild(li);
  });
}

function renderHighscores(highlightIndex) {
  const list = loadHighscores();
  renderHighscoresRows(highscoresListEl, list, null);
  renderHighscoresRows(overlayHighscoresEl, list, highlightIndex);
}

function submitHighscore() {
  const rawName = (playerNameInput?.value || "").trim();
  const name = (rawName || "Jugador").slice(0, 12);
  const { list, index } = addHighscore(name, score, bestCombo, lines);
  if (highscoreEntryEl) highscoreEntryEl.classList.add("hidden");
  renderHighscoresRows(highscoresListEl, list, null);
  renderHighscoresRows(overlayHighscoresEl, list, index === -1 ? null : index);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = "GAME OVER";
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove("hidden");

  if (qualifiesForHighscore(score)) {
    if (highscoreEntryEl) highscoreEntryEl.classList.remove("hidden");
    if (playerNameInput) {
      playerNameInput.value = "";
      window.setTimeout(() => playerNameInput.focus(), 0);
    }
  } else if (highscoreEntryEl) {
    highscoreEntryEl.classList.add("hidden");
  }
  renderHighscores(null);
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseOverlay.classList.add("hidden");
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    pauseOverlay.classList.remove("hidden");
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
        clearRotationContext();
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
  activeStartLevel = selectedStartLevel;
  level = activeStartLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  linesSinceSpecial = 0;
  linesSinceSpecialShape = 0;
  pendingSingleRewards = 0;
  singleRewardSpawnsLeft = 0;
  hollowCooldownSpawns = 0;
  comboChain = -1;
  backToBackTetris = false;
  lastMoveWasRotation = false;
  lastRotationUsedKick = false;
  freezeRemainingMs = 0;
  nextRayIsRow = true;
  audioReady = false;
  bestCombo = 0;
  if (highscoreEntryEl) highscoreEntryEl.classList.add("hidden");
  lastTime = performance.now();
  next = createNextPiece();
  spawn();
  updateHUD();
  overlay.classList.add("hidden");
  pauseOverlay.classList.add("hidden");
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener("keydown", (e) => {
  if (!audioReady) {
    ensureAudioContext();
    audioReady = !!audioContext;
  }
  if (e.code === "KeyP" || e.code === "Escape") {
    togglePause();
    return;
  }
  if (gameOver) {
    if (e.code === "Enter" || e.code === "NumpadEnter") {
      e.preventDefault();
      if (highscoreEntryEl && !highscoreEntryEl.classList.contains("hidden")) {
        submitHighscore();
      } else {
        init();
      }
    }
    return;
  }
  if (paused) return;
  switch (e.code) {
    case "ArrowLeft":
      if (!collide(current.shape, current.x - 1, current.y)) {
        current.x--;
        clearRotationContext();
      }
      break;
    case "ArrowRight":
      if (!collide(current.shape, current.x + 1, current.y)) {
        current.x++;
        clearRotationContext();
      }
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

restartBtn.addEventListener("click", () => {
  if (highscoreEntryEl && !highscoreEntryEl.classList.contains("hidden")) {
    submitHighscore();
  }
  init();
});
restartBtn.addEventListener("pointerdown", () => {
  ensureAudioContext();
  audioReady = !!audioContext;
});

resumeBtn.addEventListener("click", () => {
  if (paused) togglePause();
});

pauseRestartBtn.addEventListener("click", () => {
  init();
});

startLevelSelect.addEventListener("change", (e) => {
  const value = parseInt(e.target.value, 10);
  if (!Number.isNaN(value)) selectedStartLevel = value;
});

startLevelSelect.value = String(selectedStartLevel);

if (saveScoreBtn) saveScoreBtn.addEventListener("click", submitHighscore);
if (resetScoresBtn) resetScoresBtn.addEventListener("click", resetHighscores);

renderHighscores(null);
init();

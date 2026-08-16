# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project summary

Vanilla JavaScript implementation of classic Tetris using HTML5 Canvas and CSS. **No build step, no dependencies, no tests, no linter, no package manager.** The repo is a 3-file static site that runs directly in the browser.

## Running the game

Open `index.html` directly in a browser, or serve the directory with any static server. The README documents both options (e.g. `python3 -m http.server 8000`, `npx serve .`, `php -S localhost:8000`).

There is nothing to install, compile, lint, or test — `git status` is clean and there is no `package.json`.

## File map (big-picture architecture)

The whole game lives in three cooperating files. The architecture is intentionally flat — no modules, no classes, just module-scoped `let`/`const` and top-level functions.

- **`index.html`** — DOM structure. Hosts the main `<canvas id="board">` (300×600 = 10 cols × 20 rows × 30px blocks), the side panel with score/lines/level readouts and a `<canvas id="next-canvas">` (120×120) for the next-piece preview, the key control list, and the pause/game-over overlay (`#overlay` with `#overlay-title`, `#overlay-score`, `#restart-btn`).
- **`style.css`** — Dark retro-arcade visual styling. Defines the layout (`.wrapper`, `.game-container` flexbox, `.panel`), the `#board`/`#next-canvas` look, monospace `.value` styling for HUD numbers, the `kbd` chip styling, and the `.overlay` with `backdrop-filter: blur(4px)`. `.overlay.hidden` hides the overlay.
- **`game.js`** — All game logic (~300 lines, top-to-bottom). Module-scoped constants at the top, then DOM element grabs, then a flat sequence of functions and event listeners. A single `'use strict'` directive at line 1.

### `game.js` structure (read in this order)

1. **Constants block (lines 3–29)** — `COLS`, `ROWS`, `BLOCK`, `COLORS` palette (index 0 reserved as "empty", 1–7 map to I/O/T/S/Z/J/L), `PIECES` (each tetromino as a square matrix using its color-index as the cell value), `LINE_SCORES = [0, 100, 300, 500, 800]`.
2. **DOM handles (lines 31–42)** — cached references to canvases, HUD spans, overlay, and restart button.
3. **Mutable game state (line 43)** — single `let` tuple of all runtime state: `board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `lastTime`, `dropAccum`, `dropInterval`, `animId`. `init()` resets all of these.
4. **Pure-ish helpers** — `createBoard()`, `randomPiece()`, `collide(shape, ox, oy)`, `rotateCW(shape)` (transposition + row reverse), `tryRotate()` (with simple wall kicks `[0, -1, 1, -2, 2]`), `merge()`, `clearLines()`, `ghostY()`, `hardDrop()`, `softDrop()`, `lockPiece()`, `spawn()`, `updateHUD()`.
5. **Rendering** — `drawBlock()` (shared between board and next-piece canvas, takes a `context` and an `alpha` for the ghost), `drawGrid()`, `draw()`, `drawNext()`.
6. **Lifecycle** — `endGame()` (cancels `animId`, shows overlay), `togglePause()` (cancels or restarts the rAF loop), `loop(ts)` (accumulates `dt`, drops a row when `dropAccum >= dropInterval`, calls `draw()`, schedules next frame), `init()` (resets state, spawns first piece, starts loop).
7. **Event wiring** — single `keydown` listener maps `ArrowLeft/Right` (move), `ArrowDown` (soft drop), `ArrowUp`/`KeyX` (rotate), `Space` (hard drop, with `preventDefault` to stop page scroll), `KeyP` (toggle pause). `restartBtn` click → `init()`.

### Key design choices to preserve

- **Game model is a 2D matrix of color indices** (0 = empty, 1–7 = piece). `merge()` writes the piece's color indices straight into `board`, so the board doubles as both the grid state and the color source for re-rendering.
- **Rotation is square-matrix + transpose-reversing** (`rotateCW`); wall kicks are a fixed 5-step `kicks` array in `tryRotate`, not SRS.
- **The game loop is time-based, not tick-based**: `loop(ts)` accumulates `dt` into `dropAccum` and drops one row when it crosses `dropInterval`. `dropInterval` is recomputed in `clearLines()` as `Math.max(100, 1000 - (level - 1) * 90)`.
- **Ghost piece is computed on demand** by `ghostY()` and drawn with `globalAlpha = 0.2`; it is not stored in state.
- **Game over detection is "spawn into collision"** — `spawn()` calls `collide` with the new piece at the top; if it collides, `endGame()` fires.

## Customization knobs (all in `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `PIECES`, `LINE_SCORES`, plus the per-level speed formula inside `clearLines()`. If `COLS`/`ROWS`/`BLOCK` change, the `<canvas id="board" width="…" height="…">` attributes in `index.html` and the `next-canvas` size must be adjusted to match (board = `COLS * BLOCK` × `ROWS * BLOCK`).

## Controls reference

| Key            | Action                          |
| -------------- | ------------------------------- |
| `←` / `→`      | Move horizontally               |
| `↑` or `X`     | Rotate clockwise                |
| `↓`            | Soft drop (+1 pt/row)           |
| `Space`        | Hard drop (+2 pt/row)           |
| `P`            | Pause / resume                  |

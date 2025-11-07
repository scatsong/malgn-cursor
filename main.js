const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;
const TICK_INITIAL = 1000;
const LEVEL_DROP_MODIFIER = 0.85;

const COLORS = {
  I: "#38bdf8",
  J: "#6366f1",
  L: "#f97316",
  O: "#facc15",
  S: "#22c55e",
  T: "#a855f7",
  Z: "#ef4444"
};

const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0]
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0]
  ],
  O: [
    [1, 1],
    [1, 1]
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0]
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0]
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0]
  ]
};

const KEY_BINDINGS = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowDown: "softDrop",
  ArrowUp: "rotate",
  Space: "hardDrop",
  KeyP: "togglePause"
};

const canvas = document.querySelector("#playfield");
const context = canvas.getContext("2d");
context.scale(BLOCK_SIZE, BLOCK_SIZE);

const nextCanvas = document.querySelector("#nextPiece");
const nextContext = nextCanvas.getContext("2d");

const scoreEl = document.querySelector("#score");
const linesEl = document.querySelector("#lines");
const levelEl = document.querySelector("#level");
const statusEl = document.querySelector("#statusMessage");
// single-player only

const startBtn = document.querySelector("#startBtn");
const pauseBtn = document.querySelector("#pauseBtn");
const resetBtn = document.querySelector("#resetBtn");
// no multiplayer controls

const game = new (class Game {
  constructor() {
    this.grid = this.createEmptyGrid();
    this.bag = [];
    this.activePiece = this.createPiece();
    this.nextPiece = this.createPiece();
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.dropInterval = TICK_INITIAL;
    this.dropBuffer = 0;
    this.lastTime = 0;
    this.running = false;
    this.paused = false;
    this.frameId = null;
  }

  createEmptyGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }

  getRandomPieceType() {
    if (this.bag.length === 0) {
      this.bag = Object.keys(SHAPES);
      for (let i = this.bag.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }

  createPiece() {
    const type = this.getRandomPieceType();
    const matrix = SHAPES[type].map((row) => [...row]);
    return {
      type,
      matrix,
      pos: { x: Math.floor(COLS / 2) - Math.ceil(matrix[0].length / 2), y: 0 }
    };
  }

  reset() {
    this.grid = this.createEmptyGrid();
    this.activePiece = this.createPiece();
    this.nextPiece = this.createPiece();
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.dropInterval = TICK_INITIAL;
    this.dropBuffer = 0;
    this.lastTime = 0;
    this.running = false;
    this.paused = false;
    cancelAnimationFrame(this.frameId);
    updateScoreboard(this);
    draw();
    statusEl.textContent = "대기 중";
  }

  start() {
    if (this.running) {
      this.paused = false;
      statusEl.textContent = "플레이 중";
      return;
    }
    this.running = true;
    this.paused = false;
    this.lastTime = 0;
    statusEl.textContent = "플레이 중";
    const step = (time = 0) => {
      const delta = time - this.lastTime;
      this.lastTime = time;
      if (!this.paused) {
        this.dropBuffer += delta;
        if (this.dropBuffer >= this.dropInterval) {
          this.dropBuffer = 0;
          this.drop();
        }
        draw();
      }
      this.frameId = requestAnimationFrame(step);
    };
    this.frameId = requestAnimationFrame(step);
  }

  togglePause() {
    if (!this.running) return;
    this.paused = !this.paused;
    statusEl.textContent = this.paused ? "일시정지" : "플레이 중";
  }

  hardDrop() {
    if (!this.running || this.paused) return;
    while (!this.collides(0, 1, this.activePiece.matrix)) {
      this.activePiece.pos.y += 1;
    }
    this.lockPiece();
    this.spawnNextPiece();
    // no-op
  }

  drop() {
    if (!this.running || this.paused) return;
    if (!this.collides(0, 1, this.activePiece.matrix)) {
      this.activePiece.pos.y += 1;
    } else {
      this.lockPiece();
      this.spawnNextPiece();
    }
  }

  move(dir) {
    if (!this.running || this.paused) return;
    const offset = dir === "left" ? -1 : 1;
    if (!this.collides(offset, 0, this.activePiece.matrix)) {
      this.activePiece.pos.x += offset;
      draw();
    }
  }

  rotatePiece() {
    if (!this.running || this.paused) return;
    const rotated = rotateMatrix(this.activePiece.matrix);
    const originalX = this.activePiece.pos.x;
    let offset = 1;
    while (this.collides(0, 0, rotated)) {
      this.activePiece.pos.x += offset;
      offset = -(offset + (offset > 0 ? 1 : -1));
      if (offset > rotated[0].length) {
        this.activePiece.pos.x = originalX;
        return;
      }
    }
    this.activePiece.matrix = rotated;
    draw();
  }

  collides(offsetX, offsetY, matrix) {
    const { pos } = this.activePiece;
    for (let y = 0; y < matrix.length; y += 1) {
      for (let x = 0; x < matrix[y].length; x += 1) {
        if (matrix[y][x] === 0) continue;
        const newX = x + pos.x + offsetX;
        const newY = y + pos.y + offsetY;
        if (newX < 0 || newX >= COLS || newY >= ROWS) {
          return true;
        }
        if (newY < 0) continue;
        if (this.grid[newY][newX]) {
          return true;
        }
      }
    }
    return false;
  }

  lockPiece() {
    const { matrix, pos, type } = this.activePiece;
    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        const boardY = y + pos.y;
        if (boardY < 0) {
          this.gameOver();
          return;
        }
        this.grid[boardY][x + pos.x] = type;
      });
    });
    const cleared = this.clearLines();
    if (cleared > 0) {
      this.lines += cleared;
      this.score += this.calculateScore(cleared);
      const newLevel = Math.floor(this.lines / 10) + 1;
      if (newLevel !== this.level) {
        this.level = newLevel;
        this.dropInterval = Math.max(120, TICK_INITIAL * LEVEL_DROP_MODIFIER ** (this.level - 1));
      }
      updateScoreboard(this);
    }
  }

  spawnNextPiece() {
    this.activePiece = this.nextPiece;
    this.activePiece.pos = {
      x: Math.floor(COLS / 2) - Math.ceil(this.activePiece.matrix[0].length / 2),
      y: 0
    };
    this.nextPiece = this.createPiece();
    if (this.collides(0, 0, this.activePiece.matrix)) {
      this.gameOver();
    }
  }

  clearLines() {
    let cleared = 0;
    outer: for (let y = ROWS - 1; y >= 0; y -= 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (!this.grid[y][x]) {
          continue outer;
        }
      }
      const row = this.grid.splice(y, 1)[0].fill(0);
      this.grid.unshift(row);
      cleared += 1;
      y += 1;
    }
    return cleared;
  }

  calculateScore(lines) {
    const base = [0, 100, 300, 500, 800];
    return (base[lines] || 0) * this.level;
  }

  gameOver() {
    this.running = false;
    this.paused = false;
    cancelAnimationFrame(this.frameId);
    statusEl.textContent = "게임 오버";
  }

  // no multiplayer state
})();

function rotateMatrix(matrix) {
  const size = matrix.length;
  const rotated = matrix.map((row, y) => row.map((_, x) => matrix[size - 1 - x][y]));
  return rotated;
}

function drawGrid(grid, ctx, scale = BLOCK_SIZE) {
  const width = COLS;
  const height = ROWS;
  ctx.save();
  ctx.scale(scale / BLOCK_SIZE, scale / BLOCK_SIZE);
  ctx.clearRect(0, 0, width * BLOCK_SIZE, height * BLOCK_SIZE);
  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(0, 0, width * BLOCK_SIZE, height * BLOCK_SIZE);
  grid.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      drawBlock(ctx, x, y, COLORS[value]);
    });
  });
  ctx.restore();
}

function drawActivePiece(ctx, piece, ghost = false) {
  const { matrix, pos, type } = piece;
  const color = ghost ? "rgba(148, 163, 184, 0.3)" : COLORS[type];
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      drawBlock(ctx, x + pos.x, y + pos.y, color);
    });
  });
}

function getGhostPiece(piece, grid) {
  const ghost = {
    type: piece.type,
    matrix: piece.matrix.map((row) => [...row]),
    pos: { ...piece.pos }
  };
  while (!collidesWithGrid(ghost, grid, 0, 1)) {
    ghost.pos.y += 1;
  }
  return ghost;
}

function collidesWithGrid(piece, grid, offsetX, offsetY) {
  const { matrix, pos } = piece;
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix[y].length; x += 1) {
      if (!matrix[y][x]) continue;
      const newX = pos.x + x + offsetX;
      const newY = pos.y + y + offsetY;
      if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
      if (newY < 0) continue;
      if (grid[newY][newX]) return true;
    }
  }
  return false;
}

function drawBlock(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  ctx.strokeStyle = "rgba(15, 23, 42, 0.7)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
}

function draw() {
  drawGrid(game.grid, context);
  const ghost = getGhostPiece(game.activePiece, game.grid);
  drawActivePiece(context, ghost, true);
  drawActivePiece(context, game.activePiece);
  drawNextPiece();
}

function drawNextPiece() {
  nextContext.save();
  nextContext.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const { matrix, type } = game.nextPiece;
  const block = 24;
  const offsetX = (nextCanvas.width / block - matrix[0].length) / 2;
  const offsetY = (nextCanvas.height / block - matrix.length) / 2;
  nextContext.fillStyle = "#f3f4f6";
  nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      nextContext.fillStyle = COLORS[type];
      nextContext.fillRect((x + offsetX) * block, (y + offsetY) * block, block, block);
      nextContext.strokeStyle = "#e5e7eb";
      nextContext.strokeRect((x + offsetX) * block, (y + offsetY) * block, block, block);
    });
  });
  nextContext.restore();
}

function updateScoreboard({ score, lines, level }) {
  scoreEl.textContent = score;
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

document.addEventListener("keydown", (event) => {
  const action = KEY_BINDINGS[event.code];
  if (!action) return;
  event.preventDefault();
  switch (action) {
    case "left":
      game.move("left");
      break;
    case "right":
      game.move("right");
      break;
    case "softDrop":
      game.drop();
      break;
    case "rotate":
      game.rotatePiece();
      break;
    case "hardDrop":
      game.hardDrop();
      break;
    case "togglePause":
      game.togglePause();
      break;
    default:
      break;
  }
});

startBtn.addEventListener("click", () => {
  if (!game.running) game.reset();
  game.start();
});

pauseBtn.addEventListener("click", () => {
  game.togglePause();
});

resetBtn.addEventListener("click", () => {
  game.reset();
});

draw();
// expose for debugging
window.__tetris = { game };


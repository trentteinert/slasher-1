export const TILE = 16;
export const COLS = 12;
export const ROWS = 21;
export const T = { GRASS: 0, TREE: 1, ROCK: 2, FIRE: 3, TORCH: 4, WATER: 5 };
export const isSolid = t => t !== T.GRASS;

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Distance (in tiles, 4-way) from (tx,ty) over non-solid tiles; -1 where unreachable.
export function distanceField(grid, tx, ty) {
  const d = new Int16Array(COLS * ROWS).fill(-1);
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS || isSolid(grid[ty][tx])) return d;
  const q = [[tx, ty]];
  d[ty * COLS + tx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (isSolid(grid[ny][nx]) || d[ny * COLS + nx] >= 0) continue;
      d[ny * COLS + nx] = d[y * COLS + x] + 1;
      q.push([nx, ny]);
    }
  }
  return d;
}

export function genFloor(seed) {
  for (let attempt = 0; ; attempt++) {
    const w = tryGen(seed + attempt * 101);
    if (w.reach.length >= 60) return w;
  }
}

function tryGen(seed) {
  const r = rng(seed);
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(T.GRASS));
  const spawn = { tx: COLS >> 1, ty: ROWS - 4 };
  const nearSpawn = (x, y) => Math.abs(x - spawn.tx) <= 2 && Math.abs(y - spawn.ty) <= 2;
  const inner = (x, y) => x >= 1 && y >= 1 && x < COLS - 1 && y < ROWS - 1;

  // ragged forest border
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const d = Math.min(x, y, COLS - 1 - x, ROWS - 1 - y);
      if (d === 0 || (d === 1 && r() < 0.75) || (d === 2 && r() < 0.25)) grid[y][x] = T.TREE;
    }
  }

  // random-walk blobs for ponds and tree groves
  const blob = (type, count, size) => {
    for (let i = 0; i < count; i++) {
      let x = 2 + Math.floor(r() * (COLS - 4)), y = 2 + Math.floor(r() * (ROWS - 4));
      for (let k = 0; k < size; k++) {
        if (inner(x, y) && !nearSpawn(x, y)) grid[y][x] = type;
        const [dx, dy] = DIRS[Math.floor(r() * 4)];
        x += dx; y += dy;
      }
    }
  };
  blob(T.WATER, Math.floor(r() * 3), 8);
  blob(T.TREE, 2 + Math.floor(r() * 3), 10);

  const scatter = (type, count) => {
    for (let i = 0; i < count; i++) {
      const x = 2 + Math.floor(r() * (COLS - 4)), y = 2 + Math.floor(r() * (ROWS - 4));
      if (grid[y][x] === T.GRASS && !nearSpawn(x, y)) grid[y][x] = type;
    }
  };
  scatter(T.ROCK, 4 + Math.floor(r() * 4));
  scatter(T.FIRE, 1 + Math.floor(r() * 3));
  scatter(T.TORCH, 2);

  // anything the player can't reach becomes forest so nothing is sealed off
  const field = distanceField(grid, spawn.tx, spawn.ty);
  const reach = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (grid[y][x] !== T.GRASS) continue;
      if (field[y * COLS + x] < 0) grid[y][x] = T.TREE;
      else reach.push({ tx: x, ty: y, dist: field[y * COLS + x] });
    }
  }

  const variant = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => Math.floor(r() * 3)));
  return { grid, spawn, reach, variant, seed };
}

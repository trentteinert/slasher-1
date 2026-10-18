export const TILE = 16;
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

// Floors grow: a bit wider and a lot longer each time.
export const floorSize = floor => ({
  cols: Math.min(36, 12 + 2 * floor),
  rows: Math.min(64, 24 + 5 * floor),
});

// Distance (in tiles, 4-way) from (tx,ty) over non-solid tiles; -1 where unreachable.
export function distanceField(world, tx, ty) {
  const { grid, cols, rows } = world;
  const d = new Int16Array(cols * rows).fill(-1);
  if (tx < 0 || ty < 0 || tx >= cols || ty >= rows || isSolid(grid[ty][tx])) return d;
  const q = [[tx, ty]];
  d[ty * cols + tx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (isSolid(grid[ny][nx]) || d[ny * cols + nx] >= 0) continue;
      d[ny * cols + nx] = d[y * cols + x] + 1;
      q.push([nx, ny]);
    }
  }
  return d;
}

export function genFloor(seed, cols, rows) {
  for (let attempt = 0; ; attempt++) {
    const w = tryGen(seed + attempt * 101, cols, rows);
    if (w.reach.length >= cols * rows * 0.25) return w;
  }
}

function tryGen(seed, cols, rows) {
  const r = rng(seed);
  const grid = Array.from({ length: rows }, () => Array(cols).fill(T.GRASS));
  const spawn = { tx: cols >> 1, ty: rows - 4 };
  const nearSpawn = (x, y) => Math.abs(x - spawn.tx) <= 2 && Math.abs(y - spawn.ty) <= 2;
  const inner = (x, y) => x >= 1 && y >= 1 && x < cols - 1 && y < rows - 1;
  const k = (cols * rows) / 252; // feature density scales with area

  // ragged forest border
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const d = Math.min(x, y, cols - 1 - x, rows - 1 - y);
      if (d === 0 || (d === 1 && r() < 0.8) || (d === 2 && r() < 0.35) || (d === 3 && r() < 0.1)) grid[y][x] = T.TREE;
    }
  }

  // random-walk blobs for ponds and tree groves
  const blob = (type, count, size) => {
    for (let i = 0; i < count; i++) {
      let x = 2 + Math.floor(r() * (cols - 4)), y = 2 + Math.floor(r() * (rows - 4));
      for (let n = 0; n < size; n++) {
        if (inner(x, y) && !nearSpawn(x, y)) grid[y][x] = type;
        const [dx, dy] = DIRS[Math.floor(r() * 4)];
        x += dx; y += dy;
      }
    }
  };
  blob(T.WATER, Math.round(k * (0.6 + r() * 1.4)), 10);
  blob(T.TREE, Math.round(k * (2.5 + r() * 2)), 14);

  const scatter = (type, count) => {
    for (let i = 0; i < count; i++) {
      const x = 2 + Math.floor(r() * (cols - 4)), y = 2 + Math.floor(r() * (rows - 4));
      if (grid[y][x] === T.GRASS && !nearSpawn(x, y)) grid[y][x] = type;
    }
  };
  scatter(T.ROCK, Math.round(k * (4 + r() * 4)));
  scatter(T.FIRE, Math.round(k * (1 + r() * 2)));
  scatter(T.TORCH, Math.round(k * 2));

  // anything the player can't reach becomes forest so nothing is sealed off
  const field = distanceField({ grid, cols, rows }, spawn.tx, spawn.ty);
  const reach = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x] !== T.GRASS) continue;
      if (field[y * cols + x] < 0) grid[y][x] = T.TREE;
      else reach.push({ tx: x, ty: y, dist: field[y * cols + x] });
    }
  }

  const variant = Array.from({ length: rows }, () => Array.from({ length: cols }, () => Math.floor(r() * 4)));
  return { grid, cols, rows, spawn, reach, variant, seed };
}

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

export function genFloor(seed, cols, rows, opts = {}) {
  for (let attempt = 0; ; attempt++) {
    const w = tryGen(seed + attempt * 101, cols, rows, opts.carve !== false);
    if (w.reach.length >= cols * rows * 0.25) return w;
  }
}

function tryGen(seed, cols, rows, carve) {
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
        const stamp = type === T.WATER ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]];
        for (const [sx, sy] of stamp) if (inner(x + sx, y + sy) && !nearSpawn(x + sx, y + sy)) grid[y + sy][x + sx] = type;
        const [dx, dy] = DIRS[Math.floor(r() * 4)];
        x += dx; y += dy;
      }
    }
  };
  blob(T.TREE, Math.round(k * (3 + r() * 2.5)), 26);
  blob(T.WATER, Math.max(1, Math.round(k * (0.4 + r() * 0.7))), 34); // lakes carve through groves

  const scatter = (type, count) => {
    for (let i = 0; i < count; i++) {
      const x = 2 + Math.floor(r() * (cols - 4)), y = 2 + Math.floor(r() * (rows - 4));
      if (grid[y][x] === T.GRASS && !nearSpawn(x, y)) grid[y][x] = type;
    }
  };
  scatter(T.ROCK, Math.round(k * (4 + r() * 4)));
  scatter(T.FIRE, Math.round(k * (1 + r() * 2)));
  scatter(T.TORCH, Math.round(k * 2));

  if (carve) widenPassages(grid, cols, rows);

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

const CARVABLE = new Set([T.TREE, T.ROCK, T.FIRE, T.TORCH]);

// Every walkable tile should sit inside a 2x2 block of walkable tiles, so there are no one-tile
// corridors, dead-end slits or pinch points. Where one exists, clear the few obstacles that
// would make a 2x2 block (never lakes, and never the outer forest wall).
export function widenPassages(grid, cols, rows) {
  const walk = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && grid[y][x] === T.GRASS;
  const carvable = (x, y) => x >= 2 && y >= 2 && x < cols - 2 && y < rows - 2 && CARVABLE.has(grid[y][x]);
  const BLOCKS = [[0, 0], [-1, 0], [0, -1], [-1, -1]];
  const blockTiles = (x, y, [dx, dy]) => [[x + dx, y + dy], [x + dx + 1, y + dy], [x + dx, y + dy + 1], [x + dx + 1, y + dy + 1]];
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let y = 2; y < rows - 2; y++) {
      for (let x = 2; x < cols - 2; x++) {
        if (!walk(x, y)) continue;
        let best = null;
        for (const b of BLOCKS) {
          const need = blockTiles(x, y, b).filter(([bx, by]) => !walk(bx, by));
          if (need.length === 0) { best = []; break; }
          if (need.every(([bx, by]) => carvable(bx, by)) && (!best || need.length < best.length)) best = need;
        }
        if (best && best.length) { for (const [bx, by] of best) grid[by][bx] = T.GRASS; changed = true; }
      }
    }
    if (!changed) break;
  }
}

// how many walkable tiles are NOT inside a 2x2 walkable block (a measure of tight spots)
export function narrowCount(grid, cols, rows) {
  const walk = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && grid[y][x] === T.GRASS;
  let n = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (!walk(x, y)) continue;
    const ok = [[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) => walk(x + dx, y + dy) && walk(x + dx + 1, y + dy) && walk(x + dx, y + dy + 1) && walk(x + dx + 1, y + dy + 1));
    if (!ok) n++;
  }
  return n;
}

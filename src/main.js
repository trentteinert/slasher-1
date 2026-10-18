import { buildSprites, orbSprite } from './sprites.js';
import { TILE, T, isSolid, genFloor, floorSize, distanceField, rng } from './world.js';

// The screen shows a fixed 12x21-tile window; the world is bigger and the camera scrolls.
const W = 12 * TILE, H = 21 * TILE;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const SPR = buildSprites();

let scale = 1, offX = 0, offY = 0;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(innerWidth * dpr);
  cv.height = Math.round(innerHeight * dpr);
  const fit = Math.min(cv.width / W, cv.height / H);
  scale = fit >= 1 ? Math.floor(fit) : fit; // integer scale keeps pixels crisp
  offX = Math.round((cv.width - W * scale) / 2);
  offY = Math.round((cv.height - H * scale) / 2);
}
addEventListener('resize', resize);
resize();

// Upgrade orbs: dropped by monsters, picked up by walking over them.
const ORBS = [
  { name: 'Power', colors: { m: '#e5484d', M: '#8f1d2c', W: '#ffd0d0' }, text: '+10% damage', apply: p => { p.dmg *= 1.1; } },
  { name: 'Haste', colors: { m: '#f5c542', M: '#a8761a', W: '#fff3c4' }, text: '+7% attack speed', apply: p => { p.cd *= 0.93; } },
  { name: 'Reach', colors: { m: '#4d8dff', M: '#27479e', W: '#d4e4ff' }, text: '+7% slash range', apply: p => { p.range *= 1.07; } },
  { name: 'Swift', colors: { m: '#4fd6d6', M: '#1f7f86', W: '#d4ffff' }, text: '+5% move speed', apply: p => { p.speed *= 1.05; } },
  { name: 'Vigor', colors: { m: '#52c86a', M: '#25783a', W: '#d4ffd9' }, text: '+10 max HP', apply: p => { p.maxHp += 10; p.hp += 10; } },
];
ORBS.forEach(o => { o.sprite = orbSprite(o.colors); });

const ENEMY_TYPES = {
  chomper: { sprite: 'chomper', hp: 14, speed: 30, dmg: 8, size: 16, cr: 4, drop: 0.25 },
  bulb: { sprite: 'bulb', hp: 8, speed: 44, dmg: 6, size: 16, cr: 4, drop: 0.2 },
  brute: { sprite: 'brute', hp: 50, speed: 24, dmg: 16, size: 24, cr: 6, drop: 0.9 },
};
const AGGRO = 90;

let seed, floor, world, staticLayer, lights, field, fieldT;
let player, enemies, particles, orbs, texts, portal, state, shake, time, banner, fade, msg;
const cam = { x: 0, y: 0 };
const stick = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
const STICK_R = 22;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

function newRun() {
  seed = (Math.random() * 1e9) | 0;
  floor = 0;
  player = { x: 0, y: 0, r: 7, cr: 4, hp: 100, maxHp: 100, speed: 60, dmg: 10, range: 24, arc: Math.PI * 0.9, cd: 0.55, t: 0, hurt: 0, face: 1, walk: 0, dir: 1, swing: null };
  nextFloor();
}

function nextFloor() {
  floor++;
  const { cols, rows } = floorSize(floor);
  world = genFloor(seed + floor * 7919, cols, rows);
  buildStatic();
  player.x = world.spawn.tx * TILE + TILE / 2;
  player.y = world.spawn.ty * TILE + TILE / 2;
  player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.2);
  player.swing = null;
  enemies = []; particles = []; orbs = []; texts = [];
  shake = 0; time = 0; msg = { text: '', t: 0 };
  populate();
  const far = [...world.reach].sort((a, b) => b.dist - a.dist).slice(0, 5);
  const p = far[Math.floor(Math.random() * far.length)];
  portal = { x: p.tx * TILE + 8, y: p.ty * TILE + 8, open: false };
  banner = 1.6; fade = 1;
  field = distanceField(world, world.spawn.tx, world.spawn.ty);
  fieldT = 0.2;
  state = 'play';
  cam.x = clamp(player.x - W / 2, 0, world.cols * TILE - W);
  cam.y = clamp(player.y - H / 2, 0, world.rows * TILE - H);
}

function buildStatic() {
  const { cols, rows, grid, variant } = world;
  const c = document.createElement('canvas');
  c.width = cols * TILE; c.height = rows * TILE;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const r = rng(world.seed);
  const water = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && grid[y][x] === T.WATER;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = grid[y][x], v = variant[y][x];
      g.drawImage(t === T.WATER ? SPR.water[v & 1] : SPR.grass[v], x * TILE, y * TILE);
    }
  }
  // big soft patches of lighter and darker grass break up the tiling
  for (let i = 0; i < cols * rows / 10; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(80,125,40,0.22)' : 'rgba(160,200,90,0.14)';
    g.beginPath();
    g.ellipse(r() * cols * TILE, r() * rows * TILE, 10 + r() * 22, 8 + r() * 14, 0, 0, Math.PI * 2);
    g.fill();
  }
  // ponds: foam on the shore, dark bank on the grass side
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x] !== T.WATER) continue;
      const px = x * TILE, py = y * TILE;
      if (grid[y][x] === T.WATER && !water(x, y - 1)) { g.fillStyle = '#d8f0e8'; g.fillRect(px, py, TILE, 2); g.fillStyle = '#4f7a2c'; g.fillRect(px, py - 1, TILE, 1); }
      if (!water(x, y + 1)) { g.fillStyle = '#d8f0e8'; g.fillRect(px, py + TILE - 2, TILE, 2); g.fillStyle = '#4f7a2c'; g.fillRect(px, py + TILE, TILE, 1); }
      if (!water(x - 1, y)) { g.fillStyle = '#d8f0e8'; g.fillRect(px, py, 2, TILE); g.fillStyle = '#4f7a2c'; g.fillRect(px - 1, py, 1, TILE); }
      if (!water(x + 1, y)) { g.fillStyle = '#d8f0e8'; g.fillRect(px + TILE - 2, py, 2, TILE); g.fillStyle = '#4f7a2c'; g.fillRect(px + TILE, py, 1, TILE); }
    }
  }
  // contact shadows under trees and rocks
  g.fillStyle = 'rgba(30,60,20,0.35)';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = grid[y][x];
      if (t === T.TREE || t === T.ROCK) { g.beginPath(); g.ellipse(x * TILE + 8 + treeShift(y), y * TILE + 14, 8, 3, 0, 0, Math.PI * 2); g.fill(); }
    }
  }
  // trees and rocks row by row so lower ones overlap upper ones; odd rows are staggered
  // like the dense forests in the reference
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = grid[y][x];
      if (t === T.TREE) g.drawImage(SPR.tree[(x * 7 + y * 3) % 2], x * TILE + treeShift(y), y * TILE - 2);
      else if (t === T.ROCK) g.drawImage(SPR.rock, x * TILE, y * TILE);
    }
  }
  staticLayer = c;
  lights = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (grid[y][x] === T.FIRE || grid[y][x] === T.TORCH) lights.push({ x, y, t: grid[y][x] });
}
const treeShift = y => (y & 1) ? 4 : -4;

// ---- collision ----
function solidAt(x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= world.cols || ty >= world.rows) return true;
  return isSolid(world.grid[ty][tx]);
}
const blocked = (x, y, r) => solidAt(x - r, y - r) || solidAt(x + r, y - r) || solidAt(x - r, y + r) || solidAt(x + r, y + r);
function move(e, dx, dy) {
  if (!blocked(e.x + dx, e.y, e.cr)) e.x += dx;
  if (!blocked(e.x, e.y + dy, e.cr)) e.y += dy;
}

// ---- enemies ----
function pickType() {
  const r = Math.random();
  if (floor >= 3 && r < 0.12) return 'brute';
  if (floor >= 2 && r < 0.4) return 'bulb';
  return 'chomper';
}

function addEnemy(x, y) {
  const type = ENEMY_TYPES[pickType()];
  const hpMul = 1 + 0.25 * (floor - 1), dmgMul = 1 + 0.15 * (floor - 1), spdMul = 1 + 0.04 * (floor - 1);
  const hp = type.hp * hpMul;
  enemies.push({ type, x, y, cr: type.cr, hp, maxHp: hp, speed: type.speed * spdMul * rand(0.9, 1.1), dmg: type.dmg * dmgMul, flash: 0, kx: 0, ky: 0, phase: rand(0, 6), aggro: false });
}

// Enemies wait in packs scattered across the floor and wake up when you get close.
function populate() {
  const total = Math.min(60, 6 + 4 * floor);
  let far = world.reach.filter(t => t.dist >= 9);
  if (!far.length) far = world.reach;
  for (let guard = 0; enemies.length < total && guard < 500; guard++) {
    const c = far[Math.floor(Math.random() * far.length)];
    const n = Math.min(total - enemies.length, 1 + Math.floor(Math.random() * 3));
    for (let i = 0; i < n; i++) {
      const tx = c.tx + Math.floor(rand(-2, 3)), ty = c.ty + Math.floor(rand(-2, 3));
      if (tx < 1 || ty < 1 || tx >= world.cols - 1 || ty >= world.rows - 1 || isSolid(world.grid[ty][tx])) continue;
      addEnemy(tx * TILE + 8 + rand(-3, 3), ty * TILE + 8 + rand(-3, 3));
    }
  }
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 45;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.25, color });
  }
}

function nearestEnemy(maxDist) {
  let best = null, bd = maxDist;
  for (const e of enemies) {
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// ---- sword ----
function startSwing(target) {
  const a = Math.atan2(target.y - player.y, target.x - player.x);
  player.dir *= -1; // alternate swing direction for a combo feel
  player.face = Math.cos(a) >= 0 ? 1 : -1;
  player.swing = { t: 0, dur: Math.min(0.2, player.cd * 0.5), a, dir: player.dir, hit: false };
}

function swingHit(s) {
  for (const e of enemies) {
    const dx = e.x - player.x, dy = e.y - player.y, d = Math.hypot(dx, dy);
    if (d > player.range + e.cr) continue;
    let da = Math.atan2(dy, dx) - s.a;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > player.arc / 2 && d > e.cr + 2) continue;
    e.hp -= player.dmg;
    e.aggro = true;
    e.flash = 0.1;
    e.kx = (dx / (d || 1)) * 90; e.ky = (dy / (d || 1)) * 90;
    burst(e.x, e.y, '#ffffff', 2);
    burst(e.x, e.y, '#ff6b6b', 3);
  }
  shake = Math.max(shake, 1);
}

const ease = p => 1 - (1 - p) * (1 - p);
const swingAngles = s => [s.a - s.dir * (player.arc / 2 + 0.5), s.a + s.dir * (player.arc / 2)];

function dropOrb(x, y) {
  orbs.push({ x, y, kind: ORBS[Math.floor(Math.random() * ORBS.length)], t: Math.random() * 6 });
}
function say(text, x, y) { texts.push({ text, x, y, life: 1.1 }); }

// ---- update ----
function update(dt) {
  time += dt;
  banner = Math.max(0, banner - dt);
  fade = Math.max(0, fade - dt * 2.5);
  msg.t = Math.max(0, msg.t - dt);
  if (state === 'dead') return;

  const len = Math.hypot(stick.dx, stick.dy);
  if (stick.active && len > 2) {
    const m = Math.min(len, STICK_R) / STICK_R;
    move(player, (stick.dx / len) * player.speed * m * dt, (stick.dy / len) * player.speed * m * dt);
    player.walk += dt * 10;
    if (!player.swing && Math.abs(stick.dx) > 2) player.face = stick.dx > 0 ? 1 : -1;
  } else player.walk = 0;
  player.hurt = Math.max(0, player.hurt - dt);

  player.t -= dt;
  if (player.t <= 0) {
    const t = nearestEnemy(player.range + 10);
    if (t) { startSwing(t); player.t = player.cd; }
  }
  if (player.swing) {
    const s = player.swing;
    s.t += dt;
    if (!s.hit && s.t / s.dur >= 0.35) { s.hit = true; swingHit(s); }
    if (s.t > s.dur + 0.12) player.swing = null;
  }

  fieldT -= dt;
  if (fieldT <= 0) {
    field = distanceField(world, Math.floor(player.x / TILE), Math.floor(player.y / TILE));
    fieldT = 0.2;
  }

  const cols = world.cols;
  for (const e of enemies) {
    const pd = Math.hypot(player.x - e.x, player.y - e.y);
    if (!e.aggro && pd < AGGRO) {
      e.aggro = true;
      for (const o of enemies) if (!o.aggro && Math.hypot(o.x - e.x, o.y - e.y) < 40) o.aggro = true; // wake the pack
    }
    e.flash = Math.max(0, e.flash - dt);
    e.phase += dt * (e.aggro ? 8 : 2);
    if (!e.aggro) continue;

    const tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE);
    let gx = player.x, gy = player.y;
    const d = field[ty * cols + tx];
    if (d > 1) {
      let best = d, bx = tx, by = ty;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= world.rows) continue;
        const nd = field[ny * cols + nx];
        if (nd >= 0 && nd < best) { best = nd; bx = nx; by = ny; }
      }
      gx = bx * TILE + TILE / 2; gy = by * TILE + TILE / 2;
    }
    const dx = gx - e.x, dy = gy - e.y, dist = Math.hypot(dx, dy) || 1;
    move(e, (dx / dist * e.speed + e.kx) * dt, (dy / dist * e.speed + e.ky) * dt);
    e.kx *= 0.85; e.ky *= 0.85;

    if (pd < e.cr + player.cr + 2 && player.hurt <= 0) {
      player.hp -= e.dmg; player.hurt = 0.6; shake = 3;
      burst(player.x, player.y, '#7dd3fc', 6);
      if (player.hp <= 0) { state = 'dead'; return; }
    }
  }
  // soft separation so enemies don't stack
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i], b = enemies[j];
      if (!a.aggro && !b.aggro) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      const min = a.cr + b.cr;
      if (d > 0 && d < min) { const p = (min - d) / 2; move(a, -dx / d * p, -dy / d * p); move(b, dx / d * p, dy / d * p); }
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.hp > 0) continue;
    burst(e.x, e.y, '#fbbf24', 8);
    if (Math.random() < e.type.drop) dropOrb(e.x, e.y);
    enemies.splice(i, 1);
  }

  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    o.t += dt;
    const dx = player.x - o.x, dy = player.y - o.y, d = Math.hypot(dx, dy);
    if (d < 40) { o.x += (dx / d) * 70 * dt; o.y += (dy / d) * 70 * dt; }
    if (d < 8) {
      o.kind.apply(player);
      say(o.kind.name + ' ' + o.kind.text, player.x, player.y - 14);
      burst(o.x, o.y, o.kind.colors.m, 10);
      orbs.splice(i, 1);
    }
  }

  if (!portal.open && enemies.length === 0) {
    portal.open = true;
    msg = { text: 'Floor clear! Find the portal', t: 3 };
  }
  if (portal.open && Math.hypot(player.x - portal.x, player.y - portal.y) < 9) nextFloor();

  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  particles = particles.filter(p => p.life > 0);
  for (const t of texts) { t.y -= 8 * dt; t.life -= dt; }
  texts = texts.filter(t => t.life > 0);
  shake = Math.max(0, shake - dt * 12);

  // camera follows the hero, clamped to the world
  const tx = clamp(player.x - W / 2, 0, world.cols * TILE - W);
  const ty = clamp(player.y - H / 2, 0, world.rows * TILE - H);
  const k = 1 - Math.exp(-dt * 9);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
}

// ---- draw ----
function shadow(x, y, rx) {
  ctx.fillStyle = 'rgba(20,30,10,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.45, 0, 0, Math.PI * 2); ctx.fill();
}

function drawSword(px, py, ang) {
  const s = player.range / 24;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(ang + Math.PI / 2);
  ctx.drawImage(SPR.sword, -3.5 * s, -17.5 * s, 7 * s, 21 * s);
  ctx.restore();
}

function drawHero() {
  const s = player.swing;
  const q = s ? s.t / s.dur : 0;
  const lunge = s ? Math.sin(Math.min(q, 1) * Math.PI) * 2.5 : 0;
  const hx = player.x + (s ? Math.cos(s.a) * lunge : 0);
  const hy = player.y + (s ? Math.sin(s.a) * lunge : 0);
  const bob = player.walk ? Math.abs(Math.sin(player.walk)) * 1.5 : 0;
  const frame = player.walk ? (Math.floor(player.walk / 2.2) % 2 ? 'walkA' : 'walkB') : 'idle';

  // sword pose: resting over the back, or mid-swing
  let ang, px, py;
  if (s) {
    const [a0, a1] = swingAngles(s);
    ang = a0 + (a1 - a0) * ease(Math.min(q, 1));
    px = hx + Math.cos(s.a) * 3; py = hy + 1 + Math.sin(s.a) * 2;
  } else {
    ang = (player.face > 0 ? -2.1 : -1.04) + Math.sin(time * 3) * 0.04;
    px = hx + player.face * 5; py = hy + 1 - bob;
  }
  const behind = s ? Math.sin(ang) < 0 : true;

  shadow(player.x, player.y + 6, 5);
  if (behind) drawSword(px, py, ang);
  ctx.save();
  if (player.hurt > 0 && Math.floor(time * 20) % 2) ctx.filter = 'brightness(3)';
  ctx.translate(Math.round(hx), Math.round(hy - 9 - bob));
  if (player.face < 0) ctx.scale(-1, 1);
  ctx.drawImage(SPR.hero[frame], -8, 0);
  ctx.restore();
  if (!behind) drawSword(px, py, ang);

  if (s) {
    // glowing crescent that chases the blade
    const [a0, a1] = swingAngles(s);
    const head = ease(Math.min(q, 1)), tail = ease(clamp(q - 0.55, 0, 1));
    if (head > tail) {
      const R = player.range * 0.92;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = 'rgba(170,220,255,0.4)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(px, py, R, a0 + (a1 - a0) * tail, a0 + (a1 - a0) * head, s.dir < 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, R + 1, a0 + (a1 - a0) * tail, a0 + (a1 - a0) * head, s.dir < 0); ctx.stroke();
    }
  }
}

function arrowTo(tx, ty, color) {
  const sx = tx - cam.x, sy = ty - cam.y;
  if (sx > 8 && sx < W - 8 && sy > 8 && sy < H - 8) return;
  const dx = sx - W / 2, dy = sy - H / 2;
  const k = Math.min((W / 2 - 12) / (Math.abs(dx) || 1e-6), (H / 2 - 12) / (Math.abs(dy) || 1e-6));
  ctx.save();
  ctx.translate(W / 2 + dx * k, H / 2 + dy * k);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = color; ctx.strokeStyle = '#2a1f33'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0b12';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(scale, 0, 0, scale, offX, offY);
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();

  // ---- world (camera space) ----
  const cx = Math.round(cam.x), cy = Math.round(cam.y);
  const sx = shake ? Math.round((Math.random() - 0.5) * shake) : 0, sy = shake ? Math.round((Math.random() - 0.5) * shake) : 0;
  ctx.save();
  ctx.translate(-cx + sx, -cy + sy);
  ctx.drawImage(staticLayer, cx, cy, W, H, cx, cy, W, H);

  const fi = Math.floor(time * 6) % 2;
  for (const l of lights) {
    const x = l.x * TILE, y = l.y * TILE;
    if (x < cx - 30 || x > cx + W + 30 || y < cy - 30 || y > cy + H + 30) continue;
    ctx.fillStyle = `rgba(255,190,80,${0.12 + 0.04 * fi})`;
    ctx.beginPath(); ctx.arc(x + 8, y + 6, 22, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(l.t === T.FIRE ? SPR.fire[fi] : SPR.torch, x, y);
  }

  // portal: dull and sealed until the floor is cleared
  for (let py = -8; py < 8; py++) {
    for (let px = -8; px < 8; px++) {
      const d = Math.hypot(px + 0.5, (py + 0.5) * 1.15);
      if (d > 7.5) continue;
      const band = Math.floor(d - time * 6 + 40) % 3;
      ctx.fillStyle = d > 6.5 ? '#2a1f33'
        : portal.open ? (band === 0 ? '#ffffff' : band === 1 ? '#5cd6e6' : '#8a4fd0')
        : (band === 0 ? '#555a68' : '#3d4150');
      ctx.fillRect(portal.x + px, portal.y + py, 1, 1);
    }
  }

  const list = [];
  for (const o of orbs) list.push({ y: o.y, fn: () => {
    const bob = Math.sin(o.t * 4) * 1.5;
    shadow(o.x, o.y + 3, 3);
    ctx.drawImage(o.kind.sprite, Math.round(o.x - 4), Math.round(o.y - 5 + bob));
  } });
  for (const e of enemies) list.push({ y: e.y, fn: () => {
    const s = e.type.size, bob = Math.abs(Math.sin(e.phase)) * 1.5;
    shadow(e.x, e.y + 5, s / 3);
    ctx.save();
    if (e.flash > 0) ctx.filter = 'brightness(3)';
    ctx.drawImage(SPR[e.type.sprite], Math.round(e.x - s / 2), Math.round(e.y - s / 2 - bob - (s - 16) / 2), s, s);
    ctx.restore();
    if (e.hp < e.maxHp) {
      ctx.fillStyle = '#000'; ctx.fillRect(Math.round(e.x - 6), Math.round(e.y - s / 2 - 4), 12, 2);
      ctx.fillStyle = '#4ade80'; ctx.fillRect(Math.round(e.x - 6), Math.round(e.y - s / 2 - 4), Math.max(0, Math.round(12 * e.hp / e.maxHp)), 2);
    }
  } });
  list.push({ y: player.y, fn: drawHero });
  list.sort((a, b) => a.y - b.y).forEach(i => i.fn());

  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life * 3, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
  }
  ctx.globalAlpha = 1;

  ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
  for (const t of texts) {
    ctx.globalAlpha = Math.min(1, t.life * 2);
    ctx.fillStyle = '#2a1f33'; ctx.fillText(t.text, t.x + 0.5, t.y + 0.5);
    ctx.fillStyle = '#fff'; ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // ---- screen space ----
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.72);
  vg.addColorStop(0, 'rgba(10,20,5,0)'); vg.addColorStop(1, 'rgba(10,20,5,0.4)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  if (enemies.length) {
    let best = null, bd = 1e9;
    for (const e of enemies) { const d = Math.hypot(e.x - player.x, e.y - player.y); if (d < bd) { bd = d; best = e; } }
    arrowTo(best.x, best.y, '#e5484d');
  } else arrowTo(portal.x, portal.y, '#5cd6e6');

  if (stick.active && stick.ox > -900) {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(stick.ox, stick.oy, STICK_R, 0, Math.PI * 2); ctx.stroke();
    const l = Math.min(Math.hypot(stick.dx, stick.dy), STICK_R), a = Math.atan2(stick.dy, stick.dx);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.arc(stick.ox + Math.cos(a) * l, stick.oy + Math.sin(a) * l, 7, 0, Math.PI * 2); ctx.fill();
  }

  ctx.font = 'bold 7px monospace';
  ctx.fillStyle = '#2a1f33'; ctx.fillRect(5, 5, 52, 8);
  ctx.fillStyle = '#4a1a24'; ctx.fillRect(6, 6, 50, 6);
  ctx.fillStyle = '#e5484d'; ctx.fillRect(6, 6, Math.max(0, Math.round(50 * player.hp / player.maxHp)), 6);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'right';
  ctx.fillText('Floor ' + floor, W - 6, 12);
  ctx.textAlign = 'left';
  ctx.fillText(portal.open ? 'Portal open' : 'Foes ' + enemies.length, 6, 22);

  if (msg.t > 0) {
    ctx.globalAlpha = Math.min(1, msg.t); ctx.textAlign = 'center';
    ctx.fillStyle = '#2a1f33'; ctx.fillText(msg.text, W / 2 + 0.5, 40.5);
    ctx.fillStyle = '#fff'; ctx.fillText(msg.text, W / 2, 40);
    ctx.globalAlpha = 1;
  }
  if (banner > 0) {
    ctx.globalAlpha = Math.min(1, banner);
    ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#2a1f33'; ctx.fillText('FLOOR ' + floor, W / 2 + 1, 81);
    ctx.fillStyle = '#fff'; ctx.fillText('FLOOR ' + floor, W / 2, 80);
    ctx.globalAlpha = 1;
  }
  if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }

  if (state === 'dead') {
    ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace'; ctx.fillText('YOU DIED', W / 2, 140);
    ctx.font = 'bold 9px monospace'; ctx.fillText('Reached floor ' + floor, W / 2, 160);
    ctx.fillStyle = '#7cc460'; ctx.fillText('Tap to retry', W / 2, 190);
  }
  ctx.restore();
}

// ---- input (touch + mouse via pointer events) ----
const toLogical = e => {
  const dpr = devicePixelRatio || 1;
  return { x: (e.clientX * dpr - offX) / scale, y: (e.clientY * dpr - offY) / scale };
};
cv.addEventListener('pointerdown', e => {
  if (state === 'dead') { newRun(); return; }
  if (stick.active) return;
  const p = toLogical(e);
  Object.assign(stick, { active: true, id: e.pointerId, ox: p.x, oy: p.y, dx: 0, dy: 0 });
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => {
  if (!stick.active || e.pointerId !== stick.id) return;
  const p = toLogical(e);
  stick.dx = p.x - stick.ox; stick.dy = p.y - stick.oy;
});
const release = e => { if (e.pointerId === stick.id) { stick.active = false; stick.dx = stick.dy = 0; } };
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', release);

const keys = {};
function kb() {
  const dx = (keys.d || keys.ArrowRight ? 1 : 0) - (keys.a || keys.ArrowLeft ? 1 : 0);
  const dy = (keys.s || keys.ArrowDown ? 1 : 0) - (keys.w || keys.ArrowUp ? 1 : 0);
  if (dx || dy) Object.assign(stick, { active: true, id: 'kb', ox: -999, oy: -999, dx: dx * STICK_R, dy: dy * STICK_R });
  else if (stick.id === 'kb') { stick.active = false; stick.dx = stick.dy = 0; }
}
addEventListener('keydown', e => { keys[e.key] = true; kb(); });
addEventListener('keyup', e => { keys[e.key] = false; kb(); });

let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
newRun();
requestAnimationFrame(frame);

// hooks for automated tests
window.__game = {
  get state() { return state; },
  get floor() { return floor; },
  get enemies() { return enemies.length; },
  get orbs() { return orbs.length; },
  get portal() { return portal; },
  get hp() { return player.hp; },
  get size() { return [world.cols, world.rows]; },
  get cam() { return [cam.x, cam.y]; },
  get player() { return [player.x, player.y]; },
  get enemyList() { return enemies.map(e => [e.x, e.y]); },
  teleport(x, y) { player.x = x; player.y = y; },
  killAll() { enemies.forEach(e => { e.hp = 0; }); },
};

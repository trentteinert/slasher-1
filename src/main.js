import { buildSprites, orbSprite } from './sprites.js';
import { TILE, COLS, ROWS, T, isSolid, genFloor, distanceField } from './world.js';

const W = COLS * TILE, H = ROWS * TILE;
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

let seed, floor, world, staticLayer, field, fieldT;
let player, enemies, slashes, particles, orbs, texts, toSpawn, spawnTimer, portal, state, shake, time, banner, fade;
const stick = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
const STICK_R = 22;

function newRun() {
  seed = (Math.random() * 1e9) | 0;
  floor = 0;
  player = { x: 0, y: 0, r: 7, cr: 4, hp: 100, maxHp: 100, speed: 60, dmg: 10, range: 26, arc: Math.PI * 0.9, cd: 0.55, t: 0, hurt: 0, face: -Math.PI / 2, walk: 0 };
  nextFloor();
}

function nextFloor() {
  floor++;
  world = genFloor(seed + floor * 7919);
  buildStatic();
  player.x = world.spawn.tx * TILE + TILE / 2;
  player.y = world.spawn.ty * TILE + TILE / 2;
  player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.2);
  enemies = []; slashes = []; particles = []; orbs = []; texts = [];
  portal = null; shake = 0; time = 0;
  toSpawn = Math.min(40, 5 + floor * 3);
  spawnTimer = 0.6;
  banner = 1.6; fade = 1;
  fieldT = 0;
  state = 'play';
}

function buildStatic() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const t = world.grid[y][x];
      const v = world.variant[y][x];
      g.drawImage(t === T.WATER ? SPR.water[v & 1] : SPR.grass[v], x * TILE, y * TILE);
    }
  }
  // trees and rocks drawn row by row so lower ones overlap upper ones
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const t = world.grid[y][x];
      if (t === T.TREE) g.drawImage(SPR.tree[(x * 7 + y * 3) % 2], x * TILE, y * TILE);
      else if (t === T.ROCK) g.drawImage(SPR.rock, x * TILE, y * TILE);
    }
  }
  staticLayer = c;
}

// ---- collision ----
function solidAt(x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
  return isSolid(world.grid[ty][tx]);
}
const blocked = (x, y, r) => solidAt(x - r, y - r) || solidAt(x + r, y - r) || solidAt(x - r, y + r) || solidAt(x + r, y + r);
function move(e, dx, dy) {
  if (!blocked(e.x + dx, e.y, e.cr)) e.x += dx;
  if (!blocked(e.x, e.y + dy, e.cr)) e.y += dy;
}

// ---- spawning & combat ----
function pickType() {
  const r = Math.random();
  if (floor >= 3 && r < 0.12) return 'brute';
  if (floor >= 2 && r < 0.4) return 'bulb';
  return 'chomper';
}

function spawnEnemy() {
  const far = world.reach.filter(t => Math.hypot(t.tx * TILE + 8 - player.x, t.ty * TILE + 8 - player.y) > 70);
  const t = far[Math.floor(Math.random() * far.length)];
  if (!t) return;
  const type = ENEMY_TYPES[pickType()];
  const hpMul = 1 + 0.25 * (floor - 1), dmgMul = 1 + 0.15 * (floor - 1), spdMul = 1 + 0.04 * (floor - 1);
  const hp = type.hp * hpMul;
  enemies.push({ type, x: t.tx * TILE + 8, y: t.ty * TILE + 8, cr: type.cr, hp, maxHp: hp, speed: type.speed * spdMul * (0.9 + Math.random() * 0.2), dmg: type.dmg * dmgMul, flash: 0, kx: 0, ky: 0, phase: Math.random() * 6 });
  burst(t.tx * TILE + 8, t.ty * TILE + 8, '#c5e87a', 6);
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

function slash(target) {
  player.face = Math.atan2(target.y - player.y, target.x - player.x);
  slashes.push({ life: 0.14, max: 0.14, a: player.face, arc: player.arc, range: player.range });
  for (const e of enemies) {
    const dx = e.x - player.x, dy = e.y - player.y, d = Math.hypot(dx, dy);
    if (d > player.range + e.cr) continue;
    let da = Math.atan2(dy, dx) - player.face;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > player.arc / 2 && d > e.cr + 2) continue;
    e.hp -= player.dmg;
    e.flash = 0.1;
    e.kx = (dx / (d || 1)) * 90; e.ky = (dy / (d || 1)) * 90;
    burst(e.x, e.y, '#ff6b6b', 3);
  }
}

function dropOrb(x, y) {
  orbs.push({ x, y, kind: ORBS[Math.floor(Math.random() * ORBS.length)], t: Math.random() * 6 });
}

function say(text, x, y) { texts.push({ text, x, y, life: 1.1 }); }

// ---- update ----
function update(dt) {
  time += dt;
  banner = Math.max(0, banner - dt);
  fade = Math.max(0, fade - dt * 2.5);
  if (state === 'dead') return;

  // movement
  const len = Math.hypot(stick.dx, stick.dy);
  if (stick.active && len > 2) {
    const m = Math.min(len, STICK_R) / STICK_R;
    move(player, (stick.dx / len) * player.speed * m * dt, (stick.dy / len) * player.speed * m * dt);
    player.walk += dt * 10;
  } else player.walk = 0;
  player.hurt = Math.max(0, player.hurt - dt);

  // auto slash
  player.t -= dt;
  if (player.t <= 0) {
    const t = nearestEnemy(player.range + 10);
    if (t) { slash(t); player.t = player.cd; }
  }

  // path field toward the player, refreshed a few times a second
  fieldT -= dt;
  if (fieldT <= 0) {
    field = distanceField(world.grid, Math.floor(player.x / TILE), Math.floor(player.y / TILE));
    fieldT = 0.2;
  }

  if (toSpawn > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) { spawnEnemy(); toSpawn--; spawnTimer = Math.max(0.35, 1.0 - floor * 0.05); }
  }

  for (const e of enemies) {
    const tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE);
    let gx = player.x, gy = player.y;
    const d = field[ty * COLS + tx];
    if (d > 1) {
      let best = d, bx = tx, by = ty;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const nd = field[ny * COLS + nx];
        if (nd >= 0 && nd < best) { best = nd; bx = nx; by = ny; }
      }
      gx = bx * TILE + TILE / 2; gy = by * TILE + TILE / 2;
    }
    const dx = gx - e.x, dy = gy - e.y, dist = Math.hypot(dx, dy) || 1;
    move(e, (dx / dist * e.speed + e.kx) * dt, (dy / dist * e.speed + e.ky) * dt);
    e.kx *= 0.85; e.ky *= 0.85;
    e.flash = Math.max(0, e.flash - dt);
    e.phase += dt * 8;

    const pd = Math.hypot(player.x - e.x, player.y - e.y);
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

  // orbs
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    o.t += dt;
    const dx = player.x - o.x, dy = player.y - o.y, d = Math.hypot(dx, dy);
    if (d < 40) { o.x += (dx / d) * 70 * dt; o.y += (dy / d) * 70 * dt; }
    if (d < 8) {
      o.kind.apply(player);
      say(o.kind.name + ' ' + o.kind.text, player.x, player.y - 12);
      burst(o.x, o.y, o.kind.colors.m, 10);
      orbs.splice(i, 1);
    }
  }

  // floor clear -> portal appears at the far end of the map
  if (!portal && toSpawn === 0 && enemies.length === 0) {
    const sorted = [...world.reach].sort((a, b) => b.dist - a.dist);
    const t = sorted[Math.floor(Math.random() * Math.min(5, sorted.length))];
    portal = { x: t.tx * TILE + 8, y: t.ty * TILE + 8 };
    say('Floor clear! Find the portal', W / 2, H / 2 - 30);
  }
  if (portal && Math.hypot(player.x - portal.x, player.y - portal.y) < 9) nextFloor();

  for (const s of slashes) s.life -= dt;
  slashes = slashes.filter(s => s.life > 0);
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  particles = particles.filter(p => p.life > 0);
  for (const t of texts) { t.y -= 8 * dt; t.life -= dt; }
  texts = texts.filter(t => t.life > 0);
  shake = Math.max(0, shake - dt * 12);
}

// ---- draw ----
function shadow(x, y, rx) {
  ctx.fillStyle = 'rgba(20,30,10,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.45, 0, 0, Math.PI * 2); ctx.fill();
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0b12';
  ctx.fillRect(0, 0, cv.width, cv.height);
  const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
  ctx.setTransform(scale, 0, 0, scale, offX + sx * scale, offY + sy * scale);
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();

  ctx.drawImage(staticLayer, 0, 0);

  // fires and torches (animated)
  const fi = Math.floor(time * 6) % 2;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const t = world.grid[y][x];
      if (t === T.FIRE || t === T.TORCH) {
        ctx.fillStyle = `rgba(255,190,80,${0.12 + 0.04 * fi})`;
        ctx.beginPath(); ctx.arc(x * TILE + 8, y * TILE + 6, 22, 0, Math.PI * 2); ctx.fill();
        ctx.drawImage(t === T.FIRE ? SPR.fire[fi] : SPR.torch, x * TILE, y * TILE);
      }
    }
  }

  if (portal) {
    for (let py = -8; py < 8; py++) {
      for (let px = -8; px < 8; px++) {
        const d = Math.hypot(px + 0.5, (py + 0.5) * 1.15);
        if (d > 7.5) continue;
        const band = Math.floor(d - time * 6 + 40) % 3;
        ctx.fillStyle = d > 6.5 ? '#2a1f33' : band === 0 ? '#ffffff' : band === 1 ? '#5cd6e6' : '#8a4fd0';
        ctx.fillRect(portal.x + px, portal.y + py, 1, 1);
      }
    }
  }

  // depth-sorted entities
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
  list.push({ y: player.y, fn: () => {
    const bob = player.walk ? Math.abs(Math.sin(player.walk)) * 1.5 : 0;
    shadow(player.x, player.y + 6, 5);
    ctx.save();
    if (player.hurt > 0 && Math.floor(time * 20) % 2) ctx.filter = 'brightness(3)';
    ctx.drawImage(SPR.hero, Math.round(player.x - 8), Math.round(player.y - 9 - bob));
    ctx.restore();
  } });
  list.sort((a, b) => a.y - b.y).forEach(i => i.fn());

  for (const s of slashes) {
    const k = s.life / s.max;
    ctx.fillStyle = `rgba(255,255,255,${0.55 * k})`;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.arc(player.x, player.y, s.range * (1.1 - 0.1 * k), s.a - s.arc / 2, s.a + s.arc / 2);
    ctx.closePath(); ctx.fill();
  }
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 3));
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

  if (stick.active && stick.ox > -900) {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(stick.ox, stick.oy, STICK_R, 0, Math.PI * 2); ctx.stroke();
    const l = Math.min(Math.hypot(stick.dx, stick.dy), STICK_R), a = Math.atan2(stick.dy, stick.dx);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.arc(stick.ox + Math.cos(a) * l, stick.oy + Math.sin(a) * l, 7, 0, Math.PI * 2); ctx.fill();
  }

  // HUD
  ctx.fillStyle = '#2a1f33'; ctx.fillRect(5, 5, 52, 8);
  ctx.fillStyle = '#4a1a24'; ctx.fillRect(6, 6, 50, 6);
  ctx.fillStyle = '#e5484d'; ctx.fillRect(6, 6, Math.max(0, Math.round(50 * player.hp / player.maxHp)), 6);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'right';
  ctx.fillText('Floor ' + floor, W - 6, 12);
  ctx.textAlign = 'left';
  ctx.fillText(portal ? 'Portal open' : 'Foes ' + (enemies.length + toSpawn), 6, 22);

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
  const dt = Math.min(0.05, (now - last) / 1000);
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
  teleport(x, y) { player.x = x; player.y = y; },
  killAll() { toSpawn = 0; enemies.forEach(e => { e.hp = 0; }); },
};

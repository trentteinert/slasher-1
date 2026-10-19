import { buildSprites, orbSprite } from './sprites.js';
import { TILE, T, isSolid, genFloor, floorSize, distanceField } from './world.js';
import { Renderer } from './render.js';

// Game logic runs in "pixels" (16 per tile); src/render.js draws it as a 3D world with
// sprite characters, and the HUD is a 2D canvas laid over the top.
const glCanvas = document.getElementById('gl');
const hud = document.getElementById('hud');
const hctx = hud.getContext('2d');
const SPR = buildSprites();
const renderer = new Renderer(glCanvas, SPR);

let VW = innerWidth, VH = innerHeight;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  VW = innerWidth; VH = innerHeight;
  hud.width = Math.round(VW * dpr); hud.height = Math.round(VH * dpr);
  hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderer.resize(VW, VH, dpr);
}
addEventListener('resize', resize);

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

let seed, floor, world, field, fieldT;
let player, enemies, particles, orbs, texts, portal, state, shake, time, banner, fade, msg;
const cam = { x: 0, y: 0 };
const stick = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
const STICK_R = 48; // CSS pixels

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

function newRun() {
  seed = Number(new URLSearchParams(location.search).get('seed')) || (Math.random() * 1e9) | 0;
  floor = 0;
  player = { x: 0, y: 0, r: 7, cr: 4, hp: 100, maxHp: 100, speed: 60, dmg: 10, range: 24, arc: Math.PI * 0.9, cd: 0.55, t: 0, hurt: 0, aim: Math.PI / 2, walk: 0, dir: 1, swing: null };
  nextFloor();
}

function nextFloor() {
  floor++;
  const { cols, rows } = floorSize(floor);
  world = genFloor(seed + floor * 7919, cols, rows);
  renderer.buildWorld(world);
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
  const f = camTarget(); cam.x = f.x; cam.y = f.y;
}

// camera focus: a little ahead of the hero, kept inside the map
const fit = (v, lo, hi) => lo > hi ? (lo + hi) / 2 : clamp(v, lo, hi);
function camTarget() {
  return {
    x: fit(player.x, 5.5 * TILE, world.cols * TILE - 5.5 * TILE),
    y: fit(player.y - 20, 6 * TILE, world.rows * TILE - 6 * TILE),
  };
}

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

const rgb = c => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
function burst(x, y, color, n, h = 6) {
  const c = rgb(color);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 45;
    particles.push({ x, y, h, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vh: 20 + Math.random() * 50, life: 0.3 + Math.random() * 0.25, rgb: c });
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
  player.aim = a;
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

function dropOrb(x, y) {
  orbs.push({ x, y, kind: ORBS[Math.floor(Math.random() * ORBS.length)], t: Math.random() * 6 });
}
function say(text, x, y) { texts.push({ text, x, y, rise: 0, life: 1.4 }); }

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
    if (!player.swing) player.aim = Math.atan2(stick.dy, stick.dx);
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
      say(o.kind.name + ' ' + o.kind.text, player.x, player.y);
      burst(o.x, o.y, o.kind.colors.m, 10);
      orbs.splice(i, 1);
    }
  }

  if (!portal.open && enemies.length === 0) {
    portal.open = true;
    msg = { text: 'Floor clear! Find the portal', t: 3 };
  }
  if (portal.open && Math.hypot(player.x - portal.x, player.y - portal.y) < 9) nextFloor();

  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.h = Math.max(0, p.h + p.vh * dt); p.vh -= 160 * dt; p.life -= dt; }
  particles = particles.filter(p => p.life > 0);
  for (const t of texts) { t.rise += 14 * dt; t.life -= dt; }
  texts = texts.filter(t => t.life > 0);
  shake = Math.max(0, shake - dt * 12);

  const ct = camTarget();
  const k = 1 - Math.exp(-dt * 7);
  cam.x += (ct.x - cam.x) * k;
  cam.y += (ct.y - cam.y) * k;
}

// ---- HUD (2D overlay) ----
const ease = p => 1 - (1 - p) * (1 - p);
const swingAngles = s => [s.a - s.dir * (player.arc / 2 + 0.5), s.a + s.dir * (player.arc / 2)];

function label(text, x, y, size, color = '#fff', align = 'center') {
  hctx.font = `bold ${size}px ui-monospace, Menlo, Consolas, monospace`;
  hctx.textAlign = align;
  hctx.fillStyle = '#12101a'; hctx.fillText(text, x + 1, y + 1);
  hctx.fillStyle = color; hctx.fillText(text, x, y);
}

function arrowTo(wx, wy, color) {
  const p = renderer.project(wx, wy, 8);
  const m = 26;
  if (!p.behind && p.x > m && p.x < VW - m && p.y > m + 30 && p.y < VH - m) return;
  const cx = VW / 2, cy = VH / 2;
  let dx = p.x - cx, dy = p.y - cy;
  if (p.behind) { dx = -dx; dy = -dy; }
  const k = Math.min((VW / 2 - m) / (Math.abs(dx) || 1e-6), (VH / 2 - m - 20) / (Math.abs(dy) || 1e-6));
  hctx.save();
  hctx.translate(cx + dx * k, cy + dy * k);
  hctx.rotate(Math.atan2(dy, dx));
  hctx.fillStyle = color; hctx.strokeStyle = '#12101a'; hctx.lineWidth = 2;
  hctx.beginPath(); hctx.moveTo(14, 0); hctx.lineTo(-10, -11); hctx.lineTo(-10, 11); hctx.closePath(); hctx.fill(); hctx.stroke();
  hctx.restore();
}

function drawHud() {
  hctx.clearRect(0, 0, VW, VH);
  const u = Math.max(1, Math.min(VW / 390, VH / 844) * 1.0);

  // enemy health bars
  for (const e of enemies) {
    if (e.hp >= e.maxHp) continue;
    const p = renderer.project(e.x, e.y, e.type.size + 4);
    const w = 28 * u;
    hctx.fillStyle = '#000'; hctx.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, 6 * u);
    hctx.fillStyle = '#4ade80'; hctx.fillRect(p.x - w / 2, p.y, Math.max(0, w * e.hp / e.maxHp), 4 * u);
  }
  for (const t of texts) {
    const p = renderer.project(t.x, t.y, 26 + t.rise);
    hctx.globalAlpha = Math.min(1, t.life * 2);
    label(t.text, p.x, p.y, 13 * u);
  }
  hctx.globalAlpha = 1;

  if (enemies.length) {
    let best = null, bd = 1e9;
    for (const e of enemies) { const d = Math.hypot(e.x - player.x, e.y - player.y); if (d < bd) { bd = d; best = e; } }
    arrowTo(best.x, best.y, '#e5484d');
  } else arrowTo(portal.x, portal.y, '#5cd6e6');

  if (stick.active && stick.ox > -900) {
    hctx.strokeStyle = 'rgba(255,255,255,0.35)'; hctx.lineWidth = 2;
    hctx.beginPath(); hctx.arc(stick.ox, stick.oy, STICK_R, 0, Math.PI * 2); hctx.stroke();
    const l = Math.min(Math.hypot(stick.dx, stick.dy), STICK_R), a = Math.atan2(stick.dy, stick.dx);
    hctx.fillStyle = 'rgba(255,255,255,0.45)';
    hctx.beginPath(); hctx.arc(stick.ox + Math.cos(a) * l, stick.oy + Math.sin(a) * l, 18, 0, Math.PI * 2); hctx.fill();
  }

  // bars and labels
  const top = 12 * u + (window.visualViewport ? 0 : 0);
  hctx.fillStyle = '#12101a'; hctx.fillRect(12, top, 128 * u, 16 * u);
  hctx.fillStyle = '#4a1a24'; hctx.fillRect(14, top + 2, 124 * u, 12 * u);
  hctx.fillStyle = '#e5484d'; hctx.fillRect(14, top + 2, Math.max(0, 124 * u * player.hp / player.maxHp), 12 * u);
  label('Floor ' + floor, VW - 12, top + 14 * u, 15 * u, '#fff', 'right');
  label(portal.open ? 'Portal open' : 'Foes ' + enemies.length, 12, top + 38 * u, 13 * u, '#fff', 'left');

  if (msg.t > 0) { hctx.globalAlpha = Math.min(1, msg.t); label(msg.text, VW / 2, VH * 0.2, 15 * u); hctx.globalAlpha = 1; }
  if (banner > 0) { hctx.globalAlpha = Math.min(1, banner); label('FLOOR ' + floor, VW / 2, VH * 0.3, 34 * u); hctx.globalAlpha = 1; }
  if (fade > 0) { hctx.fillStyle = `rgba(0,0,0,${fade})`; hctx.fillRect(0, 0, VW, VH); }
  if (state === 'dead') {
    hctx.fillStyle = 'rgba(0,0,0,0.78)'; hctx.fillRect(0, 0, VW, VH);
    label('YOU DIED', VW / 2, VH * 0.38, 36 * u);
    label('Reached floor ' + floor, VW / 2, VH * 0.38 + 34 * u, 18 * u);
    label('Tap to retry', VW / 2, VH * 0.38 + 80 * u, 18 * u, '#7cc460');
  }
}

function draw() {
  renderer.render({ time, cam, player, enemies, orbs, portal, particles, shake });
  drawHud();
}

// ---- input (touch + mouse via pointer events; coordinates are CSS pixels) ----
const toLogical = e => ({ x: e.clientX, y: e.clientY });
hud.addEventListener('pointerdown', e => {
  if (state === 'dead') { newRun(); return; }
  if (stick.active) return;
  const p = toLogical(e);
  Object.assign(stick, { active: true, id: e.pointerId, ox: p.x, oy: p.y, dx: 0, dy: 0 });
  hud.setPointerCapture(e.pointerId);
});
hud.addEventListener('pointermove', e => {
  if (!stick.active || e.pointerId !== stick.id) return;
  const p = toLogical(e);
  stick.dx = p.x - stick.ox; stick.dy = p.y - stick.oy;
});
const release = e => { if (e.pointerId === stick.id) { stick.active = false; stick.dx = stick.dy = 0; } };
hud.addEventListener('pointerup', release);
hud.addEventListener('pointercancel', release);

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
resize();
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
  teleport(x, y) { player.x = x; player.y = y; const f = camTarget(); cam.x = f.x; cam.y = f.y; },
  findTile(t) { for (let y = 0; y < world.rows; y++) for (let x = 0; x < world.cols; x++) if (world.grid[y][x] === t) return [x * TILE + 8, y * TILE + 8]; return null; },
  killAll() { enemies.forEach(e => { e.hp = 0; }); },
};

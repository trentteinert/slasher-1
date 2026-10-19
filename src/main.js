import { buildSprites } from './sprites.js';
import { TILE, T, isSolid, genFloor, floorSize, distanceField } from './world.js';
import { Renderer } from './render.js';
import { RARITIES, UPGRADES, newMods, rollOrbTier, rollChoices, applyChoice, cardName, cardText } from './upgrades.js';

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

// Orbs drop from monsters; their colour is their tier, and the tier decides how good the
// three power-up choices you get on pickup tend to be.
const ORB_COLORS = ['#cfd4dc', '#52c86a', '#4d8dff', '#ffb020'];

const ENEMY_TYPES = {
  chomper: { sprite: 'chomper', hp: 14, speed: 30, dmg: 8, size: 16, cr: 4, drop: 0.25, ai: 'chase' },
  bulb: { sprite: 'bulb', hp: 8, speed: 44, dmg: 6, size: 16, cr: 4, drop: 0.2, ai: 'chase' },
  brute: { sprite: 'brute', hp: 50, speed: 24, dmg: 16, size: 24, cr: 6, drop: 0.9, ai: 'chase' },
  // keeps its distance and spits slow purple spores
  spitter: { sprite: 'spitter', hp: 12, speed: 26, dmg: 5, size: 16, cr: 4, drop: 0.35, ai: 'ranged' },
  // flies over everything in erratic swarms
  bat: { sprite: 'batA', frames: ['batA', 'batB'], hp: 5, speed: 62, dmg: 5, size: 16, cr: 3, drop: 0.1, ai: 'swarm', fly: true },
  // winds up (flashes red), then dashes in a straight line
  charger: { sprite: 'charger', hp: 30, speed: 28, dmg: 14, size: 16, cr: 5, drop: 0.5, ai: 'charger' },
};
// a boss every 5th floor, cycling through these (and getting tougher with the floor number)
const BOSSES = [
  { name: 'Great Chomper', sprite: 'bossChomper', ai: 'bossChomper', hp: 260, speed: 20, dmg: 18 },
  { name: 'Stone Golem', sprite: 'bossGolem', ai: 'bossGolem', hp: 340, speed: 18, dmg: 22 },
  { name: 'Venom Chomper', sprite: 'bossVenom', ai: 'bossChomper', hp: 300, speed: 24, dmg: 20 },
  { name: 'Frost Golem', sprite: 'bossFrost', ai: 'bossGolem', hp: 380, speed: 21, dmg: 24 },
].map(b => ({ ...b, size: 32, cr: 11, depth: 6, kb: 0.1, boss: true, aggro: 150, drop: 0 }));
const AGGRO = 90;

let seed, floor, world, field, fieldT;
let player, enemies, particles, orbs, texts, portal, state, shake, time, banner, fade, msg;
let shots = [], fx = [], bossRef = null;
let uiT = 0, choice = null, pending = [], buttons = [], howto = false;
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
let best = Number(store.get('slasher-best', 0)) || 0;
let qualityPref = store.get('slasher-q', 'auto');
const cam = { x: 0, y: 0 };
const stick = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
const STICK_R = 48; // CSS pixels

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

function newRun() {
  seed = Number(new URLSearchParams(location.search).get('seed')) || (Math.random() * 1e9) | 0;
  floor = 0;
  player = { x: 0, y: 0, r: 7, cr: 4, hp: 100, maxHp: 100, speed: 60, dmg: 10, range: 24, arc: Math.PI * 0.9, cd: 0.55, t: 0, hurt: 0, aim: Math.PI / 2, walk: 0, dir: 1, swing: null,
    mods: newMods(), picks: [], swings: 0, queued: 0, guardReady: false, guardT: 0, guardEver: false, whirlT: 3, bladeA: 0, blades: [] };
  pending = []; choice = null;
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
  enemies = []; particles = []; orbs = []; texts = []; shots = []; fx = []; bossRef = null;
  shake = 0; time = 0; msg = { text: '', t: 0 };
  populate();
  const far = [...world.reach].sort((a, b) => b.dist - a.dist).slice(0, 5);
  const p = far[Math.floor(Math.random() * far.length)];
  portal = { x: p.tx * TILE + 8, y: p.ty * TILE + 8, open: false };
  if (floor % 5 === 0) placeBoss();
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
  if (e.type && e.type.fly) { e.x = clamp(e.x + dx, 8, world.cols * TILE - 8); e.y = clamp(e.y + dy, 8, world.rows * TILE - 8); return; }
  if (!blocked(e.x + dx, e.y, e.cr)) e.x += dx;
  if (!blocked(e.x, e.y + dy, e.cr)) e.y += dy;
}

// ---- enemies ----
function pickType() {
  const pool = [['chomper', 3]];
  if (floor >= 2) pool.push(['bulb', 1.6], ['spitter', 1.3]);
  if (floor >= 3) pool.push(['bat', 1.2], ['brute', 0.7]);
  if (floor >= 4) pool.push(['charger', 1]);
  let r = Math.random() * pool.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of pool) if ((r -= w) < 0) return k;
  return 'chomper';
}

function makeEnemy(type, x, y) {
  const hpMul = 1 + (type.boss ? 0.2 : 0.25) * (floor - 1), dmgMul = 1 + 0.15 * (floor - 1), spdMul = 1 + 0.04 * (floor - 1);
  const hp = type.hp * hpMul;
  const e = { type, x, y, cr: type.cr, hp, maxHp: hp, speed: type.speed * (type.boss ? 1 : spdMul) * rand(0.9, 1.1), dmg: type.dmg * dmgMul, flash: 0, tele: 0, kx: 0, ky: 0, phase: rand(0, 6), seed: rand(0, 6.28), aggro: false, state: 'walk', st: 0, cool: rand(0.6, 2), slamCd: 3, sumCd: 7, rockCd: 2, chargeCd: 5, dashA: 0 };
  enemies.push(e);
  return e;
}
const addEnemy = (x, y, key = pickType()) => makeEnemy(ENEMY_TYPES[key], x, y);

// Enemies wait in packs scattered across the floor and wake up when you get close.
function populate() {
  const total = Math.round(Math.min(60, 6 + 4 * floor) * (floor % 5 === 0 ? 0.5 : 1)); // boss floors have fewer minions
  let far = world.reach.filter(t => t.dist >= 9);
  if (!far.length) far = world.reach;
  for (let guard = 0; enemies.length < total && guard < 500; guard++) {
    const c = far[Math.floor(Math.random() * far.length)];
    const key = pickType();
    const n = Math.min(total - enemies.length, key === 'bat' ? 4 : 1 + Math.floor(Math.random() * 3));
    for (let i = 0; i < n; i++) {
      const tx = c.tx + Math.floor(rand(-2, 3)), ty = c.ty + Math.floor(rand(-2, 3));
      if (tx < 1 || ty < 1 || tx >= world.cols - 1 || ty >= world.rows - 1 || isSolid(world.grid[ty][tx])) continue;
      addEnemy(tx * TILE + 8 + rand(-3, 3), ty * TILE + 8 + rand(-3, 3), key);
    }
  }
}

// the boss guards the portal
function placeBoss() {
  const def = BOSSES[(floor / 5 - 1) % BOSSES.length];
  const px = Math.floor(portal.x / TILE), py = Math.floor(portal.y / TILE);
  const spots = world.reach.filter(t => { const d = Math.abs(t.tx - px) + Math.abs(t.ty - py); return d >= 4 && d <= 8; });
  const t = spots.length ? spots[Math.floor(Math.random() * spots.length)] : world.reach[world.reach.length - 1];
  bossRef = makeEnemy(def, t.tx * TILE + 8, t.ty * TILE + 8);
  msg = { text: `BOSS: ${def.name}`, t: 4 };
}

function hurtPlayer(dmg) {
  if (player.hurt > 0 || state !== 'play') return;
  const m = player.mods;
  if (player.guardReady) { // Aegis barrier soaks the hit
    player.guardReady = false; player.guardT = m.guardCd; player.hurt = 0.5;
    fx.push({ kind: 'shock', x: player.x, y: player.y, r: 26, t: 0, dur: 0.3, color: '#7fc8ff' });
    say('Blocked!', player.x, player.y);
    return;
  }
  player.hp -= dmg; player.hurt = 0.6; shake = Math.max(shake, 3);
  burst(player.x, player.y, '#7dd3fc', 6);
  if (m.retaliate) nova(player.x, player.y, 36, player.dmg * m.retaliate, '#9be86a');
  if (player.hp <= 0) {
    if (m.phoenix > 0) { // Phoenix Heart: cheat death once
      m.phoenix--; player.hp = player.maxHp * 0.6; player.hurt = 1.5;
      nova(player.x, player.y, 72, player.dmg * 5, '#ff8a30');
      shake = 6; msg = { text: 'Phoenix Heart!', t: 2.5 };
    } else endRun();
  }
}

function endRun() {
  state = 'dead'; uiT = 0; stick.active = false; stick.dx = stick.dy = 0;
  if (floor > best) { best = floor; store.set('slasher-best', String(best)); }
}

function fireShot(x, y, a, speed, r, dmg, color) {
  shots.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r, dmg, life: 3.2, color });
}

function summon(boss, n) {
  for (let i = 0; i < n; i++) {
    for (let tries = 0; tries < 8; tries++) {
      const a = rand(0, 6.28), d = rand(22, 40), x = boss.x + Math.cos(a) * d, y = boss.y + Math.sin(a) * d;
      if (blocked(x, y, 4)) continue;
      addEnemy(x, y, 'chomper').aggro = true;
      burst(x, y, '#c5e87a', 8);
      break;
    }
  }
}

// wind up (telegraph) -> dash in a straight line -> rest. Returns a velocity, or null while walking.
function dashStep(e, dt, toP, o) {
  if (e.state === 'wind') {
    e.st -= dt; e.tele = clamp(1 - e.st / o.wind, 0, 1);
    if (e.st > 0.18) e.dashA = toP; // keeps aiming until the last instant
    if (e.st <= 0) { e.state = 'dash'; e.st = o.dash; }
    return [0, 0];
  }
  if (e.state === 'dash') {
    e.st -= dt;
    const dx = Math.cos(e.dashA), dy = Math.sin(e.dashA);
    if (solidAt(e.x + dx * 7, e.y + dy * 7) || e.st <= 0) { e.state = 'rest'; e.st = o.rest; if (e.type.boss) shake = Math.max(shake, 3); }
    return [dx * o.speed, dy * o.speed];
  }
  if (e.state === 'rest') {
    e.st -= dt;
    if (e.st <= 0) { e.state = 'walk'; e.cool = o.cool; }
    return [0, 0];
  }
  return null;
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
function startSwing(target, o = {}) {
  const a = Math.atan2(target.y - player.y, target.x - player.x);
  player.dir *= -1; // alternate swing direction for a combo feel
  player.aim = a;
  player.swing = { t: 0, dur: o.dur ?? Math.min(0.2, player.cd * 0.5), a, dir: player.dir, hit: false, arc: o.arc, range: o.range };
  const m = player.mods;
  if (!o.second && !o.whirl) {
    player.swings++;
    if (m.waveEvery && player.swings % m.waveEvery === 0) fireWave(a);
    if (m.multi && Math.random() < m.multi) player.queued = 0.22;
  }
}

function swingHit(s) {
  const range = s.range ?? player.range, arc = s.arc ?? player.arc;
  for (const e of enemies) {
    const dx = e.x - player.x, dy = e.y - player.y, d = Math.hypot(dx, dy);
    if (d > range + e.cr) continue;
    let da = Math.atan2(dy, dx) - s.a;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (arc < Math.PI * 2 && Math.abs(da) > arc / 2 && d > e.cr + 2) continue;
    hitEnemy(e, player.dmg, { kx: (dx / (d || 1)) * 90, ky: (dy / (d || 1)) * 90 });
  }
  shake = Math.max(shake, 1);
}

// one place for every hit, so power-up effects (crit, burn, chain...) apply to all of them
function hitEnemy(e, base, o = {}) {
  const m = player.mods;
  let dmg = base, crit = false;
  if (!o.noProc) {
    if (m.berserk) dmg *= 1 + m.berserk * (1 - player.hp / player.maxHp);
    if (m.slayer && (e.type.boss || e.type === ENEMY_TYPES.brute)) dmg *= 1 + m.slayer;
    if (m.crit && Math.random() < m.crit) { dmg *= 2; crit = true; }
  }
  e.hp -= dmg; e.aggro = true; e.flash = 0.1;
  if (o.kx !== undefined) { const kb = e.type.kb ?? 1; e.kx = o.kx * kb; e.ky = o.ky * kb; }
  burst(e.x, e.y, crit ? '#ffd84a' : '#ffffff', crit ? 6 : 2);
  burst(e.x, e.y, '#ff6b6b', 3);
  if (o.noProc) return;
  if (m.lifesteal) player.hp = Math.min(player.maxHp, player.hp + m.lifesteal);
  if (m.burn) { e.burn = 3; e.burnDps = Math.max(e.burnDps || 0, m.burn); }
  if (m.chill) { e.slow = 2; e.slowMul = Math.min(e.slowMul ?? 1, 1 - m.chill); }
  if (m.exec && e.hp > 0 && !e.type.boss && e.hp < e.maxHp * m.exec) { e.hp = 0; say('Executed!', e.x, e.y); }
  if (m.chain && Math.random() < m.chain) {
    let best2 = null, bd = 56;
    for (const n of enemies) { if (n === e || n.hp <= 0) continue; const d = Math.hypot(n.x - e.x, n.y - e.y); if (d < bd) { bd = d; best2 = n; } }
    if (best2) {
      fx.push({ kind: 'bolt', x: e.x, y: e.y, x2: best2.x, y2: best2.y, t: 0, dur: 0.18 });
      hitEnemy(best2, dmg * 0.6, { noProc: true });
    }
  }
}

// shockwave around a point (explosions, retaliation, phoenix)
function nova(x, y, r, dmg, color) {
  fx.push({ kind: 'shock', x, y, r, t: 0, dur: 0.35, color });
  burst(x, y, color || '#ffffff', 14, 8);
  for (const e of enemies) {
    const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
    if (d < r + e.cr) hitEnemy(e, dmg, { noProc: true, kx: (dx / (d || 1)) * 110, ky: (dy / (d || 1)) * 110 });
  }
}

function fireWave(a) {
  shots.push({ friendly: true, x: player.x, y: player.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, r: 9, dmg: player.dmg * 0.6, life: 0.55, color: '#8fe9ff', hit: new Set() });
}

function dropOrb(x, y, minTier = 0, tier) {
  tier = tier ?? rollOrbTier(floor, minTier);
  orbs.push({ x, y, tier, color: ORB_COLORS[tier], t: Math.random() * 6 });
}
function say(text, x, y) { texts.push({ text, x, y, rise: 0, life: 1.4 }); }

// ---- run state: menu, choosing a power-up, paused ----
function startRun() { newRun(); state = 'play'; uiT = 0; }
function goMenu() { newRun(); state = 'menu'; uiT = 0; howto = false; }
function togglePause() {
  if (state === 'play') { state = 'paused'; stick.active = false; stick.dx = stick.dy = 0; }
  else if (state === 'paused') state = 'play';
}
function cyclePref() {
  qualityPref = { auto: 'high', high: 'low', low: 'auto' }[qualityPref] || 'auto';
  store.set('slasher-q', qualityPref);
  applyPref();
}
function applyPref() {
  renderer.locked = qualityPref !== 'auto';
  if (qualityPref === 'high') renderer.setQuality(2);
  if (qualityPref === 'low') renderer.setQuality(0);
}

// the pop-up: three power-ups, each with its own rarity; the orb's tier tilts the odds
function openChoice(tier) {
  const cards = rollChoices(player, tier, floor);
  if (!cards.length) return;
  state = 'choose'; uiT = 0; stick.active = false; stick.dx = stick.dy = 0;
  choice = { cards, tier, t0: 0 };
}
function choose(i) {
  if (state !== 'choose' || !choice || uiT < 0.35) return;
  const c = choice.cards[i];
  if (!c) return;
  applyChoice(player, c);
  if (c.up.id === 'guard' && !player.guardEver) { player.guardEver = true; player.guardReady = true; }
  say(cardName(c), player.x, player.y);
  burst(player.x, player.y, RARITIES[c.rarity].color, 14, 10);
  choice = null;
  if (pending.length) openChoice(pending.shift()); else { state = 'play'; uiT = 0; }
}

// menu background: the camera drifts over the generated forest
function menuStep(dt) {
  time += dt;
  const span = world.rows * TILE;
  const tx = fit(world.cols * TILE * (0.5 + 0.25 * Math.sin(time * 0.07)), 5.5 * TILE, world.cols * TILE - 5.5 * TILE);
  const ty = fit(span * (0.18 + 0.64 * (Math.sin(time * 0.1 - 1) + 1) / 2), 6 * TILE, span - 6 * TILE);
  const k = Math.min(1, dt * 2);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  for (const e of enemies) e.phase += dt * 2;
}

// ---- update ----
function update(dt) {
  uiT += dt;
  if (state === 'menu') { menuStep(dt); return; }
  if (state === 'paused' || state === 'choose') return;
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

  // power-up effects that tick over time
  const m = player.mods;
  if (m.regen) player.hp = Math.min(player.maxHp, player.hp + m.regen * dt);
  if (m.guardCd && !player.guardReady) { player.guardT -= dt; if (player.guardT <= 0) player.guardReady = true; }
  if (m.whirlCd) {
    player.whirlT -= dt;
    if (player.whirlT <= 0) {
      const t = nearestEnemy(player.range * 1.3 + 8);
      if (t) { startSwing(t, { arc: Math.PI * 2, range: player.range * 1.3, dur: 0.32, whirl: true }); player.whirlT = m.whirlCd; } else player.whirlT = 0.3;
    }
  }
  if (player.queued > 0) {
    player.queued -= dt;
    if (player.queued <= 0) { const t = nearestEnemy(player.range + 12); if (t) startSwing(t, { second: true }); }
  }
  player.blades.length = 0;
  if (m.blades) {
    player.bladeA += dt * 4.2;
    for (const e of enemies) e.bladeCd = (e.bladeCd || 0) - dt;
    for (let i = 0; i < m.blades; i++) {
      const a = player.bladeA + (i * Math.PI * 2) / m.blades;
      const bx = player.x + Math.cos(a) * 24, by = player.y + Math.sin(a) * 24;
      player.blades.push({ x: bx, y: by, a });
      for (const e of enemies) {
        if (e.bladeCd > 0 || Math.hypot(e.x - bx, e.y - by) > 7 + e.cr) continue;
        e.bladeCd = 0.35;
        hitEnemy(e, player.dmg * 0.5, { noProc: true, kx: Math.cos(a) * 70, ky: Math.sin(a) * 70 });
      }
      for (let k = shots.length - 1; k >= 0; k--) if (!shots[k].friendly && Math.hypot(shots[k].x - bx, shots[k].y - by) < 8) { burst(shots[k].x, shots[k].y, shots[k].color, 4, 10); shots.splice(k, 1); }
    }
  }

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
    const t = e.type;
    const pd = Math.hypot(player.x - e.x, player.y - e.y);
    if (!e.aggro && pd < (t.aggro || AGGRO)) {
      e.aggro = true;
      for (const o of enemies) if (!o.aggro && Math.hypot(o.x - e.x, o.y - e.y) < 40) o.aggro = true; // wake the pack
    }
    e.flash = Math.max(0, e.flash - dt);
    e.phase += dt * (e.aggro ? 8 : 2);
    e.tele = 0;
    if (e.burn > 0) { e.burn -= dt; e.hp -= e.burnDps * dt; e.aggro = true; if (Math.random() < dt * 12) burst(e.x, e.y, '#ff9a3c', 1, 8); }
    if (!e.aggro) continue;

    // path toward the hero (flyers just go straight at them)
    const toP = Math.atan2(player.y - e.y, player.x - e.x);
    let ux = Math.cos(toP), uy = Math.sin(toP);
    if (!t.fly) {
      const tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE);
      const d = field[ty * cols + tx];
      if (d > 1) {
        let best = d, bx = tx, by = ty;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = tx + dx, ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= world.rows) continue;
          const nd = field[ny * cols + nx];
          if (nd >= 0 && nd < best) { best = nd; bx = nx; by = ny; }
        }
        const gx = bx * TILE + TILE / 2 - e.x, gy = by * TILE + TILE / 2 - e.y, gl = Math.hypot(gx, gy) || 1;
        ux = gx / gl; uy = gy / gl;
      }
    }
    let vx = ux * e.speed, vy = uy * e.speed;
    let dmgMul = 1;

    switch (t.ai) {
      case 'swarm': { // weave side to side
        const w = Math.sin(e.phase * 0.8 + e.seed);
        vx += -uy * w * e.speed * 0.9; vy += ux * w * e.speed * 0.9;
        break;
      }
      case 'ranged': { // back off when close, circle at mid range, spit from afar
        const px = Math.cos(toP), py = Math.sin(toP);
        if (pd < 70) { vx = -px * e.speed; vy = -py * e.speed; }
        else if (pd < 110) { vx = -py * e.speed * 0.6 * (e.seed > 3 ? 1 : -1); vy = px * e.speed * 0.6 * (e.seed > 3 ? 1 : -1); }
        e.cool -= dt;
        if (pd < 150 && e.cool <= 0) { fireShot(e.x, e.y, toP, 78, 4, e.dmg, '#c07bff'); e.cool = 1.9; }
        break;
      }
      case 'charger': {
        const v = dashStep(e, dt, toP, { wind: 0.6, dash: 0.5, rest: 0.8, speed: 150, cool: rand(1.5, 3) });
        if (v) { [vx, vy] = v; if (e.state === 'dash') dmgMul = 1.3; }
        else { vx *= 0.7; vy *= 0.7; e.cool -= dt; if (e.cool <= 0 && pd < 110 && pd > 25) { e.state = 'wind'; e.st = 0.6; e.dashA = toP; } }
        break;
      }
      case 'bossChomper': {
        if (e.state === 'slam') {
          vx = vy = 0; e.st -= dt; e.tele = clamp(1 - e.st / 0.9, 0, 1);
          if (e.st <= 0) { // impact
            if (pd < 56 + player.cr) hurtPlayer(e.dmg * 1.2);
            fx.push({ kind: 'shock', x: e.x, y: e.y, r: 64, t: 0, dur: 0.35 });
            shake = 6; e.state = 'walk'; e.slamCd = 4.5;
          }
        } else if (e.state === 'roar') {
          vx = vy = 0; e.st -= dt; e.tele = 0.5;
          if (e.st <= 0) e.state = 'walk';
        } else {
          e.slamCd -= dt; e.sumCd -= dt;
          if (e.slamCd <= 0 && pd < 90) { e.state = 'slam'; e.st = 0.9; fx.push({ kind: 'slam', x: e.x, y: e.y, r: 56, t: 0, dur: 0.9, owner: e }); }
          else if (e.sumCd <= 0 && enemies.length < 26) { summon(e, 3); e.sumCd = 9; e.state = 'roar'; e.st = 0.6; }
        }
        break;
      }
      case 'bossGolem': {
        const v = dashStep(e, dt, toP, { wind: 0.9, dash: 0.8, rest: 1.2, speed: 135, cool: 0 });
        if (v) { [vx, vy] = v; if (e.state === 'dash') dmgMul = 1.4; if (e.state === 'rest' && e.st > 1.15) e.chargeCd = 7; }
        else {
          e.rockCd -= dt; e.chargeCd -= dt;
          if (e.chargeCd <= 0 && pd < 170) { e.state = 'wind'; e.st = 0.9; e.dashA = toP; }
          else if (e.rockCd <= 0 && pd < 190) {
            for (let k = -1; k <= 1; k++) fireShot(e.x, e.y, toP + k * 0.28, 85, 5, e.dmg * 0.55, '#aab0c8');
            e.rockCd = 3.2;
          }
        }
        break;
      }
    }

    if (e.slow > 0) { e.slow -= dt; vx *= e.slowMul; vy *= e.slowMul; if (e.slow <= 0) e.slowMul = 1; }
    move(e, (vx + e.kx) * dt, (vy + e.ky) * dt);
    e.kx *= 0.85; e.ky *= 0.85;

    if (pd < e.cr + player.cr + 2) hurtPlayer(e.dmg * dmgMul);
    if (state === 'dead') return;
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
    burst(e.x, e.y, '#fbbf24', e.type.boss ? 30 : 8, e.type.boss ? 14 : 6);
    if (e.type.boss) {
      dropOrb(e.x, e.y, 2, Math.random() < 0.25 ? 3 : 2); // a boss always drops at least a rare orb
      for (let k = 0; k < 2; k++) dropOrb(e.x + rand(-12, 12), e.y + rand(-12, 12), 1);
      shake = 7; msg = { text: `${e.type.name} defeated!`, t: 3 };
      bossRef = null;
    } else if (Math.random() < e.type.drop) dropOrb(e.x, e.y, e.type === ENEMY_TYPES.brute ? 1 : 0);
    enemies.splice(i, 1);
    if (player.mods.volatile) nova(e.x, e.y, 28, player.dmg * player.mods.volatile, '#ff9a3c');
  }

  // projectiles and ground effects
  for (let i = shots.length - 1; i >= 0; i--) {
    const sh = shots[i];
    sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.life -= dt;
    let dead = sh.life <= 0 || solidAt(sh.x, sh.y);
    if (sh.friendly) { // crescent wave: pierces everything it touches once
      for (const e of enemies) {
        if (!sh.hit.has(e) && Math.hypot(e.x - sh.x, e.y - sh.y) < sh.r + e.cr) { sh.hit.add(e); hitEnemy(e, sh.dmg, { kx: sh.vx * 0.5, ky: sh.vy * 0.5 }); }
      }
    } else if (!dead && Math.hypot(player.x - sh.x, player.y - sh.y) < sh.r + player.cr + 1 && player.hurt <= 0) { hurtPlayer(sh.dmg); dead = true; }
    if (dead) { burst(sh.x, sh.y, sh.color, 4, 10); shots.splice(i, 1); }
  }
  for (const f of fx) f.t += dt;
  fx = fx.filter(f => f.t < f.dur && !(f.owner && f.owner.hp <= 0));

  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    o.t += dt;
    const dx = player.x - o.x, dy = player.y - o.y, d = Math.hypot(dx, dy);
    if (d < 40) { o.x += (dx / d) * 70 * dt; o.y += (dy / d) * 70 * dt; }
    if (d < 8) {
      burst(o.x, o.y, o.color, 12, 10);
      pending.push(o.tier);
      orbs.splice(i, 1);
    }
  }
  if (pending.length && state === 'play') openChoice(pending.shift());

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

// ---- UI helpers ----
let u = 1; // UI scale, set each frame
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const rr = (x, y, w, h, r) => {
  hctx.beginPath(); hctx.moveTo(x + r, y);
  hctx.arcTo(x + w, y, x + w, y + h, r); hctx.arcTo(x + w, y + h, x, y + h, r);
  hctx.arcTo(x, y + h, x, y, r); hctx.arcTo(x, y, x + w, y, r); hctx.closePath();
};
function wrapText(text, maxW, font) {
  hctx.font = font;
  const lines = []; let line = '';
  for (const w of text.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (hctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
function button(x, y, w, h, text, fn, o = {}) {
  buttons.push({ x, y, w, h, fn });
  const g = hctx.createLinearGradient(0, y, 0, y + h);
  if (o.primary) { g.addColorStop(0, '#ffd45a'); g.addColorStop(1, '#e8901c'); } else { g.addColorStop(0, '#3a3552'); g.addColorStop(1, '#241f38'); }
  rr(x, y + 3 * u, w, h, 12 * u); hctx.fillStyle = 'rgba(0,0,0,0.45)'; hctx.fill();
  rr(x, y, w, h, 12 * u); hctx.fillStyle = g; hctx.fill();
  hctx.lineWidth = 2 * u; hctx.strokeStyle = o.primary ? '#fff2b0' : '#6c648f'; hctx.stroke();
  hctx.font = `bold ${(o.size || 18) * u}px ui-monospace, Menlo, Consolas, monospace`;
  hctx.textAlign = 'center'; hctx.textBaseline = 'middle';
  hctx.fillStyle = o.primary ? '#3a1d05' : '#f1eeff';
  hctx.fillText(text, x + w / 2, y + h / 2 + 1);
  hctx.textBaseline = 'alphabetic';
}
const dim = a => { hctx.fillStyle = `rgba(6,8,14,${a})`; hctx.fillRect(0, 0, VW, VH); };

function drawMenu() {
  const g = hctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, 'rgba(8,14,10,0.7)'); g.addColorStop(0.45, 'rgba(8,14,10,0.28)'); g.addColorStop(1, 'rgba(8,14,10,0.78)');
  hctx.fillStyle = g; hctx.fillRect(0, 0, VW, VH);
  const cx = VW / 2, bob = Math.sin(uiT * 1.6) * 4 * u;

  hctx.textAlign = 'center';
  hctx.font = `bold ${60 * u}px ui-monospace, Menlo, Consolas, monospace`;
  hctx.lineJoin = 'round';
  hctx.lineWidth = 9 * u; hctx.strokeStyle = '#12101a'; hctx.strokeText('SLASHER', cx, VH * 0.2 + bob + 4 * u);
  const tg = hctx.createLinearGradient(0, VH * 0.2 - 50 * u, 0, VH * 0.2 + 10 * u);
  tg.addColorStop(0, '#fff2b0'); tg.addColorStop(0.55, '#ffc23a'); tg.addColorStop(1, '#e8701c');
  hctx.fillStyle = tg; hctx.fillText('SLASHER', cx, VH * 0.2 + bob);
  label('CLIMB THE FLOORS  -  SLAY THE BOSSES', cx, VH * 0.2 + 34 * u + bob, 12 * u, '#cfe6c0');

  if (howto) {
    const w = Math.min(VW - 36, 360 * u), x = cx - w / 2, y = VH * 0.33, lines = [
      ['Drag anywhere to move.', ''],
      ['You swing at nearby enemies on your own.', ''],
      ['Clear every enemy on a floor, then step into the portal.', ''],
      ['Monsters drop glowing orbs. Grab one and pick 1 of 3 power-ups.', ''],
      ['Orb colour shows its quality: white, green, blue, gold.', ''],
      ['Power-ups come in Common, Uncommon, Rare and Legendary.', ''],
      ['A boss guards the portal every 5th floor.', ''],
    ];
    const font = `${13 * u}px ui-monospace, Menlo, Consolas, monospace`;
    const wrapped = lines.map(([t]) => wrapText(t, w - 36 * u, font));
    const h = wrapped.reduce((a, l) => a + l.length * 18 * u + 8 * u, 0) + 40 * u;
    rr(x, y, w, h, 14 * u); hctx.fillStyle = 'rgba(18,16,30,0.9)'; hctx.fill(); hctx.lineWidth = 2 * u; hctx.strokeStyle = '#6c648f'; hctx.stroke();
    let ty = y + 30 * u;
    hctx.fillStyle = '#f1eeff'; hctx.textAlign = 'left'; hctx.font = font;
    for (const l of wrapped) { for (const t of l) { hctx.fillText(t, x + 18 * u, ty); ty += 18 * u; } ty += 8 * u; }
    button(cx - 90 * u, y + h + 18 * u, 180 * u, 46 * u, 'BACK', () => { howto = false; });
    return;
  }

  const bw = 230 * u;
  button(cx - bw / 2, VH * 0.46, bw, 60 * u, 'PLAY', startRun, { primary: true, size: 24 });
  button(cx - bw / 2, VH * 0.46 + 78 * u, bw, 46 * u, 'HOW TO PLAY', () => { howto = true; });
  button(cx - bw / 2, VH * 0.46 + 134 * u, bw, 42 * u, `GRAPHICS: ${qualityPref.toUpperCase()}`, cyclePref, { size: 14 });
  label(best ? `BEST FLOOR  ${best}` : 'NO RUNS YET', cx, VH * 0.9, 14 * u, '#ffd84a');
}

function drawChoice() {
  dim(0.74);
  const cx = VW / 2;
  const cw = Math.min(VW - 28, 380 * Math.max(1, u * 0.9)), ch = clamp(VH * 0.165, 104, 142), gap = 12 * u;
  const y0 = (VH - (3 * ch + 2 * gap)) / 2 + 26 * u;
  label('CHOOSE A POWER-UP', cx, y0 - 46 * u, 21 * u, '#fff');
  label(`${RARITIES[choice.tier].name} ORB`, cx, y0 - 22 * u, 13 * u, RARITIES[choice.tier].color);

  choice.cards.forEach((c, i) => {
    const rar = RARITIES[c.rarity];
    const k = ease(clamp((uiT - 0.09 * i) / 0.28, 0, 1));
    const x = cx - cw / 2, y = y0 + i * (ch + gap) + (1 - k) * 56;
    hctx.save();
    hctx.globalAlpha = k;
    if (c.rarity >= 2) { hctx.shadowColor = rar.glow; hctx.shadowBlur = (c.rarity === 3 ? 26 : 14) * u * (0.8 + 0.2 * Math.sin(uiT * 4 + i)); }
    const bg = hctx.createLinearGradient(x, y, x + cw, y + ch);
    bg.addColorStop(0, '#1d1a2e'); bg.addColorStop(1, c.rarity === 0 ? '#191728' : c.rarity === 1 ? '#17261f' : c.rarity === 2 ? '#16233f' : '#3a2410');
    rr(x, y, cw, ch, 14 * u); hctx.fillStyle = bg; hctx.fill();
    hctx.shadowBlur = 0;
    hctx.lineWidth = (c.rarity === 3 ? 4 : 3) * u;
    if (c.rarity === 3) { // legendary border cycles through gold
      const bgG = hctx.createLinearGradient(x, y, x + cw, y + ch);
      const s0 = (uiT * 0.7) % 1;
      bgG.addColorStop(0, '#ffe58a'); bgG.addColorStop(s0, '#ff8a1c'); bgG.addColorStop(1, '#ffe58a');
      hctx.strokeStyle = bgG;
    } else hctx.strokeStyle = rar.color;
    hctx.stroke();

    // shimmer sweeping across rare and legendary cards
    if (c.rarity >= 2) {
      hctx.save(); rr(x, y, cw, ch, 14 * u); hctx.clip();
      const sx = x + ((uiT * 0.45 + i * 0.3) % 1.6 - 0.3) * cw;
      const sg = hctx.createLinearGradient(sx - 40 * u, 0, sx + 40 * u, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, c.rarity === 3 ? 'rgba(255,230,160,0.28)' : 'rgba(170,200,255,0.18)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      hctx.fillStyle = sg; hctx.fillRect(x, y, cw, ch);
      hctx.restore();
    }

    // icon medallion
    const ix = x + ch * 0.52, iy = y + ch / 2, ir = ch * 0.3;
    hctx.beginPath(); hctx.arc(ix, iy, ir, 0, Math.PI * 2);
    const ig = hctx.createRadialGradient(ix, iy - ir * 0.3, 2, ix, iy, ir);
    ig.addColorStop(0, rar.color); ig.addColorStop(1, rar.glow);
    hctx.fillStyle = ig; hctx.fill();
    hctx.lineWidth = 2 * u; hctx.strokeStyle = 'rgba(0,0,0,0.5)'; hctx.stroke();
    hctx.font = `${ch * 0.34}px ${EMOJI}`; hctx.textAlign = 'center'; hctx.textBaseline = 'middle';
    hctx.fillStyle = '#fff'; hctx.fillText(c.up.icon, ix, iy + 2);
    hctx.textBaseline = 'alphabetic';

    // text
    const tx = x + ch * 0.98, tw = cw - ch * 0.98 - 14 * u;
    hctx.textAlign = 'left';
    hctx.font = `bold ${10.5 * u}px ui-monospace, Menlo, Consolas, monospace`;
    hctx.fillStyle = rar.color; hctx.fillText(rar.name, tx, y + 22 * u);
    hctx.font = `bold ${17 * u}px ui-monospace, Menlo, Consolas, monospace`;
    hctx.fillStyle = '#fff'; hctx.fillText(cardName(c), tx, y + 43 * u);
    const lines = wrapText(cardText(c), tw, `${12.5 * u}px ui-monospace, Menlo, Consolas, monospace`);
    hctx.fillStyle = '#c9c4e0';
    lines.slice(0, 3).forEach((l, n) => hctx.fillText(l, tx, y + 64 * u + n * 16 * u));
    hctx.restore();

    buttons.push({ x, y: y0 + i * (ch + gap), w: cw, h: ch, fn: () => choose(i) });
  });
  if (pending.length) label(`+${pending.length} more orb${pending.length > 1 ? 's' : ''} waiting`, cx, y0 + 3 * ch + 2 * gap + 26 * u, 12 * u, '#cfd4dc');
}

function drawPause() {
  dim(0.7);
  const cx = VW / 2, bw = 230 * u;
  label('PAUSED', cx, VH * 0.3, 34 * u);
  button(cx - bw / 2, VH * 0.4, bw, 56 * u, 'RESUME', togglePause, { primary: true, size: 22 });
  button(cx - bw / 2, VH * 0.4 + 72 * u, bw, 46 * u, 'QUIT TO MENU', goMenu);
  button(cx - bw / 2, VH * 0.4 + 128 * u, bw, 42 * u, `GRAPHICS: ${qualityPref.toUpperCase()}`, cyclePref, { size: 14 });
  drawPicks(VH * 0.4 + 215 * u);
}

function drawDead() {
  dim(0.8);
  const cx = VW / 2, bw = 230 * u;
  label('YOU DIED', cx, VH * 0.26, 38 * u, '#ff6b6b');
  label(`Reached floor ${floor}`, cx, VH * 0.26 + 36 * u, 18 * u);
  label(floor >= best && floor > 1 ? 'NEW BEST!' : `Best floor ${best}`, cx, VH * 0.26 + 62 * u, 14 * u, '#ffd84a');
  drawPicks(VH * 0.26 + 110 * u);
  if (uiT > 0.7) {
    button(cx - bw / 2, VH * 0.58, bw, 58 * u, 'TRY AGAIN', startRun, { primary: true, size: 22 });
    button(cx - bw / 2, VH * 0.58 + 74 * u, bw, 46 * u, 'MAIN MENU', goMenu);
  }
}

// power-ups collected so far, grouped, as a row of rarity-ringed icons
function drawPicks(y, small = false) {
  const groups = new Map();
  for (const pk of player.picks) { const g = groups.get(pk.id) || { icon: pk.icon, n: 0, rarity: 0 }; g.n++; g.rarity = Math.max(g.rarity, pk.rarity); groups.set(pk.id, g); }
  if (!groups.size) return;
  const size = (small ? 17 : 24) * u, step = size + 8 * u, perRow = Math.max(1, Math.floor((VW - 24) / step));
  let n = 0;
  for (const g of groups.values()) {
    const col = n % perRow, row = Math.floor(n / perRow);
    const rowCount = Math.min(perRow, groups.size - row * perRow);
    const rows = Math.ceil(groups.size / perRow);
    const x = small ? 20 * u + col * step : VW / 2 - (rowCount * step) / 2 + step / 2 + col * step, yy = small ? y - (rows - 1 - row) * step : y + row * step;
    hctx.beginPath(); hctx.arc(x, yy, size * 0.62, 0, Math.PI * 2);
    hctx.fillStyle = 'rgba(14,12,24,0.78)'; hctx.fill();
    hctx.lineWidth = 2 * u; hctx.strokeStyle = RARITIES[g.rarity].color; hctx.stroke();
    hctx.font = `${size * 0.8}px ${EMOJI}`; hctx.textAlign = 'center'; hctx.textBaseline = 'middle'; hctx.fillStyle = '#fff';
    hctx.fillText(g.icon, x, yy + 1); hctx.textBaseline = 'alphabetic';
    if (g.n > 1) label('x' + g.n, x + size * 0.55, yy + size * 0.85, 10 * u, '#ffd84a');
    n++;
  }
}

function drawHud() {
  hctx.clearRect(0, 0, VW, VH);
  buttons.length = 0;
  u = Math.max(0.9, Math.min(VW / 390, VH / 844));
  if (state === 'menu') { drawMenu(); return; }

  // enemy health bars
  for (const e of enemies) {
    if (e.hp >= e.maxHp) continue;
    const p = renderer.project(e.x, e.y, e.type.size + 4);
    const w = 28 * u;
    hctx.fillStyle = '#000'; hctx.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, 6 * u);
    hctx.fillStyle = e.burn > 0 ? '#ff9a3c' : '#4ade80'; hctx.fillRect(p.x - w / 2, p.y, Math.max(0, w * e.hp / e.maxHp), 4 * u);
  }
  for (const t of texts) {
    const p = renderer.project(t.x, t.y, 26 + t.rise);
    hctx.globalAlpha = Math.min(1, t.life * 2);
    label(t.text, p.x, p.y, 13 * u);
  }
  hctx.globalAlpha = 1;

  if (state === 'play' || state === 'dead') {
    if (enemies.length) {
      let best2 = null, bd = 1e9;
      for (const e of enemies) { const d = Math.hypot(e.x - player.x, e.y - player.y); if (d < bd) { bd = d; best2 = e; } }
      arrowTo(best2.x, best2.y, '#e5484d');
    } else arrowTo(portal.x, portal.y, '#5cd6e6');
  }

  if (stick.active && stick.ox > -900) {
    hctx.strokeStyle = 'rgba(255,255,255,0.35)'; hctx.lineWidth = 2;
    hctx.beginPath(); hctx.arc(stick.ox, stick.oy, STICK_R, 0, Math.PI * 2); hctx.stroke();
    const l = Math.min(Math.hypot(stick.dx, stick.dy), STICK_R), a = Math.atan2(stick.dy, stick.dx);
    hctx.fillStyle = 'rgba(255,255,255,0.45)';
    hctx.beginPath(); hctx.arc(stick.ox + Math.cos(a) * l, stick.oy + Math.sin(a) * l, 18, 0, Math.PI * 2); hctx.fill();
  }

  // bars and labels
  const top = 12 * u;
  hctx.fillStyle = '#12101a'; hctx.fillRect(12, top, 128 * u, 16 * u);
  hctx.fillStyle = '#4a1a24'; hctx.fillRect(14, top + 2, 124 * u, 12 * u);
  hctx.fillStyle = '#e5484d'; hctx.fillRect(14, top + 2, Math.max(0, 124 * u * player.hp / player.maxHp), 12 * u);
  if (player.guardReady) { hctx.strokeStyle = '#7fc8ff'; hctx.lineWidth = 2; hctx.strokeRect(13, top + 1, 126 * u, 14 * u); }
  label('Floor ' + floor, VW - 12, top + 14 * u, 15 * u, '#fff', 'right');
  label(portal.open ? 'Portal open' : 'Foes ' + enemies.length, 12, top + 38 * u, 13 * u, '#fff', 'left');
  if (state === 'play') {
    const bx = VW - 12 - 36 * u, by = top + 24 * u;
    buttons.push({ x: bx - 6, y: by - 6, w: 36 * u + 12, h: 36 * u + 12, fn: togglePause });
    rr(bx, by, 36 * u, 36 * u, 9 * u); hctx.fillStyle = 'rgba(18,16,30,0.7)'; hctx.fill();
    hctx.lineWidth = 2; hctx.strokeStyle = '#6c648f'; hctx.stroke();
    hctx.fillStyle = '#f1eeff'; hctx.fillRect(bx + 11 * u, by + 9 * u, 5 * u, 18 * u); hctx.fillRect(bx + 20 * u, by + 9 * u, 5 * u, 18 * u);
  }

  if (bossRef) {
    const bw = Math.min(VW * 0.8, 320), bx = (VW - bw) / 2, by = top + 62 * u;
    label(bossRef.type.name, VW / 2, by - 6 * u, 13 * u, '#ffd84a');
    hctx.fillStyle = '#12101a'; hctx.fillRect(bx - 2, by, bw + 4, 14 * u);
    hctx.fillStyle = '#4a1a24'; hctx.fillRect(bx, by + 2, bw, 10 * u);
    hctx.fillStyle = '#e5484d'; hctx.fillRect(bx, by + 2, Math.max(0, bw * bossRef.hp / bossRef.maxHp), 10 * u);
  }
  if (state === 'play' && player.picks.length) drawPicks(VH - 22 * u, true);
  if (msg.t > 0) { hctx.globalAlpha = Math.min(1, msg.t); label(msg.text, VW / 2, VH * 0.2, 15 * u); hctx.globalAlpha = 1; }
  if (banner > 0 && state === 'play') { hctx.globalAlpha = Math.min(1, banner); label('FLOOR ' + floor, VW / 2, VH * 0.3, 34 * u); hctx.globalAlpha = 1; }
  if (fade > 0) { hctx.fillStyle = `rgba(0,0,0,${fade})`; hctx.fillRect(0, 0, VW, VH); }

  if (state === 'choose') drawChoice();
  else if (state === 'paused') drawPause();
  else if (state === 'dead') drawDead();
}

function draw() {
  renderer.render({ time, cam, player, enemies, orbs, portal, particles, shots, fx, blades: player.blades, shake });
  drawHud();
}

// ---- input (touch + mouse via pointer events; coordinates are CSS pixels) ----
const toLogical = e => ({ x: e.clientX, y: e.clientY });
hud.addEventListener('pointerdown', e => {
  const p = toLogical(e);
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i];
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { b.fn(); return; }
  }
  if (state !== 'play' || stick.active) return;
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

addEventListener('keydown', e => {
  if (e.repeat) return;
  if (state === 'choose' && '123'.includes(e.key)) choose(Number(e.key) - 1);
  else if (e.key === 'Escape' || e.key === 'p') togglePause();
  else if ((e.key === 'Enter' || e.key === ' ') && state === 'menu') startRun();
  else if (e.key === 'r' && state === 'dead') startRun();
});

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
  const raw = now - last;
  const dt = clamp(raw / 1000, 0, 0.05);
  last = now;
  if (raw > 0) renderer.adapt(raw);
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
resize();
applyPref();
newRun();
state = new URLSearchParams(location.search).has('play') ? 'play' : 'menu'; // ?play skips the menu
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });
requestAnimationFrame(frame);

// hooks for automated tests
window.__game = {
  get stats() { const i = renderer.gl.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }; },
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
  get quality() { return renderer.quality; },
  setQuality(q) { renderer.setQuality(q); },
  gotoFloor(n) { floor = n - 1; nextFloor(); },
  spawn(key, dx = 40, dy = -30) { const e = addEnemy(player.x + dx, player.y + dy, key); e.aggro = true; return e.hp; },
  get boss() { return bossRef ? { hp: bossRef.hp, max: bossRef.maxHp, state: bossRef.state, x: bossRef.x, y: bossRef.y } : null; },
  get shots() { return shots.length; },
  hurtMe(d) { player.hp -= d; },
  start() { startRun(); },
  grant(id, rarity) { const up = UPGRADES.find(x => x.id === id); applyChoice(player, { up, rarity, value: up.v[rarity] }); if (id === 'guard' && !player.guardEver) { player.guardEver = true; player.guardReady = true; } },
  pause() { togglePause(); },
  hurt(d) { hurtPlayer(d); },
  get guard() { return player.guardReady; },
  die() { player.hp = 0; hurtPlayer(1); },
  get choice() { return choice ? choice.cards.map(c => ({ name: cardName(c), rarity: c.rarity, text: cardText(c) })) : null; },
  choose(i) { uiT = 1; choose(i); },
  giveOrb(tier = 0) { dropOrb(player.x + 2, player.y, 0, tier); },
  get picks() { return player.picks.map(p => p.id); },
  get mods() { return player.mods; },
  get blades() { return player.blades.length; },
  setHp(v) { player.hp = v; },
  killAll() { enemies.forEach(e => { e.hp = 0; }); },
};

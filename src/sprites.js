// All art is defined as pixel maps (one char per pixel) so it can be edited as text.
// '.' is transparent; letters map to a palette. Environment art has no black outlines
// (darker shades of the same hue instead); the hero is shaded the same way.
const PAL = {
  k: '#2a1f33', // outline (enemies keep a soft dark outline so they pop off the ground)
  y: '#ffd84a', O: '#f08a24',
  r: '#d9363e', R: '#a02632',
  g: '#4a9d4f', G: '#2f6b3a',
  n: '#8a5a3c', N: '#5a3a28',
  s: '#8d8f98', S: '#c5c7cf',
  W: '#ffffff', c: '#5cd6e6',
  u: '#8a4fd0', U: '#53268f',
  m: '#d63fd6', M: '#8a2a99',
  C: '#f4e3b8', D: '#cfb98a', // cream
  p: '#3a1030', Q: '#b8621a',
};

export function makeSprite(rows, pal = PAL, w = 16, h = 16) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (rows.length !== h) throw new Error(`sprite has ${rows.length} rows, expected ${h}`);
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`sprite row ${y} is ${row.length} wide, expected ${w}: ${row}`);
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      if (!pal[ch]) throw new Error(`unknown palette char '${ch}'`);
      g.fillStyle = pal[ch];
      g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

const BLANK = '................';
const pad = (rows, top = 0) => [...Array(top).fill(BLANK), ...rows, ...Array(16 - top - rows.length).fill(BLANK)];
// R(n, s): s placed n pixels from the left, padded out to 16 wide
const R = (n, s, w = 16) => '.'.repeat(n) + s + '.'.repeat(w - n - s.length);

// ---- hero: spiky-haired armored fighter, top-down 3/4 view (down / up / side) ----
const HERO_PAL = {
  h: '#232a6b', H: '#3b4fb0', d: '#141845',
  s: '#d49a58', S: '#a8703a', e: '#14102a',
  a: '#7d8ab8', A: '#aab5da', z: '#4d5788',
  r: '#c0314a', R: '#7e1c34',
  p: '#2c4fa8', P: '#1c3270',
  b: '#8a5430', B: '#5a3520',
};
const HERO_DOWN = [
  R(5, 'h..h.h'),
  R(4, 'hhhhhhhh'),
  R(3, 'hhHhhhhHhh'),
  R(3, 'hhhhhhhhhh'),
  R(3, 'hdssssssdh'),
  R(4, 'sessssse'),
  R(4, 'sssSSsss'),
  R(5, 'ssssss'),
  R(2, 'zAAaarrraaAz'),
  R(2, 'zAaaaaaaaaAz'),
  R(2, 'zaaazzzzaaaz'),
  R(2, 'zaaaaaaaaaaz'),
  R(2, 'sszaaaaaazss'),
  R(4, 'zaaaaaaz'),
  R(4, 'pppPPppp'),
];
const HERO_UP = [
  R(5, 'h..h.h'),
  R(4, 'hhhhhhhh'),
  R(3, 'hhHhhhhHhh'),
  R(3, 'hhhhhhhhhh'),
  R(3, 'hhhhhhhhhh'),
  R(4, 'hhhhhhhh'),
  R(4, 'hdhhhhdh'),
  R(5, 'dhhhhd'),
  R(2, 'zAAaaaaaaAAz'),
  R(2, 'zArrrrrrrrAz'),
  R(2, 'zarrrrrrrraz'),
  R(2, 'zarrRrrRrraz'),
  R(2, 'zarrrrrrrraz'),
  R(3, 'RrrrRRrrrR'),
  R(4, 'pppPPppp'),
];
const HERO_SIDE = [
  R(4, 'h..h.h'),
  R(3, 'hhhhhhhh'),
  R(3, 'hhHhhhhhh'),
  R(3, 'hhhhhhhhs'),
  R(4, 'hhhsssss'),
  R(4, 'hhsssess'),
  R(5, 'hsssssS'),
  R(6, 'dsss'),
  R(3, 'rrzAAaaAz'),
  R(3, 'rrrzAaaaz'),
  R(3, 'rRrzzzzaz'),
  R(3, 'rrrzaaaaz'),
  R(3, 'RrrzaaaSs'),
  R(4, 'rrzaaaaz'),
  R(5, 'pppPpp'),
];
const LEGS_FRONT = {
  idle: [R(4, 'ppp..ppp'), R(4, 'ppp..ppp'), R(4, 'bbb..bbb'), R(3, 'bBBb..bBBb')],
  walkA: [R(4, 'ppp..ppp'), R(4, 'pp...ppp'), R(4, 'bb...bbb'), R(3, 'bBb...bBBb')],
  walkB: [R(4, 'ppp..ppp'), R(4, 'ppp...pp'), R(4, 'bbb...bb'), R(3, 'bBBb...bBb')],
};
const LEGS_SIDE = {
  idle: [R(5, 'pppppp'), R(5, 'pppppp'), R(5, 'bbbbbb'), R(4, 'bBBBBbb')],
  walkA: [R(4, 'ppp..ppp'), R(3, 'ppp...ppp'), R(3, 'bbb...bbb'), R(2, 'bBBb...bBBb')],
  walkB: [R(5, 'ppp.pp'), R(5, 'pp..pp'), R(5, 'bb..bb'), R(4, 'bBb..bBb')],
};

const SHIELD_PAL = { o: '#e8873a', r: '#c0314a', R: '#7e1c34', y: '#ffd84a' };
const SHIELD = [
  '..oooo..',
  '.orrrro.',
  'orrRRrro',
  'orRyyRro',
  'orRyyRro',
  'orrRRrro',
  '.orrrro.',
  '..oooo..',
];

// Big sword, pointing up; pivot is the middle of the grip (x=2.5, y=16.5).
const SWORD_PAL = { g: '#aab5da', W: '#ffffff', y: '#ffd84a', o: '#c9801e', n: '#8a5a3c', z: '#6b7396' };
const SWORD = [
  '..W..',
  '.gWg.',
  '.gWg.',
  '.gWg.',
  '.gWg.',
  '.gWg.',
  '.gWg.',
  '.gWg.',
  '.gWg.',
  '.gWg.',
  '.gWg.',
  '.gWz.',
  '.zWz.',
  'oyyyo',
  '.ooo.',
  '..n..',
  '..n..',
  '..n..',
  '.yyy.',
];

const CHOMPER = pad([
  '....kkkkkkkk....',
  '...kOOOOOOOOk...',
  '..kOOOkkkkOOOk..',
  '.kOOOkkWkWkkOOk.',
  '.kOOkkkkkkkkOOk.',
  '.kOOkWkkkkWkOOk.',
  '..kOOkkkkkkOOk..',
  '...kOOOOOOOOk...',
  '..kkkGkkkkGkkk..',
  '.kGGkGggggGkGGk.',
  'kGgGGGggggGGGgGk',
  '.kkgGGGGGGGGgkk.',
  '...kkkkkkkkkk...',
], 1);

const BULB = pad([
  '...kkkkkkkkkk...',
  '..kOOkOOOkOOOk..',
  '.kOkOOOkOOOOkOk.',
  '.kkkkkkkkkkkkkk.',
  '..kkrrrrrrrrkk..',
  '.kkrrrWrrrrrrkk.',
  '.krrrrrrrrWrrrk.',
  '.krrrWrrrrrrrRk.',
  '..krrrrrrrrRRk..',
  '...kRRRRRRRRk...',
  '..kkkkkkkkkkkk..',
  '.kgGk......kgGk.',
  '..kkk......kkk..',
], 2);

const ROCK_PAL = { a: '#5e463e', q: '#8b6b5c', Q: '#b99a85' };
const ROCK = pad([
  '.....aaaaaa.....',
  '...aaQQQQQqaa...',
  '..aQQQQqqqqqqa..',
  '.aQQqqqqqqqqqqa.',
  '.aqqqqqqqqqqqqa.',
  '..aaqqqqqqqqaa..',
  '...aaaaaaaaaa...',
], 8);

const FIRE_BASE = [
  '......y.........',
  '.....yyy........',
  '.....yOy........',
  '....yyOyy.......',
  '....yOOOy.......',
  '...yOOyOOy......',
  '...OOyyyOO......',
  '..kNOOyOONk.....',
  '.kNNNkkkNNNk....',
  '..kkkNNNkkk.....',
];
const FIRE_A = pad(FIRE_BASE, 3);
const FIRE_B = pad([
  '.......y........',
  '......yyy.......',
  '.....yyOy.......',
  '.....yOOy.......',
  '....yyOOyy......',
  '....yOyyOy......',
  '...yOOyyOOy.....',
  '...OOyyyyOO.....',
  '..kNOOyOONk.....',
  '.kNNNkkkNNNk....',
  '..kkkNNNkkk.....',
], 2);

const TORCH = pad([
  '......y.........',
  '.....yOy........',
  '.....yOOy.......',
  '....yOyyOy......',
  '....yOOOOy......',
  '...kkOOOOkk.....',
  '..kSSkkkkSSk....',
  '..kSsSSSSsSk....',
  '...kSssssSk.....',
  '....kssssk......',
  '.....kssk.......',
  '....kssssk......',
  '...kssssssk.....',
  '...kkkkkkkk.....',
], 1);

const ORB_MAP = [
  '..kkkk..',
  '.kmmmmk.',
  'kmWWmmMk',
  'kmWmmmMk',
  'kmmmmMMk',
  'kmmmMMMk',
  '.kMMMMk.',
  '..kkkk..',
];

export function orbSprite({ m, M, W }) {
  return makeSprite(ORB_MAP, { ...PAL, m, M, W }, 8, 8);
}

// Chunky scalloped pine in muted teal-green: lighter top-left, shadowed underside on
// every tier, reddish root tips at the base. 16x20 so forests overlap like the reference.
const TREE_GREEN = { e: '#1f4a38', d: '#2c6849', m: '#3a7f58', h: '#4f9a69', H: '#6db582' };
const TREE_PINK = { e: '#5b2b3e', d: '#7b4057', m: '#9a566c', h: '#b8707f', H: '#d792a0' };
function makeTree(P, tiers) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 20;
  const g = c.getContext('2d');
  const dim = { H: 'h', h: 'm', m: 'd', d: 'e', e: 'e' };
  const set = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };

  for (let y = 14; y < 20; y++) { set(7, y, '#5a3a28'); set(8, y, '#5a3a28'); }
  [[4, 17], [5, 17], [6, 17], [5, 16], [9, 17], [10, 17], [11, 17], [10, 16]].forEach(([x, y]) => set(x, y, '#a8553f'));
  [[3, 18], [4, 18], [5, 18], [6, 18], [9, 18], [10, 18], [11, 18], [12, 18], [4, 19], [5, 19], [10, 19], [11, 19]].forEach(([x, y]) => set(x, y, '#6e3228'));

  for (const { top, h, hw } of tiers) {
    for (let t = 0; t < h; t++) {
      const w = Math.max(2, Math.round(hw * Math.pow((t + 1) / h, 0.4)));
      for (let px = 8 - w; px < 8 + w; px++) {
        if (t === h - 1 && (px - (8 - w)) % 5 === 4) continue; // scalloped lower edge
        const u = (px - (8 - w)) / (2 * w - 1);
        let k = u < 0.3 ? 'h' : u < 0.7 ? 'm' : 'd';
        if (u < 0.18 && t >= 1 && t <= h - 3) k = 'H';
        if (t === 0 && u > 0.15 && u < 0.85) k = 'H';
        if (px === 8 + w - 1) k = 'e';
        if (t >= h - 2) k = dim[k];
        set(px, top + t, P[k]);
      }
    }
  }
  return c;
}

// Mostly flat olive grass with a few tiny specks; the character comes from the
// large patches painted per pixel over the whole floor.
function ground(base, dark, light, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 16, 16);
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 3; i++) { g.fillStyle = dark; g.fillRect(Math.floor(rnd() * 15), Math.floor(rnd() * 16), 2, 1); }
  for (let i = 0; i < 4; i++) { g.fillStyle = light; g.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 1, 1); }
  return c;
}


// ---- new monsters ----
const SPITTER = pad([
  R(5, 'kkkkkk'),
  R(3, 'kkuuuuuukk'),
  R(2, 'kuuWWuuuuWWk'),
  R(1, 'kuuWWuuuuuWWuk'),
  R(1, 'kuuuuuuuuuuuuk'),
  R(2, 'kUUUUUUUUUUk'),
  R(4, 'kkUUUUkk'),
  R(5, 'kCCCCk'),
  R(5, 'kCkkCk'),
  R(5, 'kCkkCk'),
  R(5, 'kDCCDk'),
  R(4, 'kDDCCDDk'),
  R(4, 'kkkkkkkk'),
], 1);

const BAT_A = pad([
  R(1, 'kk..........kk'),
  R(1, 'kuk........kuk'),
  R(1, 'kuuk..kk..kuuk'),
  R(2, 'kuuukUUkuuuk'),
  R(2, 'kuuUrUUrUuuk'),
  R(3, 'kuUUUUUUuk'),
  R(4, 'kkUUUUkk'),
  R(5, 'kWkkWk'),
  R(6, 'kkkk'),
], 3);
const BAT_B = pad([
  R(4, 'kk....kk'),
  R(4, 'kuk..kuk'),
  R(1, 'kkuukkkkkkuukk'),
  R(1, 'kuuuukUUkuuuuk'),
  R(1, 'kuuukUrrUkuuuk'),
  R(1, 'kkuuukUUkuuukk'),
  R(2, 'kk.kUUUUk.kk'),
  R(2, 'k...kWWk...k'),
], 3);

const CHARGER = pad([
  R(4, 'kkkkkkkk'),
  R(3, 'knnnnnnnnk'),
  R(2, 'knnNnnnnNnnk'),
  R(1, 'knnnnnnnnnnnnk'),
  R(1, 'knnrknnnnkrnnk'),
  R(1, 'knnnnnnnnnnnnk'),
  R(2, 'knNNNNNNNNNk'),
  R(2, 'knNkNNNNkNNk'),
  R(1, 'kWWkNNNNNNkWWk'),
  R(1, 'kWk........kWk'),
  R(3, 'knk....knk'),
  R(3, 'kkk....kkk'),
], 2);

// ---- bosses: drawn procedurally at 32x32 ----
const px = (g, x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
function disc(g, cx, cy, rx, ry, c, mask) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1 && (!mask || mask(x, y))) px(g, x, y, c);
    }
  }
}
function outline(c, color) {
  const w = c.width, h = c.height, g = c.getContext('2d'), d = g.getImageData(0, 0, w, h).data;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) px(g, x, y, color);
  }
}
const BOSS_CHOMPER_PAL = { body: '#f08a24', dark: '#c0621a', light: '#ffb454', leaf: '#4a9d4f', leafD: '#2f6b3a', mouth: '#3a1030', tongue: '#d9363e', eye: '#ffd84a', line: '#2a1f33' };
const BOSS_VENOM_PAL = { body: '#8a4fd0', dark: '#5f2fa0', light: '#b98af0', leaf: '#3fb59a', leafD: '#1f7a68', mouth: '#1a0c28', tongue: '#e0457b', eye: '#9dff5c', line: '#1c1226' };
function bossChomper(P) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  // leafy collar and vines at the base
  disc(g, 16, 27, 13, 4, P.leafD);
  disc(g, 16, 26, 12, 3, P.leaf);
  for (const x of [4, 9, 22, 27]) { disc(g, x, 28, 3, 2, P.leaf); px(g, x, 27, P.leafD); }
  // head
  disc(g, 16, 13, 12, 12, P.body);
  disc(g, 16, 13, 12, 12, P.dark, (x, y) => ((x + 0.5 - 14) ** 2 + (y + 0.5 - 11) ** 2) > 12.5 ** 2);
  disc(g, 11, 6, 4, 2, P.light);
  // mouth
  disc(g, 16, 15, 9, 7.5, P.mouth);
  disc(g, 16, 19.5, 5.5, 2.8, P.tongue);
  for (let i = 0; i < 5; i++) {
    const tx = 10 + i * 3;
    for (let dy = 0; dy < 4; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (Math.abs(dx) <= (3 - dy) / 2) { px(g, tx + dx, 8 + dy, '#ffffff'); px(g, tx + dx, 22 - dy, '#ffffff'); }
    }
  }
  // eyes
  for (const ex of [9, 21]) { g.fillStyle = P.eye; g.fillRect(ex, 4, 3, 2); px(g, ex + 1, 5, P.line); }
  outline(c, P.line);
  return c;
}

const BOSS_GOLEM_PAL = { base: '#8d8f98', light: '#c5c7cf', dark: '#5b5f6e', moss: '#4a9d4f', mossD: '#2f6b3a', eye: '#ffd84a', glow: '#f08a24', line: '#2a1f33' };
const BOSS_FROST_PAL = { base: '#7fa3c9', light: '#cfe6ff', dark: '#44688f', moss: '#9fe3f0', mossD: '#5ab4cf', eye: '#c8fbff', glow: '#4d8dff', line: '#1c2540' };
function bossGolem(P) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const block = (x, y, w, h) => {
    g.fillStyle = P.base; g.fillRect(x, y, w, h);
    g.fillStyle = P.light; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
    g.fillStyle = P.dark; g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y, 1, h);
  };
  block(8, 24, 6, 7); block(18, 24, 6, 7);          // legs
  block(7, 12, 18, 13);                             // torso
  block(2, 10, 8, 8); block(22, 10, 8, 8);          // shoulders
  block(2, 18, 5, 8); block(25, 18, 5, 8);          // arms
  block(1, 25, 7, 6); block(24, 25, 7, 6);          // fists
  block(11, 2, 10, 9);                              // head
  g.fillStyle = P.line; g.fillRect(12, 4, 8, 1);    // brow
  for (const ex of [13, 17]) { g.fillStyle = P.eye; g.fillRect(ex, 5, 2, 2); px(g, ex, 7, P.glow); px(g, ex + 1, 7, P.glow); }
  g.fillStyle = P.dark; g.fillRect(13, 9, 6, 1);    // mouth slit
  g.fillStyle = P.glow; g.fillRect(15, 15, 2, 6); g.fillRect(13, 17, 6, 2); // chest rune
  for (const [x, y, w] of [[3, 10, 4], [22, 11, 3], [8, 13, 3], [20, 22, 4], [9, 24, 3], [12, 2, 3]]) { g.fillStyle = P.moss; g.fillRect(x, y, w, 1); g.fillStyle = P.mossD; g.fillRect(x, y + 1, w - 1, 1); }
  g.fillStyle = P.dark; for (const [x, y] of [[10, 18], [11, 19], [21, 14], [22, 15], [4, 21], [27, 22]]) px(g, x, y, P.dark);
  outline(c, P.line);
  return c;
}

export function buildSprites() {
  const recolor = (rows, map) => makeSprite(rows, { ...PAL, ...map });
  const hero = {};
  const views = { down: [HERO_DOWN, LEGS_FRONT], up: [HERO_UP, LEGS_FRONT], side: [HERO_SIDE, LEGS_SIDE] };
  for (const [view, [top, legs]] of Object.entries(views)) {
    hero[view] = {};
    for (const [frame, rows] of Object.entries(legs)) {
      hero[view][frame] = makeSprite([...top, ...rows, BLANK].slice(0, 20), HERO_PAL, 16, 20);
    }
  }
  return {
    hero,
    shield: makeSprite(SHIELD, SHIELD_PAL, 8, 8),
    spitter: makeSprite(SPITTER),
    batA: makeSprite(BAT_A),
    batB: makeSprite(BAT_B),
    charger: makeSprite(CHARGER),
    bossChomper: bossChomper(BOSS_CHOMPER_PAL),
    bossVenom: bossChomper(BOSS_VENOM_PAL),
    bossGolem: bossGolem(BOSS_GOLEM_PAL),
    bossFrost: bossGolem(BOSS_FROST_PAL),
    sword: makeSprite(SWORD, SWORD_PAL, 5, 19),
    chomper: makeSprite(CHOMPER),
    bulb: makeSprite(BULB),
    brute: recolor(CHOMPER, { O: PAL.u, G: PAL.U, g: PAL.u, k: '#1c1226' }),
    tree: [
      makeTree(TREE_GREEN, [{ top: 2, h: 5, hw: 7 }, { top: 6, h: 5, hw: 8 }, { top: 10, h: 6, hw: 8 }]),
      makeTree(TREE_GREEN, [{ top: 1, h: 6, hw: 6 }, { top: 5, h: 6, hw: 8 }, { top: 10, h: 6, hw: 8 }]),
      makeTree(TREE_PINK, [{ top: 2, h: 5, hw: 7 }, { top: 6, h: 5, hw: 8 }, { top: 10, h: 6, hw: 8 }]),
    ],
    rock: makeSprite(ROCK, ROCK_PAL),
    fire: [makeSprite(FIRE_A), makeSprite(FIRE_B)],
    torch: makeSprite(TORCH),
    grass: [
      ground('#76943f', '#6a8738', '#93ae57', 11),
      ground('#76943f', '#6a8738', '#93ae57', 23),
      ground('#78963f', '#6c8939', '#d9e3a8', 37),
      ground('#74923e', '#688536', '#93ae57', 51),
    ],
  };
}

// All art is defined as pixel maps (one char per pixel) so it can be edited as text.
// '.' is transparent; letters map to a palette. Environment art uses no black outlines
// (just darker shades), characters keep a soft dark outline so they pop off the ground.
const PAL = {
  k: '#2a1f33', // outline
  y: '#ffd84a', O: '#f08a24',
  r: '#d9363e', R: '#a02632',
  g: '#4a9d4f', G: '#2f6b3a',
  n: '#8a5a3c', N: '#5a3a28',
  s: '#8d8f98', S: '#c5c7cf',
  W: '#ffffff', c: '#5cd6e6',
  u: '#8a4fd0', U: '#53268f',
  m: '#d63fd6', M: '#8a2a99',
};

export function makeSprite(rows, pal = PAL, w = 16, h = 16) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
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

// ---- hero: a stylized human adventurer (front view; flipped for facing left) ----
const HERO_PAL = {
  k: '#2a1f33',
  H: '#5a3320', J: '#8a5530',
  f: '#f6d0a8', F: '#d9a27a', e: '#2a1f33', p: '#ef8a8a',
  R: '#d9363e', D: '#9e2430',
  t: '#3b8f5a', T: '#2b6a43', b: '#8a5a3c', y: '#ffd84a',
  q: '#4a4e69', B: '#6a3b24',
};
const HERO_TOP = [
  '................',
  '....kkkkkkkk....',
  '...kHHHHHHHHk...',
  '..kHHJJJJJJHHk..',
  '..kHHHffffHHHk..',
  '..kHffffffffHk..',
  '..kffeffffeffk..',
  '..kfpffffffpfk..',
  '...kkffffffkk...',
  '....kRRRRRRk....',
  '...kRRDDDDRRk...',
  '..kttttttttttk..',
  '.kfkttbyybttkfk.',
  '..kktTTTTTTtkk..',
];
const HERO_LEGS = {
  idle: ['...kqqqkkqqqk...', '...kBBBkkBBBk...'],
  walkA: ['...kqqqk.kqqk...', '...kBBBk.kBBk...'],
  walkB: ['...kqqk.kqqqk...', '...kBBk.kBBBk...'],
};

// Big sword, pointing up; pivot is the middle of the grip (x=3.5, y=17.5).
const SWORD_PAL = { k: '#2a1f33', S: '#b9c2d6', W: '#ffffff', y: '#ffd84a', O: '#c9801e', n: '#8a5a3c' };
const SWORD = [
  '...k...',
  '..kWk..',
  '.kSWSk.',
  '.kSWSk.',
  '.kSWSk.',
  '.kSWSk.',
  '.kSWSk.',
  '.kSWSk.',
  '.kSWSk.',
  '.kSWSk.',
  '.kSWSk.',
  '.kSWSk.',
  '.kSWSk.',
  'kyyyyyk',
  'kOOOOOk',
  '..knk..',
  '..knk..',
  '..knk..',
  '.kyyyk.',
  '.kkkkk.',
  '.......',
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

// Layered scalloped pine, like the reference: light left, dark right, a shadowed
// underside on every tier, and reddish roots at the base.
function makeTree(variant) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  const P = { e: '#1f5233', d: '#2c6e3e', m: '#3f8d4b', h: '#66b05f', H: '#92cf7c' };
  const dim = { H: 'h', h: 'm', m: 'd', d: 'e', e: 'e' };
  const set = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };

  // trunk and roots first, tiers cover the top of them
  for (let y = 11; y < 16; y++) { set(7, y, '#5a3a28'); set(8, y, '#5a3a28'); }
  [[4, 14], [5, 14], [6, 14], [5, 13], [9, 14], [10, 14], [11, 14], [10, 13]].forEach(([x, y]) => set(x, y, '#a8553f'));
  [[3, 15], [4, 15], [5, 15], [6, 15], [9, 15], [10, 15], [11, 15], [12, 15]].forEach(([x, y]) => set(x, y, '#6e3228'));

  const tiers = variant
    ? [{ top: 0, h: 5, hw: 5 }, { top: 3, h: 6, hw: 7 }, { top: 7, h: 7, hw: 8 }]
    : [{ top: 1, h: 5, hw: 5 }, { top: 4, h: 5, hw: 7 }, { top: 8, h: 6, hw: 8 }];
  for (const { top, h, hw } of tiers) {
    for (let t = 0; t < h; t++) {
      const w = Math.max(1, Math.round(hw * (t + 1) / h));
      for (let px = 8 - w; px < 8 + w; px++) {
        if (t === h - 1 && (px - (8 - w)) % 4 === 3) continue; // scalloped lower edge
        const u = (px - (8 - w)) / (2 * w - 1);
        let k = u < 0.3 ? 'h' : u < 0.72 ? 'm' : 'd';
        if (px === 8 + w - 1) k = 'e';
        if (t >= h - 2) k = dim[k];
        if (t === 1 && u < 0.45 && u > 0.1) k = 'H';
        set(px, top + t, P[k]);
      }
    }
  }
  return c;
}

// Olive grass with soft speckle and the odd flower, seeded so tiles are stable.
function ground(base, dark, light, seed, flowers = false) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 16, 16);
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 9; i++) { g.fillStyle = dark; g.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 2, 1); }
  for (let i = 0; i < 6; i++) { g.fillStyle = light; g.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 1, 1); }
  if (flowers) {
    g.fillStyle = '#f4f1d0'; g.fillRect(Math.floor(rnd() * 14), Math.floor(rnd() * 14), 1, 1);
    g.fillStyle = '#ffd84a'; g.fillRect(Math.floor(rnd() * 14), Math.floor(rnd() * 14), 1, 1);
  }
  return c;
}

export function buildSprites() {
  const recolor = (rows, map) => makeSprite(rows, { ...PAL, ...map });
  const heroBody = HERO_TOP.slice(0, 14);
  const hero = {};
  for (const [name, legs] of Object.entries(HERO_LEGS)) hero[name] = makeSprite([...heroBody, ...legs], HERO_PAL);
  return {
    hero,
    sword: makeSprite(SWORD, SWORD_PAL, 7, 21),
    chomper: makeSprite(CHOMPER),
    bulb: makeSprite(BULB),
    brute: recolor(CHOMPER, { O: PAL.u, G: PAL.U, g: PAL.u, k: '#1c1226' }),
    tree: [makeTree(0), makeTree(1)],
    rock: makeSprite(ROCK, ROCK_PAL),
    fire: [makeSprite(FIRE_A), makeSprite(FIRE_B)],
    torch: makeSprite(TORCH),
    grass: [
      ground('#6f9c3c', '#628e33', '#8fb858', 11),
      ground('#6f9c3c', '#628e33', '#8fb858', 23),
      ground('#729f3f', '#658f36', '#c7d98a', 37, true),
      ground('#6c993a', '#5f8c32', '#8fb858', 51, true),
    ],
    water: [ground('#3aa8b0', '#2f93a0', '#8fd6d6', 5), ground('#3aa8b0', '#2f93a0', '#8fd6d6', 9)],
  };
}

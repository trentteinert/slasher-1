// All art is defined as pixel maps (one char per pixel) so it can be edited as text.
// '.' is transparent; letters map to PAL below.
const PAL = {
  k: '#2a1f33', // outline
  w: '#fdf0d5', o: '#e3b98f', p: '#ef8a8a',
  b: '#3d6fd1', B: '#28479b',
  y: '#ffd84a', O: '#f08a24',
  r: '#d9363e', R: '#a02632',
  g: '#4a9d4f', G: '#2f6b3a', l: '#7cc460',
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

const HERO = pad([
  '..kk........kk..',
  '.kwwk......kwwk.',
  '.kwwwkkkkkkwwwk.',
  '.kwwwwwwwwwwwwk.',
  'kwwwwwwwwwwwwwwk',
  'kwwkkwwwwwwkkwwk',
  'kwwkkwwwwwwkkwwk',
  'kwwwwwwppwwwwwwk',
  '.kwwwwwwwwwwwwk.',
  '..kkbbkkkkbbkk..',
  '..kbbbbbbbbbbk..',
  '..kbbbyybbbbbk..',
  '..kbbbbbbbbbbk..',
  '..kbbk....kbbk..',
  '..kkkk....kkkk..',
], 1);

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

const TREE = pad([
  '......kkkk......',
  '.....kGggGk.....',
  '....kGgllgGk....',
  '...kGgllllgGk...',
  '...kGggllggGk...',
  '..kGGggggggGGk..',
  '..kGggllllggGk..',
  '.kGGgllllllgGGk.',
  '.kGgggllllgggGk.',
  '.kGGGgggggggGGk.',
  '..kkGGGGGGGGkk..',
  '....kkNNNNkk....',
  '.....kNNNNk.....',
  '.....kkkkkk.....',
], 1);

const ROCK = pad([
  '.....kkkkkk.....',
  '...kkSSSSSskk...',
  '..kSSSSsssssnk..',
  '.kSSssssssssnnk.',
  '.kssssssssnnnnk.',
  '..kknnnnnnnnkk..',
  '...kkkkkkkkkk...',
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

// Seeded so ground tiles are stable between runs.
function ground(base, dark, light, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 16, 16);
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 10; i++) { g.fillStyle = dark; g.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 2, 1); }
  for (let i = 0; i < 5; i++) { g.fillStyle = light; g.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 1, 1); }
  return c;
}

export function buildSprites() {
  const recolor = (rows, map) => makeSprite(rows, { ...PAL, ...map });
  return {
    hero: makeSprite(HERO),
    chomper: makeSprite(CHOMPER),
    bulb: makeSprite(BULB),
    brute: recolor(CHOMPER, { O: PAL.u, G: PAL.U, g: PAL.u, k: '#1c1226' }),
    tree: [makeSprite(TREE), recolor(TREE, { g: '#3f8f55', G: '#276149', l: '#6fb86f' })],
    rock: makeSprite(ROCK),
    fire: [makeSprite(FIRE_A), makeSprite(FIRE_B)],
    torch: makeSprite(TORCH),
    grass: [
      ground('#6b9a3b', '#5f8c33', '#8bb455', 11),
      ground('#6b9a3b', '#5f8c33', '#8bb455', 23),
      ground('#6f9f3e', '#628f35', '#c7d98a', 37),
    ],
    water: [ground('#3aa8b0', '#2f93a0', '#8fd6d6', 5), ground('#3aa8b0', '#2f93a0', '#8fd6d6', 9)],
  };
}

// Pixel-art icons for every power-up, drawn procedurally on a 16x16 canvas, thresholded to crisp
// pixels, and given a dark edge so they read on any rarity colour. Draw them with
// imageSmoothingEnabled = false at an integer scale.
const C = { W: '#ffffff', G: '#ffd84a', O: '#f08a24', R: '#e5484d', B: '#6db3ff', Cy: '#7de8f0', Gn: '#6bd47f', Gd: '#3f9a52', S: '#d5d9e6', Br: '#a66f43', D: '#2a1f33' };

function make(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  draw(g);
  const img = g.getImageData(0, 0, 16, 16), d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0; // crisp pixels
  g.putImageData(img, 0, 0);
  const sil = document.createElement('canvas'); sil.width = sil.height = 16;
  const s = sil.getContext('2d');
  s.drawImage(c, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = 'rgba(20,14,34,0.9)'; s.fillRect(0, 0, 16, 16);
  const out = document.createElement('canvas'); out.width = out.height = 16;
  const o = out.getContext('2d');
  o.drawImage(sil, 1, 1); o.drawImage(sil, 0, 1); o.drawImage(sil, 1, 0); o.drawImage(c, 0, 0);
  return out;
}

const poly = (g, pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = fill; g.fill(); };
const line = (g, pts, color, w) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.strokeStyle = color; g.lineWidth = w; g.stroke(); };
const disc = (g, x, y, r, fill) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
const star = (g, cx, cy, n, ro, ri, fill) => {
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const a = (i * Math.PI) / n - Math.PI / 2, r = i % 2 ? ri : ro; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  poly(g, pts, fill);
};
const bolt = [[9.5, 1], [3.5, 9], [7.5, 9], [5.5, 15], [12.5, 6], [8.5, 6], [11, 1]];

const DRAW = {
  dmg: g => { // sword
    line(g, [[4, 12], [12.5, 3.5]], C.S, 2.6); line(g, [[5, 11], [11.5, 4.5]], C.W, 0.9);
    line(g, [[3.5, 8.5], [7.5, 12.5]], C.G, 2); line(g, [[5.5, 10.5], [2.5, 13.5]], C.Br, 2);
  },
  haste: g => poly(g, bolt, C.G),
  reach: g => { // double arrow
    line(g, [[3, 8], [13, 8]], C.Cy, 1.8);
    poly(g, [[1, 8], [5, 4.8], [5, 11.2]], C.Cy); poly(g, [[15, 8], [11, 4.8], [11, 11.2]], C.Cy);
  },
  swift: g => { // boot
    poly(g, [[5, 2], [9.5, 2], [9.5, 8], [14, 10.5], [14, 14], [4, 14]], '#efe3cf');
    g.fillStyle = C.Br; g.fillRect(4, 12, 10, 2.2); g.fillStyle = C.O; g.fillRect(5, 2, 4.5, 1.8);
  },
  vigor: g => { // heart
    disc(g, 5.6, 6.2, 3.7, C.R); disc(g, 10.4, 6.2, 3.7, C.R);
    poly(g, [[2.1, 7.6], [13.9, 7.6], [8, 14.6]], C.R);
    g.fillStyle = '#ff9a9a'; g.fillRect(3.6, 4, 2, 1.4);
  },
  regen: g => { g.fillStyle = C.Gn; g.fillRect(6, 2, 4, 12); g.fillRect(2, 6, 12, 4); g.fillStyle = '#c8f5d2'; g.fillRect(6.6, 2.8, 1.2, 4); },
  crit: g => { // target
    g.beginPath(); g.arc(8, 8, 5.6, 0, 7); g.strokeStyle = C.R; g.lineWidth = 2.2; g.stroke();
    g.beginPath(); g.arc(8, 8, 2.6, 0, 7); g.strokeStyle = C.W; g.lineWidth = 1.6; g.stroke();
    disc(g, 8, 8, 1, C.R); line(g, [[8, 0.8], [8, 3.2]], C.W, 1.2); line(g, [[8, 12.8], [8, 15.2]], C.W, 1.2);
  },
  lifesteal: g => { // blood drop
    g.beginPath(); g.moveTo(8, 1.2); g.bezierCurveTo(11.6, 6, 13.6, 8.4, 13.6, 10.4); g.arc(8, 10.4, 5.6, 0, Math.PI); g.bezierCurveTo(2.4, 8.4, 4.4, 6, 8, 1.2);
    g.fillStyle = C.R; g.fill(); g.fillStyle = '#ff9a9a'; g.fillRect(4.8, 9.2, 1.6, 2.6);
  },
  burn: g => { // flame
    g.beginPath(); g.moveTo(8, 1); g.bezierCurveTo(10.5, 4.5, 13.6, 6.6, 12.6, 10.6); g.bezierCurveTo(12, 13, 10, 14.6, 8, 14.6);
    g.bezierCurveTo(6, 14.6, 3.4, 13, 3.4, 10.6); g.bezierCurveTo(3.4, 8.4, 5, 7.6, 5.4, 5.4); g.bezierCurveTo(7, 6.6, 7, 3.4, 8, 1);
    g.fillStyle = C.O; g.fill();
    g.beginPath(); g.ellipse(8, 11.2, 2.7, 3.4, 0, 0, 7); g.fillStyle = C.G; g.fill();
  },
  chill: g => { // snowflake
    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) line(g, [[8 + Math.cos(a) * 6.8, 8 + Math.sin(a) * 6.8], [8 - Math.cos(a) * 6.8, 8 - Math.sin(a) * 6.8]], C.Cy, 1.7);
    disc(g, 8, 8, 1.6, C.W);
  },
  chain: g => { // arcing between two nodes
    line(g, [[3.5, 3.5], [9.5, 4.8], [6, 9], [12.5, 12.5]], C.Cy, 1.9);
    disc(g, 3.5, 3.5, 2.2, C.W); disc(g, 12.5, 12.5, 2.2, C.W);
  },
  exec: g => { // skull
    disc(g, 8, 7, 5.4, C.W); g.fillStyle = C.W; g.fillRect(5, 10, 6, 4.4);
    disc(g, 5.8, 7.6, 1.5, C.D); disc(g, 10.2, 7.6, 1.5, C.D); poly(g, [[8, 9], [7, 11], [9, 11]], C.D);
    line(g, [[6.8, 12], [6.8, 14.2]], C.D, 0.9); line(g, [[9.2, 12], [9.2, 14.2]], C.D, 0.9);
  },
  multi: g => { // crossed swords
    line(g, [[2.5, 2.5], [13.5, 13.5]], C.S, 2.2); line(g, [[13.5, 2.5], [2.5, 13.5]], C.S, 2.2);
    line(g, [[2.5, 9.5], [6, 13]], C.G, 1.8); line(g, [[13.5, 9.5], [10, 13]], C.G, 1.8);
  },
  berserk: g => { star(g, 8, 8, 8, 7.4, 3.4, C.R); disc(g, 8, 8, 2.6, C.O); },
  slayer: g => { // crown
    poly(g, [[2, 12.5], [2, 5], [5.6, 8.6], [8, 2.8], [10.4, 8.6], [14, 5], [14, 12.5]], C.G);
    g.fillStyle = C.O; g.fillRect(2, 12, 12, 2.4); disc(g, 8, 10, 1.1, C.R); disc(g, 4.6, 10.4, 0.8, C.R); disc(g, 11.4, 10.4, 0.8, C.R);
  },
  blades: g => { // spinning spiral
    const pts = []; for (let t = 0; t < 12.6; t += 0.4) pts.push([8 + (1.2 + t * 0.52) * Math.cos(t), 8 + (1.2 + t * 0.52) * Math.sin(t)]);
    line(g, pts, C.Cy, 2); disc(g, 8, 8, 1.2, C.W);
  },
  wave: g => { // crescent wave
    g.beginPath(); g.arc(8, 13, 9, Math.PI * 1.15, Math.PI * 1.85); g.strokeStyle = C.Cy; g.lineWidth = 2.8; g.stroke();
    g.beginPath(); g.arc(8, 13, 5.2, Math.PI * 1.15, Math.PI * 1.85); g.strokeStyle = C.W; g.lineWidth = 1.8; g.stroke();
  },
  volatile: g => { star(g, 8, 8, 10, 7.4, 3.6, C.O); star(g, 8, 8, 8, 4.6, 2.2, C.G); },
  guard: g => { // shield
    g.beginPath(); g.moveTo(8, 1.2); g.lineTo(14, 3.4); g.lineTo(13.2, 9); g.bezierCurveTo(12.6, 12, 10.2, 13.8, 8, 15); g.bezierCurveTo(5.8, 13.8, 3.4, 12, 2.8, 9); g.lineTo(2, 3.4); g.closePath();
    g.fillStyle = C.B; g.fill();
    g.fillStyle = C.G; g.fillRect(7.2, 4.4, 1.7, 6); g.fillRect(5, 6.4, 6, 1.7);
  },
  retaliate: g => { star(g, 8, 8, 6, 7.6, 3.2, C.Gn); disc(g, 8, 8, 2.2, '#c8f5d2'); },
  whirl: g => { // tornado
    [[2, 14, 3], [3.4, 12.6, 6], [5, 11, 9], [6.6, 9.4, 12], [7.6, 8.4, 14.6]].forEach(([x0, x1, y], i) => line(g, [[x0 + (i % 2), y - 1.5], [x1 - (i % 2) + 0, y - 1.5]], i % 2 ? C.W : C.Cy, 1.9));
  },
  fortune: g => { // four-leaf clover
    for (const [x, y] of [[5.6, 5.4], [10.4, 5.4], [5.6, 10], [10.4, 10]]) disc(g, x, y, 3.2, C.Gn);
    line(g, [[8, 9], [10.5, 15]], C.Gd, 1.6); disc(g, 8, 7.7, 1.4, '#c8f5d2');
  },
  phoenix: g => { // fiery bird
    poly(g, [[8, 9.6], [0.8, 3.6], [3.2, 9.6], [8, 12.6]], C.O); poly(g, [[8, 9.6], [15.2, 3.6], [12.8, 9.6], [8, 12.6]], C.O);
    g.beginPath(); g.ellipse(8, 8.8, 2.4, 4.2, 0, 0, 7); g.fillStyle = C.R; g.fill();
    disc(g, 8, 4.4, 1.9, C.G); poly(g, [[6.4, 12], [8, 15.6], [9.6, 12]], C.G);
  },
};

export function buildIcons() {
  const out = {};
  for (const [id, fn] of Object.entries(DRAW)) out[id] = make(fn);
  return out;
}
export const ICON_IDS = Object.keys(DRAW);

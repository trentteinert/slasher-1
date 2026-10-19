// Power-ups: every upgrade has up to four rarities, and each rarity has its own strength.
// v[i] is the value at [common, uncommon, rare, legendary]; null means it can't roll at that rarity.
// Stat-only upgrades scale up, while the effect upgrades (chain lightning, orbiting blades,
// crescent waves, whirlwind, phoenix...) only appear at higher rarities and get wilder.

export const RARITIES = [
  { id: 'common', name: 'COMMON', color: '#c8ced8', glow: '#8d96a8' },
  { id: 'uncommon', name: 'UNCOMMON', color: '#52c86a', glow: '#2f8f46' },
  { id: 'rare', name: 'RARE', color: '#4d8dff', glow: '#2a5fc4' },
  { id: 'legendary', name: 'LEGENDARY', color: '#ffb020', glow: '#d9741a' },
];

export const newMods = () => ({
  crit: 0, lifesteal: 0, regen: 0, burn: 0, chill: 0, chain: 0, exec: 0, multi: 0,
  blades: 0, waveEvery: 0, volatile: 0, guardCd: 0, retaliate: 0, berserk: 0, slayer: 0,
  whirlCd: 0, phoenix: 0, luck: 0,
});

const pct = v => `${Math.round(v * 100)}%`;
const num = v => (Number.isInteger(v) ? `${v}` : v.toFixed(1));
const lowest = (cur, v) => (cur ? Math.min(cur, v) : v);

export const UPGRADES = [
  // ---- stats ----
  { id: 'dmg', name: 'Keen Edge', legend: 'Godslayer Edge', v: [0.08, 0.14, 0.22, 0.4], text: v => `+${pct(v)} damage`, apply: (p, v) => { p.dmg *= 1 + v; } },
  { id: 'haste', name: 'Quick Hands', legend: 'Blur of Steel', v: [0.06, 0.1, 0.16, 0.28], text: v => `+${pct(v)} attack speed`, apply: (p, v) => { p.cd /= 1 + v; } },
  { id: 'reach', name: 'Long Reach', legend: 'Titan Grip', v: [0.06, 0.1, 0.16, 0.28], text: v => `+${pct(v)} slash range`, apply: (p, v) => { p.range *= 1 + v; } },
  { id: 'swift', name: 'Fleet Foot', legend: 'Wind Walker', v: [0.04, 0.07, 0.11, 0.2], text: v => `+${pct(v)} move speed`, apply: (p, v) => { p.speed *= 1 + v; } },
  { id: 'vigor', name: 'Vitality', legend: 'Heart of the Forest', v: [8, 14, 22, 40], text: v => `+${v} max HP and heal ${v}`, apply: (p, v) => { p.maxHp += v; p.hp = Math.min(p.maxHp, p.hp + v); } },
  { id: 'regen', name: 'Regeneration', legend: 'Verdant Blessing', v: [0.4, 0.8, 1.4, 2.6], text: v => `Regain ${num(v)} HP per second`, apply: (p, v) => { p.mods.regen += v; } },

  // ---- combat tricks ----
  { id: 'crit', name: 'Deadly Aim', legend: 'Assassin\'s Mark', v: [0.05, 0.09, 0.15, 0.25], text: v => `${pct(v)} chance to crit for double damage`, apply: (p, v) => { p.mods.crit += v; } },
  { id: 'lifesteal', name: 'Vampiric Edge', legend: 'Crimson Feast', v: [0.5, 1, 1.8, 3.5], text: v => `Heal ${num(v)} HP on every hit`, apply: (p, v) => { p.mods.lifesteal += v; } },
  { id: 'burn', name: 'Ember Edge', legend: 'Dragonfire', v: [1.5, 3, 6, 12], text: v => `Hits set enemies ablaze: ${num(v)} damage per second for 3s`, apply: (p, v) => { p.mods.burn += v; } },
  { id: 'chill', name: 'Frostbite', legend: 'Absolute Zero', v: [0.15, 0.25, 0.38, 0.6], text: v => `Hits slow enemies by ${pct(v)} for 2s`, apply: (p, v) => { p.mods.chill = Math.max(p.mods.chill, v); } },
  { id: 'chain', name: 'Chain Lightning', legend: 'Storm Caller', v: [null, 0.25, 0.4, 0.7], text: v => `${pct(v)} chance a hit arcs to a nearby enemy`, apply: (p, v) => { p.mods.chain += v; } },
  { id: 'exec', name: 'Executioner', legend: 'Reaper\'s Due', v: [0.06, 0.1, 0.16, 0.26], text: v => `Enemies below ${pct(v)} health die instantly`, apply: (p, v) => { p.mods.exec += v; } },
  { id: 'multi', name: 'Twin Strike', legend: 'Dance of Blades', v: [null, 0.12, 0.22, 0.4], text: v => `${pct(v)} chance to swing twice`, apply: (p, v) => { p.mods.multi += v; } },
  { id: 'berserk', name: 'Berserker', legend: 'Blood Rage', v: [0.15, 0.25, 0.4, 0.8], text: v => `Up to +${pct(v)} damage as your health drops`, apply: (p, v) => { p.mods.berserk += v; } },
  { id: 'slayer', name: 'Giant Slayer', legend: 'Kingbreaker', v: [0.2, 0.35, 0.6, 1.1], text: v => `+${pct(v)} damage to bosses and brutes`, apply: (p, v) => { p.mods.slayer += v; } },

  // ---- big effects ----
  { id: 'blades', name: 'Orbiting Blades', legend: 'Blade Storm', v: [null, 1, 2, 4], text: v => `${v} spinning blade${v > 1 ? 's' : ''} circle you and cut anything close`, apply: (p, v) => { p.mods.blades += v; } },
  { id: 'wave', name: 'Crescent Wave', legend: 'Tidal Fury', v: [null, 4, 3, 2], text: v => `Every ${v === 2 ? 'other' : v === 3 ? '3rd' : '4th'} swing sends a piercing wave`, apply: (p, v) => { p.mods.waveEvery = lowest(p.mods.waveEvery, v); } },
  { id: 'volatile', name: 'Volatile Kills', legend: 'Chain Reaction', v: [0.3, 0.5, 0.85, 1.5], text: v => `Slain enemies explode for ${pct(v)} of your damage`, apply: (p, v) => { p.mods.volatile += v; } },
  { id: 'guard', name: 'Aegis', legend: 'Bulwark of Ages', v: [14, 10, 7, 3.5], text: v => `A barrier blocks one hit, recharging every ${num(v)}s`, apply: (p, v) => { p.mods.guardCd = lowest(p.mods.guardCd, v); } },
  { id: 'retaliate', name: 'Retaliation', legend: 'Wrath of Thorns', v: [null, 1.2, 2, 3.5], text: v => `Getting hurt unleashes a shockwave for ${pct(v)} damage`, apply: (p, v) => { p.mods.retaliate += v; } },
  { id: 'whirl', name: 'Whirlwind', legend: 'Eye of the Storm', v: [null, null, 7, 4], text: v => `Every ${v}s, spin in a full circle of steel`, apply: (p, v) => { p.mods.whirlCd = lowest(p.mods.whirlCd, v); } },
  { id: 'fortune', name: 'Fortune', legend: 'Golden Fate', v: [0.12, 0.2, 0.35, 0.6], text: v => `Orb choices roll ${pct(v)} better odds for rare and legendary`, apply: (p, v) => { p.mods.luck += v; } },
  { id: 'phoenix', name: 'Phoenix Heart', legend: 'Phoenix Heart', v: [null, null, null, 1], text: () => 'Cheat death once: revive at 60% HP in a burst of flame', ok: p => p.mods.phoenix === 0, apply: p => { p.mods.phoenix += 1; } },
];

// rarity weights, shifted up by the orb's own tier, the floor number and Fortune
const BASE = [60, 28, 10, 2];
const TIER_MULT = [[1, 1, 1, 1], [0.6, 1.3, 1.6, 2], [0.2, 0.8, 2.6, 4.5], [0, 0.3, 2.4, 10]];

export function rollRarity(orbTier, luck = 0, floor = 1, rnd = Math.random) {
  const m = TIER_MULT[orbTier] || TIER_MULT[0];
  const w = BASE.map((b, i) => b * m[i]);
  w[1] *= 1 + luck * 0.6;
  w[2] *= (1 + 0.04 * floor) * (1 + luck * 1.5);
  w[3] *= (1 + 0.05 * floor) * (1 + luck * 2);
  w[0] *= Math.max(0.3, 1 - luck * 0.4);
  let r = rnd() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 4; i++) if ((r -= w[i]) < 0) return i;
  return 0;
}

// three different upgrades, each with its own rolled rarity
export function rollChoices(p, orbTier, floor, rnd = Math.random) {
  const out = [];
  const taken = new Set();
  for (let n = 0; n < 3; n++) {
    let rar = rollRarity(orbTier, p.mods.luck, floor, rnd);
    let pool = [];
    for (; rar >= 0; rar--) {
      pool = UPGRADES.filter(u => u.v[rar] != null && !taken.has(u.id) && (!u.ok || u.ok(p)));
      if (pool.length) break;
    }
    if (!pool.length) continue;
    const up = pool[Math.floor(rnd() * pool.length)];
    taken.add(up.id);
    out.push({ up, rarity: rar, value: up.v[rar] });
  }
  return out;
}

export function cardName(c) { return c.rarity === 3 && c.up.legend ? c.up.legend : c.up.name; }
export function cardText(c) { return c.up.text(c.value); }

export function applyChoice(p, c) {
  c.up.apply(p, c.value);
  p.picks.push({ id: c.up.id, rarity: c.rarity });
}

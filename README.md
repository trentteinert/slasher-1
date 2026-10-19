# slasher-1

2.5D roguelike slasher for iPhone: a real 3D world (Three.js) with pixel-art sprite characters,
rendered at low resolution and upscaled with nearest filtering so everything stays chunky.

- **Run it:** `npm install`, then `npm run dev` and open the printed URL on a phone-size screen
  (WASD/arrows on desktop). `npm run build` writes a static site to `dist/`.
- **Sprite sheet:** `/sprites.html` (2D sprites that become the billboards)
- **Controls:** drag anywhere to move; you auto-slash nearby enemies.
- **Loop:** each floor is a bigger generated map. Clear every enemy, then walk into the portal.
  Enemies get tougher each floor, and monsters can drop upgrade orbs (Power, Haste, Reach, Swift, Vigor).
- **Monsters:** chompers, bulbs, brutes, spitters (ranged spores), bat swarms (flying) and chargers
  (telegraphed dash). A boss guards the portal every 5th floor: Great Chomper (slam + summons) and
  Stone Golem (rock volleys + charge), then tougher recolours.
- **Performance:** trees are merged and chunked so far ones are culled, rendering is low-res, and the
  game steps quality down automatically if frames get slow (shadows, then resolution).
- **Menu:** title screen over the live 3D forest (Play, How to Play, Graphics: Auto/High/Low), a pause
  button in-game, and a game-over screen with your collected power-ups and best floor.
- **Orbs:** monsters drop small coloured orbs (Power, Haste, Reach, Swift, Vigor) that give a little permanent
  boost the moment you touch them.
- **Power-ups:** clearing a floor opens a pop-up with 3 choices, each rolled as Common, Uncommon, Rare or
  Legendary. Boss floors give a second, better pop-up (always Rare or better odds). 23 upgrades in
  `src/upgrades.js`, from stat boosts to chain lightning, orbiting blades, crescent waves, whirlwind,
  explosions, an Aegis barrier, Fortune (better odds) and a one-time Phoenix revive. Their pixel-art icons
  are drawn in `src/icons.js` (preview at `/icons.html`).
- **Test seed:** add `?seed=21` to the URL for the same map every time, and `?play` to skip the menu.

Layout: `src/sprites.js` (pixel art as text maps), `src/world.js` (floor generation),
`src/render.js` (3D scene, camera, lighting, billboards), `src/main.js` (game logic + HUD).

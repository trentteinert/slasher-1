# slasher-1

2.5D roguelike slasher for iPhone: a real 3D world (Three.js) with pixel-art sprite characters,
rendered at low resolution and upscaled with nearest filtering so everything stays chunky.

- **Run it:** `npm install`, then `npm run dev` and open the printed URL on a phone-size screen
  (WASD/arrows on desktop). `npm run build` writes a static site to `dist/`.
- **Sprite sheet:** `/sprites.html` (2D sprites that become the billboards)
- **Controls:** drag anywhere to move; you auto-slash nearby enemies.
- **Loop:** each floor is a bigger generated map. Clear every enemy, then walk into the portal.
  Enemies get tougher each floor, and monsters can drop upgrade orbs (Power, Haste, Reach, Swift, Vigor).
- **Test seed:** add `?seed=21` to the URL for the same map every time.

Layout: `src/sprites.js` (pixel art as text maps), `src/world.js` (floor generation),
`src/render.js` (3D scene, camera, lighting, billboards), `src/main.js` (game logic + HUD).

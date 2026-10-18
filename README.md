# slasher-1

2D roguelike slasher for iPhone. Plain JS + canvas, pixel-art sprites defined as text maps.

- **Run it:** `python3 -m http.server` then open `http://localhost:8000` (use the phone-size device view, or WASD/arrows on desktop).
- **Sprite sheet:** `/sprites.html`
- **Controls:** drag anywhere to move; you auto-slash nearby enemies.
- **Loop:** clear a floor, walk into the portal, enemies get tougher each floor. Monsters can drop upgrade orbs (Power, Haste, Reach, Swift, Vigor).

Art lives in `src/sprites.js`, floor generation in `src/world.js`, game logic in `src/main.js`.

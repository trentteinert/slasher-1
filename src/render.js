import * as THREE from 'three';
import { TILE, T, rng } from './world.js';

// 3D world with pixel-art sprite characters (billboards). Game logic stays in pixels
// (x right, y down); here 1 tile = 1 unit, x -> X, y -> Z, and Y is up.
const U = 1 / TILE;
const PITCH = THREE.MathUtils.degToRad(50);
const SIN_P = Math.sin(PITCH), COS_P = Math.cos(PITCH);
const FOV = 30;
const WATER_H = -0.6;
const FOG = 0x16241b;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Renderer {
  constructor(canvas, SPR) {
    this.canvas = canvas;
    this.SPR = SPR;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(FOG);
    this.scene.fog = new THREE.Fog(FOG, 30, 60);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 200);
    this.focus = new THREE.Vector3();
    this.fwd = new THREE.Vector3();
    this.up = new THREE.Vector3(0, COS_P, -SIN_P);
    this.tmp = new THREE.Vector3();
    this.camDist = 40;

    // lighting: sky/ground fill, a warm sun that casts shadows, and a few flickering fire lights
    this.scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5b7a3c, 1.5));
    this.sun = new THREE.DirectionalLight(0xfff0d2, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 60;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);
    this.firelights = [0, 1, 2].map(() => {
      const l = new THREE.PointLight(0xff9a3c, 0, 7, 1.6);
      this.scene.add(l);
      return l;
    });

    // shared assets
    this.texCache = new Map();
    this.shadowGeo = new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x0c1a08, transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: false });
    this.glowTex = this.radialTexture();
    this.billGeos = new Map();
    this.ents = new Map(); // game object -> { mesh, shadow, glow }
    this.world = null;
    this.portalObj = null;

    // hero parts
    this.hero = this.bill(this.tex(SPR.hero.down.idle), 1, 1.25);
    this.shield = this.bill(this.tex(SPR.shield), 0.5, 0.5, true);
    this.sword = this.makeSword();
    this.heroShadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    this.heroShadow.scale.setScalar(0.9);
    this.trail = this.makeTrail();
    this.scene.add(this.hero, this.shield, this.sword, this.heroShadow, this.trail);

    this.particles = this.makeParticles();
    this.scene.add(this.particles.points);
  }

  // ---------- helpers ----------
  tex(canvas) {
    let t = this.texCache.get(canvas);
    if (!t) {
      t = new THREE.CanvasTexture(canvas);
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
      this.texCache.set(canvas, t);
    }
    return t;
  }

  radialTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  // upright quad whose pivot is bottom-centre (or the centre when `centre`)
  bill(map, w, h, centre = false) {
    const key = `${w}x${h}${centre}`;
    let geo = this.billGeos.get(key);
    if (!geo) { geo = new THREE.PlaneGeometry(w, h); if (!centre) geo.translate(0, h / 2, 0); this.billGeos.set(key, geo); }
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide }));
    return m;
  }

  makeSword() {
    const geo = new THREE.PlaneGeometry(5 * U, 19 * U);
    geo.translate(0, 7 * U, 0); // grip centre at the origin
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.tex(this.SPR.sword), alphaTest: 0.5, side: THREE.DoubleSide }));
  }

  makeTrail() {
    const SEG = 28;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.frustumCulled = false; m.visible = false; m.userData.SEG = SEG;
    return m;
  }

  makeParticles() {
    const MAX = 700;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false }));
    points.frustumCulled = false;
    return { points, MAX };
  }

  // ---------- sizing ----------
  resize(cssW, cssH, dpr) {
    // render at roughly one art pixel per render pixel, then upscale with nearest filtering
    const step = Math.max(1, Math.ceil((cssH * dpr) / 380));
    const lowH = Math.round((cssH * dpr) / step), lowW = Math.round((cssW * dpr) / step);
    this.gl.setPixelRatio(1);
    this.gl.setSize(lowW, lowH, false);
    this.camera.aspect = lowW / lowH;
    this.camera.updateProjectionMatrix();
    // distance where one tile spans ~16 render pixels at the focus point
    this.camDist = (lowH / TILE) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    this.scene.fog.near = this.camDist - 4;
    this.scene.fog.far = this.camDist + 34;
    this.cssW = cssW; this.cssH = cssH;
  }

  // world px -> CSS px on screen (for HUD overlays); h is height in px above the ground
  project(x, y, h = 0) {
    this.tmp.set(x * U, 0, y * U).addScaledVector(this.up, h * U).project(this.camera);
    return { x: (this.tmp.x + 1) / 2 * this.cssW, y: (1 - this.tmp.y) / 2 * this.cssH, behind: this.tmp.z > 1 };
  }

  // ---------- world building ----------
  buildWorld(world) {
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.group.traverse(o => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
      this.world.disposables.forEach(d => d.dispose());
    }
    for (const e of this.ents.values()) this.removeEnt(e);
    this.ents.clear();
    if (this.portalObj) { this.scene.remove(this.portalObj.group); this.portalObj = null; }

    const { cols, rows, grid } = world;
    const group = new THREE.Group();
    const disposables = [];
    const r = rng(world.seed ^ 0x9e3779b9);
    const isWater = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && grid[y][x] === T.WATER;

    // terrain: one big painted ground texture on flat tops, lakes sunk below with cliff walls
    const groundCanvas = this.paintGround(world);
    const groundTex = new THREE.CanvasTexture(groundCanvas);
    groundTex.magFilter = THREE.NearestFilter; groundTex.minFilter = THREE.NearestFilter;
    groundTex.generateMipmaps = false; groundTex.colorSpace = THREE.SRGBColorSpace;
    disposables.push(groundTex);
    const gw = cols * TILE, gh = rows * TILE;
    const pos = [], uv = [], nor = [], idx = [];
    const wpos = [], wuv = [], wnor = [], widx = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const h = grid[y][x] === T.WATER ? WATER_H : 0;
        const b = pos.length / 3;
        pos.push(x, h, y, x + 1, h, y, x + 1, h, y + 1, x, h, y + 1);
        for (const [px, py] of [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]]) uv.push(px * TILE / gw, 1 - py * TILE / gh);
        for (let i = 0; i < 4; i++) nor.push(0, 1, 0);
        idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
        if (grid[y][x] !== T.WATER) continue;
        // cliff walls on every side where land meets this lake tile
        for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const nx = x + dx, ny = y + dz;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || isWater(nx, ny)) continue;
          const wb = wpos.length / 3;
          const ex = dx === 0 ? [x, x + 1] : [dx < 0 ? x : x + 1, dx < 0 ? x : x + 1];
          const ez = dx === 0 ? [dz < 0 ? y : y + 1, dz < 0 ? y : y + 1] : [y, y + 1];
          wpos.push(ex[0], 0, ez[0], ex[1], 0, ez[1], ex[1], WATER_H, ez[1], ex[0], WATER_H, ez[0]);
          wuv.push(0, 1, 1, 1, 1, 0, 0, 0);
          for (let i = 0; i < 4; i++) wnor.push(-dx, 0, -dz);
          widx.push(wb, wb + 1, wb + 2, wb, wb + 2, wb + 3);
        }
      }
    }
    const mk = (p, u, n, i) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
      g.setIndex(i);
      return g;
    };
    const ground = new THREE.Mesh(mk(pos, uv, nor, idx), new THREE.MeshLambertMaterial({ map: groundTex }));
    ground.receiveShadow = true;
    group.add(ground);
    if (wpos.length) {
      const cliffTex = new THREE.CanvasTexture(this.cliffCanvas());
      cliffTex.magFilter = THREE.NearestFilter; cliffTex.minFilter = THREE.NearestFilter;
      cliffTex.generateMipmaps = false; cliffTex.colorSpace = THREE.SRGBColorSpace;
      disposables.push(cliffTex);
      const walls = new THREE.Mesh(mk(wpos, wuv, wnor, widx), new THREE.MeshLambertMaterial({ map: cliffTex, side: THREE.DoubleSide }));
      walls.receiveShadow = true;
      group.add(walls);
    }

    // glittering water surface just under the shore line
    const sparkle = this.sparkleCanvas(r);
    const sTex = new THREE.CanvasTexture(sparkle);
    sTex.wrapS = sTex.wrapT = THREE.RepeatWrapping; sTex.magFilter = THREE.NearestFilter; sTex.minFilter = THREE.NearestFilter;
    sTex.generateMipmaps = false; sTex.repeat.set(cols / 4, rows / 4);
    disposables.push(sTex);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows).rotateX(-Math.PI / 2).translate(cols / 2, WATER_H + 0.12, rows / 2),
      new THREE.MeshBasicMaterial({ map: sTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
    group.add(sheet);

    // instanced trees (three stacked low-poly cones + trunk) and rocks
    const trees = [], rocks = [], lights = [], flames = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const t = grid[y][x];
        if (t === T.TREE) trees.push({ x: x + 0.5 + (r() - 0.5) * 0.35, z: y + 0.5 + (r() - 0.5) * 0.35, s: 0.95 + r() * 0.3, rot: r() * 6.28, pink: r() < 0.05, v: 0.92 + r() * 0.16 });
        else if (t === T.ROCK) rocks.push({ x: x + 0.5, z: y + 0.5, s: 0.8 + r() * 0.5, rot: r() * 6.28 });
        else if (t === T.FIRE) this.addFire(group, x + 0.5, y + 0.5, lights, flames, disposables);
        else if (t === T.TORCH) this.addTorch(group, x + 0.5, y + 0.5, lights, flames);
      }
    }
    this.addTrees(group, trees, disposables, true);
    // beyond the map edge: a ground skirt and a wide band of forest so the world never shows its end
    const M = 14, outer = [];
    for (let y = -M; y < rows + M; y++) {
      for (let x = -M; x < cols + M; x++) {
        if (x >= 0 && y >= 0 && x < cols && y < rows) continue;
        if (r() < 0.9) outer.push({ x: x + 0.5 + (r() - 0.5) * 0.5, z: y + 0.5 + (r() - 0.5) * 0.5, s: 0.95 + r() * 0.35, rot: r() * 6.28, pink: r() < 0.05, v: 0.88 + r() * 0.16 });
      }
    }
    this.addTrees(group, outer, disposables, false);
    const skirtMat = new THREE.MeshLambertMaterial({ color: 0x5a7a30 });
    disposables.push(skirtMat);
    const X0 = -M - 10, X1 = cols + M + 10, Z0 = -M - 10, Z1 = rows + M + 10;
    for (const [x0, x1, z0, z1] of [[X0, X1, Z0, 0], [X0, X1, rows, Z1], [X0, 0, 0, rows], [cols, X1, 0, rows]]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2), skirtMat);
      strip.receiveShadow = true;
      group.add(strip);
    }
    this.addRocks(group, rocks);

    this.world = { group, disposables, lights, flames, sparkle: sTex, cols, rows };
    this.scene.add(group);
  }

  paintGround(world) {
    const { cols, rows, grid, variant } = world;
    const w = cols * TILE, h = rows * TILE;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const r = rng(world.seed);
    const isWater = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && grid[y][x] === T.WATER;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) g.drawImage(this.SPR.grass[variant[y][x]], x * TILE, y * TILE);

    // smooth value noise thresholded into crisp darker/lighter grass patches; lakes in flat bands
    const img = g.getImageData(0, 0, w, h), d = img.data;
    const cell = 9, nx = Math.ceil(w / cell) + 2, ny = Math.ceil(h / cell) + 2;
    const noise = Float32Array.from({ length: nx * ny }, () => r());
    const smooth = a => a * a * (3 - 2 * a);
    const n = (px, py) => {
      const fx = px / cell, fy = py / cell, ix = Math.floor(fx), iy = Math.floor(fy);
      const u = smooth(fx - ix), v = smooth(fy - iy);
      const A = noise[iy * nx + ix], B = noise[iy * nx + ix + 1], C = noise[(iy + 1) * nx + ix], D = noise[(iy + 1) * nx + ix + 1];
      return (A * (1 - u) + B * u) * (1 - v) + (C * (1 - u) + D * u) * v;
    };
    const WATER = [[0xd7, 0xed, 0xe6], [0x9f, 0xd0, 0xd0], [0x63, 0xb4, 0xb6], [0x3f, 0x9a, 0xa3]];
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const i = (py * w + px) * 4;
        const tx = (px / TILE) | 0, ty = (py / TILE) | 0;
        const nn = n(px, py);
        if (grid[ty][tx] !== T.WATER) {
          if (nn > 0.62) { d[i] *= 0.9; d[i + 1] *= 0.93; d[i + 2] *= 0.88; }
          else if (nn < 0.2) { d[i] = Math.min(255, d[i] + 9); d[i + 1] = Math.min(255, d[i + 1] + 12); d[i + 2] = Math.min(255, d[i + 2] + 5); }
          continue;
        }
        let dist = 99;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (isWater(tx + ox, ty + oy)) continue;
            const rx0 = (tx + ox) * TILE, ry0 = (ty + oy) * TILE;
            const ddx = Math.max(rx0 - px, 0, px - (rx0 + TILE - 1)), ddy = Math.max(ry0 - py, 0, py - (ry0 + TILE - 1));
            dist = Math.min(dist, Math.hypot(ddx, ddy));
          }
        }
        const t = dist + (nn - 0.5) * 10;
        let col = t < 2 ? WATER[0] : t < 7 ? WATER[1] : t < 14 ? WATER[2] : WATER[3];
        if (col !== WATER[0] && ((px * 7 + py * 13) % 61 === 0)) col = WATER[0];
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  cliffCanvas() {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = '#8a5a48'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#b9c7a6'; g.fillRect(0, 0, 16, 2);
    g.fillStyle = '#6a4034';
    for (const [x, y, w] of [[1, 4, 5], [9, 5, 6], [3, 8, 7], [11, 10, 4], [0, 12, 5], [8, 13, 6]]) g.fillRect(x, y, w, 1);
    g.fillStyle = '#a06c58';
    for (const [x, y] of [[7, 3], [13, 7], [2, 10], [10, 12], [5, 14]]) g.fillRect(x, y, 2, 1);
    return c;
  }

  sparkleCanvas(r) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(r() * 64), y = Math.floor(r() * 64);
      g.fillStyle = r() < 0.5 ? '#cfeeee' : '#7fc8cc';
      g.fillRect(x, y, 2 + Math.floor(r() * 3), 1);
    }
    return c;
  }

  addTrees(group, trees, disposables, shadows) {
    if (!trees.length) return;
    const GREEN = ['#245c40', '#2f7550', '#418c62'], PINK = ['#6f3750', '#8d4d65', '#aa6679'];
    const geos = [
      new THREE.ConeGeometry(0.66, 0.85, 8).translate(0, 0.88, 0),
      new THREE.ConeGeometry(0.52, 0.78, 8).translate(0, 1.32, 0),
      new THREE.ConeGeometry(0.36, 0.72, 8).translate(0, 1.74, 0),
    ];
    const trunkGeo = new THREE.CylinderGeometry(0.11, 0.16, 0.6, 6).translate(0, 0.3, 0);
    const mat = new THREE.MeshLambertMaterial({ flatShading: true });
    disposables.push(mat);
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    const parts = [...geos.map((g, i) => ({ g, i })), { g: trunkGeo, i: -1 }];
    for (const { g, i } of parts) {
      const m = new THREE.InstancedMesh(g, mat, trees.length);
      m.castShadow = shadows; m.receiveShadow = shadows;
      m.userData.shared = false;
      trees.forEach((t, n) => {
        dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, t.rot, 0); dummy.scale.setScalar(t.s * 0.86); dummy.updateMatrix();
        m.setMatrixAt(n, dummy.matrix);
        col.set(i < 0 ? '#5a3a28' : (t.pink ? PINK : GREEN)[i]).multiplyScalar(t.v);
        m.setColorAt(n, col);
      });
      group.add(m);
    }
  }

  addRocks(group, rocks) {
    if (!rocks.length) return;
    const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 0), new THREE.MeshLambertMaterial({ flatShading: true, color: 0xffffff }), rocks.length);
    m.castShadow = true; m.receiveShadow = true;
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    rocks.forEach((rk, n) => {
      dummy.position.set(rk.x, 0.18, rk.z); dummy.rotation.set(0, rk.rot, 0); dummy.scale.set(rk.s * 1.1, rk.s * 0.7, rk.s * 0.9); dummy.updateMatrix();
      m.setMatrixAt(n, dummy.matrix);
      m.setColorAt(n, col.set('#8b6b5c').offsetHSL(0, 0, (n % 3 - 1) * 0.03));
    });
    group.add(m);
  }

  glow(group, x, z, size, color) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.glowTex, color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.position.set(x, 0.04, z);
    m.userData.shared = false;
    group.add(m);
    return m;
  }

  addFire(group, x, z, lights, flames, disposables) {
    const logMat = new THREE.MeshLambertMaterial({ color: 0x5a3a28 });
    disposables.push(logMat);
    for (const a of [0.5, -0.5]) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 6), logMat);
      log.rotation.set(Math.PI / 2, 0, a); log.position.set(x, 0.08, z);
      log.castShadow = true;
      group.add(log);
    }
    const flame = this.bill(this.tex(this.SPR.fire[0]), 1, 1);
    flame.userData.flameOffset = -0.18;
    group.add(flame);
    flames.push({ mesh: flame, x, z, h: 0, glow: this.glow(group, x, z, 3.4, 0xff8a30), scale: 1 });
    lights.push({ x, z, y: 0.7 });
  }

  addTorch(group, x, z, lights, flames) {
    const stone = new THREE.MeshLambertMaterial({ color: 0x8d8f98, flatShading: true });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.8, 7), stone);
    post.position.set(x, 0.4, z); post.castShadow = true; post.receiveShadow = true;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.16, 0.2, 7), stone);
    bowl.position.set(x, 0.9, z); bowl.castShadow = true;
    group.add(post, bowl);
    const flame = this.bill(this.tex(this.SPR.fire[0]), 0.8, 0.8);
    group.add(flame);
    flames.push({ mesh: flame, x, z, h: 1.0 * TILE, glow: this.glow(group, x, z, 3.0, 0xffa040), scale: 0.8 });
    lights.push({ x, z, y: 1.3 });
  }

  // ---------- per-frame ----------
  place(mesh, x, z, h = 0, dx = 0, depth = 0) {
    // x,z in world units; h along the screen-up direction of an upright billboard
    mesh.position.set(x + dx, 0, z).addScaledVector(this.up, h).addScaledVector(this.fwd, depth);
    mesh.quaternion.copy(this.camera.quaternion);
  }

  ent(obj, make) {
    let e = this.ents.get(obj);
    if (!e) { e = make(); this.ents.set(obj, e); }
    e.seen = true;
    return e;
  }
  removeEnt(e) {
    this.scene.remove(e.mesh);
    if (e.shadow) this.scene.remove(e.shadow);
    if (e.glow) this.scene.remove(e.glow);
    e.mesh.material.dispose();
  }

  heroView(a) {
    const c = Math.cos(a), sn = Math.sin(a);
    if (Math.abs(c) > Math.abs(sn)) return { v: 'side', f: c >= 0 ? 1 : -1 };
    return { v: sn >= 0 ? 'down' : 'up', f: c >= 0 ? 1 : -1 };
  }

  render(s) {
    const { time, cam, player, enemies, orbs, portal, particles, shake } = s;
    const sx = shake ? (Math.random() - 0.5) * shake * U * 2 : 0, sz = shake ? (Math.random() - 0.5) * shake * U * 2 : 0;

    // camera: fixed tilt looking north, following the focus point
    const fx = cam.x * U + sx, fz = cam.y * U + sz;
    this.focus.set(fx, 0, fz);
    this.camera.position.set(fx, this.camDist * SIN_P, fz + this.camDist * COS_P);
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this.fwd);

    // sun follows the view; snapped so shadows don't shimmer
    const sx0 = Math.round(fx * 4) / 4, sz0 = Math.round(fz * 4) / 4;
    this.sun.target.position.set(sx0, 0, sz0);
    this.sun.position.set(sx0 - 9, 20, sz0 + 7);

    this.renderHero(player, time);
    this.renderEnemies(enemies);
    this.renderOrbs(orbs, time);
    this.renderPortal(portal, time);
    this.renderFlames(time, fx, fz);
    this.renderParticles(particles);
    if (this.world) this.world.sparkle.offset.set(time * 0.012, time * 0.008);

    for (const [k, e] of this.ents) { if (!e.seen) { this.removeEnt(e); this.ents.delete(k); } e.seen = false; }
    this.gl.render(this.scene, this.camera);
  }

  renderHero(p, time) {
    const sw = p.swing;
    const { v, f } = this.heroView(sw ? sw.a : p.aim);
    const q = sw ? sw.t / sw.dur : 0;
    const lunge = sw ? Math.sin(Math.min(q, 1) * Math.PI) * 2.5 : 0;
    const hx = (p.x + (sw ? Math.cos(sw.a) * lunge : 0)) * U, hz = (p.y + (sw ? Math.sin(sw.a) * lunge : 0)) * U;
    const bob = (p.walk ? Math.abs(Math.sin(p.walk)) * 1.5 : 0) * U;
    const frame = p.walk ? (Math.floor(p.walk / 2.2) % 2 ? 'walkA' : 'walkB') : 'idle';

    this.hero.material.map = this.tex(this.SPR.hero[v][frame]);
    this.hero.scale.x = v === 'side' && f < 0 ? -1 : 1;
    this.hero.material.color.setScalar(p.hurt > 0 && Math.floor(time * 20) % 2 ? 3 : 1);
    this.place(this.hero, hx, hz, bob);
    this.heroShadow.position.set(p.x * U, 0.03, p.y * U);

    // shield on the off-hand arm
    const sdx = v === 'down' ? 7 : v === 'up' ? -7 : -f * 5;
    this.place(this.shield, hx, hz, bob + 8 * U, sdx * U, v === 'down' ? -0.05 : 0.06);

    // sword: rests over the back, or sweeps through its arc
    let theta, len = 1, behind;
    const sway = Math.sin(time * 3) * 0.04;
    if (sw) {
      const a0 = sw.a - sw.dir * (p.arc / 2 + 0.5), a1 = sw.a + sw.dir * (p.arc / 2);
      const e = 1 - (1 - Math.min(q, 1)) * (1 - Math.min(q, 1));
      const ang = a0 + (a1 - a0) * e;
      theta = Math.atan2(Math.sin(ang) * SIN_P, Math.cos(ang));
      len = 0.4 + 0.6 * Math.hypot(Math.cos(ang), Math.sin(ang) * SIN_P);
      behind = Math.sin(ang) < 0;
      const hxs = hx + Math.cos(sw.a) * 3 * U, hzs = hz + Math.sin(sw.a) * 3 * U;
      this.place(this.sword, hxs, hzs, 10 * U + bob, 0, behind ? 0.07 : -0.07);
      // glowing crescent on the ground chasing the blade
      const head = e, tail = (() => { const t = Math.min(Math.max(q - 0.55, 0), 1); return 1 - (1 - t) * (1 - t); })();
      this.updateTrail(hx, hz, a0 + (a1 - a0) * tail, a0 + (a1 - a0) * head, p.range * 0.92 * U, head > tail + 0.01);
    } else {
      this.trail.visible = false;
      if (v === 'down') { theta = -1.15 + sway; this.place(this.sword, hx, hz, 10 * U + bob, 4 * U, 0.07); behind = true; }
      else if (v === 'up') { theta = -1.95 + sway; this.place(this.sword, hx, hz, 11 * U + bob, -2 * U, -0.07); behind = false; }
      else { theta = (f > 0 ? -2.2 : -0.94) + sway; this.place(this.sword, hx, hz, 10 * U + bob, -f * 2 * U, 0.07); behind = true; }
    }
    const k = p.range / 24;
    this.sword.scale.set(k, k * len, 1);
    this.sword.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -(theta + Math.PI / 2)));
  }

  updateTrail(cx, cz, a0, a1, R, show) {
    this.trail.visible = show;
    if (!show) return;
    const SEG = this.trail.userData.SEG, pos = this.trail.geometry.attributes.position.array;
    for (let i = 0; i <= SEG; i++) {
      const a = a0 + (a1 - a0) * (i / SEG), c = Math.cos(a), s = Math.sin(a);
      pos.set([cx + c * (R - 0.3), 0.07, cz + s * (R - 0.3), cx + c * (R + 0.05), 0.07, cz + s * (R + 0.05)], i * 6);
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
  }

  renderEnemies(enemies) {
    for (const e of enemies) {
      const ent = this.ent(e, () => {
        const mesh = this.bill(this.tex(this.SPR[e.type.sprite]), 1, 1);
        const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
        this.scene.add(mesh, shadow);
        return { mesh, shadow };
      });
      const size = e.type.size * U;
      const bob = Math.abs(Math.sin(e.phase)) * 1.5 * U;
      ent.mesh.scale.setScalar(size);
      ent.mesh.material.color.setScalar(e.flash > 0 ? 3 : 1);
      this.place(ent.mesh, e.x * U, e.y * U, bob - 0.1 * size);
      ent.shadow.scale.setScalar(size * 0.75);
      ent.shadow.position.set(e.x * U, 0.03, e.y * U);
    }
  }

  renderOrbs(orbs, time) {
    for (const o of orbs) {
      const ent = this.ent(o, () => {
        const mesh = this.bill(this.tex(o.kind.sprite), 0.5, 0.5, true);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4),
          new THREE.MeshBasicMaterial({ map: this.glowTex, color: o.kind.colors.m, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
        this.scene.add(mesh, glow, shadow);
        return { mesh, glow, shadow };
      });
      const bob = Math.sin(o.t * 4) * 0.08;
      this.place(ent.mesh, o.x * U, o.y * U, 0.45 + bob);
      this.place(ent.glow, o.x * U, o.y * U, 0.45 + bob, 0, 0.08);
      ent.shadow.scale.setScalar(0.35);
      ent.shadow.position.set(o.x * U, 0.03, o.y * U);
    }
  }

  renderPortal(portal, time) {
    if (!portal) return;
    if (!this.portalObj || this.portalObj.ref !== portal) {
      if (this.portalObj) this.scene.remove(this.portalObj.group);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
      const group = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5 }));
      disc.position.y = 0.05;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 4, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x7fe6f0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      beam.position.y = 2;
      group.add(disc, beam);
      group.position.set(portal.x * U, 0, portal.y * U);
      this.scene.add(group);
      this.portalObj = { ref: portal, group, canvas, tex, beam, ctx: canvas.getContext('2d') };
    }
    const po = this.portalObj, g = po.ctx;
    g.clearRect(0, 0, 32, 32);
    for (let py = 0; py < 32; py++) {
      for (let px = 0; px < 32; px++) {
        const d = Math.hypot(px - 15.5, py - 15.5);
        if (d > 15) continue;
        const band = Math.floor(d / 2 - time * 6 + 40) % 3;
        g.fillStyle = d > 13.5 ? '#2a1f33'
          : portal.open ? (band === 0 ? '#ffffff' : band === 1 ? '#5cd6e6' : '#8a4fd0')
          : (band === 0 ? '#555a68' : '#3d4150');
        g.fillRect(px, py, 1, 1);
      }
    }
    po.tex.needsUpdate = true;
    po.beam.visible = portal.open;
    po.beam.material.opacity = 0.18 + Math.sin(time * 4) * 0.05;
  }

  renderFlames(time, fx, fz) {
    if (!this.world) return;
    const fi = Math.floor(time * 6) % 2;
    const map = this.tex(this.SPR.fire[fi]);
    const flick = 0.85 + Math.sin(time * 17) * 0.08 + Math.sin(time * 9.3) * 0.07;
    for (const f of this.world.flames) {
      f.mesh.material.map = map;
      this.place(f.mesh, f.x, f.z, f.h * U + (f.mesh.userData.flameOffset || 0));
      f.mesh.scale.setScalar(1);
      f.glow.material.opacity = 0.42 * flick;
    }
    // the three nearest fires actually light the scene
    const near = this.world.lights.map(l => ({ l, d: (l.x - fx) ** 2 + (l.z - fz) ** 2 })).sort((a, b) => a.d - b.d).slice(0, 3);
    this.firelights.forEach((pl, i) => {
      const n = near[i];
      if (n && n.d < 18 * 18) { pl.position.set(n.l.x, n.l.y, n.l.z); pl.intensity = 5.5 * flick; } else pl.intensity = 0;
    });
  }

  renderParticles(parts) {
    const { points, MAX } = this.particles;
    const pos = points.geometry.attributes.position.array, col = points.geometry.attributes.color.array;
    const n = Math.min(parts.length, MAX);
    for (let i = 0; i < n; i++) {
      const p = parts[i];
      pos[i * 3] = p.x * U; pos[i * 3 + 1] = 0.1 + p.h * U; pos[i * 3 + 2] = p.y * U;
      const a = Math.min(1, p.life * 3);
      col[i * 3] = p.rgb[0] * a; col[i * 3 + 1] = p.rgb[1] * a; col[i * 3 + 2] = p.rgb[2] * a;
    }
    points.geometry.setDrawRange(0, n);
    points.geometry.attributes.position.needsUpdate = true;
    points.geometry.attributes.color.needsUpdate = true;
  }
}

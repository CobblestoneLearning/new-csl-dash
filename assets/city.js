/* ===================================================================
   COBBLESTONE LEARNING · REPOSITORY HUB (v2)
   THE SOURCE — the estate as a city, built from the real file trees.
   -------------------------------------------------------------------
   109 cubes is a chart with a camera on it. This is built one storey
   down: every *file* in every repository is a tower.

     district        repo            (treemap over the cap)
     block           folder          (treemap, recursive, any depth)
     tower           file            (height = bytes of that file)
     lit windows     ignition        (search, hover, selection)

   ~2,400 towers across 109 districts, laid out from the actual
   `git/trees` of each repo — so the skyline is the shape of the
   codebase, not a decoration of it. Trees stream in and districts
   rise as they land.

   It is night here on purpose: the windows are the data, and bloom
   needs headroom that a white page doesn't have. List mode stays
   light and carries everything for anyone who can't run WebGL.
   =================================================================== */
import * as THREE from 'three';
import { OrbitControls } from './vendor/addons/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from './vendor/addons/CSS2DRenderer.js';
import { EffectComposer } from './vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/addons/postprocessing/OutputPass.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const CAP = 260;              /* the cap the city stands on      */
const MAX_H = 46;             /* tallest tower                   */
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ---------- squarified treemap ---------- */
function squarify(items, x, y, w, h, out) {
  if (!items.length || w <= 0 || h <= 0) return;
  if (items.length === 1) { out.push({ item: items[0], x, y, w, h }); return; }
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const horizontal = w >= h;
  let best = 1, bestRatio = Infinity, acc = 0;
  for (let n = 1; n <= items.length; n++) {
    acc += items[n - 1].value;
    const side = (horizontal ? w : h) * (acc / total);
    const other = horizontal ? h : w;
    let worst = 0;
    for (let k = 0; k < n; k++) {
      const a = (items[k].value / acc) * other || 1e-6;
      worst = Math.max(worst, Math.max(side / a, a / side));
    }
    if (worst < bestRatio) { bestRatio = worst; best = n; } else break;
  }
  const row = items.slice(0, best), rest = items.slice(best);
  const rowSum = row.reduce((s, i) => s + i.value, 0) || 1;
  const frac = rowSum / total;
  if (horizontal) {
    const rw = w * frac; let cy = y;
    row.forEach((it) => { const rh = h * (it.value / rowSum); out.push({ item: it, x, y: cy, w: rw, h: rh }); cy += rh; });
    squarify(rest, x + rw, y, w - rw, h, out);
  } else {
    const rh = h * frac; let cx = x;
    row.forEach((it) => { const rw = w * (it.value / rowSum); out.push({ item: it, x: cx, y, w: rw, h: rh }); cx += rw; });
    squarify(rest, x, y + rh, w, h - rh, out);
  }
}

/* Turn a flat list of paths into a directory tree. */
function toTree(files) {
  const root = { dirs: new Map(), files: [], value: 0 };
  files.forEach((f) => {
    const parts = f.p.split('/');
    let node = root;
    const v = Math.max(120, f.s || 120);
    node.value += v;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], { dirs: new Map(), files: [], value: 0, name: parts[i] });
      node = node.dirs.get(parts[i]);
      node.value += v;
    }
    node.files.push({ path: f.p, name: parts[parts.length - 1], size: f.s || 0, value: v });
  });
  return root;
}

/* Recursive treemap over that tree. Padding at each level is what
   leaves streets between the blocks. */
function layoutTree(node, x, y, w, h, depth, out) {
  const pad = depth === 0 ? 2.6 : depth === 1 ? 1.4 : 0.7;
  const ix = x + pad, iy = y + pad;
  const iw = Math.max(0.6, w - pad * 2), ih = Math.max(0.6, h - pad * 2);
  const items = [];
  node.dirs.forEach((d) => items.push({ kind: 'dir', node: d, value: d.value }));
  node.files.forEach((f) => items.push({ kind: 'file', file: f, value: f.value }));
  if (!items.length) return;
  items.sort((a, b) => b.value - a.value);
  const cells = [];
  squarify(items, ix, iy, iw, ih, cells);
  cells.forEach((c) => {
    if (c.item.kind === 'dir') layoutTree(c.item.node, c.x, c.y, c.w, c.h, depth + 1, out);
    else out.push({ file: c.item.file, x: c.x, y: c.y, w: c.w, h: c.h });
  });
}

/* ------------------------------------------------------------------
   Tower material — MeshStandardMaterial with lit windows injected.
   Keeping the PBR base means the city still takes real lighting; the
   windows are additive emissive driven by a per-instance value.
   ------------------------------------------------------------------ */
function towerMaterial(tint) {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tint).multiplyScalar(0.44),
    roughness: 0.72, metalness: 0.18
  });
  mat.userData.glow = new THREE.Color(tint);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = { value: mat.userData.glow };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aLit;
        attribute float aH;
        attribute float aSeed;
        varying float vLit; varying float vH; varying float vSeed; varying vec3 vLocal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLit = aLit; vH = aH; vSeed = aSeed; vLocal = position;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uGlow;
        varying float vLit; varying float vH; varying float vSeed; varying vec3 vLocal;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // window grid: rows scale with the tower's real height so a tall
        // file reads as a tall building, not a stretched texture
        float rows = max(2.0, floor(vH / 2.4));
        float band = fract(vLocal.y * rows + vSeed * 0.37);
        float cols = fract((vLocal.x + vLocal.z) * 7.0 + vSeed * 2.1);
        float win = step(0.30, band) * step(band, 0.72)
                  * step(0.28, cols) * step(cols, 0.70);
        // no windows on the roof
        win *= 1.0 - smoothstep(0.55, 0.92, abs(vNormal.y));
        // a few windows are always on, the rest light up when ignited
        float base = step(0.52, fract(vSeed * 41.7 + floor(vLocal.y * rows)));
        float amount = base * 0.95 + vLit * 1.9;
        totalEmissiveRadiance += uGlow * win * amount;
        // ground-up gradient so the bases sink into the dark
        diffuseColor.rgb *= mix(0.45, 1.15, clamp(vLocal.y, 0.0, 1.0));`);
    mat.userData.shader = shader;
  };
  return mat;
}

export class City {
  constructor(host, opts = {}) {
    this.host = host;
    this.onPick = opts.onPick || (() => {});
    this.onSelect = opts.onSelect || (() => {});
    this.onHover = opts.onHover || (() => {});
    this.onProgress = opts.onProgress || (() => {});

    this.districts = new Map();     /* repo name -> district record */
    this.repos = [];
    this.filter = null;
    this.running = false;
    this.userMoved = false;
    this.flight = null;
    this.hover = null;
    this.selected = null;
    this.t0 = performance.now();
    this.wave = null;
    this.pointer = new THREE.Vector2(-10, -10);
    this.hasPointer = false;

    this._initScene();
    this._bind();
  }

  /* ================= scene ================= */
  _initScene() {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    r.setClearColor(0x0b1016, 1);
    r.domElement.className = 'city-gl';
    this.host.appendChild(r.domElement);
    this.renderer = r;

    const l = new CSS2DRenderer();
    l.domElement.className = 'city-labels';
    this.host.appendChild(l.domElement);
    this.labelRenderer = l;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0b1016, 0.0022);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.6, 4000);
    this.camera.position.set(0, CAP * 0.62, CAP * 0.72);

    const c = new OrbitControls(this.camera, r.domElement);
    c.enableDamping = true; c.dampingFactor = 0.07;
    c.rotateSpeed = 0.5; c.zoomSpeed = 0.9; c.panSpeed = 0.7;
    c.screenSpacePanning = false;
    c.minDistance = 14;                       /* street level */
    c.maxDistance = CAP * 2.2;
    c.minPolarAngle = 0.08;
    c.maxPolarAngle = Math.PI / 2 - 0.035;
    c.target.set(0, 6, 0);
    c.addEventListener('start', () => { this.userMoved = true; this.flight = null; });
    this.controls = c;

    /* Night lighting: a cool key for form, a warm bounce, and the city's
       own windows do the rest through bloom. */
    const key = new THREE.DirectionalLight(0xa8ccec, 1.75);
    key.position.set(-CAP * 0.5, CAP * 0.9, CAP * 0.45);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 20; key.shadow.camera.far = CAP * 3;
    const s = CAP * 0.62;
    key.shadow.camera.left = -s; key.shadow.camera.right = s;
    key.shadow.camera.top = s; key.shadow.camera.bottom = -s;
    key.shadow.bias = -0.0012; key.shadow.normalBias = 0.5;
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0x39597a, 0x070b11, 1.15));
    const rim = new THREE.DirectionalLight(0x27aae1, 0.55);
    rim.position.set(CAP * 0.6, CAP * 0.2, -CAP * 0.6);
    this.scene.add(rim);

    this.rig = new THREE.Group();
    this.scene.add(this.rig);

    /* the cap the city stands on */
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(CAP, 9, CAP),
      new THREE.MeshStandardMaterial({ color: 0x141b24, roughness: 0.92, metalness: 0.1 })
    );
    deck.position.y = -4.5;
    deck.receiveShadow = true;
    this.rig.add(deck);

    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(CAP * 1.035, 3.2, CAP * 1.035),
      new THREE.MeshStandardMaterial({ color: 0x27aae1, roughness: 0.4, metalness: 0.3,
        emissive: 0x0d5f85, emissiveIntensity: 1.1 })
    );
    skirt.position.y = -9.6;
    this.rig.add(skirt);

    /* the shockwave ring a search sends out */
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.035, 96),
      new THREE.MeshBasicMaterial({ color: 0x27aae1, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.6;
    this.rig.add(this.ring);

    this.raycaster = new THREE.Raycaster();
    this.labels = [];
    this._initComposer();
    this._resize();
  }

  _initComposer() {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(size, 0.80, 0.70, 0.55);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /* ================= districts ================= */
  setRepos(repos, types) {
    this.repos = repos;
    this.types = types;
    this.tint = {};
    types.forEach((t) => { this.tint[t.id] = t.color; });

    this._clear();
    const val = (r) => 0.4 + Math.log10(1 + (r.bytes || 0));
    const groups = types
      .map((t) => ({ id: t.id, repos: repos.filter((r) => r.type === t.id).sort((a, b) => val(b) - val(a)) }))
      .filter((g) => g.repos.length)
      .map((g) => ({ ...g, value: g.repos.reduce((s, r) => s + val(r), 0) }))
      .sort((a, b) => b.value - a.value);

    const typeCells = [];
    squarify(groups, -CAP / 2, -CAP / 2, CAP, CAP, typeCells);

    typeCells.forEach((tc) => {
      const cells = [];
      squarify(tc.item.repos.map((r) => ({ repo: r, value: val(r) })),
        tc.x + 2, tc.y + 2, Math.max(1, tc.w - 4), Math.max(1, tc.h - 4), cells);
      cells.forEach((c) => {
        const repo = c.item.repo;
        this.districts.set(repo.name, {
          repo, x: c.x, y: c.y, w: c.w, h: c.h,
          type: tc.item.id, mesh: null, towers: [], built: false
        });
        this._addLabel(repo, c, this.tint[tc.item.id]);
      });
    });

    this.resetView(true);
  }

  /* Called per repo as its git tree arrives — the city rises in pieces. */
  addRepoTree(name, files) {
    const d = this.districts.get(name);
    if (!d || d.built) return;
    d.built = true;
    if (!files || !files.length) return;

    const cells = [];
    layoutTree(toTree(files), d.x, d.y, d.w, d.h, 0, cells);
    if (!cells.length) return;

    let maxSize = 1;
    cells.forEach((c) => { maxSize = Math.max(maxSize, c.file.size || 0); });

    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = towerMaterial(this.tint[d.type] || '#27AAE1');
    const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;

    const lit = new Float32Array(cells.length);
    const hs = new Float32Array(cells.length);
    const seeds = new Float32Array(cells.length);
    geo.setAttribute('aLit', new THREE.InstancedBufferAttribute(lit, 1));
    geo.setAttribute('aH', new THREE.InstancedBufferAttribute(hs, 1));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));

    d.towers = cells.map((c, i) => {
      const mag = Math.pow((c.file.size || 0) / maxSize, 0.38);
      const h = 1.6 + mag * MAX_H;
      hs[i] = h;
      seeds[i] = (((i * 2654435761) >>> 0) % 1000) / 1000;
      return {
        file: c.file, repo: d.repo, i,
        x: c.x + c.w / 2, z: c.y + c.h / 2,
        w: Math.max(0.35, c.w - 0.28), d: Math.max(0.35, c.h - 0.28),
        h, lit: 0, litTarget: 0, rise: 0
      };
    });
    d.mesh = mesh;
    d.litAttr = geo.getAttribute('aLit');
    d.t0 = performance.now();
    this.rig.add(mesh);
    this._writeDistrict(d, 0);
    this.onProgress(this.districts.size, [...this.districts.values()].filter((x) => x.built).length);
  }

  _writeDistrict(d, intro) {
    if (!d.mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < d.towers.length; i++) {
      const t = d.towers[i];
      const stagger = Math.max(0, Math.min(1, intro * 1.8 - (i / d.towers.length) * 0.5));
      const e = 1 - Math.pow(1 - stagger, 4);
      p.set(t.x, 0, t.z);
      s.set(t.w, Math.max(0.05, t.h * e), t.d);
      m.compose(p, q, s);
      d.mesh.setMatrixAt(i, m);
    }
    d.mesh.instanceMatrix.needsUpdate = true;
  }

  _addLabel(repo, cell, color) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'city-label';
    el.innerHTML = '<span class="cl-dot" style="background:' + color + '"></span>' +
      '<span class="cl-name"></span>';
    el.querySelector('.cl-name').textContent = repo.isSnippet ? repo.label : repo.name;
    el.addEventListener('click', (e) => { e.stopPropagation(); this.focus(repo.name); this.onSelect(repo, null); });
    const obj = new CSS2DObject(el);
    obj.position.set(cell.x + cell.w / 2, MAX_H * 0.5, cell.y + cell.h / 2);
    obj.userData = { repo, area: cell.w * cell.h };
    this.rig.add(obj);
    this.labels.push(obj);
    /* biggest districts first — the LOD below reveals them in this order */
    this.labels.sort((a, b) => b.userData.area - a.userData.area);
    this.labels.forEach((o, i) => { o.userData.rank = i; });
  }

  /* ================= filtering ================= */
  setFilter(set) {
    this.filter = set;
    /* a wave that sweeps out from the middle and ignites as it passes */
    this.wave = set ? { t0: performance.now(), r: 0 } : null;
    if (!set) {
      this.districts.forEach((d) => d.towers.forEach((t) => { t.litTarget = 0; t.delay = 0; }));
      this.ring.material.opacity = 0;
      return;
    }
    this.districts.forEach((d) => {
      const on = !!set[d.repo.name];
      d.towers.forEach((t) => {
        const dist = Math.hypot(t.x, t.z);
        t.delay = dist / (CAP * 0.72);
        t.litTarget = on ? 1 : 0;
      });
    });
    this.frameMatches();
  }

  frameMatches() {
    const hits = [...this.districts.values()].filter((d) => !this.filter || this.filter[d.repo.name]);
    if (!hits.length || hits.length === this.districts.size) return this.resetView(true);
    const box = new THREE.Box3();
    hits.forEach((d) => {
      box.expandByPoint(new THREE.Vector3(d.x, 0, d.y));
      box.expandByPoint(new THREE.Vector3(d.x + d.w, MAX_H, d.y + d.h));
    });
    const c = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 30);
    this._flyTo(c, radius * 2.5);
  }

  clearSelection() { this.selected = null; this._setHover(null); }

  focus(name) {
    const d = this.districts.get(name);
    if (!d) return;
    this.selected = name;
    this._flyTo(new THREE.Vector3(d.x + d.w / 2, MAX_H * 0.35, d.y + d.h / 2),
      Math.max(34, Math.hypot(d.w, d.h) * 1.5));
  }

  _fitDistance() {
    const radius = CAP * 0.72;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    return Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2)) * 0.70;
  }

  resetView(soft) {
    this.userMoved = false;
    this.selected = null;
    this._flyTo(new THREE.Vector3(0, MAX_H * 0.22, 0), this._fitDistance(), soft ? 900 : 1300);
  }

  _flyTo(target, dist, ms) {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.y < 0.28) dir.y = 0.48;
    dir.normalize();
    this.flight = {
      t0: performance.now(), ms: REDUCED.matches ? 1 : (ms || 1050),
      fromT: this.controls.target.clone(), toT: target.clone(),
      fromP: this.camera.position.clone(), toP: target.clone().addScaledVector(dir, dist)
    };
  }

  /* ================= interaction ================= */
  _bind() {
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (ev) => {
      const r = el.getBoundingClientRect();
      this.pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      this.pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      this.hasPointer = true; this.lastEv = ev;
    });
    el.addEventListener('pointerleave', () => {
      this.hasPointer = false; this.pointer.set(-10, -10); this._setHover(null);
    });

    let down = null, moved = 0;
    el.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY }; moved = 0; });
    el.addEventListener('pointermove', (ev) => {
      if (down) moved = Math.max(moved, Math.hypot(ev.clientX - down.x, ev.clientY - down.y));
    });
    el.addEventListener('pointerup', () => {
      if (down && moved < 5) {
        if (this.hover) {
          this.focus(this.hover.repo.name);
          this.onSelect(this.hover.repo, this.hover.file);
        } else { this.onSelect(null, null); }
      }
      down = null;
    });
    el.addEventListener('dblclick', () => { if (this.hover) this.onPick(this.hover.repo.name); });

    window.addEventListener('resize', () => this._resize());
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { this.onScreen = e.isIntersecting; this._sync(); });
    }, { rootMargin: '80px' });
    io.observe(this.host);
    document.addEventListener('visibilitychange', () => this._sync());
    this.onScreen = true; this._sync();
  }

  _sync() {
    const want = this.onScreen && document.visibilityState === 'visible' && !this.host.hidden;
    if (want && !this.running) { this.running = true; this._loop(); }
    else if (!want) this.running = false;
  }

  _setHover(h) {
    const same = (a, b) => (!a && !b) || (a && b && a.file === b.file);
    if (same(h, this.hover)) { if (h) this.onHover(h.repo, h.file, this.lastEv); return; }
    if (this.hover) this.hover.tower.litTarget = this.filter ? (this.filter[this.hover.repo.name] ? 1 : 0) : 0;
    this.hover = h;
    if (h) { h.tower.litTarget = 1.8; h.tower.delay = 0; }
    this.renderer.domElement.style.cursor = h ? 'pointer' : 'grab';
    this.onHover(h ? h.repo : null, h ? h.file : null, this.lastEv);
  }

  _pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = [];
    this.districts.forEach((d) => { if (d.mesh) meshes.push(d.mesh); });
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return this._setHover(null);
    let found = null;
    this.districts.forEach((d) => { if (d.mesh === hit.object) found = d; });
    if (!found) return this._setHover(null);
    const t = found.towers[hit.instanceId];
    if (!t) return this._setHover(null);
    this._setHover({ repo: found.repo, file: t.file, tower: t });
  }

  /* ================= loop ================= */
  _resize() {
    const r = this.host.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.renderer.setSize(w, h, false);
    this.labelRenderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
    if (this.bloom) this.bloom.resolution.set(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.userMoved) this.resetView(true);
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());
    const now = performance.now();

    if (this.flight) {
      const f = this.flight;
      const t = Math.min(1, (now - f.t0) / f.ms);
      const e = easeInOut(t);
      this.controls.target.lerpVectors(f.fromT, f.toT, e);
      this.camera.position.lerpVectors(f.fromP, f.toP, e);
      if (t >= 1) this.flight = null;
    } else if (!this.userMoved && !REDUCED.matches) {
      const p = this.camera.position.clone().sub(this.controls.target);
      p.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.00025);
      this.camera.position.copy(this.controls.target).add(p);
    }
    this.controls.update();

    /* shockwave */
    if (this.wave) {
      const age = (now - this.wave.t0) / 950;
      this.wave.r = age;
      const rr = Math.min(1.35, age) * CAP * 0.78;
      this.ring.scale.set(Math.max(0.01, rr), Math.max(0.01, rr), 1);
      this.ring.material.opacity = Math.max(0, 0.55 * (1 - age / 1.35));
      if (age > 1.5) { this.wave = null; this.ring.material.opacity = 0; }
    }

    const waveR = this.wave ? this.wave.r : 99;
    this.districts.forEach((d) => {
      if (!d.mesh) return;
      const intro = Math.min(1, (now - d.t0) / 1400);
      if (intro < 1) this._writeDistrict(d, intro);

      const arr = d.litAttr.array;
      let dirty = false;
      for (let i = 0; i < d.towers.length; i++) {
        const t = d.towers[i];
        const gate = this.wave ? (waveR >= (t.delay || 0) ? 1 : 0) : 1;
        const target = t.litTarget * gate;
        const next = t.lit + (target - t.lit) * 0.12;
        if (Math.abs(next - t.lit) > 0.0005) { t.lit = next; dirty = true; }
        arr[i] = t.lit;
      }
      if (dirty || intro < 1) d.litAttr.needsUpdate = true;
    });

    if (this.hasPointer && !this.flight) this._pick();

    /* Label LOD. Showing all 109 at once is confetti, not navigation: the
       city carries the shape, labels only name what you could actually
       read. Rank by district size, reveal more as you descend, and always
       name whatever is under the pointer or selected. */
    const dist = this.camera.position.distanceTo(this.controls.target);
    const k = Math.round(THREE.MathUtils.clamp(1800 / Math.max(dist, 1), 5, 42));
    const near = CAP * 0.34;
    const hoverName = this.hover ? this.hover.repo.name : null;
    this.labels.forEach((o) => {
      const d2 = Math.hypot(o.position.x - this.controls.target.x, o.position.z - this.controls.target.z);
      const forced = o.userData.repo.name === hoverName || o.userData.repo.name === this.selected;
      const on = forced || o.userData.rank < k || (dist < CAP * 0.55 && d2 < near);
      const a = on ? THREE.MathUtils.clamp((dist - 18) / 40, 0, 1) : 0;
      o.element.style.opacity = a;
      o.element.style.pointerEvents = a > 0.55 ? 'auto' : 'none';
    });

    this.composer.render();
    this.labelRenderer.render(this.scene, this.camera);
  }

  _clear() {
    this.districts.forEach((d) => {
      if (d.mesh) { this.rig.remove(d.mesh); d.mesh.geometry.dispose(); d.mesh.material.dispose(); d.mesh.dispose(); }
    });
    this.labels.forEach((o) => this.rig.remove(o));
    this.districts.clear(); this.labels = [];
  }
}

export function mountCity(host, handlers) {
  try {
    const p = document.createElement('canvas');
    if (!(p.getContext('webgl2') || p.getContext('webgl'))) return null;
  } catch (e) { return null; }
  try { return new City(host, handlers); }
  catch (e) { console.warn('City failed to start:', e); return null; }
}

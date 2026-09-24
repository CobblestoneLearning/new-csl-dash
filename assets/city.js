/* ===================================================================
   COBBLESTONE LEARNING · REPOSITORY HUB (v2)
   THE SOURCE — the estate as a city you can descend into.
   -------------------------------------------------------------------
   One city renderer, the same grammar at every depth:

     ESTATE   districts = repositories   towers = their files
     REPO     districts = top folders    towers = the files in them
     FOLDER   districts = subfolders     towers = the files in them
     FILE     the source itself

   Click a district and the city is rebuilt from whatever is inside it,
   so you fly the whole account, drop into one repo, walk its
   `includes/`, and end on the actual code. Every level is laid out
   from the real `git/trees` — nothing here is illustrative.

     district   treemap area   -> total bytes beneath it
     tower      height         -> bytes of that file
     colour     estate: repo type · inside a repo: file type
     windows    ignition       -> search, hover, selection

   Night on purpose: the windows are the data, and bloom needs
   headroom a white page doesn't have.
   =================================================================== */
import * as THREE from 'three';
import { OrbitControls } from './vendor/addons/OrbitControls.js';
import { PointerLockControls } from './vendor/addons/PointerLockControls.js';
import { CSS2DRenderer, CSS2DObject } from './vendor/addons/CSS2DRenderer.js';
import { RoomEnvironment } from './vendor/addons/RoomEnvironment.js';
import { mergeGeometries } from './vendor/addons/BufferGeometryUtils.js';
import { EffectComposer } from './vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/addons/postprocessing/OutputPass.js';
import { variantGeometry, variantFor, archetypeFor, fileColor, extOf, signatureOf } from './architecture.js';
import { layoutPoly, plotToSite, blobPolygon, polyCentroid, inradiusAt, polyArea, seedPlan } from './plan.js';

/* The n biggest files anywhere beneath a node. */
function flattenTop(node, n) {
  const all = [];
  (function walk(x) { x.files.forEach((f) => all.push(f)); x.dirs.forEach(walk); })(node);
  all.sort((a, b) => b.value - a.value);
  return all.slice(0, n);
}

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const CAP = 260;
const MAX_H = 46;
const WALK_EYE = 2.6;          /* eye height on the street */
const YAXIS = new THREE.Vector3(0, 1, 0);
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

/* ---------- directory tree ---------- */
function toTree(files) {
  const root = { dirs: new Map(), files: [], value: 0, count: 0 };
  files.forEach((f) => {
    const parts = f.p.split('/');
    const v = Math.max(120, f.s || 120);
    let node = root;
    node.value += v; node.count++;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.dirs.has(parts[i])) {
        node.dirs.set(parts[i], { dirs: new Map(), files: [], value: 0, count: 0, name: parts[i] });
      }
      node = node.dirs.get(parts[i]);
      node.value += v; node.count++;
    }
    node.files.push({ path: f.p, name: parts[parts.length - 1], size: f.s || 0, value: v });
  });
  return root;
}
function descend(node, path) {
  if (!path) return node;
  let n = node;
  for (const part of path.split('/')) {
    if (!n || !n.dirs.has(part)) return null;
    n = n.dirs.get(part);
  }
  return n;
}

/* Recursive treemap over a subtree. Padding shrinks with depth, and that
   padding is what reads as streets. */
function layoutTree(node, x, y, w, h, depth, out) {
  const pad = depth === 0 ? 2.4 : depth === 1 ? 1.3 : 0.65;
  const ix = x + pad, iy = y + pad;
  const iw = Math.max(0.5, w - pad * 2), ih = Math.max(0.5, h - pad * 2);
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
   Tower material — one shared MeshStandardMaterial with lit windows
   injected. Colour rides on instanceColor, so a single material (and
   a single shader compile) serves every district at every level.
   ------------------------------------------------------------------ */
function towerMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.06 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = { value: new THREE.Color(0x27aae1) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aLit;
        attribute float aH;
        attribute float aSeed;
        varying float vLit; varying float vH; varying float vSeed;
        varying vec3 vLocal; varying vec3 vObjN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLit = aLit; vH = aH; vSeed = aSeed; vLocal = position; vObjN = normal;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uGlow;
        varying float vLit; varying float vH; varying float vSeed;
        varying vec3 vLocal; varying vec3 vObjN;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 glowCol = uGlow;
        #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          glowCol = vColor;
        #endif
        // window rows scale with the tower's real height, so a big file
        // reads as a tall building rather than a stretched texture
        float rows = max(2.0, floor(vH / 2.4));
        float band = fract(vLocal.y * rows + vSeed * 0.37);
        float cols = fract((vLocal.x + vLocal.z) * 7.0 + vSeed * 2.1);
        float win = step(0.30, band) * step(band, 0.72)
                  * step(0.28, cols) * step(cols, 0.70);
        win *= 1.0 - step(0.5, abs(vObjN.y));   // object-space: roofs have no windows
        // daylight: glazing reads as darker, cooler panels in the facade,
        // and only ignition actually emits
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.42 + vec3(0.04, 0.07, 0.10), win * 0.85);
        totalEmissiveRadiance += glowCol * win * vLit * 2.4;
        diffuseColor.rgb *= mix(0.86, 1.10, clamp(vLocal.y, 0.0, 1.0));`);
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
    this.onLevel = opts.onLevel || (() => {});
    this.onWalk = opts.onWalk || (() => {});
    this.walking = false;
    this.onOpenFile = opts.onOpenFile || (() => {});

    this.trees = new Map();        /* repo -> raw file list  */
    this.roots = new Map();        /* repo -> directory tree */
    this.signatures = new Map();   /* repo -> architectural signature */
    this.districts = [];
    this.batches = new Map();
    this._plateQueue = [];
    this.repos = [];
    this.level = { kind: 'estate' };
    this.filter = null;
    this.running = false;
    this.userMoved = false;
    this.flight = null;
    this.hover = null;
    this.selected = null;
    this.wave = null;
    this.pointer = new THREE.Vector2(-10, -10);
    this.hasPointer = false;

    this._initScene();
    this._bind();
  }

  /* ================= scene ================= */
  _initScene() {
    this.plate = CAP;
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.02;
    r.setClearColor(0xdfe7ef, 1);
    r.domElement.className = 'city-gl';
    this.host.appendChild(r.domElement);
    this.renderer = r;

    const l = new CSS2DRenderer();
    l.domElement.className = 'city-labels';
    this.host.appendChild(l.domElement);
    this.labelRenderer = l;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xe3eaf1, CAP * 2.2, CAP * 6.0);
    this.scene.background = this._sky();

    /* Image-based lighting: this is what stops the forms reading as flat
       toy shapes once they stop being plain boxes. */
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.62;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.6, 4000);
    this.camera.position.set(0, CAP * 0.62, CAP * 0.72);

    const c = new OrbitControls(this.camera, r.domElement);
    c.enableDamping = true; c.dampingFactor = 0.07;
    c.rotateSpeed = 0.5; c.zoomSpeed = 0.9; c.panSpeed = 0.7;
    c.screenSpacePanning = false;
    c.minDistance = 12;
    c.maxDistance = CAP * 2.2;
    c.minPolarAngle = 0.08;
    c.maxPolarAngle = Math.PI / 2 - 0.035;
    c.target.set(0, 6, 0);
    c.addEventListener('start', () => { this.userMoved = true; this.flight = null; });
    this.controls = c;

    const key = new THREE.DirectionalLight(0xfff4e2, 2.05);
    key.position.set(-CAP * 0.55, CAP * 0.95, CAP * 0.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 20; key.shadow.camera.far = CAP * 3;
    const s = CAP * 0.62;
    key.shadow.camera.left = -s; key.shadow.camera.right = s;
    key.shadow.camera.top = s; key.shadow.camera.bottom = -s;
    key.shadow.bias = -0.0012; key.shadow.normalBias = 0.5;
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0xcfe0f2, 0xa8b4c2, 1.05));
    const rim = new THREE.DirectionalLight(0x9fd4ef, 0.8);
    rim.position.set(CAP * 0.6, CAP * 0.28, -CAP * 0.6);
    this.scene.add(rim);

    this.rig = new THREE.Group();
    this.scene.add(this.rig);

    /* the estate is an island, so its ground is round too */
    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(CAP * 0.52, CAP * 0.50, 9, 48),
      new THREE.MeshStandardMaterial({ color: 0xc9d2db, roughness: 0.97, metalness: 0 })
    );
    deck.position.y = -4.5; deck.receiveShadow = true;
    this.rig.add(deck);
    this.deck = deck;

    this.skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(CAP * 0.535, CAP * 0.515, 3.2, 48),
      new THREE.MeshStandardMaterial({
        color: 0x27aae1, roughness: 0.45, metalness: 0.2,
        emissive: 0x1176a3, emissiveIntensity: 0.35
      })
    );
    this.skirt.position.y = -9.6;
    this.rig.add(this.skirt);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.035, 96),
      new THREE.MeshBasicMaterial({
        color: 0x27aae1, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
      })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.6;
    this.rig.add(this.ring);

    this.towerMat = towerMaterial();
    this.raycaster = new THREE.Raycaster();
    this.labels = [];
    this.hubLabels = [];
    this.linksOn = true;
    this._initComposer();
    this._resize();
  }

  _sky() {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.00, '#b9d4ea');
    grad.addColorStop(0.45, '#dbe6f0');
    grad.addColorStop(0.72, '#eef2f6');
    grad.addColorStop(1.00, '#e3e9ee');
    g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  }

  _initComposer() {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(size, 0.62, 0.55, 0.97);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /* ================= data ================= */
  setEstate(repos, types) {
    this.repos = repos;
    this.types = types;
    this.typeColor = {};
    types.forEach((t) => { this.typeColor[t.id] = t.color; });
    this.repoByName = new Map(repos.map((r) => [r.name, r]));
    this._estateCells = null;
    if (this.level.kind === 'estate') this._build();
  }

  addRepoTree(name, files) {
    this.trees.set(name, files || []);
    this.roots.set(name, toTree(files || []));
    this.signatures.set(name, signatureOf(name, files || []));
    if (this.level.kind === 'estate') this._build(true);
  }

  /* ================= levels ================= */
  go(level, opts) {
    this.level = level;
    this.selected = null;
    this.hover = null;
    this._build();
    this.onLevel(this.crumbs(), level, this._levelSummary());
    if (!opts || !opts.keepCamera) this.resetView();
  }

  home() { this.go({ kind: 'estate' }); }

  up() {
    const lv = this.level;
    if (lv.kind === 'estate') return false;
    if (lv.kind === 'repo') { this.home(); return true; }
    const parts = lv.path.split('/');
    parts.pop();
    if (!parts.length) this.go({ kind: 'repo', repo: lv.repo });
    else this.go({ kind: 'dir', repo: lv.repo, path: parts.join('/') });
    return true;
  }

  crumbs() {
    const lv = this.level;
    const out = [{ label: 'Estate', level: { kind: 'estate' } }];
    if (lv.kind === 'estate') return out;
    const repo = this.repoByName.get(lv.repo);
    out.push({ label: repo && repo.isSnippet ? repo.label : lv.repo, level: { kind: 'repo', repo: lv.repo } });
    if (lv.kind === 'dir') {
      const parts = lv.path.split('/');
      parts.forEach((p, i) => {
        out.push({ label: p, level: { kind: 'dir', repo: lv.repo, path: parts.slice(0, i + 1).join('/') } });
      });
    }
    return out;
  }

  _levelSummary() {
    const towers = this.districts.reduce((s, d) => s + d.towers.length, 0);
    if (this.level.kind === 'estate') {
      return this.districts.length + ' repositories · ' + towers + ' files';
    }
    const dirs = this.districts.filter((d) => d.target).length;
    return dirs + (dirs === 1 ? ' folder · ' : ' folders · ') + towers + ' files';
  }

  /* A level's plate is sized to what's on it. The estate holds 2,400 files
     and needs the full cap; a 25-file repo on the same plate gives every
     file a huge footprint and no height, so it reads as flat slabs instead
     of towers. Scaling the plate keeps footprints — and therefore building
     proportions — roughly constant at every depth. */
  _plateFor(fileCount) {
    return THREE.MathUtils.clamp(Math.sqrt(Math.max(1, fileCount)) * 5.4, 72, CAP);
  }

  _setPlate(size) {
    this.plate = size;
    const k = size / CAP;
    this.deck.scale.set(k, 1, k);
    this.skirt.scale.set(k, 1, k);
  }

  /* ================================================================
     CONNECTIONS — what plugs into what.
     ----------------------------------------------------------------
     Repos carry platform topics (LearnDash, BuddyBoss, WooCommerce…).
     Each platform gets a beacon above the city and every repo that
     uses it throws an arc up to it, with light running along the arc.
     Pairwise links would be 900+ lines for LearnDash alone; hub and
     spoke says the same thing and stays readable.
     ================================================================ */
  buildLinks(platforms) {
    this._clearLinks();
    if (!platforms || !platforms.length || this.level.kind !== 'estate') return;
    this.platforms = platforms;

    const hubs = [];
    const R = CAP * 0.40, Y = MAX_H * 3.4;
    platforms.forEach((p, i) => {
      const a = (i / platforms.length) * Math.PI * 2 - Math.PI / 2;
      hubs.push({ id: p.id, label: p.label, color: p.color,
        pos: new THREE.Vector3(Math.cos(a) * R, Y + (i % 3) * 18, Math.sin(a) * R), count: 0 });
    });

    const verts = [], cols = [];
    const curves = [];
    const c = new THREE.Color();
    this.districts.forEach((d) => {
      const repo = d.repo;
      if (!repo || !repo.platforms) return;
      const from = new THREE.Vector3(d.cx, MAX_H * 0.7, d.cz);
      repo.platforms.forEach((pid) => {
        const hub = hubs.find((h) => h.id === pid);
        if (!hub) return;
        hub.count++;
        const mid = from.clone().lerp(hub.pos, 0.5);
        mid.y += 34;
        const curve = new THREE.QuadraticBezierCurve3(from, mid, hub.pos);
        const pts = curve.getPoints(18);
        c.set(hub.color);
        for (let k = 0; k < pts.length - 1; k++) {
          verts.push(pts[k].x, pts[k].y, pts[k].z, pts[k + 1].x, pts[k + 1].y, pts[k + 1].z);
          const f0 = k / pts.length, f1 = (k + 1) / pts.length;
          cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
          void f0; void f1;
        }
        curves.push(curve);
      });
    });
    if (!curves.length) return;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.links = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false
    }));
    this.links.frustumCulled = false;
    this.rig.add(this.links);

    /* light running along every arc */
    this.curves = curves;
    const pn = curves.length;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pn * 3), 3));
    const pc = new Float32Array(pn * 3);
    curves.forEach((cv, i) => {
      const hub = hubs.find((h) => h.pos.equals(cv.v2));
      c.set(hub ? hub.color : 0x27aae1);
      pc[i * 3] = c.r; pc[i * 3 + 1] = c.g; pc[i * 3 + 2] = c.b;
    });
    pg.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3));
    this.pulses = new THREE.Points(pg, new THREE.PointsMaterial({
      size: 3.4, vertexColors: true, transparent: true, opacity: 1.0,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    }));
    this.pulses.frustumCulled = false;
    this.pulseOffset = new Float32Array(pn);
    for (let i = 0; i < pn; i++) this.pulseOffset[i] = Math.random();
    this.rig.add(this.pulses);

    hubs.filter((h) => h.count).forEach((h) => {
      const el = document.createElement('div');
      el.className = 'city-hub';
      el.innerHTML = '<span class="ch-dot" style="background:' + h.color + '"></span>' +
        '<span class="ch-name"></span><span class="ch-n">' + h.count + '</span>';
      el.querySelector('.ch-name').textContent = h.label;
      const obj = new CSS2DObject(el);
      obj.position.copy(h.pos);
      this.rig.add(obj);
      this.hubLabels.push(obj);
    });
  }

  /* Arcs between two files in this repo, from what they actually import. */
  setFileLinks(edges) {
    if (this.fileLinks) {
      this.rig.remove(this.fileLinks);
      this.fileLinks.geometry.dispose(); this.fileLinks.material.dispose();
      this.fileLinks = null;
    }
    if (this.fileDots) {
      this.rig.remove(this.fileDots);
      this.fileDots.geometry.dispose(); this.fileDots.material.dispose();
      this.fileDots = null;
    }
    this.fileCurves = null;
    if (!edges || !edges.length) return;

    const byPath = new Map();
    this.districts.forEach((d) => d.towers.forEach((t) => byPath.set(t.file.path, t)));

    const verts = [], curves = [];
    edges.forEach((e) => {
      const a = byPath.get(e.from), b = byPath.get(e.to);
      if (!a || !b || a === b) return;
      const p0 = new THREE.Vector3(a.x, a.h + 2, a.z);
      const p1 = new THREE.Vector3(b.x, b.h + 2, b.z);
      const mid = p0.clone().lerp(p1, 0.5);
      mid.y += Math.max(10, p0.distanceTo(p1) * 0.42);
      const cv = new THREE.QuadraticBezierCurve3(p0, mid, p1);
      const pts = cv.getPoints(16);
      for (let k = 0; k < pts.length - 1; k++) {
        verts.push(pts[k].x, pts[k].y, pts[k].z, pts[k + 1].x, pts[k + 1].y, pts[k + 1].z);
      }
      curves.push(cv);
    });
    if (!curves.length) return;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this.fileLinks = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color: 0x0074b4, transparent: true, opacity: 0.48, depthWrite: false
    }));
    this.fileLinks.frustumCulled = false;
    this.rig.add(this.fileLinks);

    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(curves.length * 3), 3));
    this.fileDots = new THREE.Points(dg, new THREE.PointsMaterial({
      color: 0x27aae1, size: 3.6, transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    }));
    this.fileDots.frustumCulled = false;
    this.rig.add(this.fileDots);

    this.fileCurves = curves;
    this.fileOffset = new Float32Array(curves.length);
    for (let i = 0; i < curves.length; i++) this.fileOffset[i] = Math.random();
  }

  setLinksVisible(on) {
    this.linksOn = on;
    if (this.links) this.links.visible = on;
    if (this.pulses) this.pulses.visible = on;
    this.hubLabels.forEach((o) => { o.element.style.display = on ? '' : 'none'; });
  }

  _clearLinks() {
    [this.links, this.pulses, this.fileLinks, this.fileDots].forEach((o) => {
      if (!o) return;
      this.rig.remove(o); o.geometry.dispose(); o.material.dispose();
    });
    this.links = null; this.pulses = null; this.curves = null;
    this.fileLinks = null; this.fileDots = null; this.fileCurves = null;
    this.hubLabels.forEach((o) => { this.rig.remove(o); if (o.element.parentNode) o.element.remove(); });
    this.hubLabels = [];
  }

  _stepPulses(now) {
    if (this.fileDots && this.fileCurves) {
      const fa = this.fileDots.geometry.getAttribute('position');
      const ft = now * 0.00022;
      const fv = new THREE.Vector3();
      for (let i = 0; i < this.fileCurves.length; i++) {
        this.fileCurves[i].getPoint((ft + this.fileOffset[i]) % 1, fv);
        fa.setXYZ(i, fv.x, fv.y, fv.z);
      }
      fa.needsUpdate = true;
    }
    if (!this.pulses || !this.curves || !this.linksOn) return;
    const arr = this.pulses.geometry.getAttribute('position');
    const t = now * 0.00016;
    const v = new THREE.Vector3();
    for (let i = 0; i < this.curves.length; i++) {
      const u = (t + this.pulseOffset[i]) % 1;
      this.curves[i].getPoint(u, v);
      arr.setXYZ(i, v.x, v.y, v.z);
    }
    arr.needsUpdate = true;
  }

  /* ---- build the districts for the current level ---- */
  _build(incremental) {
    if (!incremental) { this._clearDistricts(); this._clearLinks(); }
    if (this.level.kind === 'estate') this._buildEstate(incremental);
    else this._buildInside();
  }

  _buildEstate(incremental) {
    if (!incremental) {
      this._setPlate(CAP);
      const val = (r) => 0.4 + Math.log10(1 + (r.bytes || 0));
      const groups = this.types
        .map((t) => ({ id: t.id, repos: this.repos.filter((r) => r.type === t.id).sort((a, b) => val(b) - val(a)) }))
        .filter((g) => g.repos.length)
        .map((g) => ({ ...g, value: g.repos.reduce((s, r) => s + val(r), 0) }))
        .sort((a, b) => b.value - a.value);

      /* the estate is an island, not a slab */
      const island = blobPolygon(CAP * 0.48, 26, 0.16, 0x0BB1E5);
      seedPlan(0x0BB1E5);
      this._estateCells = [];
      layoutPoly(island, groups, (g, quarterPoly) => {
        /* each type gets a quarter of the city; repos are its blocks */
        layoutPoly(quarterPoly, g.repos.map((r) => ({ repo: r, value: val(r) })),
          (it, plot) => this._estateCells.push({ plot, type: g.id, repo: it.repo }),
          { pad: 2.0, leafPad: 1.4, jitter: 0.5 });
      }, { pad: 4.0, leafPad: 3.0, jitter: 0.34 });
    }
    this._estateCells.forEach((e) => {
      if (this.districts.some((d) => d.key === e.repo.name)) return;
      const root = this.roots.get(e.repo.name);
      if (!root) return;                            /* tree hasn't landed yet */
      /* Out here a repo's plot is a few units across: 640 individual files
         in it is a smear. Show its principal buildings and let the count on
         the label carry the rest — going in shows everything. */
      const cells = [];
      const top = flattenTop(root, 14);
      layoutPoly(e.plot, top.map((f) => ({ file: f, value: f.value })),
        (it, plot) => cells.push({ file: it.file, site: plotToSite(plot) }),
        { pad: 0.6, leafPad: 0.35, jitter: 0.6 });
      if (!cells.length) return;
      this._addDistrict({
        key: e.repo.name,
        label: e.repo.isSnippet ? e.repo.label : e.repo.name,
        color: this.typeColor[e.type] || '#27AAE1',
        plot: e.plot,
        target: { kind: 'repo', repo: e.repo.name },
        repo: e.repo, cells, colorBy: 'district', sig: this.signatures.get(e.repo.name)
      });
    });
  }

  /* Lay a directory subtree into a polygon: folders become sub-plots,
     files become sites. Same recursion, organic geometry. */
  _layoutSubtree(node, poly, out, depth = 0, cap = 0) {
    const items = [];
    node.dirs.forEach((d) => items.push({ kind: 'dir', node: d, value: d.value }));
    node.files.forEach((f) => items.push({ kind: 'file', file: f, value: f.value }));
    if (!items.length) return;
    items.sort((a, b) => b.value - a.value);
    const P = this.plate || CAP;
    layoutPoly(poly, items, (it, plot) => {
      if (it.kind === 'dir') this._layoutSubtree(it.node, plot, out, depth + 1);
      else out.push({ file: it.file, site: plotToSite(plot) });
    }, { pad: depth === 0 ? P * 0.010 : P * 0.005, leafPad: P * 0.004, jitter: 0.55 });
  }

  _buildInside() {
    const lv = this.level;
    const repo = this.repoByName.get(lv.repo);
    const root = this.roots.get(lv.repo);
    if (!root) return;
    const node = lv.kind === 'repo' ? root : descend(root, lv.path);
    if (!node) { this.home(); return; }

    const items = [];
    node.dirs.forEach((d, name) => items.push({ kind: 'dir', name, node: d, value: d.value }));
    if (node.files.length) {
      items.push({
        kind: 'files', name: lv.kind === 'repo' ? 'root' : 'here', files: node.files,
        value: node.files.reduce((s, f) => s + f.value, 0)
      });
    }
    if (!items.length) return;
    items.sort((a, b) => b.value - a.value);

    const P = this._plateFor(node.count);
    this._setPlate(P);
    const island = blobPolygon(P * 0.47, 22, 0.14, 0x51D0C2);
    seedPlan(0x51D0C2);

    layoutPoly(island, items, (it, plot) => {
      const inner = [];
      if (it.kind === 'dir') {
        this._layoutSubtree(it.node, plot, inner);
      } else {
        layoutPoly(plot, it.files.map((f) => ({ file: f, value: f.value })),
          (x, fp) => inner.push({ file: x.file, site: plotToSite(fp) }),
          { pad: P * 0.010, leafPad: P * 0.006, jitter: 0.55 });
      }
      if (!inner.length) return;
      const c = polyCentroid(plot);
      this._addDistrict({
        key: (lv.kind === 'repo' ? '' : lv.path + '/') + it.name,
        label: it.kind === 'dir' ? it.name + '/' : it.name,
        sub: it.kind === 'dir' ? it.node.count + ' files' : it.files.length + ' files',
        color: it.kind === 'dir' ? '#27AAE1' : '#8FA3B8',
        plot, centre: c,
        target: it.kind === 'dir'
          ? { kind: 'dir', repo: lv.repo, path: (lv.kind === 'repo' ? '' : lv.path + '/') + it.name }
          : null,
        repo, cells: inner, colorBy: 'file', sig: this.signatures.get(lv.repo)
      });
    }, { pad: P * 0.020, leafPad: P * 0.014, jitter: 0.42 });
  }

  _addDistrict(spec) {
    if (!spec.cells.length) return;
    let maxSize = 1;
    spec.cells.forEach((c) => { maxSize = Math.max(maxSize, c.file.size || 0); });

    const sig = spec.sig || { verticality: 1, slender: 0.9, twist: 0, crown: 1, hueShift: 0 };
    const c = spec.centre || polyCentroid(spec.plot);
    const d = {
      key: spec.key, label: spec.label, sub: spec.sub, color: spec.color,
      plot: spec.plot, cx: c[0], cz: c[1],
      radius: Math.max(inradiusAt(spec.plot, c), Math.sqrt(polyArea(spec.plot)) * 0.42),
      target: spec.target, repo: spec.repo, sig,
      towers: [], t0: performance.now()
    };

    /* Group this district's files by archetype: one InstancedMesh per form
       for the whole level, not per district, so 2,400 buildings in ten
       shapes cost ten draw calls rather than a hundred. */
    const ranked = spec.cells.slice().sort((a, b) => (a.file.size || 0) - (b.file.size || 0));
    const pctOf = new Map();
    ranked.forEach((c, i) => pctOf.set(c, ranked.length > 1 ? i / (ranked.length - 1) : 1));
    const landmark = ranked[ranked.length - 1];

    const byArch = new Map();
    spec.cells.forEach((c) => {
      const depth = (c.file.path.match(/\//g) || []).length;
      const key = variantFor(c.file.path, pctOf.get(c), c === landmark, sig, depth);
      if (!byArch.has(key)) byArch.set(key, []);
      byArch.get(key).push(c);
    });

    byArch.forEach((cells, arch) => {
      const batch = this._batch(arch, cells.length);
      const col = new THREE.Color();
      cells.forEach((c) => {
        const i = batch.n++;
        const mag = Math.pow((c.file.size || 0) / maxSize, 0.38);
        let h = (1.6 + mag * MAX_H) * sig.verticality;
        batch.hs[i] = h;
        const seed = (((i * 2654435761) >>> 0) % 1000) / 1000;
        batch.seeds[i] = seed;
        col.set(fileColor(c.file.path));
        col.offsetHSL(sig.hueShift, 0, 0);
        batch.mesh.setColorAt(i, col);
        const baseCol = col.clone();

        /* The plot already decided where this stands and which way it
           faces; a building is the largest square that fits inside it. */
        const site = c.site;
        /* Size from the plot's area, then make sure it still fits across
           the narrow way — elongated plots have a tiny inradius but plenty
           of ground, and sizing off the inradius alone made needles. */
        const foot = Math.max(0.4,
          Math.min(Math.sqrt(site.area) * 0.62, site.r * 1.9) * sig.slender);
        /* An organic plan throws up the odd sliver plot; without this they
           become needles rather than buildings. */
        h = Math.min(h, foot * 7.5);
        const t = {
          file: c.file, repo: spec.repo, district: d, batch, i,
          x: site.x, z: site.z,
          w: foot, dd: foot,
          rot: site.angle + sig.twist * (seed - 0.5),
          h, lit: 0, litTarget: 0, delay: 0, baseCol,
          order: d.towers.length / Math.max(1, spec.cells.length)
        };
        batch.towers[i] = t;
        d.towers.push(t);
      });
      batch.dirty = true;
    });

    this.districts.push(d);
    this._addLabel(d);
    this._rankLabels();
    this._plateQueue.push(d);
  }

  /* A lazily grown InstancedMesh per archetype for the current level. */
  _batch(arch, want) {
    let b = this.batches.get(arch);
    const need = (b ? b.mesh.count : 0) + want;
    if (!b || b.mesh.count < need) {
      const cap = Math.max(need, 64);
      const geo = variantGeometry(arch).clone();
      const mesh = new THREE.InstancedMesh(geo, this.towerMat, cap);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      const lit = new Float32Array(cap);
      const hs = new Float32Array(cap);
      const seeds = new Float32Array(cap);
      geo.setAttribute('aLit', new THREE.InstancedBufferAttribute(lit, 1));
      geo.setAttribute('aH', new THREE.InstancedBufferAttribute(hs, 1));
      geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
      const next = { arch, mesh, lit, hs, seeds, towers: [], n: 0,
                     litAttr: geo.getAttribute('aLit'), dirty: true };
      if (b) {                                    /* grow: carry the old one over */
        for (let i = 0; i < b.n; i++) {
          next.hs[i] = b.hs[i]; next.seeds[i] = b.seeds[i]; next.lit[i] = b.lit[i];
          next.towers[i] = b.towers[i];
          if (b.towers[i]) b.towers[i].batch = next;
          const c = new THREE.Color();
          if (b.mesh.instanceColor) { b.mesh.getColorAt(i, c); mesh.setColorAt(i, c); }
        }
        next.n = b.n;
        this.rig.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.dispose();
      }
      this.rig.add(mesh);
      this.batches.set(arch, next);
      b = next;
    }
    return b;
  }

  /* Thin coloured plate under each district — what makes the boundaries
     readable before any label has faded in. */
  /* District plates are now the plot outlines themselves, extruded a
     little — so the ground reads as blocks and streets, not tiles. */
  _flushPlates() {
    if (!this._plateQueue.length) return;
    if (this.plates) {
      this.rig.remove(this.plates);
      this.plates.geometry.dispose(); this.plates.material.dispose();
      this.plates = null;
    }
    const geos = [];
    const col = new THREE.Color();
    this.districts.forEach((d) => {
      if (!d.plot || d.plot.length < 3) return;
      const shape = new THREE.Shape();
      d.plot.forEach((q, i) => (i ? shape.lineTo(q[0], q[1]) : shape.moveTo(q[0], q[1])));
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false });
      g.rotateX(Math.PI / 2);                      /* shape is XY, the ground is XZ */
      g.translate(0, 0, 0);
      col.set(d.color).lerp(new THREE.Color(0xdfe5ec), 0.46);
      const n = g.getAttribute('position').count;
      const c3 = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { c3[k * 3] = col.r; c3[k * 3 + 1] = col.g; c3[k * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(c3, 3));
      geos.push(g);
    });
    if (geos.length) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (merged) {
        this.plates = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
          vertexColors: true, roughness: 0.95, metalness: 0
        }));
        this.plates.receiveShadow = true;
        this.plates.position.y = -0.02;
        this.rig.add(this.plates);
      }
    }
    this._plateQueue.length = 0;
  }

  /* One pass over every batch. Each tower carries its district, so the
     staggered rise still happens per district while the write stays a
     single sweep per archetype. */
  _writeBatches(now) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    this.batches.forEach((b) => {
      if (!b.dirty && !b.animating) return;
      let animating = false;
      for (let i = 0; i < b.n; i++) {
        const t = b.towers[i];
        if (!t) continue;
        const intro = Math.min(1, (now - t.district.t0) / 1300);
        if (intro < 1) animating = true;
        const stagger = Math.max(0, Math.min(1, intro * 1.8 - t.order * 0.5));
        const e = 1 - Math.pow(1 - stagger, 4);
        p.set(t.x, 0, t.z);
        sc.set(t.w, Math.max(0.05, t.h * e), t.dd);
        q.setFromAxisAngle(YAXIS, t.rot || 0);
        m.compose(p, q, sc);
        b.mesh.setMatrixAt(i, m);
      }
      b.mesh.count = b.n;
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
      b.dirty = false;
      b.animating = animating;
    });
  }

  _addLabel(d) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'city-label' + (d.target ? '' : ' is-leaf');
    el.innerHTML = '<span class="cl-dot" style="background:' + d.color + '"></span>' +
      '<span class="cl-name"></span>' + (d.sub ? '<span class="cl-sub"></span>' : '');
    el.querySelector('.cl-name').textContent = d.label;
    if (d.sub) el.querySelector('.cl-sub').textContent = d.sub;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (d.target) this.go(d.target); else this.focusDistrict(d);
    });
    const obj = new CSS2DObject(el);
    obj.position.set(d.cx, MAX_H * 0.5, d.cz);
    obj.userData = { district: d, area: d.radius * d.radius };
    this.rig.add(obj);
    this.labels.push(obj);
  }

  _rankLabels() {
    this.labels.sort((a, b) => b.userData.area - a.userData.area);
    this.labels.forEach((o, i) => { o.userData.rank = i; });
  }

  focusDistrict(d) {
    this.selected = d.key;
    this._flyTo(new THREE.Vector3(d.cx, MAX_H * 0.35, d.cz), Math.max(30, d.radius * 3.0));
  }

  focus(name) {
    const d = this.districts.find((x) => x.key === name);
    if (d) this.focusDistrict(d);
  }

  clearSelection() { this.selected = null; this._setHover(null); }

  /* ================= filtering (estate level) ================= */
  setFilter(set) {
    this.filter = set;
    if (this.level.kind !== 'estate') return;
    this.wave = set ? { t0: performance.now(), r: 0 } : null;
    if (!set) {
      this.districts.forEach((d) => d.towers.forEach((t) => { t.litTarget = 0; t.delay = 0; }));
      this.ring.material.opacity = 0;
      this._recolour();
      return;
    }
    this.districts.forEach((d) => {
      const on = !!set[d.key];
      d.towers.forEach((t) => {
        t.delay = Math.hypot(t.x, t.z) / ((this.plate || CAP) * 0.72);
        t.litTarget = on ? 1 : 0;
      });
    });
    this._recolour();
    this.frameMatches();
  }

  /* In daylight a glowing window alone barely reads, so a search also
     recolours: matches deepen into their own hue, the rest drop to a
     flat slate. Contrast does the work that glow did at night. */
  _recolour() {
    const col = new THREE.Color();
    const dim = new THREE.Color(0x9aa7b4);
    this.batches.forEach((b) => {
      for (let i = 0; i < b.n; i++) {
        const t = b.towers[i];
        if (!t || !t.baseCol) continue;
        const on = !this.filter || this.filter[t.district.key];
        if (!this.filter) col.copy(t.baseCol);
        else if (on) col.copy(t.baseCol).offsetHSL(0, 0.30, -0.04);
        else col.copy(t.baseCol).lerp(dim, 0.88);
        b.mesh.setColorAt(i, col);
      }
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
    });
  }

  frameMatches() {
    const hits = this.districts.filter((d) => !this.filter || this.filter[d.key]);
    if (!hits.length || hits.length === this.districts.length) { this.resetView(true); return; }
    const box = new THREE.Box3();
    hits.forEach((d) => {
      box.expandByPoint(new THREE.Vector3(d.cx - d.radius, 0, d.cz - d.radius));
      box.expandByPoint(new THREE.Vector3(d.cx + d.radius, MAX_H, d.cz + d.radius));
    });
    const c = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 30);
    this._flyTo(c, radius * 2.5);
  }

  /* ================= camera ================= */
  /* Fit the sphere around the plate AND the skyline on it — sizing off the
     plate alone put the camera inside the towers on small levels. */
  _fitDistance() {
    const plate = this.plate || CAP;
    const radius = Math.hypot(plate * 0.72, MAX_H * 0.9);
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    return Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2)) * 0.74;
  }

  resetView(soft) {
    this.userMoved = false;
    this._flyTo(new THREE.Vector3(0, MAX_H * 0.22, 0), this._fitDistance(), soft ? 900 : 1150);
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

  /* ================================================================
     WALK — street level, first person.
     ----------------------------------------------------------------
     Orbit tells you the shape of the estate; walking tells you what it
     feels like to be inside it. Pointer lock for the look, WASD for the
     feet, and collision against the building footprints so you go down
     the streets rather than through the walls.
     ================================================================ */
  enterWalk() {
    if (this.walking) return;
    if (!this.fp) {
      this.fp = new PointerLockControls(this.camera, this.renderer.domElement);
      this.scene.add(this.fp.object);
      this.keys = {};
      this._onKey = (e) => {
        const k = e.code;
        if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','Space'].indexOf(k) < 0) return;
        this.keys[k] = e.type === 'keydown';
        e.preventDefault();
      };
      this.fp.addEventListener('unlock', () => { if (this.walking) this.exitWalk(); });
    }
    /* stand on the street nearest where the camera was looking */
    const t = this.controls.target;
    const spot = this._freeSpotNear(t.x, t.z);
    this.walking = true;
    this.controls.enabled = false;
    this.velocity = new THREE.Vector3();
    this.camera.position.set(spot.x, WALK_EYE, spot.z);
    this.camera.lookAt(t.x + (t.x - spot.x), WALK_EYE, t.z + (t.z - spot.z));
    this.camera.near = 0.35;
    this.camera.updateProjectionMatrix();
    document.addEventListener('keydown', this._onKey);
    document.addEventListener('keyup', this._onKey);
    this.fp.lock();
    this.onWalk(true);
  }

  exitWalk() {
    if (!this.walking) return;
    this.walking = false;
    this.keys = {};
    document.removeEventListener('keydown', this._onKey);
    document.removeEventListener('keyup', this._onKey);
    if (this.fp && this.fp.isLocked) this.fp.unlock();
    this.controls.enabled = true;
    this.camera.near = 0.6;
    this.camera.updateProjectionMatrix();
    this.userMoved = false;
    this.resetView();
    this.onWalk(false);
  }

  /* Nearest point to (x,z) that isn't inside a building. */
  _freeSpotNear(x, z) {
    for (let ring = 0; ring < 14; ring++) {
      const rad = ring * (this.plate || CAP) * 0.035;
      for (let i = 0; i < Math.max(1, ring * 6); i++) {
        const a = (i / Math.max(1, ring * 6)) * Math.PI * 2;
        const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
        if (!this._blocked(px, pz, 1.2)) return { x: px, z: pz };
      }
    }
    return { x, z };
  }

  _blocked(x, z, pad) {
    for (const d of this.districts) {
      if (Math.hypot(x - d.cx, z - d.cz) > d.radius + 14) continue;   /* cheap reject */
      for (const t of d.towers) {
        const half = t.w * 0.5 + pad;
        if (Math.abs(x - t.x) < half && Math.abs(z - t.z) < half) return true;
      }
    }
    return false;
  }

  _stepWalk(dt) {
    const speed = (this.keys.ShiftLeft ? 42 : 20) * dt;
    let f = 0, r = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) f += 1;
    if (this.keys.KeyS || this.keys.ArrowDown) f -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) r += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) r -= 1;
    if (!f && !r) return;

    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0; dir.normalize();
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const step = dir.multiplyScalar(f).add(side.multiplyScalar(r)).normalize().multiplyScalar(speed);

    /* slide along walls instead of sticking to them */
    const p = this.camera.position;
    if (!this._blocked(p.x + step.x, p.z, 1.0)) p.x += step.x;
    if (!this._blocked(p.x, p.z + step.z, 1.0)) p.z += step.z;

    const lim = (this.plate || CAP) * 0.54;
    const d = Math.hypot(p.x, p.z);
    if (d > lim) { p.x *= lim / d; p.z *= lim / d; }
    p.y = WALK_EYE;
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
        if (this.hover) this._activate(this.hover);
        else this.onSelect(null, null);
      }
      down = null;
    });

    window.addEventListener('resize', () => this._resize());
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { this.onScreen = e.isIntersecting; this._sync(); });
    }, { rootMargin: '80px' });
    io.observe(this.host);
    document.addEventListener('visibilitychange', () => this._sync());
    this.onScreen = true; this._sync();
  }

  /* A tower means different things at different depths: out in the estate
     it stands for its repository, inside one it is the file itself. */
  _activate(h) {
    if (this.level.kind === 'estate') {
      this.onSelect(h.repo, null);
      this.go({ kind: 'repo', repo: h.repo.name });
    } else if (h.district.target) {
      this.go(h.district.target);
    } else {
      this.onSelect(h.repo, h.file);
      this.onOpenFile(h.repo, h.file);
    }
  }

  _sync() {
    const want = this.onScreen && document.visibilityState === 'visible' && !this.host.hidden;
    if (want && !this.running) { this.running = true; this._loop(); }
    else if (!want) this.running = false;
  }

  _setHover(h) {
    const same = (a, b) => (!a && !b) || (a && b && a.tower === b.tower);
    if (same(h, this.hover)) { if (h) this.onHover(h.repo, h.file, this.lastEv, this.level.kind); return; }
    if (this.hover) {
      this.hover.tower.litTarget = this.filter ? (this.filter[this.hover.district.key] ? 1 : 0) : 0;
    }
    this.hover = h;
    if (h) { h.tower.litTarget = 1.8; h.tower.delay = 0; }
    this.renderer.domElement.style.cursor = h ? 'pointer' : 'grab';
    this.onHover(h ? h.repo : null, h ? h.file : null, this.lastEv, this.level.kind);
  }

  _pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = [];
    this.batches.forEach((b) => meshes.push(b.mesh));
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit) { this._setHover(null); return; }
    let batch = null;
    this.batches.forEach((b) => { if (b.mesh === hit.object) batch = b; });
    const t = batch && batch.towers[hit.instanceId];
    if (!t) { this._setHover(null); return; }
    this._setHover({ district: t.district, repo: t.repo, file: t.file, tower: t });
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

    if (this.walking) {
      const dt = Math.min(0.05, (now - (this._lastWalk || now)) / 1000);
      this._lastWalk = now;
      this._stepWalk(dt);
    } else if (this.flight) {
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
    if (!this.walking) this.controls.update();

    if (this.wave) {
      const age = (now - this.wave.t0) / 950;
      this.wave.r = age;
      const rr = Math.min(1.35, age) * (this.plate || CAP) * 0.78;
      this.ring.scale.set(Math.max(0.01, rr), Math.max(0.01, rr), 1);
      this.ring.material.opacity = Math.max(0, 0.55 * (1 - age / 1.35));
      if (age > 1.5) { this.wave = null; this.ring.material.opacity = 0; }
    }
    const waveR = this.wave ? this.wave.r : 99;

    this._flushPlates();
    this._writeBatches(now);
    this._stepPulses(now);

    this.batches.forEach((b) => {
      let dirty = false;
      for (let i = 0; i < b.n; i++) {
        const t = b.towers[i];
        if (!t) continue;
        const gate = this.wave ? (waveR >= (t.delay || 0) ? 1 : 0) : 1;
        const target = t.litTarget * gate;
        const next = t.lit + (target - t.lit) * 0.12;
        if (Math.abs(next - t.lit) > 0.0005) { t.lit = next; dirty = true; }
        b.lit[i] = t.lit;
      }
      if (dirty) b.litAttr.needsUpdate = true;
    });

    if (this.hasPointer && !this.flight && !this.walking) this._pick();

    /* On the street you want to know what's around you, not the whole
       city's index — so walking names only what's within earshot. */
    if (this.walking) {
      const cx = this.camera.position.x, cz = this.camera.position.z;
      this.labels.forEach((o) => {
        const near = Math.hypot(o.position.x - cx, o.position.z - cz) < 46;
        o.element.style.opacity = near ? 1 : 0;
        o.element.style.pointerEvents = 'none';
      });
      this.composer.render();
      this.labelRenderer.render(this.scene, this.camera);
      return;
    }

    const dist = this.camera.position.distanceTo(this.controls.target);
    const k = Math.round(THREE.MathUtils.clamp(1800 / Math.max(dist, 1), 5, 42));
    const near = (this.plate || CAP) * 0.34;
    const hoverKey = this.hover ? this.hover.district.key : null;
    this.labels.forEach((o) => {
      const d2 = Math.hypot(o.position.x - this.controls.target.x, o.position.z - this.controls.target.z);
      const forced = o.userData.district.key === hoverKey || o.userData.district.key === this.selected;
      const on = forced || o.userData.rank < k || (dist < (this.plate || CAP) * 0.55 && d2 < near);
      const a = on ? THREE.MathUtils.clamp((dist - 18) / 40, 0, 1) : 0;
      o.element.style.opacity = a;
      o.element.style.pointerEvents = a > 0.55 ? 'auto' : 'none';
    });

    this.composer.render();
    this.labelRenderer.render(this.scene, this.camera);
  }

  _clearDistricts() {
    this._clearLinks();
    this.batches.forEach((b) => {
      this.rig.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.dispose();
    });
    this.batches.clear();
    this._plateQueue = [];
    if (this.plates) {
      /* a merged Mesh, not an InstancedMesh — there is no .dispose() on it */
      this.rig.remove(this.plates);
      this.plates.geometry.dispose();
      this.plates.material.dispose();
      this.plates = null;
    }
    this.labels.forEach((o) => { this.rig.remove(o); if (o.element.parentNode) o.element.remove(); });
    this.districts = []; this.labels = [];
    this.hover = null; this.wave = null;
    this.ring.material.opacity = 0;
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

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
import { CSS2DRenderer, CSS2DObject } from './vendor/addons/CSS2DRenderer.js';
import { EffectComposer } from './vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/addons/postprocessing/OutputPass.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const CAP = 260;
const MAX_H = 46;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* File colours, from the same validated categorical theme as the charts. */
const EXT_COLOR = {
  php: '#0072B2', inc: '#0072B2',
  js: '#00916A', mjs: '#00916A', jsx: '#00916A', ts: '#00916A', tsx: '#00916A',
  css: '#C4719B', scss: '#C4719B', sass: '#C4719B', less: '#C4719B',
  html: '#D48200', htm: '#D48200', twig: '#D48200',
  json: '#5BB8EC', xml: '#5BB8EC', yml: '#5BB8EC', yaml: '#5BB8EC', csv: '#5BB8EC',
  md: '#8FA3B8', txt: '#8FA3B8', po: '#8FA3B8', pot: '#8FA3B8', mo: '#8FA3B8',
  png: '#7E6BB5', jpg: '#7E6BB5', jpeg: '#7E6BB5', gif: '#7E6BB5', svg: '#7E6BB5',
  webp: '#7E6BB5', ico: '#7E6BB5',
  woff: '#4E6070', woff2: '#4E6070', ttf: '#4E6070', eot: '#4E6070', otf: '#4E6070',
  mp4: '#B5686B', webm: '#B5686B', vtt: '#B5686B', srt: '#B5686B',
  sh: '#6F8A5B', py: '#6F8A5B', sql: '#6F8A5B'
};
const EXT_FALLBACK = '#59697A';
function extOf(path) {
  const b = path.slice(path.lastIndexOf('/') + 1);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1).toLowerCase() : '';
}
function fileColor(path) { return EXT_COLOR[extOf(path)] || EXT_FALLBACK; }

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
  const mat = new THREE.MeshStandardMaterial({ color: 0x2b3745, roughness: 0.7, metalness: 0.16 });
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
        float base = step(0.52, fract(vSeed * 41.7 + floor(vLocal.y * rows)));
        float amount = base * 0.95 + vLit * 1.9;
        totalEmissiveRadiance += glowCol * win * amount;
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
    this.onLevel = opts.onLevel || (() => {});
    this.onOpenFile = opts.onOpenFile || (() => {});

    this.trees = new Map();        /* repo -> raw file list  */
    this.roots = new Map();        /* repo -> directory tree */
    this.districts = [];
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
    c.minDistance = 12;
    c.maxDistance = CAP * 2.2;
    c.minPolarAngle = 0.08;
    c.maxPolarAngle = Math.PI / 2 - 0.035;
    c.target.set(0, 6, 0);
    c.addEventListener('start', () => { this.userMoved = true; this.flight = null; });
    this.controls = c;

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

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(CAP, 9, CAP),
      new THREE.MeshStandardMaterial({ color: 0x141b24, roughness: 0.92, metalness: 0.1 })
    );
    deck.position.y = -4.5; deck.receiveShadow = true;
    this.rig.add(deck);
    this.deck = deck;

    this.skirt = new THREE.Mesh(
      new THREE.BoxGeometry(CAP * 1.035, 3.2, CAP * 1.035),
      new THREE.MeshStandardMaterial({
        color: 0x27aae1, roughness: 0.4, metalness: 0.3,
        emissive: 0x0d5f85, emissiveIntensity: 1.1
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

  /* ---- build the districts for the current level ---- */
  _build(incremental) {
    if (!incremental) this._clearDistricts();
    if (this.level.kind === 'estate') this._buildEstate(incremental);
    else this._buildInside();
  }

  _buildEstate(incremental) {
    if (!incremental) this._setPlate(CAP);
    if (!incremental || !this._estateCells) {
      const val = (r) => 0.4 + Math.log10(1 + (r.bytes || 0));
      const groups = this.types
        .map((t) => ({ id: t.id, repos: this.repos.filter((r) => r.type === t.id).sort((a, b) => val(b) - val(a)) }))
        .filter((g) => g.repos.length)
        .map((g) => ({ ...g, value: g.repos.reduce((s, r) => s + val(r), 0) }))
        .sort((a, b) => b.value - a.value);
      const typeCells = [];
      squarify(groups, -CAP / 2, -CAP / 2, CAP, CAP, typeCells);
      this._estateCells = [];
      typeCells.forEach((tc) => {
        const cells = [];
        squarify(tc.item.repos.map((r) => ({ repo: r, value: val(r) })),
          tc.x + 2, tc.y + 2, Math.max(1, tc.w - 4), Math.max(1, tc.h - 4), cells);
        cells.forEach((c) => this._estateCells.push({ cell: c, type: tc.item.id }));
      });
    }
    this._estateCells.forEach((e) => {
      const repo = e.cell.item.repo;
      if (this.districts.some((d) => d.key === repo.name)) return;
      const root = this.roots.get(repo.name);
      if (!root) return;                            /* tree hasn't landed yet */
      const cells = [];
      layoutTree(root, e.cell.x, e.cell.y, e.cell.w, e.cell.h, 0, cells);
      this._addDistrict({
        key: repo.name,
        label: repo.isSnippet ? repo.label : repo.name,
        color: this.typeColor[e.type] || '#27AAE1',
        x: e.cell.x, y: e.cell.y, w: e.cell.w, h: e.cell.h,
        target: { kind: 'repo', repo: repo.name },
        repo, cells, colorBy: 'district'
      });
    });
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
    const pad = P * 0.012;

    const cells = [];
    squarify(items, -P / 2, -P / 2, P, P, cells);
    cells.forEach((c) => {
      const it = c.item;
      const inner = [];
      if (it.kind === 'dir') {
        layoutTree(it.node, c.x, c.y, c.w, c.h, 0, inner);
      } else {
        const fc = [];
        squarify(it.files.map((f) => ({ file: f, value: f.value })),
          c.x + pad, c.y + pad, Math.max(0.5, c.w - pad * 2), Math.max(0.5, c.h - pad * 2), fc);
        fc.forEach((k) => inner.push({ file: k.item.file, x: k.x, y: k.y, w: k.w, h: k.h }));
      }
      this._addDistrict({
        key: (lv.kind === 'repo' ? '' : lv.path + '/') + it.name,
        label: it.kind === 'dir' ? it.name + '/' : it.name,
        sub: it.kind === 'dir' ? it.node.count + ' files' : it.files.length + ' files',
        color: it.kind === 'dir' ? '#27AAE1' : '#8FA3B8',
        x: c.x, y: c.y, w: c.w, h: c.h,
        target: it.kind === 'dir'
          ? { kind: 'dir', repo: lv.repo, path: (lv.kind === 'repo' ? '' : lv.path + '/') + it.name }
          : null,
        repo, cells: inner, colorBy: 'file'
      });
    });
  }

  _addDistrict(spec) {
    if (!spec.cells.length) return;
    let maxSize = 1;
    spec.cells.forEach((c) => { maxSize = Math.max(maxSize, c.file.size || 0); });

    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, this.towerMat, spec.cells.length);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;

    const lit = new Float32Array(spec.cells.length);
    const hs = new Float32Array(spec.cells.length);
    const seeds = new Float32Array(spec.cells.length);
    geo.setAttribute('aLit', new THREE.InstancedBufferAttribute(lit, 1));
    geo.setAttribute('aH', new THREE.InstancedBufferAttribute(hs, 1));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));

    const col = new THREE.Color();
    const towers = spec.cells.map((c, i) => {
      const mag = Math.pow((c.file.size || 0) / maxSize, 0.38);
      const h = 1.6 + mag * MAX_H;
      hs[i] = h;
      seeds[i] = (((i * 2654435761) >>> 0) % 1000) / 1000;
      col.set(spec.colorBy === 'file' ? fileColor(c.file.path) : spec.color);
      mesh.setColorAt(i, col);
      return {
        file: c.file, repo: spec.repo, i,
        x: c.x + c.w / 2, z: c.y + c.h / 2,
        w: Math.max(0.3, c.w - 0.26), d: Math.max(0.3, c.h - 0.26),
        h, lit: 0, litTarget: 0, delay: 0
      };
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    const d = {
      key: spec.key, label: spec.label, sub: spec.sub, color: spec.color,
      x: spec.x, y: spec.y, w: spec.w, h: spec.h,
      target: spec.target, repo: spec.repo,
      mesh, litAttr: geo.getAttribute('aLit'), towers,
      t0: performance.now()
    };
    this.rig.add(mesh);
    this.districts.push(d);
    this._writeDistrict(d, 0);
    this._addLabel(d);
    this._rankLabels();
  }

  _writeDistrict(d, intro) {
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
    obj.position.set(d.x + d.w / 2, MAX_H * 0.5, d.y + d.h / 2);
    obj.userData = { district: d, area: d.w * d.h };
    this.rig.add(obj);
    this.labels.push(obj);
  }

  _rankLabels() {
    this.labels.sort((a, b) => b.userData.area - a.userData.area);
    this.labels.forEach((o, i) => { o.userData.rank = i; });
  }

  focusDistrict(d) {
    this.selected = d.key;
    this._flyTo(new THREE.Vector3(d.x + d.w / 2, MAX_H * 0.35, d.y + d.h / 2),
      Math.max(30, Math.hypot(d.w, d.h) * 1.5));
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
      return;
    }
    this.districts.forEach((d) => {
      const on = !!set[d.key];
      d.towers.forEach((t) => {
        t.delay = Math.hypot(t.x, t.z) / ((this.plate || CAP) * 0.72);
        t.litTarget = on ? 1 : 0;
      });
    });
    this.frameMatches();
  }

  frameMatches() {
    const hits = this.districts.filter((d) => !this.filter || this.filter[d.key]);
    if (!hits.length || hits.length === this.districts.length) { this.resetView(true); return; }
    const box = new THREE.Box3();
    hits.forEach((d) => {
      box.expandByPoint(new THREE.Vector3(d.x, 0, d.y));
      box.expandByPoint(new THREE.Vector3(d.x + d.w, MAX_H, d.y + d.h));
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
    const meshes = this.districts.map((d) => d.mesh);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit) { this._setHover(null); return; }
    const d = this.districts.find((x) => x.mesh === hit.object);
    const t = d && d.towers[hit.instanceId];
    if (!t) { this._setHover(null); return; }
    this._setHover({ district: d, repo: t.repo, file: t.file, tower: t });
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

    if (this.wave) {
      const age = (now - this.wave.t0) / 950;
      this.wave.r = age;
      const rr = Math.min(1.35, age) * (this.plate || CAP) * 0.78;
      this.ring.scale.set(Math.max(0.01, rr), Math.max(0.01, rr), 1);
      this.ring.material.opacity = Math.max(0, 0.55 * (1 - age / 1.35));
      if (age > 1.5) { this.wave = null; this.ring.material.opacity = 0; }
    }
    const waveR = this.wave ? this.wave.r : 99;

    this.districts.forEach((d) => {
      const intro = Math.min(1, (now - d.t0) / 1300);
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
    this.districts.forEach((d) => {
      this.rig.remove(d.mesh);
      d.mesh.geometry.dispose();
      d.mesh.dispose();
    });
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

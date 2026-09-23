/* ===================================================================
   COBBLESTONE LEARNING · REPOSITORY HUB (v2)
   THE ESTATE — a navigable 3D world, not a hero graphic.
   -------------------------------------------------------------------
   The Cobblestone mark is a graduation cap paved with cobblestones.
   Here the cap is monumental and you fly over it: one stone per
   repository, laid by a squarified treemap.

     footprint   treemap area     -> bytes of source
     height      extrusion        -> bytes of source
     district    treemap group    -> repo type
     tint        stone colour     -> how recently it was pushed

   Everything is navigation, not decoration:
     · orbit / pan / zoom the whole estate
     · district labels always; repo labels resolve as you descend
     · click a stone and the camera flies to it, inspector opens
     · search and the matches rise out of the paving under light
       columns, and the camera reframes onto them

   The flat list is one keystroke away and holds the same data, so
   nothing here is load-bearing for someone who can't run WebGL.
   =================================================================== */
import * as THREE from 'three';
import { OrbitControls } from './vendor/addons/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from './vendor/addons/CSS2DRenderer.js';
import { RoomEnvironment } from './vendor/addons/RoomEnvironment.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const CAP = 200;                 /* cap is CAP x CAP world units */
const GAP = 1.0;                 /* mortar gap                   */
const MAX_H = 62;                /* tallest stone                */

/* ---------- squarified treemap ---------- */
function squarify(items, x, y, w, h, out) {
  if (!items.length) return;
  if (items.length === 1) { out.push({ item: items[0], x, y, w, h }); return; }
  const total = items.reduce((s, i) => s + i.value, 0);
  const horizontal = w >= h;
  let best = 1, bestRatio = Infinity, acc = 0;
  for (let n = 1; n <= items.length; n++) {
    acc += items[n - 1].value;
    const side = (horizontal ? w : h) * (acc / total);
    const other = horizontal ? h : w;
    let worst = 0;
    for (let k = 0; k < n; k++) {
      const a = (items[k].value / acc) * other;
      worst = Math.max(worst, Math.max(side / a, a / side));
    }
    if (worst < bestRatio) { bestRatio = worst; best = n; } else break;
  }
  const row = items.slice(0, best), rest = items.slice(best);
  const rowSum = row.reduce((s, i) => s + i.value, 0);
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

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Estate {
  constructor(host, opts = {}) {
    this.host = host;
    this.onPick = opts.onPick || (() => {});
    this.onSelect = opts.onSelect || (() => {});
    this.onHover = opts.onHover || (() => {});
    this.onReady = opts.onReady || (() => {});

    this.stones = [];
    this.hoverId = -1;
    this.selectedId = -1;
    this.filter = null;
    this.running = false;
    this.userMoved = false;
    this.flight = null;
    this.t0 = performance.now();

    this.pointer = new THREE.Vector2(-10, -10);
    this.hasPointer = false;

    this._initScene();
    this._bind();
  }

  /* ================= scene ================= */
  _initScene() {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.domElement.className = 'world-gl';
    this.host.appendChild(r.domElement);
    this.renderer = r;

    /* CSS labels ride above the canvas — crisp at any zoom, and real DOM
       so they can be read by a screen reader and styled with the page. */
    const l = new CSS2DRenderer();
    l.domElement.className = 'world-labels';
    this.host.appendChild(l.domElement);
    this.labelRenderer = l;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xeef2f7, CAP * 1.9, CAP * 4.4);

    /* Image-based lighting: cheap, and it's what stops the stones reading
       as flat toy cubes. */
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.62;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 4000);
    this.camera.position.set(0, CAP * 1.5, CAP * 1.7);

    const c = new OrbitControls(this.camera, r.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.075;
    c.rotateSpeed = 0.55;
    c.zoomSpeed = 0.85;
    c.panSpeed = 0.7;
    c.screenSpacePanning = false;
    c.minDistance = 40;
    c.maxDistance = CAP * 3.4;
    c.minPolarAngle = 0.12;
    c.maxPolarAngle = Math.PI / 2 - 0.06;   /* never go under the floor */
    c.target.set(0, 0, 0);
    c.addEventListener('start', () => { this.userMoved = true; this.flight = null; });
    this.controls = c;

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(-CAP * 0.55, CAP * 1.05, CAP * 0.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 20;
    key.shadow.camera.far = CAP * 3.2;
    const s = CAP * 0.78;
    key.shadow.camera.left = -s; key.shadow.camera.right = s;
    key.shadow.camera.top = s; key.shadow.camera.bottom = -s;
    key.shadow.bias = -0.0009;
    key.shadow.normalBias = 0.6;
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd9e2ec, 0.9));

    const rim = new THREE.DirectionalLight(0x27aae1, 0.55);
    rim.position.set(CAP * 0.7, CAP * 0.3, -CAP * 0.7);
    this.scene.add(rim);

    this.rig = new THREE.Group();
    this.scene.add(this.rig);

    /* the white slab from the logo */
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(CAP * 0.70, 16, CAP * 0.70),
      new THREE.MeshStandardMaterial({ color: 0xeff3f7, roughness: 0.8, metalness: 0 })
    );
    slab.position.y = -11;
    slab.castShadow = true; slab.receiveShadow = true;
    this.rig.add(slab);

    /* floor: a soft radial pool so the estate sits in space rather than
       floating on nothing */
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(CAP * 2.6, 72),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.95, metalness: 0,
        map: this._floorTexture(), transparent: true
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -19.2;
    floor.receiveShadow = true;
    this.rig.add(floor);

    this._buildTassel();

    this.raycaster = new THREE.Raycaster();
    this.districtLabels = [];
    this.stoneLabels = [];
    this._resize();
  }

  _beamRamp() {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 128, 0, 0);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, '#6a6a6a');
    grad.addColorStop(1, '#000000');
    g.fillStyle = grad; g.fillRect(0, 0, 4, 128);
    return new THREE.CanvasTexture(c);
  }

  _floorTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#f4f7fa');
    grad.addColorStop(1, 'rgba(238,242,247,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  _buildTassel() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x3d3d3d, roughness: 0.62, metalness: 0.05 });
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 2.2, 22), mat);
    btn.position.set(-CAP * 0.5, 5, -CAP * 0.5);
    btn.castShadow = true; g.add(btn);

    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push(new THREE.Vector3(-CAP * 0.5 - t * 18, 5 - t * t * 58, -CAP * 0.5 - t * 7));
    }
    const cord = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 1.1, 8, false), mat);
    cord.castShadow = true; g.add(cord);

    const end = pts[pts.length - 1];
    const knot = new THREE.Mesh(new THREE.ConeGeometry(5.4, 20, 12), mat);
    knot.position.set(end.x - 1, end.y - 9, end.z - 1);
    knot.castShadow = true; g.add(knot);
    this.rig.add(g);
  }

  /* ================= stones ================= */
  setData(repos, types) {
    this._disposeStones();
    if (!repos || !repos.length) return;

    const colorOf = {};
    const labelOf = {};
    types.forEach((t) => { colorOf[t.id] = t.color; labelOf[t.id] = t.label; });

    const val = (r) => 0.3 + Math.log10(1 + (r.bytes || 0));
    const groups = types
      .map((t) => ({ id: t.id, label: t.label, repos: repos.filter((r) => r.type === t.id).sort((a, b) => val(b) - val(a)) }))
      .filter((g) => g.repos.length)
      .map((g) => ({ ...g, value: g.repos.reduce((s, r) => s + val(r), 0) }))
      .sort((a, b) => b.value - a.value);

    const districts = [];
    squarify(groups, -CAP / 2, -CAP / 2, CAP, CAP, districts);

    const cells = [];
    districts.forEach((d) => {
      const inner = [];
      squarify(
        d.item.repos.map((r) => ({ repo: r, value: val(r) })),
        d.x + GAP, d.y + GAP, Math.max(0.2, d.w - GAP * 2), Math.max(0.2, d.h - GAP * 2), inner
      );
      inner.forEach((c) => cells.push({ ...c, type: d.item.id }));
      this._addDistrictLabel(d, labelOf[d.item.id], d.item.repos.length, colorOf[d.item.id]);
    });

    const maxBytes = repos.reduce((m, r) => Math.max(m, r.bytes || 0), 1);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.48, metalness: 0.04 });

    this.mesh = new THREE.InstancedMesh(geo, mat, cells.length);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rig.add(this.mesh);

    const col = new THREE.Color();
    this.stones = cells.map((c, i) => {
      const repo = c.item.repo;
      const mag = Math.pow((repo.bytes || 0) / maxBytes, 0.34);
      const days = Math.max(0, (Date.now() - new Date(repo.pushed).getTime()) / 86400000);
      const fresh = 1 - Math.min(1, days / 400);
      const jitter = (((i * 2654435761) >>> 0) % 1000) / 1000;
      const stone = {
        repo, name: repo.name, i, type: c.type,
        x: c.x + c.w / 2, z: c.y + c.h / 2,
        w: Math.max(1.2, c.w - GAP), d: Math.max(1.2, c.h - GAP),
        h: 3 + mag * MAX_H,
        lift: 0, liftTarget: 0, glow: 0, glowTarget: 0,
        base: colorOf[c.type] || '#0072B2', fresh, jitter, label: null
      };
      this._paint(stone, col);
      return stone;
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    /* Light columns for search hits. Additive columns stacked to pure white
       where many overlapped, so they're short, faint, and fade out along
       their length via an alpha ramp. */
    const beamGeo = new THREE.CylinderGeometry(1, 0.62, 1, 12, 1, true);
    beamGeo.translate(0, 0.5, 0);
    this.beams = new THREE.InstancedMesh(
      beamGeo,
      new THREE.MeshBasicMaterial({
        color: 0x27aae1, transparent: true, opacity: 0.30,
        alphaMap: this._beamRamp(),
        depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
      }),
      cells.length
    );
    this.beams.frustumCulled = false;
    this.rig.add(this.beams);

    this._writeMatrices(0);
    this.t0 = performance.now();

    /* opening move: start high and wide, settle into the framed view */
    const d = this._fitDistance();
    this.controls.target.set(0, MAX_H * 0.2, 0);
    this.camera.position.set(0, d * 1.5, d * 1.1);
    this._flyTo(new THREE.Vector3(0, MAX_H * 0.2, 0), d, REDUCED.matches ? 1 : 2400);
    this.userMoved = false;

    this.onReady(this.stones.length);
  }

  _paint(s, col) {
    const on = !this.filter || this.filter[s.name];
    col.set(on ? s.base : '#c7d0da');
    col.offsetHSL(0, -0.10 + s.fresh * 0.20, 0.10 - s.fresh * 0.17 + (s.jitter - 0.5) * 0.05);
    if (on && this.filter) col.offsetHSL(0, 0.2, 0.02);
    this.mesh.setColorAt(s.i, col);
  }

  _addDistrictLabel(d, label, count, color) {
    const el = document.createElement('div');
    el.className = 'w-district';
    el.innerHTML = '<span class="w-dot" style="background:' + color + '"></span>' +
      '<span class="w-dl">' + label + '</span><span class="w-dn">' + count + '</span>';
    const obj = new CSS2DObject(el);
    obj.position.set(d.x + d.w / 2, MAX_H * 0.5, d.y + d.h / 2);
    obj.center.set(0.5, 0.5);
    this.rig.add(obj);
    this.districtLabels.push(obj);
  }

  _writeMatrices(intro) {
    if (!this.mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const zero = new THREE.Vector3(0, 0, 0);

    for (let i = 0; i < this.stones.length; i++) {
      const s = this.stones[i];
      const order = (s.x + CAP / 2 + s.z + CAP / 2) / (CAP * 2);
      const t = Math.max(0, Math.min(1, intro * 1.7 - order * 0.6));
      const e = 1 - Math.pow(1 - t, 4);
      const h = Math.max(0.1, s.h * e);

      pos.set(s.x, s.lift + (1 - e) * 60, s.z);
      scl.set(s.w, h, s.d);
      m.compose(pos, q, scl);
      this.mesh.setMatrixAt(i, m);

      if (this.beams) {
        const bl = s.glow;
        if (bl > 0.01) {
          pos.set(s.x, s.lift + h, s.z);
          scl.set(Math.min(s.w, s.d) * 0.30, bl * 52, Math.min(s.w, s.d) * 0.30);
          m.compose(pos, q, scl);
        } else {
          m.compose(pos.set(s.x, -9999, s.z), q, zero.set(0.0001, 0.0001, 0.0001));
        }
        this.beams.setMatrixAt(i, m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.beams) this.beams.instanceMatrix.needsUpdate = true;
  }

  /* ================= filtering ================= */
  setFilter(set) {
    this.filter = set;
    const col = new THREE.Color();
    this.stones.forEach((s) => {
      const on = !set || set[s.name];
      s.liftTarget = !set ? 0 : (on ? 22 : 0);
      s.glowTarget = !set ? 0 : (on ? 1 : 0);
      this._paint(s, col);
    });
    if (this.mesh && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (set) this.frameMatches();
  }

  /* Pull the camera onto whatever is currently lit. */
  frameMatches() {
    const hits = this.stones.filter((s) => !this.filter || this.filter[s.name]);
    if (!hits.length || hits.length === this.stones.length) return this.resetView(true);
    const box = new THREE.Box3();
    hits.forEach((s) => {
      box.expandByPoint(new THREE.Vector3(s.x - s.w, 0, s.z - s.d));
      box.expandByPoint(new THREE.Vector3(s.x + s.w, s.h + 26, s.z + s.d));
    });
    const c = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 34);
    this._flyTo(c, radius * 2.1);
  }

  focus(name) {
    const s = this.stones.find((x) => x.name === name);
    if (!s) return;
    this._select(this.stones.indexOf(s));
    this._flyTo(new THREE.Vector3(s.x, s.h * 0.6, s.z), Math.max(105, s.h * 3.4));
  }

  /* Fit the sphere that contains the spinning cap, its tallest stones and
     the tassel — against whichever field of view is tighter. A fixed
     distance cropped the estate on wide viewports. */
  _fitDistance() {
    const swept = CAP * Math.SQRT1_2;          /* radius the cap sweeps */
    const radius = Math.hypot(swept, MAX_H * 0.5) * 1.08;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    return Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2));
  }

  resetView(soft) {
    this.userMoved = false;
    this._flyTo(new THREE.Vector3(0, MAX_H * 0.2, 0), this._fitDistance(), soft ? 900 : 1200);
  }

  _flyTo(target, dist, ms) {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.y < 0.35) dir.y = 0.62;                    /* keep a readable pitch */
    dir.normalize();
    this.flight = {
      t0: performance.now(),
      ms: ms || 1000,
      fromT: this.controls.target.clone(),
      toT: target.clone(),
      fromP: this.camera.position.clone(),
      toP: target.clone().addScaledVector(dir, dist)
    };
    if (REDUCED.matches) this.flight.ms = 1;
  }

  /* ================= interaction ================= */
  _bind() {
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (ev) => {
      const r = el.getBoundingClientRect();
      this.pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      this.pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      this.hasPointer = true;
      this.lastEv = ev;
    });
    el.addEventListener('pointerleave', () => {
      this.hasPointer = false; this.pointer.set(-10, -10); this._hover(-1);
    });

    /* A click that followed a drag is a camera move, not a pick. */
    let downAt = null, moved = 0;
    el.addEventListener('pointerdown', (ev) => { downAt = { x: ev.clientX, y: ev.clientY }; moved = 0; });
    el.addEventListener('pointermove', (ev) => {
      if (downAt) moved = Math.max(moved, Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y));
    });
    el.addEventListener('pointerup', () => {
      if (downAt && moved < 5 && this.hoverId >= 0) {
        this._select(this.hoverId);
        const s = this.stones[this.hoverId];
        this._flyTo(new THREE.Vector3(s.x, s.h * 0.6, s.z), Math.max(105, s.h * 3.4));
        this.onSelect(s.repo);
      } else if (downAt && moved < 5) {
        this._select(-1);
        this.onSelect(null);
      }
      downAt = null;
    });
    el.addEventListener('dblclick', () => {
      if (this.hoverId >= 0) this.onPick(this.stones[this.hoverId].name);
    });

    window.addEventListener('resize', () => this._resize());

    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { this.onScreen = e.isIntersecting; this._sync(); });
    }, { rootMargin: '80px' });
    io.observe(this.host);
    document.addEventListener('visibilitychange', () => this._sync());
    this.onScreen = true;
    this._sync();
  }

  _sync() {
    const want = this.onScreen && document.visibilityState === 'visible' && !this.host.hidden;
    if (want && !this.running) { this.running = true; this._loop(); }
    else if (!want) this.running = false;
  }

  _hover(id) {
    if (id === this.hoverId) return;
    if (this.hoverId >= 0) this._restLift(this.stones[this.hoverId]);
    this.hoverId = id;
    if (id >= 0) this.stones[id].liftTarget = (this.filter && this.filter[this.stones[id].name] ? 22 : 0) + 16;
    this.renderer.domElement.style.cursor = id >= 0 ? 'pointer' : 'grab';
    this.onHover(id >= 0 ? this.stones[id].repo : null, this.lastEv);
  }

  _restLift(s) {
    s.liftTarget = (this.filter ? (this.filter[s.name] ? 22 : 0) : 0) + (this.selectedId === s.i ? 16 : 0);
  }

  _select(id) {
    if (this.selectedId >= 0 && this.stones[this.selectedId]) {
      const prev = this.stones[this.selectedId];
      this.selectedId = -1;
      this._restLift(prev);
    }
    this.selectedId = id;
    if (id >= 0) this._restLift(this.stones[id]);
  }

  /* ================= labels ================= */
  _syncStoneLabels() {
    const dist = this.camera.position.distanceTo(this.controls.target);
    const show = dist < CAP * 0.95;
    if (!show) {
      if (this.stoneLabels.length) {
        this.stoneLabels.forEach((o) => { this.rig.remove(o); });
        this.stoneLabels = [];
      }
      return;
    }
    /* Only the nearest handful, or 109 labels become confetti. */
    const cam = this.camera.position;
    const ranked = this.stones
      .filter((s) => !this.filter || this.filter[s.name])
      .map((s) => ({ s, d: (s.x - cam.x) ** 2 + (s.z - cam.z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 26);

    const want = new Set(ranked.map((r) => r.s.name));
    this.stoneLabels = this.stoneLabels.filter((o) => {
      if (want.has(o.userData.name)) return true;
      this.rig.remove(o); return false;
    });
    const have = new Set(this.stoneLabels.map((o) => o.userData.name));

    ranked.forEach(({ s }) => {
      if (have.has(s.name)) return;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'w-stone';
      el.textContent = s.repo.isSnippet ? s.repo.label : s.name;
      el.addEventListener('click', (e) => { e.stopPropagation(); this.onPick(s.name); });
      const obj = new CSS2DObject(el);
      obj.userData.name = s.name;
      obj.userData.stone = s;
      this.rig.add(obj);
      this.stoneLabels.push(obj);
    });

    this.stoneLabels.forEach((o) => {
      const s = o.userData.stone;
      o.position.set(s.x, s.lift + s.h + 5, s.z);
    });
  }

  /* ================= loop ================= */
  _resize() {
    const r = this.host.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.renderer.setSize(w, h, false);
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.userMoved) this.resetView(true);
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const intro = Math.min(1, (now - this.t0) / 2200);

    if (this.flight) {
      const f = this.flight;
      const t = Math.min(1, (now - f.t0) / f.ms);
      const e = easeInOut(t);
      this.controls.target.lerpVectors(f.fromT, f.toT, e);
      this.camera.position.lerpVectors(f.fromP, f.toP, e);
      if (t >= 1) this.flight = null;
    } else if (!this.userMoved && !REDUCED.matches && intro >= 1) {
      /* a slow drift until someone takes the controls */
      const a = 0.00022;
      const p = this.camera.position.clone().sub(this.controls.target);
      p.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      this.camera.position.copy(this.controls.target).add(p);
    }

    this.controls.update();

    for (const s of this.stones) {
      s.lift += (s.liftTarget - s.lift) * 0.14;
      s.glow += (s.glowTarget - s.glow) * 0.1;
    }
    this._writeMatrices(intro);

    if (this.mesh && this.hasPointer && intro > 0.5 && !this.flight) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObject(this.mesh, false)[0];
      this._hover(hit ? hit.instanceId : -1);
    }

    this._syncStoneLabels();

    /* district labels fade out once you're close enough to read stones */
    const d = this.camera.position.distanceTo(this.controls.target);
    const districtAlpha = Math.max(0, Math.min(1, (d - CAP * 0.62) / (CAP * 0.35)));
    this.districtLabels.forEach((o) => {
      o.element.style.opacity = districtAlpha * Math.min(1, intro * 1.4);
      o.element.style.pointerEvents = districtAlpha > 0.5 ? 'auto' : 'none';
    });

    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  _disposeStones() {
    [this.mesh, this.beams].forEach((m) => {
      if (!m) return;
      this.rig.remove(m); m.geometry.dispose(); m.material.dispose(); m.dispose();
    });
    this.mesh = null; this.beams = null;
    this.districtLabels.forEach((o) => this.rig.remove(o));
    this.stoneLabels.forEach((o) => this.rig.remove(o));
    this.districtLabels = []; this.stoneLabels = []; this.stones = [];
  }
}

export function mountWorld(host, handlers) {
  try {
    const p = document.createElement('canvas');
    if (!(p.getContext('webgl2') || p.getContext('webgl'))) return null;
  } catch (e) { return null; }
  try { return new Estate(host, handlers); }
  catch (e) { console.warn('Estate failed to start:', e); return null; }
}

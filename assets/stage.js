/* ===================================================================
   COBBLESTONE LEARNING · REPOSITORY HUB (v2)
   THE MORTARBOARD — a WebGL stage built out of the repositories.
   -------------------------------------------------------------------
   The Cobblestone mark is a graduation cap paved with cobblestones.
   So the hero isn't a chart of the estate — it IS the mark, laid with
   one stone per repository:

     footprint  squarified treemap area  -> bytes of source
     height     extrusion                -> bytes of source
     colour     stone tint               -> repo type
     district   treemap group            -> repo type

   Nothing here is decorative geometry: remove a repo and a stone
   disappears; push to one and its stone grows. Searching lifts the
   matching stones out of the cap.

   Three.js is vendored (assets/vendor) rather than pulled from a CDN:
   this page holds an OAuth token, so it takes no runtime third-party
   script it cannot pin exactly.
   =================================================================== */
import * as THREE from './vendor/three.module.min.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const CAP = 100;               /* cap is CAP x CAP world units */
const GAP = 0.55;              /* mortar gap between stones     */

/* ------------------------------------------------------------------
   Squarified treemap — gives the irregular, hand-laid stone pattern
   the logo has, while keeping area proportional to code size.
   ------------------------------------------------------------------ */
function squarify(items, x, y, w, h, out) {
  if (!items.length) return;
  if (items.length === 1) {
    out.push({ item: items[0], x, y, w, h });
    return;
  }
  const total = items.reduce((s, i) => s + i.value, 0);
  const horizontal = w >= h;
  let best = 1, bestRatio = Infinity, acc = 0;

  for (let n = 1; n <= items.length; n++) {
    acc += items[n - 1].value;
    const frac = acc / total;
    const side = horizontal ? w * frac : h * frac;
    const other = horizontal ? h : w;
    /* worst aspect ratio in this row */
    let worst = 0;
    let a = 0;
    for (let k = 0; k < n; k++) {
      a = items[k].value / acc * other;
      worst = Math.max(worst, Math.max(side / a, a / side));
    }
    if (worst < bestRatio) { bestRatio = worst; best = n; }
    else break;
  }

  const row = items.slice(0, best);
  const rest = items.slice(best);
  const rowSum = row.reduce((s, i) => s + i.value, 0);
  const frac = rowSum / total;

  if (horizontal) {
    const rw = w * frac;
    let cy = y;
    row.forEach((it) => {
      const rh = h * (it.value / rowSum);
      out.push({ item: it, x, y: cy, w: rw, h: rh });
      cy += rh;
    });
    squarify(rest, x + rw, y, w - rw, h, out);
  } else {
    const rh = h * frac;
    let cx = x;
    row.forEach((it) => {
      const rw = w * (it.value / rowSum);
      out.push({ item: it, x: cx, y, w: rw, h: rh });
      cx += rw;
    });
    squarify(rest, x, y + rh, w, h - rh, out);
  }
}

/* ------------------------------------------------------------------
   Stage
   ------------------------------------------------------------------ */
export class Mortarboard {
  constructor(host, opts = {}) {
    this.host = host;
    this.onPick = opts.onPick || (() => {});
    this.onHover = opts.onHover || (() => {});
    this.stones = [];
    this.hoverId = -1;
    this.filter = null;
    this.running = false;
    this.t0 = performance.now();
    this.spin = 0;
    this.pointer = new THREE.Vector2(-10, -10);
    this.parallax = { x: 0, y: 0, tx: 0, ty: 0 };

    this._initScene();
    this._bind();
  }

  /* ---------- scene ---------- */
  _initScene() {
    const { host } = this;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: true, powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none';

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 2000);
    this.camera.position.set(0, 132, 138);
    this.camera.lookAt(0, 6, 0);

    /* The whole cap lives on a rig we tilt — same restrained parallax
       idea as the cinematic dashboard, just in real 3D. */
    this.rig = new THREE.Group();
    this.scene.add(this.rig);

    /* lights: a key light that casts the stone shadows, plus fill */
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(-58, 120, 64);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 20;
    key.shadow.camera.far = 320;
    const s = 92;
    key.shadow.camera.left = -s; key.shadow.camera.right = s;
    key.shadow.camera.top = s; key.shadow.camera.bottom = -s;
    key.shadow.bias = -0.0012;
    key.shadow.normalBias = 0.42;
    this.scene.add(key);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe6ee, 1.5));

    const rim = new THREE.DirectionalLight(0x27aae1, 0.7);
    rim.position.set(76, 42, -70);
    this.scene.add(rim);

    /* the white slab under the cap, straight from the logo */
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(CAP * 0.72, 9, CAP * 0.72),
      new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 0.85, metalness: 0 })
    );
    slab.position.y = -6.5;
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.rig.add(slab);

    /* shadow catcher so the cap sits on something */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.ShadowMaterial({ opacity: 0.13 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -11.2;
    ground.receiveShadow = true;
    this.rig.add(ground);

    this._buildTassel();

    this.raycaster = new THREE.Raycaster();
    this._resize();
  }

  _buildTassel() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x3d3d3d, roughness: 0.7 });

    const button = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 1.1, 20), mat);
    button.position.set(-CAP * 0.5, 2.6, -CAP * 0.5);
    button.castShadow = true;
    g.add(button);

    const pts = [];
    for (let i = 0; i <= 22; i++) {
      const t = i / 22;
      pts.push(new THREE.Vector3(
        -CAP * 0.5 - t * 8,
        2.6 - t * t * 26,
        -CAP * 0.5 - t * 3
      ));
    }
    const cord = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.5, 8, false),
      mat
    );
    cord.castShadow = true;
    g.add(cord);

    const knot = new THREE.Mesh(new THREE.ConeGeometry(2.8, 10, 10), mat);
    const end = pts[pts.length - 1];
    knot.position.set(end.x - 0.6, end.y - 4.5, end.z - 0.4);
    knot.castShadow = true;
    g.add(knot);

    this.tassel = g;
    this.rig.add(g);
  }

  /* ---------- lay the stones ---------- */
  setData(repos, types) {
    this._disposeStones();
    if (!repos.length) return;

    const typeOrder = types.map((t) => t.id);
    const colorOf = {};
    types.forEach((t) => { colorOf[t.id] = t.color; });

    /* area ∝ log(bytes) so a 4 MB repo doesn't eat the whole cap */
    const val = (r) => 0.25 + Math.log10(1 + (r.bytes || 0)) ;

    /* group into districts by type, biggest district first */
    const groups = typeOrder
      .map((id) => ({
        id,
        repos: repos.filter((r) => r.type === id).sort((a, b) => val(b) - val(a))
      }))
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
        d.x + GAP, d.y + GAP, Math.max(0.1, d.w - GAP * 2), Math.max(0.1, d.h - GAP * 2),
        inner
      );
      inner.forEach((c) => cells.push({ ...c, type: d.item.id }));
    });

    const maxBytes = repos.reduce((m, r) => Math.max(m, r.bytes || 0), 1);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);                       /* pivot at the base */
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.02 });

    this.mesh = new THREE.InstancedMesh(geo, mat, cells.length);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rig.add(this.mesh);

    const col = new THREE.Color();
    this.stones = cells.map((c, i) => {
      const r = c.item.repo;
      const mag = Math.pow((r.bytes || 0) / maxBytes, 0.34);
      const base = colorOf[c.type] || '#0072B2';
      /* recency gives each district its own texture — the logo's mix of
         dark and cyan stones, driven by data instead of decoration */
      const days = Math.max(0, (Date.now() - new Date(r.pushed).getTime()) / 86400000);
      const fresh = 1 - Math.min(1, days / 400);
      const j = ((i * 2654435761) >>> 0) % 1000 / 1000;
      col.set(base);
      col.offsetHSL(0, -0.10 + fresh * 0.20, 0.10 - fresh * 0.17 + (j - 0.5) * 0.05);
      this.mesh.setColorAt(i, col);

      return {
        repo: r, name: r.name, i,
        x: c.x + c.w / 2, z: c.y + c.h / 2,
        w: Math.max(0.7, c.w - GAP), d: Math.max(0.7, c.h - GAP),
        h: 1.4 + mag * 30,
        lift: 0, liftTarget: 0,
        dim: 0, dimTarget: 0,
        baseColor: base,
        seed: j, fresh: fresh
      };
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    this._writeMatrices(0);
    this.t0 = performance.now();
  }

  _writeMatrices(intro) {
    if (!this.mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const n = this.stones.length;

    for (let i = 0; i < n; i++) {
      const s = this.stones[i];
      /* staggered rise on entry, radiating from the tassel corner */
      const order = (s.x + CAP / 2 + s.z + CAP / 2) / (CAP * 2);
      const t = Math.max(0, Math.min(1, intro * 1.75 - order * 0.7));
      const e = 1 - Math.pow(1 - t, 4);

      const h = Math.max(0.05, s.h * e * (1 - s.dim * 0.55));
      pos.set(s.x, s.lift + (1 - e) * 26, s.z);
      scl.set(s.w, h, s.d);
      m.compose(pos, q, scl);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------- filtering: matching stones rise out of the cap ---------- */
  setFilter(set) {
    this.filter = set;
    const col = new THREE.Color();
    this.stones.forEach((s) => {
      const on = !set || set[s.name];
      s.liftTarget = !set ? 0 : (on ? 9 : 0);
      s.dimTarget = !set ? 0 : (on ? 0 : 1);
      if (this.mesh) {
        col.set(on ? s.baseColor : '#ccd4dd');
        col.offsetHSL(0, -0.10 + s.fresh * 0.20, 0.10 - s.fresh * 0.17 + (s.seed - 0.5) * 0.05);
        if (on && set) col.offsetHSL(0, 0.18, 0.02);
        this.mesh.setColorAt(s.i, col);
      }
    });
    if (this.mesh && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /* ---------- interaction ---------- */
  _bind() {
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (ev) => {
      const r = el.getBoundingClientRect();
      this.pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      this.pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      this.parallax.tx = this.pointer.x;
      this.parallax.ty = this.pointer.y;
      this.lastEv = ev;
    });
    el.addEventListener('pointerleave', () => {
      this.pointer.set(-10, -10);
      this.parallax.tx = 0; this.parallax.ty = 0;
      this._setHover(-1, null);
    });
    el.addEventListener('click', () => {
      if (this.hoverId >= 0) this.onPick(this.stones[this.hoverId].name);
    });
    window.addEventListener('resize', () => this._resize());

    /* pause when off-screen or the tab is hidden */
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { this.onScreen = e.isIntersecting; this._sync(); });
    }, { rootMargin: '100px' });
    io.observe(this.host);
    document.addEventListener('visibilitychange', () => this._sync());
    this.onScreen = true;
    this._sync();
  }

  _sync() {
    const want = this.onScreen && document.visibilityState === 'visible';
    if (want && !this.running) { this.running = true; this._loop(); }
    else if (!want) { this.running = false; }
  }

  _setHover(id, ev) {
    if (id === this.hoverId) {
      if (id >= 0 && ev) this.onHover(this.stones[id].repo, ev);
      return;
    }
    if (this.hoverId >= 0 && this.stones[this.hoverId]) {
      this.stones[this.hoverId].liftTarget = this.filter
        ? (this.filter[this.stones[this.hoverId].name] ? 9 : 0) : 0;
    }
    this.hoverId = id;
    if (id >= 0) this.stones[id].liftTarget = 14;
    this.renderer.domElement.style.cursor = id >= 0 ? 'pointer' : 'grab';
    this.onHover(id >= 0 ? this.stones[id].repo : null, ev || this.lastEv);
  }

  _resize() {
    const r = this.host.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this._frame();
  }

  /* Analytic fits kept guessing wrong (the tilt foreshortens depth but not
     width, and the tassel hangs outside the cap). So measure instead: project
     the extremes, read the NDC bounds, and scale the camera distance to fill
     the frame. Converges in a couple of passes. */
  _frame() {
    /* As the cap spins, its footprint sweeps a CIRCLE of radius = the
       square's half-diagonal. Framing the square's corners instead was
       fitting a box sqrt(2) too big, which is why it sat small in frame. */
    const R = CAP * Math.SQRT1_2;         /* radius the spinning cap sweeps */
    const top = 42;                       /* tallest stone + slab           */
    const pts = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      pts.push(new THREE.Vector3(x, 0, z));
      pts.push(new THREE.Vector3(x, top, z));
    }
    pts.push(new THREE.Vector3(-CAP * 0.5 - 10, -34, -CAP * 0.5 - 5));  /* tassel tip */

    /* The tassel hangs well below the cap, so framing symmetrically about
       the origin zoomed out to fit it. Aim at the content's own centre. */
    const centre = new THREE.Vector3();
    pts.forEach((p) => centre.add(p));
    centre.divideScalar(pts.length);
    this.target = centre;

    const el = 0.84;
    const dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
    let dist = this.camera.position.distanceTo(centre) || 260;

    for (let pass = 0; pass < 4; pass++) {
      this.camera.position.copy(centre).addScaledVector(dir, dist);
      this.camera.lookAt(centre);
      this.camera.updateMatrixWorld(true);
      let mx = 0, my = 0;
      for (const p of pts) {
        const q = p.clone().project(this.camera);
        mx = Math.max(mx, Math.abs(q.x));
        my = Math.max(my, Math.abs(q.y));
      }
      const k = Math.max(mx, my) / 0.985;
      if (!isFinite(k) || k <= 0) break;
      dist *= k;
      if (Math.abs(k - 1) < 0.005) break;
    }
    this.camera.position.copy(centre).addScaledVector(dir, dist);
    this.camera.lookAt(centre);
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());

    const now = performance.now();
    const intro = Math.min(1, (now - this.t0) / 1800);

    if (!REDUCED.matches) this.spin += 0.0011;
    this.parallax.x += (this.parallax.tx - this.parallax.x) * 0.06;
    this.parallax.y += (this.parallax.ty - this.parallax.y) * 0.06;

    this.rig.rotation.y = this.spin + this.parallax.x * 0.30;
    this.rig.rotation.x = -this.parallax.y * 0.13;

    /* ease stone lift / dim */
    for (const s of this.stones) {
      s.lift += (s.liftTarget - s.lift) * 0.16;
      s.dim += (s.dimTarget - s.dim) * 0.12;
    }
    this._writeMatrices(intro);

    /* hover pick */
    if (this.mesh && this.pointer.x > -5 && intro > 0.6) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObject(this.mesh, false)[0];
      this._setHover(hit ? hit.instanceId : -1, this.lastEv);
    }

    this.renderer.render(this.scene, this.camera);
  }

  _disposeStones() {
    if (!this.mesh) return;
    this.rig.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
    this.mesh = null;
    this.stones = [];
  }
}

/* ------------------------------------------------------------------
   Mount — degrades to the flat grid map when WebGL isn't available.
   ------------------------------------------------------------------ */
export function mountStage(host, handlers) {
  try {
    const probe = document.createElement('canvas');
    const ok = !!(probe.getContext('webgl2') || probe.getContext('webgl'));
    if (!ok) return null;
  } catch (e) { return null; }
  try {
    return new Mortarboard(host, handlers);
  } catch (e) {
    console.warn('Mortarboard failed to start:', e);
    return null;
  }
}

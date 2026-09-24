/* ===================================================================
   COBBLESTONE LEARNING · REPOSITORY HUB (v2)
   PLAN — organic city planning by recursive polygon subdivision.
   -------------------------------------------------------------------
   A squarified treemap is area-accurate and unmistakably a grid: every
   street meets at a right angle and every plot is axis-aligned. This
   keeps the area accuracy and throws away the grid.

   A plot is a convex polygon. To place N items in it we split it with
   a single straight cut, chosen roughly perpendicular to the plot's
   longest axis and then jittered, and we binary-search the cut's
   offset until the two sides hold the right share of the area. Recurse
   on each side. Nothing is axis-aligned unless the data happens to
   make it so, streets run at every angle, and blocks come out as
   irregular convex plots the way a city that grew does.

   Each plot is then inset before its children are laid, and that inset
   is the street. Leaves hand back a centroid, an inscribed radius and
   the direction of their longest edge, so a building can sit in the
   middle of its plot facing the street rather than facing north.
   =================================================================== */

/* ---------- polygon primitives ---------- */
export function polyArea(p) {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
  }
  return Math.abs(a) / 2;
}

export function polyCentroid(p) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const f = p[j][0] * p[i][1] - p[i][0] * p[j][1];
    a += f; cx += (p[j][0] + p[i][0]) * f; cy += (p[j][1] + p[i][1]) * f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) {
    let sx = 0, sy = 0;
    p.forEach((q) => { sx += q[0]; sy += q[1]; });
    return [sx / p.length, sy / p.length];
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/* Shortest distance from a point to the polygon's edges — the radius of
   the largest circle we can stand at that point. */
export function inradiusAt(p, c) {
  let best = Infinity;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const ax = p[j][0], ay = p[j][1], bx = p[i][0], by = p[i][1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    let t = ((c[0] - ax) * dx + (c[1] - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + dx * t, qy = ay + dy * t;
    const d = Math.hypot(c[0] - qx, c[1] - qy);
    if (d < best) best = d;
  }
  return best;
}

/* The direction of the polygon's longest edge — what a building faces. */
export function longestEdgeAngle(p) {
  let best = -1, ang = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const dx = p[i][0] - p[j][0], dy = p[i][1] - p[j][1];
    const d = dx * dx + dy * dy;
    if (d > best) { best = d; ang = Math.atan2(dy, dx); }
  }
  return ang;
}

/* Shrink a convex polygon toward its centroid. An exact inward offset
   needs edge intersection; for convex plots at these scales the scalar
   version is indistinguishable and far cheaper. */
export function insetPoly(p, pad) {
  const c = polyCentroid(p);
  const r = inradiusAt(p, c);
  if (r <= 1e-4) return null;
  /* Streets scale with the block. An absolute width swallows small plots
     whole, which silently drops most of the city. */
  const use = Math.min(pad, r * 0.30);
  const k = Math.max(0.15, (r - use) / r);
  return p.map((q) => [c[0] + (q[0] - c[0]) * k, c[1] + (q[1] - c[1]) * k]);
}

/* Sutherland–Hodgman against a single half-plane: keep n·x <= d. */
function clipHalf(poly, nx, ny, d) {
  const out = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const A = poly[j], B = poly[i];
    const da = nx * A[0] + ny * A[1] - d;
    const db = nx * B[0] + ny * B[1] - d;
    const ain = da <= 0, bin = db <= 0;
    if (ain !== bin) {
      const t = da / (da - db);
      out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]);
    }
    if (bin) out.push(B);
  }
  return out;
}

/* The polygon's widest direction, used to pick a cut that keeps plots
   compact rather than slivered. */
function longestAxis(p) {
  let best = -1, ax = 1, ay = 0;
  for (let i = 0; i < p.length; i++) {
    for (let j = i + 1; j < p.length; j++) {
      const dx = p[j][0] - p[i][0], dy = p[j][1] - p[i][1];
      const d = dx * dx + dy * dy;
      if (d > best) { best = d; ax = dx; ay = dy; }
    }
  }
  const L = Math.hypot(ax, ay) || 1;
  return [ax / L, ay / L];
}

let RNG = 1;
function rand() {                                  /* deterministic per build */
  RNG = (Math.imul(RNG, 1664525) + 1013904223) >>> 0;
  return RNG / 4294967296;
}
export function seedPlan(seed) { RNG = (seed >>> 0) || 1; }

/* ---------- the split ---------- */
/* Cut `poly` so that `frac` of its area falls on the near side. */
function cutByArea(poly, nx, ny, frac) {
  let lo = Infinity, hi = -Infinity;
  poly.forEach((q) => {
    const v = nx * q[0] + ny * q[1];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  });
  const total = polyArea(poly);
  const want = total * frac;
  let a = lo, b = hi;
  for (let k = 0; k < 24; k++) {
    const mid = (a + b) / 2;
    if (polyArea(clipHalf(poly, nx, ny, mid)) < want) a = mid; else b = mid;
  }
  const d = (a + b) / 2;
  return [clipHalf(poly, nx, ny, d), clipHalf(poly, -nx, -ny, -d)];
}

/**
 * Lay `items` (each with a positive `.value`) into `poly`.
 *   opts.pad      street around the whole block, applied ONCE on entry
 *   opts.leafPad  gap around each finished plot
 *   opts.jitter   how far each cut leans off perpendicular
 *
 * The binary recursion is how we subdivide, not a level of the city: an
 * inset per split compounds (0.7^6 ≈ 12%) and eats the block alive. The
 * street goes in once, and the gap goes in at the leaves.
 */
export function layoutPoly(poly, items, onLeaf, opts = {}) {
  const pad = opts.pad || 0;
  const leafPad = opts.leafPad || 0;
  const jitter = opts.jitter == null ? 0.42 : opts.jitter;

  const start = pad ? insetPoly(poly, pad) : poly;
  if (!start || start.length < 3 || !items.length) return;

  (function rec(p, list) {
    if (!list.length || !p || p.length < 3) return;
    if (list.length === 1) {
      const leaf = leafPad ? insetPoly(p, leafPad) : p;
      if (leaf && leaf.length >= 3) onLeaf(list[0], leaf);
      return;
    }
    const total = list.reduce((s, i) => s + i.value, 0) || 1;
    let acc = 0, cut = 1;
    for (let i = 0; i < list.length - 1; i++) {
      acc += list[i].value;
      cut = i + 1;
      if (acc >= total / 2) break;
    }
    const frac = Math.min(0.9, Math.max(0.1, acc / total));

    /* Always cut ACROSS the long axis. Cutting along it spans the full
       length and turns the smaller share into a long thin strip — which
       collapses its inradius, and with it every building it carries. */
    const [ax, ay] = longestAxis(p);
    const theta = Math.atan2(ay, ax) + (rand() - 0.5) * jitter;

    const [near, far] = cutByArea(p, Math.cos(theta), Math.sin(theta), frac);
    if (near.length < 3 || far.length < 3) {           /* degenerate: don't lose it */
      const leaf = leafPad ? insetPoly(p, leafPad) : p;
      if (leaf && leaf.length >= 3) onLeaf(list[0], leaf);
      return;
    }
    rec(near, list.slice(0, cut));
    rec(far, list.slice(cut));
  })(start, items);
}

/* A plot's building: where it stands, how big it can be, which way it faces. */
export function plotToSite(poly) {
  const c = polyCentroid(poly);
  const r = inradiusAt(poly, c);
  /* Area is the honest measure of a plot; the inradius of an elongated one
     collapses and would shrink the building to nothing. Callers size from
     area and use `r` only to check the thing fits across the narrow way. */
  return { x: c[0], z: c[1], r, area: polyArea(poly), angle: longestEdgeAngle(poly) };
}

/* A rough circle of points — the estate's outline, so the whole city is
   an island rather than a square slab. */
export function blobPolygon(radius, n, wobble, seed) {
  seedPlan(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = radius * (1 - wobble / 2 + rand() * wobble);
    out.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return out;
}

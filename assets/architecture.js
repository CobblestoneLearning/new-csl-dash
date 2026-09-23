/* ===================================================================
   COBBLESTONE LEARNING · REPOSITORY HUB (v2)
   ARCHITECTURE — a generative building vocabulary.
   -------------------------------------------------------------------
   A city of scaled boxes tells you one thing: size. So buildings are
   composed, not scaled. Every building is assembled from real parts —
   plinths, colonnades, arcades, terraces, flying buttresses, domes,
   lanterns, pediments, statues — and which parts it gets is computed:

     family   file type          php -> monolith, js -> tower, css -> hall…
     tier     size within repo   plain / columns / + arcade / + buttresses
     crown    name + type        flat, pediment, dome, lantern, spire, statue
     landmark biggest file       always fully ornate, always crowned

   A single-file snippet therefore becomes a statue on a colonnaded
   plinth; a 400 KB vendor class becomes a buttressed monolith under a
   lantern; a deep little partial stays a plain shaft. All of it from
   the tree we already fetched.

   Geometry is generated per VARIANT, not per building: a few dozen
   distinct forms get instanced across 2,400 buildings, so the variety
   is free at draw time. Every variant honours one contract —
     · footprint inside ±0.5 on x/z
     · base at y = 0, apex at y = 1
     · indexed, with position/normal/uv
   so a single instance matrix (w, height, d) places any of them.
   =================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from './vendor/addons/BufferGeometryUtils.js';

/* ---------- primitives, pre-translated into place ---------- */
function box(w, h, d, y, x = 0, z = 0) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
}
function cyl(rt, rb, h, seg, y, x = 0, z = 0) {
  return new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y + h / 2, z);
}
function cone(r, h, seg, y, x = 0, z = 0) {
  return new THREE.ConeGeometry(r, h, seg).translate(x, y + h / 2, z);
}
function dome(r, h, y) {
  const g = new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, h / r, 1);
  return g.translate(0, y, 0);
}
function ball(r, y, x = 0, z = 0) {
  return new THREE.SphereGeometry(r, 8, 6).translate(x, y, z);
}
/* A half-torus standing upright: one arch of an arcade. */
function arch(r, tube, y, x, z, rotY) {
  const g = new THREE.TorusGeometry(r, tube, 5, 9, Math.PI);
  if (rotY) g.rotateY(rotY);
  return g.translate(x, y, z);
}
/* A triangular prism — pediments and gables. */
function prism(w, h, d, y) {
  const g = new THREE.CylinderGeometry(0.0001, w * 0.72, h, 3, 1);
  g.rotateY(Math.PI / 2);
  g.scale(1, 1, d / w);
  return g.translate(0, y + h / 2, 0);
}

/* ---------- composable ornament ---------- */

/* A ring of columns just inside the footprint. */
function colonnade(n, radius, height, y, r = 0.034) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    parts.push(cyl(r, r * 1.12, height, 6, y, x, z));
    parts.push(box(r * 3.0, height * 0.05, r * 3.0, y + height, x, z));     /* capital */
    parts.push(box(r * 3.3, height * 0.04, r * 3.3, y, x, z));              /* base    */
  }
  return parts;
}

/* An arcade of arches around the base. */
function arcade(n, radius, r, y) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    parts.push(arch(r, r * 0.17, y + r, Math.cos(a) * radius, Math.sin(a) * radius, -a + Math.PI / 2));
  }
  return parts;
}

/* Angled struts carrying the upper mass out to piers. */
function buttresses(n, inner, outer, top) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 4;
    const cx = Math.cos(a), cz = Math.sin(a);
    const run = outer - inner;
    const len = Math.hypot(run, top);
    const g = new THREE.BoxGeometry(0.042, len, 0.042);
    g.rotateZ(Math.atan2(run, top));
    g.rotateY(-a);
    g.translate(cx * (inner + outer) / 2, top / 2, cz * (inner + outer) / 2);
    parts.push(g);
    parts.push(box(0.10, top * 0.20, 0.10, 0, cx * outer, cz * outer));      /* pier */
  }
  return parts;
}

/* Stacked setbacks — a ziggurat body. */
function terraces(n, w, from, to) {
  const parts = [];
  const span = (to - from) / n;
  for (let i = 0; i < n; i++) {
    const ww = w * (1 - (i / n) * 0.5);
    parts.push(box(ww, span, ww, from + span * i));
    parts.push(box(ww * 1.09, span * 0.09, ww * 1.09, from + span * (i + 0.9)));
  }
  return parts;
}

/* A small abstract figure. Reads as a statue at any distance we use. */
function statue(y, s = 1) {
  return [
    box(0.24 * s, 0.045 * s, 0.24 * s, y),
    cyl(0.05 * s, 0.08 * s, 0.17 * s, 7, y + 0.045 * s),
    ball(0.05 * s, y + 0.27 * s),
    box(0.018 * s, 0.10 * s, 0.018 * s, y + 0.10 * s, 0.068 * s, 0),
    box(0.018 * s, 0.085 * s, 0.018 * s, y + 0.115 * s, -0.068 * s, 0)
  ];
}

/* ---------- crowns ---------- */
const CROWNS = {
  flat: (y) => [box(1.00, 0.022, 1.00, y)],
  pediment: (y) => [box(1.02, 0.03, 1.02, y), prism(0.98, 0.15, 0.98, y + 0.03)],
  dome: (y) => [cyl(0.34, 0.40, 0.07, 12, y), dome(0.33, 0.23, y + 0.07),
                cyl(0.034, 0.034, 0.07, 6, y + 0.29), ball(0.034, y + 0.37)],
  lantern: (y) => [box(0.52, 0.04, 0.52, y), cyl(0.17, 0.21, 0.13, 8, y + 0.04),
                   cone(0.22, 0.12, 8, y + 0.17), cyl(0.015, 0.015, 0.08, 5, y + 0.29)],
  spire: (y) => [box(0.44, 0.04, 0.44, y), cone(0.20, 0.30, 6, y + 0.04),
                 cyl(0.014, 0.014, 0.07, 5, y + 0.34)],
  statue: (y) => [box(0.38, 0.04, 0.38, y), ...statue(y + 0.04, 1.0)],
  antenna: (y) => [box(0.30, 0.03, 0.30, y), cyl(0.011, 0.028, 0.26, 5, y + 0.03),
                   box(0.10, 0.011, 0.011, y + 0.16)]
};

/* ---------- families: the body each file type builds ---------- */
const FAMILIES = {
  monolith: (t) => {
    const p = [box(0.86, 0.04, 0.86, 0)];
    if (t >= 1) p.push(box(0.96, 0.05, 0.96, 0));
    p.push(box(0.78, 0.74, 0.78, 0.05));
    p.push(box(0.88, 0.05, 0.88, 0.79));
    return p;
  },
  tower: (t) => {
    const shaft = cyl(0.29, 0.45, 0.80, 4, 0.03).rotateY(Math.PI / 4);
    const p = [box(0.82, 0.03, 0.82, 0), shaft, box(0.54, 0.04, 0.54, 0.83)];
    if (t >= 2) p.push(...terraces(2, 0.36, 0.83, 0.90));
    return p;
  },
  hall: (t) => {
    const p = [box(0.96, 0.05, 0.96, 0), box(0.88, 0.70, 0.88, 0.05), box(0.98, 0.06, 0.98, 0.75)];
    if (t >= 1) p.push(box(0.58, 0.09, 0.58, 0.81));
    return p;
  },
  house: () => {
    const roof = cone(0.66, 0.24, 4, 0.72).rotateY(Math.PI / 4);
    return [box(0.90, 0.04, 0.90, 0), box(0.82, 0.68, 0.82, 0.04), roof];
  },
  silo: () => [cyl(0.44, 0.46, 0.05, 14, 0), cyl(0.37, 0.37, 0.78, 14, 0.05),
               cyl(0.40, 0.40, 0.04, 14, 0.37), cyl(0.29, 0.39, 0.08, 14, 0.83)],
  stele: () => [box(0.42, 0.06, 0.42, 0), box(0.28, 0.80, 0.15, 0.06), box(0.36, 0.05, 0.21, 0.86)],
  pavilion: () => [cyl(0.46, 0.50, 0.06, 12, 0), cyl(0.39, 0.41, 0.54, 12, 0.06), dome(0.41, 0.27, 0.60)],
  spire: () => [box(0.38, 0.08, 0.38, 0), box(0.23, 0.50, 0.23, 0.08), cone(0.18, 0.34, 6, 0.58)],
  works: () => [box(0.58, 0.06, 0.58, 0), cyl(0.19, 0.26, 0.70, 10, 0.06),
                cyl(0.29, 0.29, 0.07, 10, 0.64), cyl(0.14, 0.18, 0.18, 10, 0.76)],
  drum: () => [cyl(0.50, 0.50, 0.06, 16, 0), cyl(0.43, 0.43, 0.70, 16, 0.06), cyl(0.35, 0.47, 0.13, 16, 0.76)]
};

const FAMILY_BY_EXT = {
  php: 'monolith', inc: 'monolith', phtml: 'monolith',
  js: 'tower', mjs: 'tower', jsx: 'tower', ts: 'tower', tsx: 'tower', vue: 'tower',
  css: 'hall', scss: 'hall', sass: 'hall', less: 'hall',
  html: 'house', htm: 'house', twig: 'house', xhtml: 'house',
  json: 'silo', xml: 'silo', yml: 'silo', yaml: 'silo', csv: 'silo', ini: 'silo', lock: 'silo',
  md: 'stele', txt: 'stele', po: 'stele', pot: 'stele', mo: 'stele', rst: 'stele',
  png: 'pavilion', jpg: 'pavilion', jpeg: 'pavilion', gif: 'pavilion',
  svg: 'pavilion', webp: 'pavilion', ico: 'pavilion',
  woff: 'spire', woff2: 'spire', ttf: 'spire', eot: 'spire', otf: 'spire',
  sh: 'works', py: 'works', sql: 'works', bat: 'works',
  mp4: 'drum', webm: 'drum', mp3: 'drum', vtt: 'drum', srt: 'drum', zip: 'drum', pdf: 'drum'
};

export function extOf(path) {
  const b = path.slice(path.lastIndexOf('/') + 1);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1).toLowerCase() : '';
}
export function familyFor(path) { return FAMILY_BY_EXT[extOf(path)] || 'hall'; }
export function archetypeFor(path) { return familyFor(path); }

/* ---------- assembling a variant ---------- */
function buildVariant(family, tier, crown) {
  const parts = (FAMILIES[family] || FAMILIES.hall)(tier).filter(Boolean);
  const bodyTop = family === 'stele' ? 0.91 : family === 'tower' ? 0.87 : family === 'house' ? 0.96 : 0.84;

  if (tier >= 1) parts.push(...colonnade(family === 'tower' ? 4 : 8, 0.455, bodyTop * 0.80, 0.05));
  if (tier >= 2) parts.push(...arcade(family === 'tower' ? 4 : 6, 0.47, 0.085, 0.02));
  if (tier >= 3) parts.push(...buttresses(4, 0.33, 0.49, bodyTop * 0.70));

  parts.push(...(CROWNS[crown] || CROWNS.flat)(bodyTop));

  const g = mergeGeometries(parts, false);
  if (!g) return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

  /* normalise into the contract: footprint ±0.5, base 0, apex 1 */
  g.computeBoundingBox();
  const bb = g.boundingBox;
  g.translate(-(bb.max.x + bb.min.x) / 2, -bb.min.y, -(bb.max.z + bb.min.z) / 2);
  g.scale(
    1 / Math.max(bb.max.x - bb.min.x, 1e-3),
    1 / Math.max(bb.max.y - bb.min.y, 1e-3),
    1 / Math.max(bb.max.z - bb.min.z, 1e-3)
  );
  g.computeVertexNormals();
  return g;
}

const VARIANTS = new Map();
export function variantGeometry(key) {
  if (!VARIANTS.has(key)) {
    const bits = key.split(':');
    VARIANTS.set(key, buildVariant(bits[0], +bits[1], bits[2]));
  }
  return VARIANTS.get(key);
}
export function archetypeGeometry(name) { return variantGeometry(name + ':0:flat'); }

/* Which variant a file becomes. `pct` is its size percentile inside its own
   district, so ornament tracks significance rather than absolute bytes. */
export function variantFor(path, pct, isLandmark, sig, depth) {
  const family = familyFor(path);
  let tier = pct > 0.93 ? 3 : pct > 0.72 ? 2 : pct > 0.38 ? 1 : 0;
  if (isLandmark) tier = 3;
  /* a repo with almost nothing in it makes a monument of what it has */
  if (sig && sig.files <= 6) tier = Math.max(tier, 2);
  if (depth >= 4) tier = Math.min(tier, 1);          /* buried partials stay plain */

  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  let crown = 'flat';
  if (isLandmark) crown = family === 'pavilion' ? 'dome' : family === 'tower' ? 'antenna' : 'statue';
  else if (/^(index|main|readme|license|plugin|functions|style|bootstrap)\b/.test(base)) crown = 'statue';
  else if (tier === 3) crown = family === 'house' ? 'pediment' : 'lantern';
  else if (tier === 2) crown = (family === 'silo' || family === 'pavilion') ? 'dome' : 'pediment';
  else if (tier === 1) crown = (family === 'spire' || family === 'tower') ? 'spire' : 'flat';

  return family + ':' + tier + ':' + crown;
}

/* ---------- colour ---------- */
const FAMILY_COLOR = {
  monolith: '#0072B2', tower: '#00916A', hall: '#C4719B', house: '#D48200',
  silo: '#5BB8EC', stele: '#8293A6', pavilion: '#7E6BB5', spire: '#4E6070',
  works: '#6F8A5B', drum: '#B5686B'
};
export function fileColor(path) { return FAMILY_COLOR[familyFor(path)] || '#59697A'; }

export const KEY = [
  { arch: 'monolith', label: 'PHP' }, { arch: 'tower', label: 'JavaScript' },
  { arch: 'hall', label: 'CSS' }, { arch: 'house', label: 'HTML' },
  { arch: 'silo', label: 'Data' }, { arch: 'stele', label: 'Docs' },
  { arch: 'pavilion', label: 'Images' }, { arch: 'spire', label: 'Fonts' },
  { arch: 'works', label: 'Scripts' }, { arch: 'drum', label: 'Media' }
].map((k) => ({ ...k, color: FAMILY_COLOR[k.arch] }));

export const KEY_GLYPH = {
  monolith: 'M3 22h18v-3H3zM5 19h14V6H5zM4 6h16V3H4z',
  tower: 'M8 22h8l-2-19h-4z',
  hall: 'M3 22h18v-3H3zM4 19h16V9H4zM3 9h18V7H3z',
  house: 'M5 22h14V11H5zM12 3l8 8H4z',
  silo: 'M6 22h12V7H6zM6 7l6-4 6 4z',
  stele: 'M10 22h4V4h-4zM8 4h8V2H8z',
  pavilion: 'M4 22h16v-7H4zM4 15a8 8 0 0 1 16 0z',
  spire: 'M9 22h6v-3H9zM12 2l4 17H8z',
  works: 'M9 22h6V9H9zM7 9h10V6H7zM10 6h4V2h-4z',
  drum: 'M5 22h14V8H5zM5 8a7 3 0 0 1 14 0z'
};

/* ===================================================================
   SIGNATURE — every repository builds differently, from its own code.
   =================================================================== */
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function signatureOf(name, files) {
  const n = files.length || 1;
  let sumDepth = 0, maxDepth = 0;
  const sizes = [];
  const counts = {};
  files.forEach((f) => {
    const d = (f.p.match(/\//g) || []).length;
    sumDepth += d; if (d > maxDepth) maxDepth = d;
    sizes.push(Math.max(1, f.s || 1));
    const a = familyFor(f.p);
    counts[a] = (counts[a] || 0) + 1;
  });
  sizes.sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] || 1;
  const biggest = sizes[sizes.length - 1] || 1;

  const avgDepth = sumDepth / n;
  const skew = Math.log10(1 + biggest / median);
  const variety = Object.keys(counts).length;
  let dominant = 'hall', best = 0;
  Object.keys(counts).forEach((k) => { if (counts[k] > best) { best = counts[k]; dominant = k; } });

  const seed = hash32(name);
  const r1 = ((seed >>> 3) % 1000) / 1000;
  const r2 = ((seed >>> 13) % 1000) / 1000;

  return {
    avgDepth, maxDepth, skew, variety, dominant, seed, files: n,
    verticality: clamp(0.55 + avgDepth * 0.20 + skew * 0.22, 0.55, 2.6),
    slender: clamp(0.94 - avgDepth * 0.055, 0.52, 0.94),
    twist: clamp((variety - 3) * 0.055 + r1 * 0.10, 0, 0.32) * (r2 > 0.5 ? 1 : -1),
    crown: clamp(0.5 + skew * 0.55, 0.5, 2.2),
    hueShift: (r1 - 0.5) * 0.06
  };
}

export function describeSignature(sig) {
  const depth = sig.avgDepth < 0.6 ? 'flat' : sig.avgDepth < 2.2 ? 'shallow' : sig.avgDepth < 4 ? 'layered' : 'deeply nested';
  const spread = sig.skew < 1.0 ? 'evenly sized' : sig.skew < 2.0 ? 'mixed' : 'one dominant file';
  const mix = sig.variety <= 3 ? 'single-purpose' : sig.variety <= 4 ? 'focused' : 'broad mix';
  return depth + ' · ' + spread + ' · ' + mix;
}

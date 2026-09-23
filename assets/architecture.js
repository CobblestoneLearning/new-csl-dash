/* ===================================================================
   COBBLESTONE LEARNING · REPOSITORY HUB (v2)
   ARCHITECTURE — the building vocabulary of the city.
   -------------------------------------------------------------------
   A city of identical scaled boxes tells you one thing: size. So the
   *form* of a building is computed too — every file type gets its own
   archetype, and a repository's silhouette becomes the shape of what
   it is made of. A theme (slabs of CSS, pitched HTML) is legible at a
   glance against an app (glass towers of JS) or a snippet (one lone
   setback tower of PHP).

   Every archetype is authored to the same contract:
     · footprint inside ±0.5 on x/z
     · base at y = 0, apex at y = 1
     · indexed, with position/normal/uv
   so one instance matrix (w, height, d) places any of them, and the
   window shader can treat local y as "up the building".
   =================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from './vendor/addons/BufferGeometryUtils.js';

function box(w, h, d, y) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, y + h / 2, 0);
  return g;
}
function cyl(rt, rb, h, seg, y) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(0, y + h / 2, 0);
  return g;
}
function cone(r, h, seg, y) {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.translate(0, y + h / 2, 0);
  return g;
}
function finish(g) {
  g.computeVertexNormals();
  return g;
}

/* ---------- the vocabulary ---------- */
const BUILDERS = {
  /* PHP — the workhorse. A setback office tower. */
  setback: () => finish(mergeGeometries([
    box(1.00, 0.58, 1.00, 0),
    box(0.78, 0.26, 0.78, 0.58),
    box(0.52, 0.16, 0.52, 0.84)
  ])),

  /* JavaScript — a tapered glass tower. */
  glass: () => {
    const g = cyl(0.34, 0.52, 1, 4, 0);
    g.rotateY(Math.PI / 4);
    return finish(g);
  },

  /* CSS — a broad low slab with a parapet. */
  slab: () => finish(mergeGeometries([
    box(1.00, 0.88, 1.00, 0),
    box(1.06, 0.12, 1.06, 0.88)
  ])),

  /* HTML — a pitched roof. */
  pitched: () => {
    const roof = cone(0.70, 0.26, 4, 0.80);
    roof.rotateY(Math.PI / 4);                 /* align the ridge to the walls */
    return finish(mergeGeometries([box(1.00, 0.80, 1.00, 0), roof]));
  },

  /* JSON / XML / config — a data silo. */
  silo: () => finish(mergeGeometries([
    cyl(0.42, 0.42, 0.92, 14, 0),
    cyl(0.30, 0.44, 0.08, 14, 0.92)
  ])),

  /* Markdown / text — a thin monument. */
  stele: () => finish(mergeGeometries([
    box(0.42, 0.94, 0.42, 0),
    box(0.54, 0.06, 0.54, 0.94)
  ])),

  /* Images — a low pavilion under a dome. */
  pavilion: () => {
    const dome = new THREE.SphereGeometry(0.46, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, 0.42, 1);
    dome.translate(0, 0.74, 0);
    return finish(mergeGeometries([cyl(0.46, 0.5, 0.74, 12, 0), dome]));
  },

  /* Fonts — a spire. */
  spire: () => finish(mergeGeometries([
    box(0.46, 0.20, 0.46, 0),
    cone(0.30, 0.80, 6, 0.20)
  ])),

  /* Shell / SQL / Python — industrial: a stack with a collar. */
  stack: () => finish(mergeGeometries([
    cyl(0.24, 0.32, 0.86, 10, 0),
    cyl(0.34, 0.34, 0.10, 10, 0.72),
    cyl(0.20, 0.24, 0.04, 10, 0.96)
  ])),

  /* Media — a drum. */
  drum: () => finish(mergeGeometries([
    cyl(0.48, 0.48, 0.80, 16, 0),
    cyl(0.40, 0.50, 0.14, 16, 0.80)
  ]))
};

export const ARCHETYPES = Object.keys(BUILDERS);

const CACHE = new Map();
export function archetypeGeometry(name) {
  if (!CACHE.has(name)) CACHE.set(name, (BUILDERS[name] || BUILDERS.slab)());
  return CACHE.get(name);
}

/* ---------- what each file becomes ---------- */
const BY_EXT = {
  php: 'setback', inc: 'setback', phtml: 'setback',
  js: 'glass', mjs: 'glass', jsx: 'glass', ts: 'glass', tsx: 'glass', vue: 'glass',
  css: 'slab', scss: 'slab', sass: 'slab', less: 'slab',
  html: 'pitched', htm: 'pitched', twig: 'pitched', xhtml: 'pitched',
  json: 'silo', xml: 'silo', yml: 'silo', yaml: 'silo', csv: 'silo', ini: 'silo', lock: 'silo',
  md: 'stele', txt: 'stele', po: 'stele', pot: 'stele', mo: 'stele', rst: 'stele',
  png: 'pavilion', jpg: 'pavilion', jpeg: 'pavilion', gif: 'pavilion',
  svg: 'pavilion', webp: 'pavilion', ico: 'pavilion',
  woff: 'spire', woff2: 'spire', ttf: 'spire', eot: 'spire', otf: 'spire',
  sh: 'stack', py: 'stack', sql: 'stack', bat: 'stack',
  mp4: 'drum', webm: 'drum', mp3: 'drum', vtt: 'drum', srt: 'drum', zip: 'drum', pdf: 'drum'
};

export function extOf(path) {
  const b = path.slice(path.lastIndexOf('/') + 1);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1).toLowerCase() : '';
}
export function archetypeFor(path) {
  return BY_EXT[extOf(path)] || 'slab';
}

/* ---------- colour, from the validated categorical theme ---------- */
const BY_EXT_COLOR = {
  setback: '#0072B2',    /* PHP        */
  glass: '#00916A',      /* JavaScript */
  slab: '#C4719B',       /* CSS        */
  pitched: '#D48200',    /* HTML       */
  silo: '#5BB8EC',       /* data       */
  stele: '#8293A6',      /* docs       */
  pavilion: '#7E6BB5',   /* images     */
  spire: '#4E6070',      /* fonts      */
  stack: '#6F8A5B',      /* scripts    */
  drum: '#B5686B'        /* media      */
};
export function fileColor(path) { return BY_EXT_COLOR[archetypeFor(path)] || '#59697A'; }

/* What the on-screen key shows, in reading order. */
export const KEY = [
  { arch: 'setback', label: 'PHP' },
  { arch: 'glass', label: 'JavaScript' },
  { arch: 'slab', label: 'CSS' },
  { arch: 'pitched', label: 'HTML' },
  { arch: 'silo', label: 'Data' },
  { arch: 'stele', label: 'Docs' },
  { arch: 'pavilion', label: 'Images' },
  { arch: 'spire', label: 'Fonts' },
  { arch: 'stack', label: 'Scripts' },
  { arch: 'drum', label: 'Media' }
].map((k) => ({ ...k, color: BY_EXT_COLOR[k.arch] }));

/* Flat silhouettes for the HTML key — the same forms, drawn in 2D. */
export const KEY_GLYPH = {
  setback: 'M3 22h18v-6h-4V9h-3V3h-4v6H7v7H3z',
  glass: 'M8 22h8l-2-19h-4z',
  slab: 'M3 22h18v-3H3zM4 19h16V8H4z',
  pitched: 'M5 22h14V11H5zM12 3l8 8H4z',
  silo: 'M6 22h12V7H6zM6 7l6-4 6 4z',
  stele: 'M10 22h4V4h-4zM8 4h8V2H8z',
  pavilion: 'M4 22h16v-7H4zM4 15a8 8 0 0 1 16 0z',
  spire: 'M9 22h6v-3H9zM12 2l4 17H8z',
  stack: 'M9 22h6V9H9zM7 9h10V6H7zM10 6h4V2h-4z',
  drum: 'M5 22h14V8H5zM5 8a7 3 0 0 1 14 0z'
};

/* ===================================================================
   SIGNATURE — every repository builds differently, from its own code.
   -------------------------------------------------------------------
   Archetypes vary the buildings; this varies the *city*. Real spread
   across the estate: average nesting depth runs 0.0 (a one-file
   snippet) to 6.7 (stripe-payment); size skew runs 0.3 (uniform) to
   3.0 (one file dwarfing the rest); type variety runs 3 to 6.

   Those become architecture, so a deep, spiky, varied repo grows a
   dense vertical downtown and a flat uniform one sprawls low and
   regular. Nothing is hand-assigned.
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
    const a = archetypeFor(f.p);
    counts[a] = (counts[a] || 0) + 1;
  });
  sizes.sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] || 1;
  const biggest = sizes[sizes.length - 1] || 1;

  const avgDepth = sumDepth / n;
  const skew = Math.log10(1 + biggest / median);         /* 0.3 – 3.0 */
  const variety = Object.keys(counts).length;            /* 3 – 6     */
  let dominant = 'slab', best = 0;
  Object.keys(counts).forEach((k) => { if (counts[k] > best) { best = counts[k]; dominant = k; } });

  const seed = hash32(name);
  const r1 = ((seed >>> 3) % 1000) / 1000;
  const r2 = ((seed >>> 13) % 1000) / 1000;

  return {
    avgDepth, maxDepth, skew, variety, dominant, seed, files: n,
    /* how tall this district builds */
    verticality: clamp(0.55 + avgDepth * 0.20 + skew * 0.22, 0.55, 2.6),
    /* deep trees build slender, flat ones squat */
    slender: clamp(0.94 - avgDepth * 0.055, 0.52, 0.94),
    /* variety loosens the street grid; the seed decides which way */
    twist: clamp((variety - 3) * 0.055 + r1 * 0.10, 0, 0.32) * (r2 > 0.5 ? 1 : -1),
    /* a taller crown on the landmark of a spikier repo */
    crown: clamp(0.5 + skew * 0.55, 0.5, 2.2),
    hueShift: (r1 - 0.5) * 0.06
  };
}

/* A one-line, human description of the same thing, for the inspector. */
export function describeSignature(sig) {
  const depth = sig.avgDepth < 0.6 ? 'flat' : sig.avgDepth < 2.2 ? 'shallow' : sig.avgDepth < 4 ? 'layered' : 'deeply nested';
  const spread = sig.skew < 1.0 ? 'evenly sized' : sig.skew < 2.0 ? 'mixed' : 'one dominant file';
  const mix = sig.variety <= 3 ? 'single-purpose' : sig.variety <= 4 ? 'focused' : 'broad mix';
  return depth + ' · ' + spread + ' · ' + mix;
}

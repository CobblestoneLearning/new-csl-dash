/* ===================================================================
   COBBLESTONE LEARNING · REPOSITORY HUB (v2) — live visualisations
   -------------------------------------------------------------------
   Two canvas engines, both driven entirely by real API data:

     constellation()  every repo wired to the platforms it integrates
                      with, held apart by a live force simulation.
     skyline()        an isometric city — one building per repo,
                      height = bytes of source, districts by type.

   House idiom (see cobblestonelearning.github.io/dashboard): light
   stage, restrained parallax, staggered entry, nothing that moves for
   the sake of moving. Both honour prefers-reduced-motion by settling
   to a static frame instead of animating.
   =================================================================== */
(function (global) {
'use strict';

var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ---------- shared helpers ---------- */
function hexToRgb(hex) {
  var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return { r: 0, g: 114, b: 178 };
  var n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function shade(hex, f) {
  var c = hexToRgb(hex);
  function ch(v) { return Math.max(0, Math.min(255, Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1)))); }
  return 'rgb(' + ch(c.r) + ',' + ch(c.g) + ',' + ch(c.b) + ')';
}
function rgba(hex, a) {
  var c = hexToRgb(hex);
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
}
function lerp(a, b, t) { return a + (b - a) * t; }
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

/* Size a canvas to its CSS box at device pixel ratio. Returns css w/h. */
function fitCanvas(canvas) {
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var r = canvas.getBoundingClientRect();
  var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr; canvas.height = h * dpr;
  }
  var ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: w, h: h, ctx: ctx };
}

/* Only run the loop while the canvas is on screen and the tab is visible —
   an off-screen animation is pure battery burn. */
function whenVisible(el, onChange) {
  var onScreen = true, tabVisible = document.visibilityState === 'visible';
  function push() { onChange(onScreen && tabVisible); }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { onScreen = e.isIntersecting; });
      push();
    }, { rootMargin: '120px' }).observe(el);
  }
  document.addEventListener('visibilitychange', function () {
    tabVisible = document.visibilityState === 'visible'; push();
  });
  push();
}

/* ===================================================================
   1. CONSTELLATION
   Repos orbit the platforms they plug into. Hubs sit on a ring; each
   repo springs toward the centroid of its hubs and is pushed off its
   neighbours, so clusters emerge from the data rather than a layout
   we picked. Repos that integrate with nothing drift in an outer belt.
   =================================================================== */
function constellation(canvas, opts) {
  var repos = opts.repos || [];
  var hubDefs = opts.hubs || [];
  var colorOf = opts.colorOf || function () { return '#0072B2'; };
  var onPick = opts.onPick || function () {};
  var onHover = opts.onHover || function () {};

  var nodes = [], hubs = [], links = [];
  var byName = {};
  var W = 0, H = 0, ctx = null;
  var hoverNode = null, dragging = null, filterSet = null;
  var raf = 0, running = false, t0 = performance.now(), settled = 0;

  /* ---- build the graph ---- */
  hubDefs.forEach(function (h, i) {
    var a = (i / hubDefs.length) * Math.PI * 2 - Math.PI / 2;
    hubs.push({
      hub: true, id: h.id, label: h.label, count: h.count,
      a: a, x: 0, y: 0, vx: 0, vy: 0, r: 0
    });
  });
  var hubById = {};
  hubs.forEach(function (h) { hubById[h.id] = h; });

  repos.forEach(function (repo) {
    var maxB = opts.maxBytes || 1;
    var mag = Math.log10(1 + (repo.bytes || 0)) / Math.log10(1 + maxB);
    var n = {
      hub: false, repo: repo, name: repo.name,
      r: 2.6 + mag * 6.4,
      x: 0, y: 0, vx: 0, vy: 0,
      color: colorOf(repo),
      hubs: []
    };
    (repo.platforms || []).forEach(function (p) { if (hubById[p]) n.hubs.push(hubById[p]); });
    nodes.push(n);
    byName[repo.name] = n;
    n.hubs.forEach(function (h) { links.push({ a: n, b: h }); });
  });

  function layout() {
    var cx = W / 2, cy = H / 2;
    var ring = Math.min(W, H) * 0.32;
    hubs.forEach(function (h) {
      h.r = 7 + Math.sqrt(h.count) * 2.1;
      h.hx = cx + Math.cos(h.a) * ring;
      h.hy = cy + Math.sin(h.a) * ring;
      if (!h.placed) { h.x = h.hx; h.y = h.hy; h.placed = 1; }
    });
    nodes.forEach(function (n, i) {
      if (n.placed) return;
      var a = (i / nodes.length) * Math.PI * 2, rr = ring * (n.hubs.length ? 0.65 : 1.45);
      n.x = cx + Math.cos(a) * rr + (Math.random() - 0.5) * 20;
      n.y = cy + Math.sin(a) * rr + (Math.random() - 0.5) * 20;
      n.placed = 1;
    });
  }

  /* ---- physics ---- */
  function step(dt) {
    var cx = W / 2, cy = H / 2;
    var belt = Math.min(W, H) * 0.46;

    /* hubs ease back to their ring slot */
    hubs.forEach(function (h) {
      h.vx += (h.hx - h.x) * 0.02;
      h.vy += (h.hy - h.y) * 0.02;
    });

    /* repos: spring to their hubs, or drift to the outer belt */
    nodes.forEach(function (n) {
      if (n.hubs.length) {
        var tx = 0, ty = 0;
        n.hubs.forEach(function (h) { tx += h.x; ty += h.y; });
        tx /= n.hubs.length; ty /= n.hubs.length;
        n.vx += (tx - n.x) * 0.013;
        n.vy += (ty - n.y) * 0.013;
      } else {
        var dx = n.x - cx, dy = n.y - cy, d = Math.hypot(dx, dy) || 1;
        n.vx += (dx / d) * (belt - d) * 0.006;
        n.vy += (dy / d) * (belt - d) * 0.006;
      }
      /* gentle pull to frame so nothing escapes */
      n.vx += (cx - n.x) * 0.0012;
      n.vy += (cy - n.y) * 0.0012;
    });

    /* repulsion — 126 bodies, so the naive O(n²) pass is free */
    var all = nodes.concat(hubs);
    for (var i = 0; i < all.length; i++) {
      var a = all[i];
      for (var j = i + 1; j < all.length; j++) {
        var b = all[j];
        var dx2 = b.x - a.x, dy2 = b.y - a.y;
        var d2 = dx2 * dx2 + dy2 * dy2;
        var min = (a.r + b.r + 7);
        if (d2 > min * min * 9 || d2 === 0) continue;
        var d3 = Math.sqrt(d2);
        var push = (min * 3 - d3) / d3 * 0.06;
        var px = dx2 * push, py = dy2 * push;
        var aw = a.hub ? 0.25 : 1, bw = b.hub ? 0.25 : 1;
        a.vx -= px * aw; a.vy -= py * aw;
        b.vx += px * bw; b.vy += py * bw;
      }
    }

    var damp = 0.86;
    all.forEach(function (n) {
      if (n === dragging) return;
      n.vx *= damp; n.vy *= damp;
      n.x += n.vx * dt; n.y += n.vy * dt;
      n.x = Math.max(n.r + 4, Math.min(W - n.r - 4, n.x));
      n.y = Math.max(n.r + 4, Math.min(H - n.r - 4, n.y));
    });
  }

  /* ---- draw ---- */
  function dimmed(n) {
    if (!filterSet) return false;
    return n.hub ? false : !filterSet[n.name];
  }
  function active(n) {
    if (!hoverNode) return false;
    if (n === hoverNode) return true;
    if (hoverNode.hub) return !n.hub && n.hubs.indexOf(hoverNode) >= 0;
    return n.hub && hoverNode.hubs.indexOf(n) >= 0;
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    var intro = Math.min(1, (now - t0) / 1100);
    var e = easeOut(intro);

    /* links */
    links.forEach(function (l) {
      var on = hoverNode && (l.a === hoverNode || l.b === hoverNode);
      var off = dimmed(l.a);
      ctx.beginPath();
      ctx.moveTo(l.a.x, l.a.y);
      ctx.lineTo(l.b.x, l.b.y);
      ctx.strokeStyle = on ? rgba(l.a.color, 0.75)
                           : off ? 'rgba(148,163,180,0.05)'
                                 : rgba(l.a.color, 0.16 * e);
      ctx.lineWidth = on ? 1.6 : 0.8;
      ctx.stroke();
    });

    /* repos */
    nodes.forEach(function (n) {
      var off = dimmed(n), on = active(n) || n === hoverNode;
      var r = n.r * (0.4 + 0.6 * e) * (on ? 1.65 : 1);
      if (on) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 7, 0, 6.2832);
        ctx.fillStyle = rgba(n.color, 0.18);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, 6.2832);
      ctx.fillStyle = off ? 'rgba(170,182,196,0.16)' : n.color;
      ctx.fill();
      if (!off) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    });

    /* hubs on top, with labels */
    hubs.forEach(function (h) {
      var on = active(h) || h === hoverNode;
      var r = h.r * (0.4 + 0.6 * e);
      ctx.beginPath();
      ctx.arc(h.x, h.y, r + (on ? 9 : 5), 0, 6.2832);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(h.x, h.y, r, 0, 6.2832);
      ctx.fillStyle = on ? '#0074B4' : '#3D3D3D';
      ctx.fill();

      ctx.font = '700 10.5px Montserrat, Helvetica, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var ty = h.y + r + 11;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(h.label, h.x, ty);
      ctx.fillStyle = on ? '#0074B4' : '#6B6B6B';
      ctx.globalAlpha = e;
      ctx.fillText(h.label, h.x, ty);
      ctx.globalAlpha = 1;
    });
  }

  /* ---- loop ---- */
  function frame(now) {
    if (!running) return;
    if (settled < 260) { step(1); settled++; }
    else if (!REDUCED.matches) { step(0.55); }
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true; raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  /* ---- interaction ---- */
  function at(px, py) {
    var best = null, bd = 18 * 18;
    hubs.concat(nodes).forEach(function (n) {
      var dx = n.x - px, dy = n.y - py, d = dx * dx + dy * dy;
      var reach = Math.max(n.r + 6, 9);
      if (d < reach * reach && d < bd) { bd = d; best = n; }
    });
    return best;
  }

  function onMove(ev) {
    var r = canvas.getBoundingClientRect();
    var px = ev.clientX - r.left, py = ev.clientY - r.top;
    if (dragging) {
      dragging.x = px; dragging.y = py; dragging.vx = 0; dragging.vy = 0;
      return;
    }
    var n = at(px, py);
    if (n !== hoverNode) {
      hoverNode = n;
      canvas.style.cursor = n ? 'pointer' : 'default';
      onHover(n && !n.hub ? n.repo : null, n && n.hub ? n : null, ev);
    } else if (n) {
      onHover(n.hub ? null : n.repo, n.hub ? n : null, ev);
    }
  }
  function onLeave() { hoverNode = null; onHover(null, null, null); canvas.style.cursor = 'default'; }
  function onDown(ev) {
    var r = canvas.getBoundingClientRect();
    var n = at(ev.clientX - r.left, ev.clientY - r.top);
    if (n && n.hub) { dragging = n; canvas.style.cursor = 'grabbing'; }
  }
  function onUp() {
    if (dragging) { dragging.hx = dragging.x; dragging.hy = dragging.y; }
    dragging = null; canvas.style.cursor = hoverNode ? 'pointer' : 'default';
  }
  function onClick(ev) {
    var r = canvas.getBoundingClientRect();
    var n = at(ev.clientX - r.left, ev.clientY - r.top);
    if (n && !n.hub) onPick(n.name);
    else if (n && n.hub && opts.onPickHub) opts.onPickHub(n.id);
  }

  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', onLeave);
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('click', onClick);

  function resize() {
    var m = fitCanvas(canvas);
    W = m.w; H = m.h; ctx = m.ctx;
    layout();
  }
  resize();
  window.addEventListener('resize', resize);
  whenVisible(canvas, function (vis) { if (vis) start(); else stop(); });

  return {
    setFilter: function (set) { filterSet = set; },
    reheat: function () { settled = Math.min(settled, 180); },
    destroy: stop
  };
}

/* ===================================================================
   2. SKYLINE
   One building per repository. Height is bytes of source (log-scaled,
   so a 4 MB repo doesn't flatten the rest); colour is type; districts
   are types. The camera rotates slowly and follows the pointer.
   =================================================================== */
function skyline(canvas, opts) {
  var groups = opts.groups || [];      /* [{ id, label, color, repos: [] }] */
  var onPick = opts.onPick || function () {};
  var onHover = opts.onHover || function () {};

  var buildings = [], W = 0, H = 0, ctx = null;
  var cam = { rot: -0.5, tw: 16, th: 8, ox: 0, oy: 0, px: 0, py: 0 };
  var raf = 0, running = false, t0 = performance.now();
  var hoverIdx = -1, filterSet = null;
  var maxBytes = 1;

  groups.forEach(function (g) {
    g.repos.forEach(function (r) { maxBytes = Math.max(maxBytes, r.bytes || 0); });
  });

  /* lay districts out along a diagonal so the city reads as a strip */
  var cursor = 0;
  groups.forEach(function (g) {
    var n = g.repos.length;
    if (!n) return;
    var cols = Math.max(2, Math.round(Math.sqrt(n * 1.9)));
    g.repos.forEach(function (repo, i) {
      var gx = cursor + (i % cols);
      var gy = Math.floor(i / cols);
      var mag = Math.log10(1 + (repo.bytes || 0)) / Math.log10(1 + maxBytes);
      buildings.push({
        repo: repo, name: repo.name, gx: gx, gy: gy,
        h: 6 + mag * 104, color: g.color, group: g.id
      });
    });
    cursor += cols + 2;
  });
  var spanX = cursor, spanY = 0;
  buildings.forEach(function (b) { spanY = Math.max(spanY, b.gy + 1); });

  /* centre the grid on its own origin so rotation spins about the middle */
  buildings.forEach(function (b) { b.cx = b.gx - spanX / 2; b.cy = b.gy - spanY / 2; });

  function project(x, y, h) {
    var c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    var rx = x * c - y * s, ry = x * s + y * c;
    return {
      x: (rx - ry) * cam.tw + cam.ox,
      y: (rx + ry) * cam.th - h + cam.oy,
      d: rx + ry
    };
  }

  function faceQuads(b, hh) {
    var x0 = b.cx, y0 = b.cy, x1 = b.cx + 0.86, y1 = b.cy + 0.86;
    var c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    var top = c.map(function (p) { return project(p[0], p[1], hh); });
    var base = c.map(function (p) { return project(p[0], p[1], 0); });
    var sides = [];
    for (var i = 0; i < 4; i++) {
      var j = (i + 1) % 4;
      sides.push({
        pts: [base[i], base[j], top[j], top[i]],
        d: (base[i].d + base[j].d) / 2,
        /* shade from the edge's screen direction — gives real form */
        lit: 0.52 + 0.30 * (0.5 + 0.5 * Math.cos(Math.atan2(base[j].y - base[i].y, base[j].x - base[i].x) - 0.6))
      });
    }
    sides.sort(function (p, q) { return p.d - q.d; });
    return { top: top, sides: sides, depth: (top[0].d + top[2].d) / 2 };
  }

  function poly(pts, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function pointIn(pts, px, py) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  var order = [];
  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    var intro = Math.min(1, (now - t0) / 1400);

    /* ground shadow pad */
    order.length = 0;
    buildings.forEach(function (b, i) {
      var stagger = Math.min(1, Math.max(0, (intro * 1.6) - (i / buildings.length) * 0.55));
      b._h = b.h * easeOut(stagger);
      var q = faceQuads(b, b._h);
      b._q = q;
      order.push({ i: i, b: b, q: q, d: q.depth });
    });
    order.sort(function (a, b) { return a.d - b.d; });

    order.forEach(function (o) {
      var b = o.b, q = o.q;
      var off = filterSet && !filterSet[b.name];
      var hot = hoverIdx === o.i;
      var col = off ? '#D5DCE4' : b.color;

      /* contact shadow */
      ctx.globalAlpha = off ? 0.05 : 0.10;
      poly(q.sides.map(function (s) { return s.pts[0]; }), '#3D3D3D');
      ctx.globalAlpha = 1;

      q.sides.forEach(function (s) {
        poly(s.pts, shade(col, hot ? s.lit + 0.28 : s.lit));
      });
      poly(q.top, hot ? shade(col, 1.30) : shade(col, off ? 1.0 : 1.12));

      if (hot) {
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(q.top[0].x, q.top[0].y);
        for (var i = 1; i < 4; i++) ctx.lineTo(q.top[i].x, q.top[i].y);
        ctx.closePath();
        ctx.stroke();
      }
    });
  }

  function fitCamera() {
    /* scale so the whole city fits the canvas at any rotation */
    var span = Math.max(spanX, spanY);
    cam.tw = Math.max(6, Math.min(W / (span * 1.55), 20));
    cam.th = cam.tw * 0.5;
    cam.ox = W / 2 + cam.px * 26;
    cam.oy = H * 0.66 + cam.py * 14;
  }

  function frame(now) {
    if (!running) return;
    if (!REDUCED.matches) cam.rot += 0.0016;
    fitCamera();
    draw(now);
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  canvas.addEventListener('mousemove', function (ev) {
    var r = canvas.getBoundingClientRect();
    var px = ev.clientX - r.left, py = ev.clientY - r.top;
    cam.px = (px / r.width - 0.5) * 2;
    cam.py = (py / r.height - 0.5) * 2;

    var found = -1;
    for (var k = order.length - 1; k >= 0; k--) {
      var o = order[k];
      if (!o.q) continue;
      if (pointIn(o.q.top, px, py)) { found = o.i; break; }
      var hit = false;
      for (var s = 0; s < o.q.sides.length; s++) {
        if (pointIn(o.q.sides[s].pts, px, py)) { hit = true; break; }
      }
      if (hit) { found = o.i; break; }
    }
    if (found !== hoverIdx) {
      hoverIdx = found;
      canvas.style.cursor = found >= 0 ? 'pointer' : 'default';
    }
    onHover(found >= 0 ? buildings[found].repo : null, ev);
  });
  canvas.addEventListener('mouseleave', function () {
    hoverIdx = -1; cam.px = 0; cam.py = 0; onHover(null, null);
  });
  canvas.addEventListener('click', function () {
    if (hoverIdx >= 0) onPick(buildings[hoverIdx].name);
  });

  function resize() {
    var m = fitCanvas(canvas);
    W = m.w; H = m.h; ctx = m.ctx;
    fitCamera();
  }
  resize();
  window.addEventListener('resize', resize);
  whenVisible(canvas, function (vis) { if (vis) start(); else stop(); });

  return {
    setFilter: function (set) { filterSet = set; },
    spin: function (d) { cam.rot += d; },
    destroy: stop
  };
}

global.CBViz = { constellation: constellation, skyline: skyline, shade: shade, rgba: rgba };

})(window);

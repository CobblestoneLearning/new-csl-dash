/* ===================================================================
   COBBLESTONE LEARNING · REPOSITORY HUB (v2)
   Vanilla JS, no build step. Depends on assets/config.js.
   =================================================================== */
(function () {
'use strict';

/* ============================================================
   0. State
   ============================================================ */
var STATE = {
  repos: [],            /* normalised, non-snippet + snippet together */
  projects: [],         /* non-snippet                                */
  snippets: [],         /* csl-snippet-*                              */
  gists: [],
  view: 'staff',
  q: '',
  purpose: 'all',
  platform: 'all',
  type: 'all',
  sort: 'updated',
  showArchived: false,
  snipQ: '',
  snipSite: 'all',
  snipPlatform: 'all',
  langBytes: {},        /* language -> bytes, live-updated            */
  langDone: 0,
  langTotal: 0,
  loaded: false,
  rateLimited: false
};

var ghToken = null;
var CBUSER = null;
var oauthPopup = null;

/* ============================================================
   1. Small helpers
   ============================================================ */
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function safeHttpUrl(u) {
  return (typeof u === 'string' && /^https:\/\//i.test(u)) ? u : '';
}
function debounce(fn, ms) {
  var t; return function () {
    var a = arguments, c = this;
    clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms);
  };
}
function timeAgo(iso) {
  if (!iso) return 'unknown';
  var then = new Date(iso).getTime();
  if (isNaN(then)) return 'unknown';
  var s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return 'just now';
  var m = s / 60;   if (m < 60)  return Math.floor(m) + 'm ago';
  var h = m / 60;   if (h < 24)  return Math.floor(h) + 'h ago';
  var d = h / 24;   if (d < 31)  return Math.floor(d) + 'd ago';
  var mo = d / 30.44; if (mo < 12) return Math.floor(mo) + 'mo ago';
  var y = d / 365.25;
  return (Math.round(y * 10) / 10) + 'y ago';
}
function daysSince(iso) {
  var t = new Date(iso).getTime();
  if (isNaN(t)) return 9999;
  return (Date.now() - t) / 86400000;
}
function fmtBytes(b) {
  if (!b) return '0';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return Math.round(b / 1024) + ' KB';
  var mb = b / 1048576;
  return (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + ' MB';
}
function splitBytes(b) {
  /* -> { val, unit } so the figure can style the unit separately */
  if (b >= 1048576) { var mb = b / 1048576; return { val: mb < 100 ? mb.toFixed(1) : String(Math.round(mb)), unit: 'MB' }; }
  return { val: String(Math.round(b / 1024)), unit: 'KB' };
}
function pct(n, total) { return total > 0 ? (n / total) * 100 : 0; }
function fmtPct(n) { return n >= 10 ? Math.round(n) + '%' : (Math.round(n * 10) / 10) + '%'; }

/* Strip the repeated "A WordPress plugin by Cobblestone Learning." lead-ins
   so cards read as sentences instead of boilerplate. */
function cleanDesc(d) {
  var out = String(d || '').trim();
  for (var i = 0; i < DESC_BOILERPLATE.length; i++) out = out.replace(DESC_BOILERPLATE[i], '');
  out = out.trim().replace(/^[.—-]\s*/, '');
  if (out) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out;
}

/* Defensive sanitiser. GitHub's markup endpoints already return sanitised
   HTML, but this is an innerHTML sink on a page that holds an OAuth token,
   so we strip actives again on our side before injecting. */
function sanitizeHtml(html) {
  var doc;
  try { doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html'); }
  catch (e) { return ''; }
  var root = doc.body.firstChild;
  if (!root) return '';
  $$('script, style, iframe, object, embed, link, meta, form, base', root).forEach(function (n) { n.remove(); });
  $$('*', root).forEach(function (n) {
    Array.prototype.slice.call(n.attributes).forEach(function (a) {
      var name = a.name.toLowerCase(), val = String(a.value || '');
      if (name.indexOf('on') === 0) { n.removeAttribute(a.name); return; }
      if ((name === 'href' || name === 'src' || name === 'xlink:href') &&
          /^\s*(javascript|data|vbscript):/i.test(val)) { n.removeAttribute(a.name); }
    });
    if (n.tagName === 'A') { n.setAttribute('rel', 'noopener noreferrer'); n.setAttribute('target', '_blank'); }
  });
  return root.innerHTML;
}

function svg(paths, size) {
  return '<svg width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    paths + '</svg>';
}
var ICON = {
  search:  '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  close:   '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  ext:     '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  play:    '<polygon points="6 3 20 12 6 21 6 3"/>',
  doc:     '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  code:    '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  copy:    '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  chev:    '<polyline points="9 18 15 12 9 6"/>',
  clock:   '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
  users:   '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>',
  github:  '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>'
};

function announce(msg) {
  var el = $('#live-status');
  if (el) el.textContent = msg;
}

function toast(msg) {
  var region = $('#toast-region');
  if (!region) return;
  var t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = '<span class="toast-dot" aria-hidden="true"></span>';
  var s = document.createElement('span');
  s.textContent = msg;
  t.appendChild(s);
  region.appendChild(t);
  setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4000);
}

function veil(on, label) {
  var v = $('#loader-veil');
  if (!v) return;
  if (label) $('#loader-label').textContent = label;
  v.setAttribute('data-open', on ? '1' : '0');
}

function copyText(text, done) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    return;
  }
  var ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-2000px;left:-2000px';
  document.body.appendChild(ta); ta.select();
  var ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  done(ok);
}

/* ============================================================
   2. Auth
   ============================================================ */
function ghFetch(url, opts) {
  opts = opts || {};
  var h = Object.assign({ 'Accept': 'application/vnd.github+json' }, opts.headers || {});
  if (ghToken) h['Authorization'] = 'Bearer ' + ghToken;
  return fetch(url, Object.assign({}, opts, { headers: h }));
}

function setSignedIn(user) {
  CBUSER = { login: user.login, name: user.name || user.login, avatar: user.avatar_url || '' };
  $('#auth-btn').hidden = true;
  var box = $('#auth-user');
  box.hidden = false;
  $('#auth-avatar').src = user.avatar_url || '';
  $('#auth-avatar').alt = (user.login || 'GitHub') + ' avatar';
  $('#auth-login').textContent = user.login || '';
}
function setSignedOut() {
  CBUSER = null;
  $('#auth-btn').hidden = false;
  $('#auth-user').hidden = true;
  $('#auth-avatar').src = '';
  $('#auth-login').textContent = '';
}

function signIn() {
  var buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  var state = Array.prototype.map.call(buf, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  try { sessionStorage.setItem('cb_oauth_state', state); } catch (e) {}

  var url = 'https://github.com/login/oauth/authorize' +
    '?client_id=' + encodeURIComponent(AUTH_CONFIG.clientId) +
    '&redirect_uri=' + encodeURIComponent(location.origin + AUTH_CONFIG.redirectPath) +
    '&scope=' + encodeURIComponent(AUTH_CONFIG.scope) +
    '&state=' + encodeURIComponent(state);

  var w = 600, h = 720;
  var left = (window.screenLeft != null ? window.screenLeft : window.screenX) + Math.max(0, (window.innerWidth - w) / 2);
  var top = (window.screenTop != null ? window.screenTop : window.screenY) + Math.max(0, (window.innerHeight - h) / 2);
  oauthPopup = window.open(url, 'cobblestone-oauth',
    'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top + ',menubar=no,toolbar=no,location=no,status=no');
  if (!oauthPopup) {
    try { sessionStorage.removeItem('cb_oauth_state'); } catch (e) {}
    toast('Pop-up blocked — allow pop-ups for this site and try again.');
  }
}

function exchange(code) {
  veil(true, 'Signing you in…');
  fetch(AUTH_CONFIG.exchangeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code })
  })
    .then(function (r) { if (!r.ok) throw new Error('exchange ' + r.status); return r.json(); })
    .then(function (d) {
      if (!d || !d.access_token) throw new Error('no token');
      ghToken = d.access_token;
      try { sessionStorage.setItem('cb_gh_token', ghToken); } catch (e) {}
      return ghFetch('https://api.github.com/user');
    })
    .then(function (r) { if (!r.ok) throw new Error('user ' + r.status); return r.json(); })
    .then(function (user) {
      setSignedIn(user);
      toast('Signed in as ' + user.login + ' — private repositories included');
      loadAll();
    })
    .catch(function (err) {
      console.error('OAuth exchange failed:', err);
      ghToken = null;
      try { sessionStorage.removeItem('cb_gh_token'); } catch (e) {}
      setSignedOut(); veil(false);
      toast('Sign-in failed — please try again.');
    });
}

function signOut() {
  ghToken = null;
  try { sessionStorage.removeItem('cb_gh_token'); } catch (e) {}
  setSignedOut();
  toast('Signed out');
  loadAll();
}

function wireAuth() {
  $('#auth-btn').addEventListener('click', signIn);
  $('#signout-btn').addEventListener('click', signOut);

  window.addEventListener('message', function (e) {
    if (e.origin !== window.location.origin) return;
    if (!e.data || e.data.source !== 'cobblestone-oauth') return;

    var expected = null;
    try { expected = sessionStorage.getItem('cb_oauth_state'); sessionStorage.removeItem('cb_oauth_state'); } catch (err) {}
    if (oauthPopup && !oauthPopup.closed) oauthPopup.close();

    if (e.data.error) { toast('Sign-in cancelled'); return; }
    if (!expected || e.data.state !== expected) {
      toast('Sign-in failed — security check did not match. Please try again.');
      return;
    }
    if (e.data.code) exchange(e.data.code);
  });
}

function restoreSession() {
  var stored = null;
  try { stored = sessionStorage.getItem('cb_gh_token'); } catch (e) {}
  if (!stored) { loadAll(); return; }
  ghToken = stored;
  ghFetch('https://api.github.com/user')
    .then(function (r) { if (!r.ok) throw new Error('user ' + r.status); return r.json(); })
    .then(function (user) { setSignedIn(user); loadAll(); })
    .catch(function () {
      ghToken = null;
      try { sessionStorage.removeItem('cb_gh_token'); } catch (e) {}
      setSignedOut(); loadAll();
    });
}

/* ============================================================
   3. Normalising a repo
   ============================================================ */
function typeOf(r, curated) {
  var t = r.topics || [];
  if (curated && curated.type) return curated.type;
  if (t.indexOf('cat-snippet') >= 0 || /^csl-snippet-/.test(r.name)) return 'snippet';
  if (t.indexOf('cat-theme') >= 0 || /-theme$/.test(r.name)) return 'theme';
  if (t.indexOf('cat-plugin') >= 0) return 'plugin';
  var d = r.description || '';
  if (/^A WordPress plugin/i.test(d) || /-plugin$/.test(r.name)) return 'plugin';
  if (/^A WordPress theme/i.test(d)) return 'theme';
  if (r.has_pages || /\.github\.io$/.test(r.name)) return 'site';
  return 'app';
}

function purposeOf(r, curated, type) {
  if (curated && curated.purpose) return curated.purpose;
  var t = r.topics || [];
  for (var i = 0; i < t.length; i++) {
    var p = TOPIC_PURPOSE[t[i]];
    if (p) return p;
  }
  if (type === 'snippet') return 'platform';
  if (type === 'theme') return 'platform';
  if (type === 'plugin') return 'platform';
  if (type === 'site') return 'web';
  return 'other';
}

function platformsOf(r, curated) {
  var found = [], hay = ((r.name || '') + ' ' + (r.description || '') + ' ' + (r.topics || []).join(' '));
  PLATFORMS.forEach(function (p) {
    var hit = false;
    for (var i = 0; i < p.topics.length; i++) {
      if ((r.topics || []).indexOf(p.topics[i]) >= 0) { hit = true; break; }
    }
    if (!hit && p.match && p.match.test(hay)) hit = true;
    if (hit) found.push(p.id);
  });
  if (curated && curated.works) {
    curated.works.forEach(function (w) { if (found.indexOf(w) < 0) found.push(w); });
  }
  return found;
}

/* Snippet repos encode their client site in the name:
   csl-snippet-onefamily-brand-colours -> One Family. */
function siteOf(r) {
  var slug = r.name.replace(/^csl-snippet-/, '');
  for (var i = 0; i < SITES.length; i++) {
    var s = SITES[i];
    for (var j = 0; j < s.prefixes.length; j++) {
      if (slug.indexOf(s.prefixes[j] + '-') === 0) return s.id;
    }
    for (var k = 0; k < s.topics.length; k++) {
      if ((r.topics || []).indexOf(s.topics[k]) >= 0) return s.id;
    }
  }
  return 'shared';
}

/* csl-snippet-onefamily-brand-colours -> "Brand colours" (site shown separately) */
function snippetLabel(r) {
  var slug = r.name.replace(/^csl-snippet-/, '');
  var site = siteOf(r);
  if (site !== 'shared') {
    for (var i = 0; i < SITES.length; i++) {
      if (SITES[i].id === site) {
        SITES[i].prefixes.forEach(function (p) {
          if (slug.indexOf(p + '-') === 0) slug = slug.slice(p.length + 1);
        });
        break;
      }
    }
  }
  var words = slug.replace(/-/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function normalize(r) {
  var curated = CURATED[r.name.toLowerCase()] || null;
  var type = typeOf(r, curated);
  var isSnippet = type === 'snippet';
  var o = {
    raw: r,
    name: r.name,
    lower: r.name.toLowerCase(),
    url: r.html_url,
    desc: (curated && curated.summary) || cleanDesc(r.description),
    rawDesc: r.description || '',
    topics: r.topics || [],
    lang: r.language ? (LANG_ALIASES[r.language] || r.language) : null,
    sizeKb: r.size || 0,
    bytes: (r.size || 0) * 1024,      /* replaced by exact bytes on enrichment */
    exact: false,
    langBytes: null,
    pushed: r.pushed_at,
    created: r.created_at,
    isPrivate: !!r.private,
    fork: !!r.fork,
    archived: !!r.archived,
    pages: !!r.has_pages,
    homepage: safeHttpUrl(r.homepage),
    branch: r.default_branch || 'main',
    type: type,
    purpose: purposeOf(r, curated, type),
    platforms: platformsOf(r, curated),
    demo: (curated && curated.demo) || null,
    isSnippet: isSnippet,
    site: isSnippet ? siteOf(r) : null,
    label: isSnippet ? snippetLabel(r) : r.name
  };
  o.haystack = (o.name + ' ' + o.desc + ' ' + o.rawDesc + ' ' + o.topics.join(' ') + ' ' +
    o.label + ' ' + o.platforms.join(' ')).toLowerCase();
  return o;
}

/* ============================================================
   4. Loading
   ============================================================ */
function publicReposUrl(page) {
  return 'https://api.github.com/users/' + ACCOUNT + '/repos?per_page=100&sort=updated&page=' + page;
}
function privateReposUrl(page) {
  return 'https://api.github.com/user/repos?per_page=100&sort=updated&visibility=private' +
    '&affiliation=owner,collaborator,organization_member&page=' + page;
}

function fetchPaged(makeUrl, maxPages) {
  var out = [];
  function step(page) {
    if (page > maxPages) return Promise.resolve(out);
    return ghFetch(makeUrl(page)).then(function (r) {
      if (r.status === 403 || r.status === 429) { STATE.rateLimited = true; return out; }
      if (!r.ok) return out;
      return r.json().then(function (rows) {
        if (!Array.isArray(rows) || !rows.length) return out;
        out = out.concat(rows);
        if (rows.length < 100) return out;
        return step(page + 1);
      });
    }).catch(function () { return out; });
  }
  return step(1);
}

function loadAll() {
  STATE.loaded = false;
  STATE.rateLimited = false;
  showSkeletons();

  var jobs = [fetchPaged(publicReposUrl, 4)];
  if (ghToken) jobs.push(fetchPaged(privateReposUrl, 6));

  Promise.all(jobs).then(function (sets) {
    var seen = {}, all = [];
    sets.forEach(function (rows) {
      rows.forEach(function (r) {
        if (!r || !r.name) return;
        /* /user/repos returns everything the viewer can touch — keep ours only */
        var owner = (r.owner && r.owner.login || '').toLowerCase();
        if (owner !== ACCOUNT) return;
        if (seen[r.name]) return;
        seen[r.name] = 1;
        all.push(r);
      });
    });

    if (!all.length) { renderEmptyEverything(); return; }

    STATE.repos = all.map(normalize);
    STATE.projects = STATE.repos.filter(function (r) { return !r.isSnippet; });
    STATE.snippets = STATE.repos.filter(function (r) { return r.isSnippet; });
    STATE.loaded = true;
    veil(false);

    renderFigures();
    renderPortfolio();
    renderMap();
    renderPlatforms();
    renderSites();
    renderChips();
    applyFilters();
    renderSnippetFacets();
    renderSnippets();
    renderPreviewStrip();
    buildPaletteIndex();
    publishData();
    enrichLanguages();
    loadGists();
  }).catch(function (e) {
    console.error(e);
    renderEmptyEverything();
  });
}

/* Progressive enrichment: exact language bytes per repo. Cached in
   sessionStorage keyed by pushed_at so a push invalidates the entry. */
function enrichLanguages() {
  var list = STATE.repos.slice();
  STATE.langBytes = {};
  STATE.langDone = 0;
  STATE.langTotal = list.length;
  renderComposition();

  var idx = 0, CONC = 6;

  function applyLangs(repo, data) {
    var total = 0, norm = {};
    Object.keys(data || {}).forEach(function (k) {
      var name = LANG_ALIASES[k] || k;
      norm[name] = (norm[name] || 0) + data[k];
      total += data[k];
    });
    repo.langBytes = norm;
    if (total > 0) { repo.bytes = total; repo.exact = true; }
    Object.keys(norm).forEach(function (k) { STATE.langBytes[k] = (STATE.langBytes[k] || 0) + norm[k]; });
    STATE.langDone++;
  }

  function one(repo) {
    var key = 'cb2_lang_' + repo.name + '_' + (repo.pushed || '');
    var cached = null;
    try { cached = sessionStorage.getItem(key); } catch (e) {}
    if (cached) {
      try { applyLangs(repo, JSON.parse(cached)); return Promise.resolve(); } catch (e) {}
    }
    return ghFetch('https://api.github.com/repos/' + ACCOUNT + '/' + repo.name + '/languages')
      .then(function (r) {
        if (r.status === 403 || r.status === 429) { STATE.rateLimited = true; throw new Error('rate'); }
        if (!r.ok) throw new Error('lang ' + r.status);
        return r.json();
      })
      .then(function (data) {
        try { sessionStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
        applyLangs(repo, data);
      })
      .catch(function () { STATE.langDone++; });
  }

  var paint = debounce(function () {
    renderComposition();
    renderFigures();
    renderHudFigures();
    renderPreviewStrip();
    if (STATE.view === 'dev') applyFilters();
  }, 180);

  var relay = debounce(function () {
    /* tower heights come from the file tree, not the repo total — nothing
       to re-lay when language bytes land */
  }, 900);

  function pump() {
    if (idx >= list.length) { renderComposition(); renderFigures(); if (STATE.view === 'dev') applyFilters(); return; }
    var batch = list.slice(idx, idx + CONC);
    idx += CONC;
    Promise.all(batch.map(one)).then(function () { paint(); relay(); pump(); });
  }
  pump();
}

function loadGists() {
  ghFetch('https://api.github.com/users/' + ACCOUNT + '/gists?per_page=12')
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) { STATE.gists = Array.isArray(rows) ? rows : []; renderGists(); })
    .catch(function () { STATE.gists = []; renderGists(); });
}

/* ============================================================
   5. Derived metrics
   ============================================================ */
function typeCounts() {
  var m = {};
  TYPES.forEach(function (t) { m[t.id] = 0; });
  STATE.repos.forEach(function (r) { if (m[r.type] != null) m[r.type]++; });
  return m;
}
function platformCounts(list) {
  var m = {};
  (list || STATE.repos).forEach(function (r) {
    r.platforms.forEach(function (p) { m[p] = (m[p] || 0) + 1; });
  });
  return m;
}
function siteCounts() {
  var m = {};
  STATE.snippets.forEach(function (r) { m[r.site] = (m[r.site] || 0) + 1; });
  return m;
}
function totalBytes() {
  var t = 0;
  STATE.repos.forEach(function (r) { t += r.bytes || 0; });
  return t;
}
function openableCount() {
  return STATE.repos.filter(function (r) { return r.demo || r.pages || r.homepage; }).length;
}

/* ============================================================
   6. Rendering — figures
   ============================================================ */
function countUp(node, target, suffixNode, unit) {
  if (suffixNode && unit != null) suffixNode.textContent = unit;
  target = String(target);
  if (node.dataset.val === target) return;       /* already showing it */
  var first = node.dataset.val == null;
  node.dataset.val = target;
  node.textContent = target;                     /* correct even if rAF never fires */

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !first || !/^[0-9.]+$/.test(target)) return;

  var end = parseFloat(target), dec = (target.split('.')[1] || '').length;
  var start = performance.now(), dur = 900;
  function frame(now) {
    if (node.dataset.val !== target) return;     /* superseded */
    var p = Math.min(1, (now - start) / dur);
    var eased = 1 - Math.pow(1 - p, 3);
    node.textContent = (end * eased).toFixed(dec);
    if (p < 1) requestAnimationFrame(frame); else node.textContent = target;
  }
  requestAnimationFrame(frame);
}

function renderFigures() {
  var n = STATE.repos.length;
  var tb = totalBytes();
  var sz = splitBytes(tb);
  var plats = Object.keys(platformCounts()).length;
  var open = openableCount();
  var priv = STATE.repos.filter(function (r) { return r.isPrivate; }).length;

  countUp($('#fig-repos'), String(n));
  $('#fig-repos-sub').textContent = priv
    ? (priv + ' private · ' + (n - priv) + ' public')
    : 'public repositories only — sign in for the rest';

  countUp($('#fig-code'), sz.val, $('#fig-code-unit'), sz.unit);
  $('#fig-code-sub').textContent = STATE.langDone < STATE.langTotal
    ? ('measuring… ' + STATE.langDone + ' of ' + STATE.langTotal)
    : (Object.keys(STATE.langBytes).length + ' languages, measured exactly');

  countUp($('#fig-platforms'), String(plats));
  var top = Object.entries(platformCounts()).sort(function (a, b) { return b[1] - a[1]; })[0];
  $('#fig-platforms-sub').textContent = top
    ? (labelForPlatform(top[0]) + ' leads with ' + top[1])
    : 'integrations across the estate';

  countUp($('#fig-open'), String(open));
  $('#fig-open-sub').textContent = 'demos and published pages';
}

function labelForPlatform(id) {
  for (var i = 0; i < PLATFORMS.length; i++) if (PLATFORMS[i].id === id) return PLATFORMS[i].label;
  return id;
}
function labelForSite(id) {
  for (var i = 0; i < SITES.length; i++) if (SITES[i].id === id) return SITES[i].label;
  return 'Shared / cross-site';
}

/* ============================================================
   7. Rendering — portfolio & composition
   ============================================================ */
function renderStack(el, rows, total) {
  el.innerHTML = rows.map(function (r) {
    var w = pct(r.value, total);
    return '<div class="stackbar-seg" style="flex:' + Math.max(w, 0.6) + ' 1 0;background:' + r.color + '" ' +
      'data-key="' + esc(r.key) + '" aria-hidden="true"></div>';
  }).join('');
  el.setAttribute('aria-label', rows.map(function (r) {
    return r.label + ' ' + fmtPct(pct(r.value, total));
  }).join(', '));
}

function renderLegend(el, rows, total, fmt, onPick) {
  el.innerHTML = rows.map(function (r) {
    var p = pct(r.value, total);
    var tag = onPick ? 'button type="button" aria-pressed="false"' : 'div';
    return '<' + tag + ' class="legend-row" data-key="' + esc(r.key) + '">' +
      '<span class="swatch" style="background:' + r.color + '"></span>' +
      '<span class="legend-name">' + esc(r.label) + '</span>' +
      '<span class="legend-val">' + esc(fmt ? fmt(r.value) : r.value) + '</span>' +
      '<span class="legend-pct">' + fmtPct(p) + '</span>' +
      '</' + (onPick ? 'button' : 'div') + '>';
  }).join('');
  if (onPick) {
    $$('.legend-row', el).forEach(function (b) {
      b.addEventListener('click', function () { onPick(b.getAttribute('data-key')); });
    });
  }
}

function renderPortfolio() {
  var counts = typeCounts();
  var total = STATE.repos.length;
  var rows = TYPES.map(function (t) {
    return { key: t.id, label: t.label, value: counts[t.id] || 0, color: t.color };
  }).filter(function (r) { return r.value > 0; });

  renderStack($('#portfolio-bar'), rows, total);
  renderLegend($('#portfolio-legend'), rows, total, null, function (key) {
    STATE.type = (STATE.type === key) ? 'all' : key;
    STATE.view = 'dev';
    applyViewUI();
    applyFilters();
    scrollToResults();
  });
  $('#portfolio-note').textContent = total + ' repositories, grouped by what they are';
  syncPortfolioPressed();
  wireStackTips($('#portfolio-bar'), rows, total, function (v) { return v + ' repos'; });
}

function syncPortfolioPressed() {
  $$('#portfolio-legend .legend-row').forEach(function (b) {
    b.setAttribute('aria-pressed', b.getAttribute('data-key') === STATE.type ? 'true' : 'false');
  });
}

function renderComposition() {
  var entries = Object.entries(STATE.langBytes).sort(function (a, b) { return b[1] - a[1]; });
  var bar = $('#lang-bar'), legend = $('#lang-legend'), note = $('#lang-note');

  if (!entries.length) {
    bar.innerHTML = '<div class="skeleton" style="flex:1;border-radius:8px"></div>';
    legend.innerHTML = '<div class="skeleton sk-line" style="margin:10px 0"></div>' +
                       '<div class="skeleton sk-line" style="margin:10px 0;width:72%"></div>' +
                       '<div class="skeleton sk-line" style="margin:10px 0;width:55%"></div>';
    note.textContent = 'measuring every repository…';
    return;
  }

  var total = entries.reduce(function (s, e) { return s + e[1]; }, 0);
  var head = entries.slice(0, 5), tail = entries.slice(5);
  var rows = head.map(function (e, i) {
    return { key: e[0], label: e[0], value: e[1], color: LANG_COLORS[e[0]] || TYPES[i % TYPES.length].color };
  });
  if (tail.length) {
    rows.push({ key: '__other', label: tail.length + ' other languages',
      value: tail.reduce(function (s, e) { return s + e[1]; }, 0), color: '#C8D0DA' });
  }

  renderStack(bar, rows, total);
  renderLegend(legend, rows, total, fmtBytes, null);
  note.textContent = STATE.langDone < STATE.langTotal
    ? ('by size on disk · ' + STATE.langDone + ' of ' + STATE.langTotal + ' measured')
    : 'by size on disk, not repository count';
  wireStackTips(bar, rows, total, fmtBytes);
}

function wireStackTips(bar, rows, total, fmt) {
  $$('.stackbar-seg', bar).forEach(function (seg, i) {
    var r = rows[i];
    if (!r) return;
    seg.addEventListener('mouseenter', function (e) {
      showTip(e, '<div class="tip-title">' + esc(r.label) + '</div>' +
        '<div class="tip-meta"><span><b>' + esc(fmt ? fmt(r.value) : r.value) + '</b></span>' +
        '<span><b>' + fmtPct(pct(r.value, total)) + '</b> of total</span></div>');
    });
    seg.addEventListener('mousemove', moveTip);
    seg.addEventListener('mouseleave', hideTip);
  });
}

/* ============================================================
   8. Rendering — the Map
   ============================================================ */
function recencyAlpha(r) {
  var d = daysSince(r.pushed);
  if (d <= 30) return 1;
  if (d <= 120) return 0.76;
  if (d <= 365) return 0.52;
  return 0.32;
}

function renderMap() {
  var host = $('#map-groups');
  var byType = {};
  TYPES.forEach(function (t) { byType[t.id] = []; });
  STATE.repos.forEach(function (r) { if (byType[r.type]) byType[r.type].push(r); });

  host.innerHTML = TYPES.map(function (t) {
    var list = byType[t.id];
    if (!list.length) return '';
    list.sort(function (a, b) { return new Date(b.pushed) - new Date(a.pushed); });
    var tiles = list.map(function (r) {
      var live = (r.demo || r.pages) ? '<span class="live-pip"></span>' : '';
      return '<button type="button" class="map-tile" data-name="' + esc(r.name) + '" ' +
        'style="background:' + t.color + ';opacity:' + recencyAlpha(r) + '" ' +
        'aria-label="' + esc(r.name) + '">' + live + '</button>';
    }).join('');
    return '<div class="map-group" data-type="' + t.id + '">' +
      '<div class="map-group-head">' +
        '<span class="map-group-dot" style="background:' + t.color + '"></span>' +
        '<span class="map-group-name">' + esc(t.label) + '</span>' +
        '<span class="map-group-count">' + list.length + '</span>' +
      '</div>' +
      '<div class="map-grid">' + tiles + '</div></div>';
  }).join('');

  $$('.map-tile', host).forEach(function (tile) {
    var name = tile.getAttribute('data-name');
    var repo = repoByName(name);
    tile.addEventListener('mouseenter', function (e) { showTip(e, mapTipHtml(repo)); });
    tile.addEventListener('focus', function (e) { showTip(e, mapTipHtml(repo)); });
    tile.addEventListener('mousemove', moveTip);
    tile.addEventListener('mouseleave', hideTip);
    tile.addEventListener('blur', hideTip);
    tile.addEventListener('click', function () { hideTip(); openRepo(name); });
  });

  $('#map-note').textContent = STATE.repos.length + ' repositories · one tile each';
}

function mapTipHtml(r) {
  if (!r) return '';
  var t = TYPE_BY_ID[r.type];
  return '<div class="tip-title">' + esc(r.isSnippet ? r.label : r.name) + '</div>' +
    (r.desc ? '<div class="tip-desc">' + esc(r.desc) + '</div>' : '') +
    '<div class="tip-meta">' +
      '<span><b>' + esc(t ? t.label.replace(/s$/, '') : r.type) + '</b></span>' +
      (r.lang ? '<span>' + esc(r.lang) + '</span>' : '') +
      '<span>' + esc(timeAgo(r.pushed)) + '</span>' +
      (r.isPrivate ? '<span>private</span>' : '') +
    '</div>';
}

function repoByName(name) {
  for (var i = 0; i < STATE.repos.length; i++) if (STATE.repos[i].name === name) return STATE.repos[i];
  return null;
}

/* Dim map tiles that don't match the live filter — the map doubles as a
   search visualiser: type "learndash" and the estate lights up. */
function syncMapToFilter(matchNames) {
  $$('#map-groups .map-tile').forEach(function (tile) {
    var on = matchNames == null || matchNames[tile.getAttribute('data-name')];
    tile.setAttribute('data-dim', on ? '0' : '1');
  });
}

/* ============================================================
   9. Rendering — ranked bars
   ============================================================ */
function renderRanked(el, rows, max, onPick, activeVal) {
  el.innerHTML = rows.map(function (r) {
    return '<button type="button" class="rank-row" data-key="' + esc(r.key) + '" ' +
      'aria-pressed="' + (activeVal === r.key ? 'true' : 'false') + '">' +
      '<span class="rank-name">' + esc(r.label) + '</span>' +
      '<span class="rank-track"><span class="rank-fill" style="width:' + Math.max(2, pct(r.value, max)) + '%;background:' + (r.color || 'var(--c1)') + '"></span></span>' +
      '<span class="rank-val">' + r.value + '</span>' +
      '</button>';
  }).join('');
  $$('.rank-row', el).forEach(function (b) {
    b.addEventListener('click', function () { onPick(b.getAttribute('data-key')); });
  });
}

function renderPlatforms() {
  var counts = platformCounts();
  var rows = PLATFORMS.map(function (p) { return { key: p.id, label: p.label, value: counts[p.id] || 0 }; })
    .filter(function (r) { return r.value > 0; })
    .sort(function (a, b) { return b.value - a.value; })
    .slice(0, 10);
  if (!rows.length) { $('#platform-rank').innerHTML = '<p class="panel-note">No integrations detected.</p>'; return; }
  var max = rows[0].value;
  renderRanked($('#platform-rank'), rows, max, function (key) {
    STATE.platform = (STATE.platform === key) ? 'all' : key;
    renderChips();
    applyFilters();
    renderPlatforms();
    scrollToResults();
  }, STATE.platform);
  $('#platform-note').textContent = 'repositories that touch each platform';
}

function renderSites() {
  var counts = siteCounts();
  var rows = Object.keys(counts).map(function (k) {
    return { key: k, label: labelForSite(k), value: counts[k], color: k === 'shared' ? '#C8D0DA' : 'var(--c2)' };
  }).sort(function (a, b) { return b.value - a.value; });
  if (!rows.length) {
    $('#site-rank').innerHTML = '<p class="panel-note">Sign in to see the snippet estate.</p>';
    $('#site-note').textContent = '';
    return;
  }
  var max = rows[0].value;
  renderRanked($('#site-rank'), rows, max, function (key) {
    STATE.snipSite = (STATE.snipSite === key) ? 'all' : key;
    renderSnippetFacets();
    renderSnippets();
    renderPreviewStrip();
    renderSites();
    document.getElementById('snippets').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, STATE.snipSite);
  $('#site-note').textContent = STATE.snippets.length + ' site snippets across ' + rows.length + ' destinations';
}

/* ============================================================
   10. Filter chips
   ============================================================ */
function purposeCounts(list) {
  var m = {};
  list.forEach(function (r) { m[r.purpose] = (m[r.purpose] || 0) + 1; });
  return m;
}

function chip(kind, value, label, count, pressed, color) {
  return '<button type="button" class="chip" data-kind="' + kind + '" data-value="' + esc(value) + '" ' +
    'aria-pressed="' + (pressed ? 'true' : 'false') + '"' + (count === 0 ? ' data-empty="1"' : '') + '>' +
    (color ? '<span class="chip-dot" style="background:' + color + '"></span>' : '') +
    esc(label) + '<span class="chip-n">' + count + '</span></button>';
}

function renderChips() {
  var base = STATE.projects;
  var row = $('#chip-primary');
  var html = '';

  if (STATE.view === 'staff') {
    var pc = purposeCounts(base);
    html += chip('purpose', 'all', 'All projects', base.length, STATE.purpose === 'all');
    PURPOSES.forEach(function (p) {
      var n = pc[p.id] || 0;
      if (n) html += chip('purpose', p.id, p.label, n, STATE.purpose === p.id);
    });
  } else {
    var tc = {};
    base.forEach(function (r) { tc[r.type] = (tc[r.type] || 0) + 1; });
    html += chip('type', 'all', 'All types', base.length, STATE.type === 'all');
    TYPES.forEach(function (t) {
      if (t.id === 'snippet') return;          /* snippets have their own section */
      var n = tc[t.id] || 0;
      if (n) html += chip('type', t.id, t.label, n, STATE.type === t.id, t.color);
    });
  }
  row.innerHTML = html;

  var counts = platformCounts(base);
  var secondary = PLATFORMS.filter(function (p) { return counts[p.id]; })
    .sort(function (a, b) { return counts[b.id] - counts[a.id]; })
    .slice(0, 9);
  var sHtml = '<span class="chiprow-label">Works with</span>' +
    chip('platform', 'all', 'Anything', base.length, STATE.platform === 'all');
  secondary.forEach(function (p) {
    sHtml += chip('platform', p.id, p.label, counts[p.id], STATE.platform === p.id);
  });
  $('#chip-secondary').innerHTML = sHtml;

  $$('#chip-primary .chip, #chip-secondary .chip').forEach(function (b) {
    b.addEventListener('click', function () {
      var kind = b.getAttribute('data-kind'), val = b.getAttribute('data-value');
      if (kind === 'purpose') STATE.purpose = val;
      if (kind === 'type') STATE.type = val;
      if (kind === 'platform') STATE.platform = val;
      renderChips(); applyFilters();
      if (kind === 'platform') renderPlatforms();
      syncPortfolioPressed();
    });
  });
}

/* ============================================================
   11. Filtering + results
   ============================================================ */
function matchesSearch(r, q) {
  if (!q) return true;
  var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  for (var i = 0; i < terms.length; i++) if (r.haystack.indexOf(terms[i]) < 0) return false;
  return true;
}

function currentList() {
  return STATE.projects.filter(function (r) {
    if (!STATE.showArchived && (r.archived || r.fork)) return false;
    if (STATE.view === 'staff' && STATE.purpose !== 'all' && r.purpose !== STATE.purpose) return false;
    if (STATE.type !== 'all' && r.type !== STATE.type) return false;
    if (STATE.platform !== 'all' && r.platforms.indexOf(STATE.platform) < 0) return false;
    return matchesSearch(r, STATE.q);
  });
}

function sortList(list) {
  var s = STATE.sort;
  return list.slice().sort(function (a, b) {
    if (s === 'name')    return a.lower.localeCompare(b.lower);
    if (s === 'size')    return (b.bytes || 0) - (a.bytes || 0);
    if (s === 'created') return new Date(b.created) - new Date(a.created);
    return new Date(b.pushed) - new Date(a.pushed);
  });
}

function applyFilters() {
  if (!STATE.loaded) return;
  var list = sortList(currentList());

  /* Light the map for whatever matches — projects AND snippets. */
  var names = {};
  list.forEach(function (r) { names[r.name] = 1; });
  STATE.snippets.forEach(function (r) {
    if (matchesSearch(r, STATE.q) &&
        (STATE.platform === 'all' || r.platforms.indexOf(STATE.platform) >= 0) &&
        (STATE.type === 'all' || STATE.type === 'snippet')) names[r.name] = 1;
  });
  var filtering = !!STATE.q || STATE.platform !== 'all' || STATE.type !== 'all' || STATE.purpose !== 'all';
  syncMapToFilter(filtering ? names : null);
  if (window.CBCity) window.CBCity.setFilter(filtering ? names : null);
  var hr = $('#hud-result');
  if (hr) {
    var lit = Object.keys(names).length;
    hr.textContent = filtering
      ? (lit + ' of ' + STATE.repos.length + ' repositories lit')
      : (STATE.repos.length + ' repositories · ' + STATE.projects.length + ' projects, ' + STATE.snippets.length + ' snippets');
  }

  $('#results-count').textContent = list.length === STATE.projects.length
    ? (list.length + ' projects')
    : (list.length + ' of ' + STATE.projects.length + ' projects');
  announce(list.length + ' projects shown');

  if (!list.length) { renderNoResults(); return; }
  if (STATE.view === 'staff') renderStaff(list); else renderDev(list);
}

function scrollToResults() {
  var el = document.getElementById('projects');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderNoResults() {
  $('#results').innerHTML =
    '<div class="empty"><h3>Nothing matches that</h3>' +
    '<p>Try a different word, or clear the filters to see everything again.</p>' +
    '<button type="button" class="btn btn-outline" id="reset-filters">Clear all filters</button></div>';
  $('#reset-filters').addEventListener('click', resetFilters);
}

function resetFilters() {
  STATE.q = ''; STATE.purpose = 'all'; STATE.type = 'all'; STATE.platform = 'all';
  $('#search').value = '';
  $('#search').parentNode.setAttribute('data-filled', '0');
  renderChips(); renderPlatforms(); applyFilters(); syncPortfolioPressed();
}

/* ---- Staff view ---- */
function renderStaff(list) {
  var groups = {};
  list.forEach(function (r) { (groups[r.purpose] = groups[r.purpose] || []).push(r); });

  var html = PURPOSES.map(function (p) {
    var rows = groups[p.id];
    if (!rows || !rows.length) return '';
    return '<section class="cat-section">' +
      '<div class="cat-head">' +
        '<span class="cat-icon">' + svg(p.icon, 19) + '</span>' +
        '<h3 class="cat-title">' + esc(p.label) + '</h3>' +
        '<span class="cat-count">' + rows.length + '</span>' +
        '<span class="cat-blurb">' + esc(p.blurb) + '</span>' +
      '</div>' +
      '<div class="cards">' + rows.map(staffCard).join('') + '</div>' +
      '</section>';
  }).join('');

  $('#results').innerHTML = html;
  wireCards($('#results'));
}

function staffCard(r) {
  var t = TYPE_BY_ID[r.type] || TYPES[0];
  var works = r.platforms.slice(0, 4).map(function (p) {
    return '<span class="pill pill-works">' + esc(labelForPlatform(p)) + '</span>';
  }).join('');
  var more = r.platforms.length > 4 ? '<span class="pill pill-works">+' + (r.platforms.length - 4) + '</span>' : '';

  return '<article class="card" style="--type-color:' + t.color + ';--type-tint:' + t.tint + '">' +
    '<div class="card-top">' +
      '<h4 class="card-name">' + esc(r.name) + '</h4>' +
      '<div style="display:flex;gap:5px;flex:none">' +
        (r.isPrivate ? '<span class="pill pill-private">Private</span>' : '') +
        '<span class="pill pill-type">' + esc(t.label.replace(/s$/, '')) + '</span>' +
      '</div>' +
    '</div>' +
    '<p class="card-desc"' + (r.desc ? '>' + esc(r.desc) : ' style="font-style:italic">' + esc((t.plural.charAt(0).toUpperCase() + t.plural.slice(1)).replace(/s$/, '')) + ' \u2014 no description on GitHub yet.') + '</p>' +
    (works ? '<div class="card-works">' + works + more + '</div>' : '') +
    '<div class="card-meta">' +
      '<span>' + svg(ICON.clock, 12) + '</span><span style="margin-left:-8px">Updated ' + esc(timeAgo(r.pushed)) + '</span>' +
      (r.pages ? '<span class="pill pill-live">Live page</span>' : '') +
    '</div>' +
    '<div class="card-actions">' +
      '<button type="button" class="btn btn-primary btn-sm" data-open="' + esc(r.name) + '">' + svg(ICON.doc, 13) + 'Open</button>' +
      (r.demo ? '<button type="button" class="btn btn-outline btn-sm" data-demo="' + esc(r.name) + '">' + svg(ICON.play, 12) + 'Demo</button>' : '') +
      '<span class="card-spacer"></span>' +
      '<a class="btn btn-ghost btn-sm" href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">GitHub' + svg(ICON.ext, 12) + '</a>' +
    '</div>' +
    '</article>';
}

/* ---- Developer view ---- */
function renderDev(list) {
  var rows = list.map(function (r) {
    var t = TYPE_BY_ID[r.type] || TYPES[0];
    return '<tr>' +
      '<td><div class="t-name">' + esc(r.name) + '</div>' +
        (r.desc ? '<div class="t-desc">' + esc(r.desc) + '</div>' : '') + '</td>' +
      '<td class="col-opt"><span class="lang-cell"><span class="swatch" style="background:' + t.color + '"></span>' +
        esc(t.label.replace(/s$/, '')) + '</span></td>' +
      '<td class="col-opt"><span class="lang-cell">' +
        (r.lang ? '<span class="swatch" style="background:' + (LANG_COLORS[r.lang] || '#C8D0DA') + '"></span>' + esc(r.lang) : '<span style="color:var(--faint)">—</span>') +
        '</span></td>' +
      '<td class="t-num col-opt">' + esc(fmtBytes(r.bytes)) + '</td>' +
      '<td class="t-num col-opt">' + esc(timeAgo(r.pushed)) + '</td>' +
      '<td class="t-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-clone="' + esc(r.name) + '" title="Copy git clone command">' + svg(ICON.copy, 13) + '</button>' +
        '<button type="button" class="btn btn-outline btn-sm" data-open="' + esc(r.name) + '">Open</button>' +
      '</td></tr>';
  }).join('');

  $('#results').innerHTML =
    '<div class="table-scroll"><table class="devtable">' +
    '<thead><tr><th>Repository</th><th class="col-opt">Type</th><th class="col-opt">Language</th>' +
    '<th class="col-opt" style="text-align:right">Size</th><th class="col-opt" style="text-align:right">Updated</th>' +
    '<th style="text-align:right">Actions</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>';
  wireCards($('#results'));
}

function wireCards(root) {
  $$('[data-open]', root).forEach(function (b) {
    b.addEventListener('click', function () { openRepo(b.getAttribute('data-open')); });
  });
  $$('[data-demo]', root).forEach(function (b) {
    b.addEventListener('click', function () { openRepo(b.getAttribute('data-demo'), 'demo'); });
  });
  $$('[data-clone]', root).forEach(function (b) {
    b.addEventListener('click', function () {
      var name = b.getAttribute('data-clone');
      copyText('git clone https://github.com/' + ACCOUNT + '/' + name + '.git', function (ok) {
        toast(ok ? 'Clone command copied' : 'Could not copy — select it manually');
      });
    });
  });
}

/* ============================================================
   12. Snippet library
   ============================================================ */
function renderSnippetFacets() {
  var sc = siteCounts();
  var siteRows = '<button type="button" class="facet-item" data-facet="site" data-value="all" aria-pressed="' +
    (STATE.snipSite === 'all') + '">All sites<span class="facet-n">' + STATE.snippets.length + '</span></button>';
  Object.keys(sc).sort(function (a, b) { return sc[b] - sc[a]; }).forEach(function (k) {
    siteRows += '<button type="button" class="facet-item" data-facet="site" data-value="' + esc(k) + '" aria-pressed="' +
      (STATE.snipSite === k) + '">' + esc(labelForSite(k)) + '<span class="facet-n">' + sc[k] + '</span></button>';
  });
  $('#snip-sites').innerHTML = siteRows;

  var pc = platformCounts(STATE.snippets);
  var platRows = '<button type="button" class="facet-item" data-facet="platform" data-value="all" aria-pressed="' +
    (STATE.snipPlatform === 'all') + '">Anything<span class="facet-n">' + STATE.snippets.length + '</span></button>';
  PLATFORMS.filter(function (p) { return pc[p.id]; })
    .sort(function (a, b) { return pc[b.id] - pc[a.id]; })
    .forEach(function (p) {
      platRows += '<button type="button" class="facet-item" data-facet="platform" data-value="' + esc(p.id) + '" aria-pressed="' +
        (STATE.snipPlatform === p.id) + '">' + esc(p.label) + '<span class="facet-n">' + pc[p.id] + '</span></button>';
    });
  $('#snip-platforms').innerHTML = platRows;

  $$('#snip-sites .facet-item, #snip-platforms .facet-item').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = b.getAttribute('data-facet'), v = b.getAttribute('data-value');
      if (f === 'site') STATE.snipSite = v; else STATE.snipPlatform = v;
      renderSnippetFacets(); renderSnippets(); renderSites();
    });
  });
}

function renderSnippets() {
  var list = STATE.snippets.filter(function (r) {
    if (STATE.snipSite !== 'all' && r.site !== STATE.snipSite) return false;
    if (STATE.snipPlatform !== 'all' && r.platforms.indexOf(STATE.snipPlatform) < 0) return false;
    return matchesSearch(r, STATE.snipQ);
  }).sort(function (a, b) { return a.label.localeCompare(b.label); });

  $('#snip-count').textContent = list.length === STATE.snippets.length
    ? (STATE.snippets.length + ' snippets')
    : (list.length + ' of ' + STATE.snippets.length + ' snippets');

  if (!STATE.snippets.length) {
    $('#snip-list').innerHTML = '<div class="empty" style="border:0;background:none">' +
      '<h3>Snippets are private</h3><p>Sign in with GitHub to browse the ' +
      'WPCode snippet library mirrored from the SiteGround network.</p></div>';
    return;
  }
  if (!list.length) {
    $('#snip-list').innerHTML = '<div class="empty" style="border:0;background:none">' +
      '<h3>No snippets match</h3><p>Try another word, or reset the facets on the left.</p></div>';
    return;
  }

  $('#snip-list').innerHTML = list.map(function (r) {
    var tags = r.platforms.filter(function (p) { return p !== 'wordpress'; }).slice(0, 2).map(function (p) {
      return '<span class="pill pill-works">' + esc(labelForPlatform(p)) + '</span>';
    }).join('');
    return '<button type="button" class="snip-row" data-open="' + esc(r.name) + '">' +
      '<span><span class="snip-name">' + esc(r.label) + '</span>' +
        (r.site !== 'shared' ? '<span class="snip-site">' + esc(labelForSite(r.site)) + '</span>' : '') + '</span>' +
      '<span class="snip-desc">' + esc(r.desc || 'No description.') + '</span>' +
      '<span class="snip-tags">' + tags + '</span>' +
      '<span class="snip-open">' + svg(ICON.chev, 16) + '</span>' +
      '</button>';
  }).join('');
  wireCards($('#snip-list'));
}

/* ============================================================
   12b. Preview strip — the things you can open without leaving
   ------------------------------------------------------------
   Marquee of every repo with a demo or a published page. Scrolls
   itself, pauses on hover, and is still a normal scroll container so
   it can be dragged or flicked by hand.
   ============================================================ */
function renderPreviewStrip() {
  var host = $('#preview-track');
  if (!host) return;
  var list = STATE.repos.filter(function (r) { return r.demo || r.pages || r.homepage; });
  if (!list.length) {
    $('#preview-band').hidden = true;
    return;
  }
  $('#preview-band').hidden = false;
  $('#preview-count').textContent = list.length + ' ready to open';

  /* duplicated once so the marquee can wrap seamlessly */
  function card(r) {
    var t = TYPE_BY_ID[r.type] || TYPES[0];
    var kind = r.demo ? 'Demo' : 'Live page';
    return '<button type="button" class="pv-card" data-' + (r.demo ? 'demo' : 'open') + '="' + esc(r.name) + '" ' +
      'style="--pv:' + t.color + '">' +
      '<span class="pv-art" aria-hidden="true">' +
        '<span class="pv-art-grid"></span>' +
        '<span class="pv-art-kind">' + esc(kind) + '</span>' +
      '</span>' +
      '<span class="pv-name">' + esc(r.isSnippet ? r.label : r.name) + '</span>' +
      '<span class="pv-desc">' + esc((r.desc || '').slice(0, 74)) + '</span>' +
      '</button>';
  }
  var html = list.map(card).join('');
  host.innerHTML = html + html;
  host.style.setProperty('--pv-n', list.length);
  wireCards(host);
}

/* ============================================================
   13. Gists
   ============================================================ */
function renderGists() {
  var host = $('#gist-cards');
  if (!STATE.gists.length) {
    host.innerHTML = '<div class="empty" style="border:0;background:none"><h3>No gists yet</h3>' +
      '<p>Public gists on the account will appear here.</p></div>';
    return;
  }
  host.innerHTML = STATE.gists.map(function (g) {
    var files = Object.keys(g.files || {}).slice(0, 5);
    return '<article class="gist-card">' +
      '<h4 class="card-name" style="font-size:14px">' + esc(g.description || files[0] || 'Untitled gist') + '</h4>' +
      '<div class="card-meta" style="margin-top:8px"><span>' + esc(timeAgo(g.updated_at)) + '</span>' +
        '<span>' + files.length + ' file' + (files.length === 1 ? '' : 's') + '</span></div>' +
      '<div class="gist-files">' + files.map(function (f) {
        return '<div class="gist-file">' + svg(ICON.code, 12) + esc(f) + '</div>';
      }).join('') + '</div>' +
      '<div class="card-actions"><a class="btn btn-outline btn-sm" href="' + esc(safeHttpUrl(g.html_url)) +
        '" target="_blank" rel="noopener noreferrer">Open gist' + svg(ICON.ext, 12) + '</a></div>' +
      '</article>';
  }).join('');
}

/* ============================================================
   14. Modal — project detail
   ============================================================ */
var modalRepo = null, modalTab = 'doc', lastFocus = null;

function openModal() {
  lastFocus = document.activeElement;
  $('#modal').setAttribute('data-open', '1');
  document.body.style.overflow = 'hidden';
  setTimeout(function () { $('#modal-close').focus(); }, 30);
}
function closeModal() {
  $('#modal').setAttribute('data-open', '0');
  document.body.style.overflow = '';
  modalRepo = null;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

function openRepo(name, tab) {
  var r = repoByName(name);
  if (!r) return;
  modalRepo = r;
  modalTab = tab || (STATE.view === 'dev' ? 'readme' : 'doc');
  if (tab === 'demo' && !r.demo) modalTab = 'doc';

  $('#modal-title').textContent = r.isSnippet ? r.label : r.name;
  $('#modal-sub').textContent = r.desc || r.rawDesc || 'No description.';
  renderModalToolbar();
  openModal();
  renderModalTab();
}

function renderModalToolbar() {
  var r = modalRepo;
  var tabs = [
    { id: 'doc',    label: 'Staff notes' },
    { id: 'readme', label: 'README' },
    { id: 'files',  label: 'Files' }
  ];
  if (r.demo) tabs.push({ id: 'demo', label: 'Demo' });

  $('#modal-tabs').innerHTML = tabs.map(function (t) {
    return '<button type="button" data-tab="' + t.id + '" aria-selected="' + (modalTab === t.id) + '">' + esc(t.label) + '</button>';
  }).join('');
  $$('#modal-tabs button').forEach(function (b) {
    b.addEventListener('click', function () { modalTab = b.getAttribute('data-tab'); renderModalToolbar(); renderModalTab(); });
  });

  $('#modal-links').innerHTML =
    '<button type="button" class="btn btn-ghost btn-sm" id="modal-clone">' + svg(ICON.copy, 13) + 'Clone</button>' +
    (r.pages ? '<a class="btn btn-ghost btn-sm" href="https://' + ACCOUNT + '.github.io/' + esc(r.name) + '/" target="_blank" rel="noopener noreferrer">Live' + svg(ICON.ext, 12) + '</a>' : '') +
    '<a class="btn btn-ghost btn-sm" href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">GitHub' + svg(ICON.ext, 12) + '</a>';
  $('#modal-clone').addEventListener('click', function () {
    copyText('git clone https://github.com/' + ACCOUNT + '/' + r.name + '.git', function (ok) {
      toast(ok ? 'Clone command copied' : 'Could not copy — select it manually');
    });
  });
}

function docSkeleton() {
  return '<div class="skeleton sk-line" style="width:46%;height:20px;margin-bottom:18px"></div>' +
    '<div class="skeleton sk-line" style="margin-bottom:10px"></div>' +
    '<div class="skeleton sk-line" style="margin-bottom:10px;width:92%"></div>' +
    '<div class="skeleton sk-line" style="margin-bottom:10px;width:74%"></div>' +
    '<div class="skeleton sk-line" style="width:84%"></div>';
}

function metaGrid(r) {
  var t = TYPE_BY_ID[r.type] || TYPES[0];
  var cells = [
    ['Type', t.label.replace(/s$/, '')],
    ['Purpose', (PURPOSE_BY_ID[r.purpose] || {}).label || r.purpose],
    ['Language', r.lang || '—'],
    ['Size', fmtBytes(r.bytes)],
    ['Updated', timeAgo(r.pushed)],
    ['Visibility', r.isPrivate ? 'Private' : 'Public']
  ];
  return '<div class="meta-grid">' + cells.map(function (c) {
    return '<div class="meta-cell"><div class="meta-k">' + esc(c[0]) + '</div><div class="meta-v">' + esc(c[1]) + '</div></div>';
  }).join('') + '</div>' +
  (r.platforms.length
    ? '<div style="margin-top:16px"><div class="meta-k" style="margin-bottom:8px">Works with</div><div class="card-works" style="margin:0">' +
      r.platforms.map(function (p) { return '<span class="pill pill-works">' + esc(labelForPlatform(p)) + '</span>'; }).join('') +
      '</div></div>'
    : '') +
  (r.topics.length
    ? '<div style="margin-top:16px"><div class="meta-k" style="margin-bottom:8px">Topics</div><div class="card-works" style="margin:0">' +
      r.topics.map(function (t2) { return '<span class="pill">' + esc(t2) + '</span>'; }).join('') +
      '</div></div>'
    : '');
}

function renderModalTab() {
  var r = modalRepo, body = $('#modal-body');
  if (!r) return;

  if (modalTab === 'demo') {
    body.innerHTML = '<p class="panel-note" style="margin-bottom:12px">Loading the demo through the authenticated GitHub API — private repos only render for signed-in staff.</p>' +
      '<div class="skeleton" style="height:320px;border-radius:12px"></div>';
    loadDemo(r);
    return;
  }

  if (modalTab === 'files') {
    body.innerHTML = metaGrid(r) + '<div style="margin-top:20px"><div class="meta-k" style="margin-bottom:10px">Repository files</div>' +
      '<div id="file-tree">' + docSkeleton() + '</div></div>';
    loadTree(r);
    return;
  }

  body.innerHTML = metaGrid(r) + '<div style="margin-top:22px"><div class="doc-body" id="doc-body">' + docSkeleton() + '</div></div>';

  if (modalTab === 'doc') loadDoc(r, 'CLREADME.md');
  else loadReadme(r);
}

function loadReadme(r) {
  ghFetch('https://api.github.com/repos/' + ACCOUNT + '/' + r.name + '/readme',
    { headers: { 'Accept': 'application/vnd.github.html+json' } })
    .then(function (res) {
      if (res.status === 404) throw new Error('none');
      if (!res.ok) throw new Error('readme ' + res.status);
      return res.text();
    })
    .then(function (html) {
      var el = $('#doc-body'); if (!el || modalRepo !== r) return;
      el.innerHTML = sanitizeHtml(html);
    })
    .catch(function () {
      var el = $('#doc-body'); if (!el || modalRepo !== r) return;
      el.innerHTML = '<div class="empty" style="border:0;background:none"><h3>No README</h3>' +
        '<p>This repository doesn’t have a README yet.</p></div>';
    });
}

/* CLREADME.md is the staff-facing doc. Fetch it raw, then let GitHub
   render the markdown so it matches README styling exactly. */
function loadDoc(r, path) {
  ghFetch('https://api.github.com/repos/' + ACCOUNT + '/' + r.name + '/contents/' + path,
    { headers: { 'Accept': 'application/vnd.github.raw' } })
    .then(function (res) {
      if (res.status === 404) throw new Error('none');
      if (!res.ok) throw new Error('doc ' + res.status);
      return res.text();
    })
    .then(function (md) {
      return ghFetch('https://api.github.com/markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: md, mode: 'gfm', context: ACCOUNT + '/' + r.name })
      }).then(function (res) { return res.ok ? res.text() : esc(md); });
    })
    .then(function (html) {
      var el = $('#doc-body'); if (!el || modalRepo !== r) return;
      el.innerHTML = sanitizeHtml(html);
    })
    .catch(function () {
      var el = $('#doc-body'); if (!el || modalRepo !== r) return;
      el.innerHTML = '<div class="empty" style="border:0;background:none">' +
        '<h3>No staff notes yet</h3>' +
        '<p>Every Cobblestone repo should carry a <code>CLREADME.md</code> — a short, plain-language note ' +
        'saying what the tool is, how to use it, and who to ask.</p>' +
        '<a class="btn btn-outline btn-sm" href="https://github.com/' + esc(ACCOUNT) + '/' + esc(r.name) +
        '/new/' + esc(r.branch) + '?filename=CLREADME.md" target="_blank" rel="noopener noreferrer">Add staff notes' + svg(ICON.ext, 12) + '</a>' +
        '<p style="margin-top:14px"><button type="button" class="btn btn-ghost btn-sm" id="jump-readme">Read the README instead</button></p></div>';
      var j = $('#jump-readme');
      if (j) j.addEventListener('click', function () { modalTab = 'readme'; renderModalToolbar(); renderModalTab(); });
    });
}

function loadTree(r) {
  ghFetch('https://api.github.com/repos/' + ACCOUNT + '/' + r.name + '/git/trees/' + encodeURIComponent(r.branch) + '?recursive=1')
    .then(function (res) { if (!res.ok) throw new Error('tree ' + res.status); return res.json(); })
    .then(function (data) {
      var el = $('#file-tree'); if (!el || modalRepo !== r) return;
      var files = (data.tree || []).filter(function (n) { return n.type === 'blob'; });
      if (!files.length) { el.innerHTML = '<p class="panel-note">No files found.</p>'; return; }
      files.sort(function (a, b) { return a.path.localeCompare(b.path); });
      var shown = files.slice(0, 300);
      el.innerHTML = '<div class="snip-list">' + shown.map(function (f) {
        return '<div class="snip-row" style="grid-template-columns:1fr auto;cursor:default">' +
          '<span class="snip-desc" style="font-family:ui-monospace,Menlo,monospace;-webkit-line-clamp:1;line-clamp:1;color:var(--ink)">' + esc(f.path) + '</span>' +
          '<span class="t-num">' + esc(fmtBytes(f.size || 0)) + '</span></div>';
      }).join('') + '</div>' +
      (files.length > shown.length ? '<p class="panel-note" style="margin-top:10px">' + (files.length - shown.length) + ' more files not shown.</p>' : '') +
      '<p class="panel-note" style="margin-top:10px">' + files.length + ' files on <code>' + esc(r.branch) + '</code>.</p>';
    })
    .catch(function () {
      var el = $('#file-tree'); if (!el || modalRepo !== r) return;
      el.innerHTML = '<p class="panel-note">Could not list the files for this repository.</p>';
    });
}

/* Demos load through the authenticated Contents API and render in a
   sandboxed iframe. That IS the privacy model: a private repo's demo
   only resolves for a signed-in viewer with access. Never enable Pages
   on a private repo to shortcut this — Pages is public. */
function loadDemo(r) {
  ghFetch('https://api.github.com/repos/' + ACCOUNT + '/' + r.name + '/contents/' + r.demo,
    { headers: { 'Accept': 'application/vnd.github.raw' }, cache: 'no-store' })
    .then(function (res) {
      if (res.status === 404) throw new Error('none');
      if (!res.ok) throw new Error('demo ' + res.status);
      return res.text();
    })
    .then(function (html) {
      var body = $('#modal-body'); if (!body || modalRepo !== r) return;
      var frame = document.createElement('iframe');
      frame.className = 'demo-frame';
      frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms allow-modals');
      frame.setAttribute('title', r.name + ' demo');
      frame.srcdoc = html;
      body.innerHTML = '';
      var note = document.createElement('p');
      note.className = 'panel-note';
      note.style.marginBottom = '12px';
      note.textContent = 'Running ' + r.demo + ' in a sandbox. Nothing it does can reach this page.';
      body.appendChild(note);
      body.appendChild(frame);
    })
    .catch(function () {
      var body = $('#modal-body'); if (!body || modalRepo !== r) return;
      body.innerHTML = '<div class="empty"><h3>Demo unavailable</h3>' +
        '<p>' + (ghToken ? 'The demo file could not be loaded from this repository.'
                         : 'This demo lives in a private repository. Sign in with GitHub to run it.') + '</p></div>';
    });
}

function wireModal() {
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-overlay').addEventListener('click', closeModal);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if ($('#palette').getAttribute('data-open') === '1') { closePalette(); return; }
    if ($('#modal').getAttribute('data-open') === '1') closeModal();
  });
  /* Focus trap */
  $('#modal').addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var f = $$('a[href], button:not([disabled]), input, select, textarea, iframe, [tabindex]:not([tabindex="-1"])', $('#modal-panel'))
      .filter(function (n) { return n.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

/* ============================================================
   15. Command palette
   ============================================================ */
var paletteIndex = [], paletteActive = 0, paletteRows = [];

function buildPaletteIndex() {
  paletteIndex = STATE.repos.map(function (r) {
    return {
      name: r.name,
      title: r.isSnippet ? r.label : r.name,
      desc: r.desc || r.rawDesc,
      kind: (TYPE_BY_ID[r.type] || {}).label || r.type,
      color: (TYPE_BY_ID[r.type] || TYPES[0]).color,
      key: (r.name + ' ' + r.label + ' ' + (r.desc || '')).toLowerCase()
    };
  });
}

function openPalette() {
  $('#palette').setAttribute('data-open', '1');
  $('#palette-input').value = '';
  runPalette('');
  setTimeout(function () { $('#palette-input').focus(); }, 20);
}
function closePalette() {
  $('#palette').setAttribute('data-open', '0');
}

function runPalette(q) {
  q = (q || '').trim().toLowerCase();
  var rows = paletteIndex;
  if (q) {
    var terms = q.split(/\s+/);
    rows = paletteIndex.filter(function (r) {
      for (var i = 0; i < terms.length; i++) if (r.key.indexOf(terms[i]) < 0) return false;
      return true;
    }).sort(function (a, b) {
      var ai = a.title.toLowerCase().indexOf(terms[0]), bi = b.title.toLowerCase().indexOf(terms[0]);
      if (ai < 0) ai = 999; if (bi < 0) bi = 999;
      return ai - bi || a.title.length - b.title.length;
    });
  }
  paletteRows = rows.slice(0, 40);
  paletteActive = 0;
  var host = $('#palette-results');
  if (!paletteRows.length) {
    host.innerHTML = '<div style="padding:26px;text-align:center;color:var(--muted);font-size:13px">No repository matches “' + esc(q) + '”.</div>';
    return;
  }
  host.innerHTML = paletteRows.map(function (r, i) {
    return '<button type="button" class="palette-item" data-i="' + i + '" data-active="' + (i === 0 ? '1' : '0') + '" data-name="' + esc(r.name) + '">' +
      '<span class="pi-dot" style="background:' + r.color + '"></span>' +
      '<span style="min-width:0"><span class="pi-name">' + esc(r.title) + '</span>' +
        (r.desc ? '<div class="pi-desc">' + esc(r.desc) + '</div>' : '') + '</span>' +
      '<span class="pi-kind">' + esc(r.kind) + '</span></button>';
  }).join('');
  $$('.palette-item', host).forEach(function (b) {
    b.addEventListener('click', function () { closePalette(); openRepo(b.getAttribute('data-name')); });
    b.addEventListener('mouseenter', function () { setPaletteActive(parseInt(b.getAttribute('data-i'), 10)); });
  });
}

function setPaletteActive(i) {
  paletteActive = Math.max(0, Math.min(paletteRows.length - 1, i));
  $$('#palette-results .palette-item').forEach(function (b, j) {
    b.setAttribute('data-active', j === paletteActive ? '1' : '0');
    if (j === paletteActive) b.scrollIntoView({ block: 'nearest' });
  });
}

function wirePalette() {
  $('#palette-overlay').addEventListener('click', closePalette);
  $('#palette-open').addEventListener('click', openPalette);
  $('#palette-input').addEventListener('input', function () { runPalette(this.value); });
  $('#palette-input').addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setPaletteActive(paletteActive + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setPaletteActive(paletteActive - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      var r = paletteRows[paletteActive];
      if (r) { closePalette(); openRepo(r.name); }
    }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if ($('#palette').getAttribute('data-open') === '1') closePalette(); else openPalette();
    }
    if (e.key === '/' && document.activeElement === document.body) {
      e.preventDefault(); $('#search').focus();
    }
  });
}

/* ============================================================
   15b. Bridge to the WebGL stage (assets/stage.js)
   ------------------------------------------------------------
   stage.js is an ES module and loads independently of this file, so
   they meet over window.CBHub + a 'cb:data' event rather than an
   import. Either can arrive first; both paths are handled.
   ============================================================ */
function publishData() {
  window.CBData = { repos: STATE.repos, types: TYPES };
  document.dispatchEvent(new CustomEvent('cb:data'));
  /* language enrichment changes stone heights — re-lay when it lands */
  if (window.CBCity && window.CBCity.setEstate) {
    window.CBCity.setEstate(STATE.repos, TYPES);
    fetchTrees();
  }
  renderHudFigures();
  renderHudLegend();
}

window.CBHub = {
  openRepo: function (name) { openRepo(name); },
  tipFor: function (repo, file) {
    if (!file) return mapTipHtml(repo);
    return '<div class="tip-title">' + esc(file.path) + '</div>' +
      '<div class="tip-desc">' + esc(repo.isSnippet ? repo.label : repo.name) + '</div>' +
      '<div class="tip-meta"><span><b>' + esc(fmtBytes(file.size)) + '</b></span>' +
      '<span>' + esc((TYPE_BY_ID[repo.type] || {}).label || repo.type) + '</span></div>';
  },
  showTip: showTip, moveTip: moveTip, hideTip: hideTip,
  inspect: renderInspector,
  focus: function (n) { if (window.CBCity) window.CBCity.focus(n); },
  openFile: openFileSource,
  onLevel: renderCrumbs,
  onWalk: function (on) {
    document.body.setAttribute('data-walk', on ? '1' : '0');
    $('#walk-hud').hidden = !on;
    $('#hud').hidden = on;
    if (on) renderInspector(null);
  },
  linkPlatforms: buildCityLinks,
  worldReady: function () { WORLD_OK = true; renderHudLegend(); renderHudFigures(); },
  noWorld: function () {
    WORLD_OK = false;
    $('#world-boot').innerHTML = '<p>This browser can\u2019t run the 3D estate.</p>' +
      '<button type="button" class="btn btn-primary btn-sm" id="fallback-list">Browse the list instead</button>';
    $('#fallback-list').addEventListener('click', function () { setMode('list'); });
  }
};

/* ============================================================
   15b2. File trees — the city's raw material
   ------------------------------------------------------------
   One `git/trees?recursive=1` call per repo (~109). Signed in that's
   well inside the 5,000/hr budget; signed out only the public repos
   are listed, so it's a handful. Cached per repo against pushed_at,
   and fed to the city as each lands so districts rise in waves.
   ============================================================ */
var TREES_DONE = 0;

function fetchTrees() {
  var list = STATE.repos.slice();
  TREES_DONE = 0;
  var idx = 0, CONC = 6;

  function feed(repo, files) {
    TREES_DONE++;
    if (window.CBCity) window.CBCity.addRepoTree(repo.name, files);
    var el = $('#city-progress');
    if (el) {
      var pctDone = Math.round((TREES_DONE / list.length) * 100);
      el.style.width = pctDone + '%';
      if (TREES_DONE >= list.length) {
        var boot = $('#world-boot');
        if (boot) boot.hidden = true;
        /* districts only exist once their trees land, so the arcs are
           drawn after the city is, not when the estate is declared */
        buildCityLinks();
      }
    }
  }

  function one(repo) {
    var key = 'cb2_tree_' + repo.name + '_' + (repo.pushed || '');
    var cached = null;
    try { cached = sessionStorage.getItem(key); } catch (e) {}
    if (cached) {
      try { feed(repo, JSON.parse(cached)); return Promise.resolve(); } catch (e) {}
    }
    return ghFetch('https://api.github.com/repos/' + ACCOUNT + '/' + repo.name +
        '/git/trees/' + encodeURIComponent(repo.branch) + '?recursive=1')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var files = ((d && d.tree) || [])
          .filter(function (n) { return n.type === 'blob'; })
          .map(function (n) { return { p: n.path, s: n.size || 0 }; });
        try { sessionStorage.setItem(key, JSON.stringify(files)); } catch (e) {}
        feed(repo, files);
      })
      .catch(function () { feed(repo, []); });
  }

  function pump() {
    if (idx >= list.length) return;
    var batch = list.slice(idx, idx + CONC);
    idx += CONC;
    Promise.all(batch.map(one)).then(pump);
  }
  pump();
}

/* ============================================================
   15b3. Dependency tracing — the real wiring inside a repo
   ------------------------------------------------------------
   Reads the files at the level you're looking at and pulls out what
   they actually pull in: PHP require/include, JS import/require, CSS
   @import, HTML src/href. Relative paths are resolved against the
   file's own directory and matched back to the repo's tree, so an edge
   only exists if both ends are real files in this repository.

   Bounded on purpose: only the files on screen, capped, six at a time,
   cached per repo+path. Nothing is guessed — an unresolved import is
   dropped rather than drawn.
   ============================================================ */
var TEXTY = /\.(php|inc|phtml|js|mjs|jsx|ts|tsx|css|scss|less|html|htm|twig)$/i;
var TRY_EXT = ['', '.php', '.js', '.jsx', '.ts', '.css', '.scss', '.html', '/index.php', '/index.js'];

var IMPORT_PATTERNS = [
  /* PHP. Real code is `require_once PLUGIN_DIR . 'includes/x.php';`, so allow
     whatever constant/concatenation sits between the keyword and the path —
     but insist on a file extension so we don't match prose. */
  /(?:require|include)(?:_once)?\b[^;\n]{0,160}?['"]([^'"\n]+?\.(?:php|inc|phtml))['"]/gi,
  /* ES modules and CommonJS */
  /\bfrom\s+['"]([^'"\n]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /* CSS */
  /@import\s+(?:url\()?\s*['"]?([^'")\n]+)/g,
  /* markup, and WordPress path helpers */
  /(?:src|href)\s*=\s*["\']([^"\'\n]+)["\']/g,
  /(?:plugin_dir_path|plugin_dir_url|get_template_directory(?:_uri)?|get_stylesheet_directory(?:_uri)?)\s*\([^)]*\)\s*\.\s*['"]([^'"\n]+)['"]/g
];

function resolveImport(fromPath, raw, pathSet) {
  var spec = String(raw).split(/[?#]/)[0].trim();
  if (!spec || /^(https?:|\/\/|data:|mailto:|#)/i.test(spec)) return null;
  if (/node_modules|vendor\/bin/.test(spec)) return null;
  spec = spec.replace(/^\.\//, '');
  var dir = fromPath.indexOf('/') >= 0 ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';
  var bases = [];
  if (spec.charAt(0) === '/') bases.push(spec.slice(1));
  else {
    bases.push(dir ? dir + '/' + spec : spec);
    bases.push(spec);
  }
  for (var b = 0; b < bases.length; b++) {
    /* collapse ../ */
    var parts = [], segs = bases[b].split('/');
    for (var i = 0; i < segs.length; i++) {
      if (segs[i] === '..') parts.pop();
      else if (segs[i] && segs[i] !== '.') parts.push(segs[i]);
    }
    var joined = parts.join('/');
    for (var e = 0; e < TRY_EXT.length; e++) {
      var cand = joined + TRY_EXT[e];
      if (pathSet[cand] && cand !== fromPath) return cand;
    }
  }
  return null;
}

function traceDependencies(repo, paths, onDone) {
  var pathSet = {};
  (window.CBCity.trees.get(repo.name) || []).forEach(function (f) { pathSet[f.p] = 1; });
  var targets = paths.filter(function (p) { return TEXTY.test(p); }).slice(0, 55);
  if (!targets.length) { onDone([]); return; }

  var edges = [], idx = 0, CONC = 6, done = 0;
  setTraceStatus('reading ' + targets.length + ' files\u2026');

  function scan(path, text) {
    var seen = {};
    IMPORT_PATTERNS.forEach(function (re) {
      re.lastIndex = 0;
      var m;
      while ((m = re.exec(text)) !== null) {
        var to = resolveImport(path, m[1], pathSet);
        if (to && !seen[to]) { seen[to] = 1; edges.push({ from: path, to: to }); }
      }
    });
  }

  function one(path) {
    var key = 'cb2_src_' + repo.name + '_' + path;
    var cached = null;
    try { cached = sessionStorage.getItem(key); } catch (e) {}
    if (cached != null) { scan(path, cached); done++; return Promise.resolve(); }
    return ghFetch('https://api.github.com/repos/' + ACCOUNT + '/' + repo.name + '/contents/' +
        path.split('/').map(encodeURIComponent).join('/'),
      { headers: { 'Accept': 'application/vnd.github.raw' } })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (t) {
        var keep = t.length > 120000 ? t.slice(0, 120000) : t;
        try { sessionStorage.setItem(key, keep); } catch (e) {}
        scan(path, keep); done++;
      })
      .catch(function () { done++; });
  }

  function pump() {
    if (idx >= targets.length) {
      setTraceStatus(edges.length ? edges.length + ' links traced' : 'no internal links found');
      setTimeout(function () { setTraceStatus(''); }, 3200);
      onDone(edges);
      return;
    }
    var batch = targets.slice(idx, idx + CONC);
    idx += CONC;
    setTraceStatus('reading ' + Math.min(idx, targets.length) + ' of ' + targets.length + '\u2026');
    Promise.all(batch.map(one)).then(pump);
  }
  pump();
}

function setTraceStatus(msg) {
  var el = $('#trace-status');
  if (!el) return;
  el.textContent = msg || '';
  el.hidden = !msg;
}

/* ============================================================
   15c. World mode — HUD, legend, inspector
   ============================================================ */
var MODE = 'world', WORLD_OK = false, CITY_LEVEL = { kind: 'estate' }, LINKS_ON = true;

function setMode(mode) {
  MODE = mode;
  document.body.setAttribute('data-mode', mode);
  $$('#modeswitch button').forEach(function (b) {
    b.setAttribute('aria-checked', b.getAttribute('data-mode') === mode ? 'true' : 'false');
  });
  $('#world').hidden = mode !== 'world';
  $('#main').hidden = mode !== 'list';
  try { localStorage.setItem('cb2_mode', mode); } catch (e) {}
  if (window.CBCity) window.CBCity._sync();
  if (mode === 'world') hideTip();
}

function renderHudFigures() {
  var host = $('#hud-figures');
  if (!host) return;
  var tb = splitBytes(totalBytes());
  var cells = [
    [String(STATE.repos.length), '', 'repositories'],
    [tb.val, tb.unit, 'of source'],
    [String(Object.keys(platformCounts()).length), '', 'platforms'],
    [String(openableCount()), '', 'open here']
  ];
  host.innerHTML = cells.map(function (c) {
    return '<div class="hud-fig"><span class="hud-fig-v">' + esc(c[0]) +
      (c[1] ? '<i>' + esc(c[1]) + '</i>' : '') + '</span>' +
      '<span class="hud-fig-l">' + esc(c[2]) + '</span></div>';
  }).join('');
}

function renderHudLegend() {
  var host = $('#hud-legend');
  if (!host) return;
  var counts = typeCounts();
  host.innerHTML = TYPES.filter(function (t) { return counts[t.id]; }).map(function (t) {
    return '<button type="button" class="hud-chip" data-type="' + esc(t.id) + '" ' +
      'aria-pressed="' + (STATE.type === t.id) + '">' +
      '<span class="hud-swatch" style="background:' + t.color + '"></span>' +
      esc(t.label) + '<span class="hud-n">' + counts[t.id] + '</span></button>';
  }).join('');
  $$('.hud-chip', host).forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-type');
      STATE.type = (STATE.type === v) ? 'all' : v;
      renderHudLegend(); renderChips(); applyFilters(); syncPortfolioPressed();
    });
  });
}

/* The platforms worth drawing: enough repos to be a real dependency,
   capped so the sky doesn't turn into a cat's cradle. */
/* Trace the level you're actually looking at. */
var TRACE_TOKEN = 0;
function traceCurrentLevel(level) {
  if (!window.CBCity || !level || level.kind === 'estate') return;
  var repo = STATE.repos.filter(function (r) { return r.name === level.repo; })[0];
  if (!repo) return;
  var paths = [];
  window.CBCity.districts.forEach(function (d) {
    d.towers.forEach(function (t) { paths.push(t.file.path); });
  });
  var token = ++TRACE_TOKEN;
  window.CBCity.setFileLinks([]);
  traceDependencies(repo, paths, function (edges) {
    if (token !== TRACE_TOKEN) return;
    window.CBCity.setFileLinks(LINKS_ON ? edges : []);
    window.CBCity._traceEdges = edges;
  });
}

function buildCityLinks() {
  if (!window.CBCity || !window.CBCity.buildLinks) return;
  var counts = platformCounts();
  var list = PLATFORMS
    .filter(function (p) { return (counts[p.id] || 0) >= 3; })
    .sort(function (a, b) { return counts[b.id] - counts[a.id]; })
    .slice(0, 9)
    .map(function (p, i) {
      var HUES = ['#0072B2', '#D48200', '#00916A', '#C4719B', '#5BB8EC',
                  '#7E6BB5', '#6F8A5B', '#B5686B', '#4E6070'];
      return { id: p.id, label: p.label, color: HUES[i % HUES.length] };
    });
  window.CBCity.buildLinks(list);
  window.CBCity.setLinksVisible(LINKS_ON);
}

function renderCrumbs(crumbs, level, summary) {
  var host = $('#hud-crumbs');
  if (!host) return;
  CITY_LEVEL = level;
  if (!crumbs || crumbs.length < 2) { host.innerHTML = ''; host.hidden = true; }
  else {
    host.hidden = false;
    host.innerHTML = crumbs.map(function (c, i) {
      var last = i === crumbs.length - 1;
      return (i ? '<span class="crumb-sep">/</span>' : '') +
        '<button type="button" class="crumb" data-i="' + i + '"' + (last ? ' aria-current="location"' : '') + '>' +
        esc(c.label) + '</button>';
    }).join('');
    $$('.crumb', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var c = crumbs[parseInt(b.getAttribute('data-i'), 10)];
        if (c && window.CBCity) window.CBCity.go(c.level);
      });
    });
  }
  var hr = $('#hud-result');
  if (hr && summary) hr.textContent = summary;
  if (level && level.kind === 'estate') buildCityLinks();
  else traceCurrentLevel(level);
  $('#links-toggle').hidden = false;
  /* search and the type legend only mean anything across the whole estate */
  var inside = level && level.kind !== 'estate';
  $('#hud-legend').hidden = !!inside;
  $('#world-search').disabled = !!inside;
  $('#world-search').placeholder = inside
    ? 'Search works across the estate — go up to use it'
    : 'Search — watch the city light up\u2026';
}

/* The end of the dive: the file itself. */
function openFileSource(repo, file) {
  if (!repo || !file) return;
  modalRepo = repo;
  $('#modal-title').textContent = file.name;
  $('#modal-sub').textContent = repo.name + ' \u00b7 ' + file.path + ' \u00b7 ' + fmtBytes(file.size);
  $('#modal-tabs').innerHTML = '';
  $('#modal-links').innerHTML =
    '<a class="btn btn-ghost btn-sm" href="' + esc(repo.url) + '/blob/' + esc(repo.branch) + '/' +
    esc(file.path) + '" target="_blank" rel="noopener noreferrer">View on GitHub' + svg(ICON.ext, 12) + '</a>';
  $('#modal-body').innerHTML = docSkeleton();
  openModal();

  var ext = (file.name.split('.').pop() || '').toLowerCase();
  var BINARY = ['png','jpg','jpeg','gif','webp','ico','woff','woff2','ttf','eot','otf','mp4','webm','zip','pdf','mo'];
  if (BINARY.indexOf(ext) >= 0) {
    $('#modal-body').innerHTML = '<div class="empty"><h3>Binary file</h3>' +
      '<p>' + esc(file.name) + ' is ' + esc(fmtBytes(file.size)) + ' of binary data \u2014 open it on GitHub to view it.</p></div>';
    return;
  }
  if ((file.size || 0) > 600000) {
    $('#modal-body').innerHTML = '<div class="empty"><h3>Too large to show</h3>' +
      '<p>This file is ' + esc(fmtBytes(file.size)) + '. Open it on GitHub instead.</p></div>';
    return;
  }

  ghFetch('https://api.github.com/repos/' + ACCOUNT + '/' + repo.name + '/contents/' +
      file.path.split('/').map(encodeURIComponent).join('/'),
    { headers: { 'Accept': 'application/vnd.github.raw' } })
    .then(function (r) { if (!r.ok) throw new Error('file ' + r.status); return r.text(); })
    .then(function (text) {
      if (!modalRepo || modalRepo.name !== repo.name) return;
      var lines = text.split('\n');
      var shown = lines.slice(0, 1200);
      $('#modal-body').innerHTML =
        '<div class="srcwrap"><pre class="srcnums">' +
          shown.map(function (_, i) { return i + 1; }).join('\n') +
        '</pre><pre class="srccode">' + esc(shown.join('\n')) + '</pre></div>' +
        (lines.length > shown.length
          ? '<p class="panel-note" style="margin-top:10px">Showing the first 1,200 of ' + lines.length + ' lines.</p>'
          : '<p class="panel-note" style="margin-top:10px">' + lines.length + ' lines.</p>');
    })
    .catch(function () {
      $('#modal-body').innerHTML = '<div class="empty"><h3>Couldn\u2019t load the file</h3>' +
        '<p>' + (ghToken ? 'GitHub wouldn\u2019t return this file.' : 'This repository is private \u2014 sign in to read it.') + '</p></div>';
    });
}

function renderInspector(repo, file) {
  var el = $('#inspector');
  if (!el) return;
  if (!repo) { el.hidden = true; el.innerHTML = ''; return; }
  var t = TYPE_BY_ID[repo.type] || TYPES[0];
  el.hidden = false;
  el.innerHTML =
    '<button type="button" class="insp-close" aria-label="Close">' + svg(ICON.close, 15) + '</button>' +
    '<p class="insp-kicker"><span class="hud-swatch" style="background:' + t.color + '"></span>' +
      esc(t.label.replace(/s$/, '')) + (repo.isPrivate ? ' · private' : '') + '</p>' +
    '<h3 class="insp-name">' + esc(repo.isSnippet ? repo.label : repo.name) + '</h3>' +
    (file ? '<p class="insp-file"><code>' + esc(file.path) + '</code><span>' + esc(fmtBytes(file.size)) + '</span></p>' : '') +
    '<p class="insp-desc">' + esc(repo.desc || 'No description on GitHub yet.') + '</p>' +
    (!file && window.CBCity && window.CBCity.signatures && window.CBCity.signatures.get(repo.name)
      ? '<p class="insp-sig">' + esc(window.CBHub.describeSig(window.CBCity.signatures.get(repo.name))) + '</p>'
      : '') +
    '<div class="insp-grid">' +
      '<div><span>Code</span><b>' + esc(fmtBytes(repo.bytes)) + '</b></div>' +
      '<div><span>Language</span><b>' + esc(repo.lang || '\u2014') + '</b></div>' +
      '<div><span>Updated</span><b>' + esc(timeAgo(repo.pushed)) + '</b></div>' +
    '</div>' +
    (repo.platforms.length ? '<div class="insp-works">' + repo.platforms.map(function (p) {
      return '<span class="pill pill-works">' + esc(labelForPlatform(p)) + '</span>';
    }).join('') + '</div>' : '') +
    '<div class="insp-actions">' +
      '<button type="button" class="btn btn-primary btn-sm" data-open="' + esc(repo.name) + '">Open docs</button>' +
      (repo.demo ? '<button type="button" class="btn btn-outline btn-sm" data-demo="' + esc(repo.name) + '">Demo</button>' : '') +
      (file ? '<a class="btn btn-ghost btn-sm" href="' + esc(repo.url) + '/blob/' + esc(repo.branch) + '/' + esc(file.path) +
        '" target="_blank" rel="noopener noreferrer">This file' + svg(ICON.ext, 12) + '</a>'
            : '<a class="btn btn-ghost btn-sm" href="' + esc(repo.url) + '" target="_blank" rel="noopener noreferrer">GitHub' + svg(ICON.ext, 12) + '</a>') +
    '</div>';
  $('.insp-close', el).addEventListener('click', function () {
    renderInspector(null);
    if (window.CBCity) window.CBCity.clearSelection();
  });
  wireCards(el);
}

function wireWorldHud() {
  $$('#modeswitch button').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
  });
  $('#walk-toggle').addEventListener('click', function () {
    if (window.CBCity) window.CBCity.enterWalk();
  });
  $('#links-toggle').addEventListener('click', function () {
    LINKS_ON = !LINKS_ON;
    this.setAttribute('aria-pressed', LINKS_ON ? 'true' : 'false');
    if (!window.CBCity) return;
    window.CBCity.setLinksVisible(LINKS_ON);
    if (CITY_LEVEL && CITY_LEVEL.kind !== 'estate') {
      window.CBCity.setFileLinks(LINKS_ON ? (window.CBCity._traceEdges || []) : []);
    }
  });
  $('#world-reset').addEventListener('click', function () {
    if (!window.CBCity) return;
    if (CITY_LEVEL && CITY_LEVEL.kind !== 'estate') window.CBCity.home();
    else window.CBCity.resetView();
  });

  var ws = $('#world-search'), wc = $('#world-search-clear');
  var run = debounce(function () {
    var q = ws.value.trim();
    wc.hidden = !q;
    STATE.q = q; STATE.snipQ = q;
    $('#search').value = q;
    $('#search').parentNode.setAttribute('data-filled', q ? '1' : '0');
    $('#snip-search').value = q;
    applyFilters(); renderSnippets();
  }, 200);
  ws.addEventListener('input', run);
  wc.addEventListener('click', function () { ws.value = ''; wc.hidden = true; run(); ws.focus(); });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || MODE !== 'world') return;
    if ($('#modal').getAttribute('data-open') === '1') return;
    if (window.CBCity && window.CBCity.walking) { window.CBCity.exitWalk(); return; }
    if (!$('#inspector').hidden) {
      renderInspector(null);
      if (window.CBCity) window.CBCity.clearSelection();
      return;
    }
    if (window.CBCity) window.CBCity.up();
  });
}

/* ============================================================
   16. Tooltip
   ============================================================ */
var tipEl;
function showTip(e, html) {
  if (!html) return;
  tipEl = tipEl || $('#tip');
  tipEl.innerHTML = html;
  tipEl.setAttribute('data-show', '1');
  moveTip(e);
}
function moveTip(e) {
  if (!tipEl) return;
  var pad = 14;
  var x = (e.clientX != null ? e.clientX : 0) + pad;
  var y = (e.clientY != null ? e.clientY : 0) + pad;
  var r = tipEl.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 8) x = window.innerWidth - r.width - 8;
  if (y + r.height > window.innerHeight - 8) y = (e.clientY || 0) - r.height - pad;
  tipEl.style.left = Math.max(8, x) + 'px';
  tipEl.style.top = Math.max(8, y) + 'px';
}
function hideTip() { if (tipEl) tipEl.setAttribute('data-show', '0'); }

/* ============================================================
   17. View / controls
   ============================================================ */
function applyViewUI() {
  $$('#view-toggle button').forEach(function (b) {
    b.setAttribute('aria-checked', b.getAttribute('data-view') === STATE.view ? 'true' : 'false');
  });
  $('#view-hint').textContent = STATE.view === 'staff'
    ? 'Grouped by what each project is for — open a tool and read its notes.'
    : 'Every project in one table — language, size, clone command and files.';
  $('#sort-wrap').hidden = STATE.view !== 'dev';
  try { localStorage.setItem('cb2_view', STATE.view); } catch (e) {}
}

function wireControls() {
  $$('#view-toggle button').forEach(function (b) {
    b.addEventListener('click', function () {
      STATE.view = b.getAttribute('data-view');
      if (STATE.view === 'staff') STATE.type = 'all'; else STATE.purpose = 'all';
      applyViewUI(); renderChips(); applyFilters(); syncPortfolioPressed();
    });
  });

  var search = $('#search');
  var onSearch = debounce(function () {
    STATE.q = search.value.trim();
    STATE.snipQ = STATE.q;
    search.parentNode.setAttribute('data-filled', STATE.q ? '1' : '0');
    $('#snip-search').value = STATE.q;
    applyFilters(); renderSnippets();
  }, 160);
  search.addEventListener('input', onSearch);
  $('#search-clear').addEventListener('click', function () {
    search.value = ''; STATE.q = ''; STATE.snipQ = ''; $('#snip-search').value = '';
    search.parentNode.setAttribute('data-filled', '0');
    applyFilters(); renderSnippets(); search.focus();
  });

  $('#sort').addEventListener('change', function () { STATE.sort = this.value; applyFilters(); });
  $('#show-archived').addEventListener('change', function () { STATE.showArchived = this.checked; applyFilters(); });

  var snipSearch = $('#snip-search');
  snipSearch.addEventListener('input', debounce(function () {
    STATE.snipQ = snipSearch.value.trim(); renderSnippets();
  }, 160));
}

/* ============================================================
   18. Skeletons / empty
   ============================================================ */
function showSkeletons() {
  $('#results').innerHTML = '<div class="cards">' +
    new Array(6).join('x').split('x').map(function () { return '<div class="skeleton sk-card"></div>'; }).join('') +
    '</div>';
}

function renderEmptyEverything() {
  veil(false);
  var msg = STATE.rateLimited
    ? 'GitHub’s anonymous API allows 60 requests an hour per network. Sign in with GitHub to lift that and see private repositories too.'
    : 'Could not reach the GitHub API just now. Check your connection and refresh.';
  $('#results').innerHTML = '<div class="empty"><h3>' +
    (STATE.rateLimited ? 'Rate limit reached' : 'Nothing loaded') + '</h3><p>' + esc(msg) + '</p>' +
    (ghToken ? '' : '<button type="button" class="btn btn-primary" id="empty-signin">Sign in with GitHub</button>') +
    '</div>';
  var b = $('#empty-signin');
  if (b) b.addEventListener('click', signIn);
}

/* ============================================================
   19. Reveal-on-scroll + header height
   ============================================================ */
function observeReveals() {
  var nodes = $$('.reveal');
  function revealAll() { nodes.forEach(function (n) { n.setAttribute('data-in', '1'); }); }

  /* A backgrounded tab isn't rendered, so IntersectionObserver reports nothing
     and timers are throttled. Nobody is watching an animation they can't see —
     just show everything and skip the choreography. */
  if (!('IntersectionObserver' in window) || document.visibilityState !== 'visible') {
    revealAll();
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.setAttribute('data-in', '1'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  nodes.forEach(function (n) { io.observe(n); });

  /* Safety net: a missed animation is nothing, invisible content is everything. */
  setTimeout(revealAll, 2000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') revealAll();
  });
}

function syncHeaderHeight() {
  var h = $('#site-header');
  if (h) document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
}

/* ============================================================
   20. Boot
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
  try {
    var v = localStorage.getItem('cb2_view');
    if (v === 'staff' || v === 'dev') STATE.view = v;
  } catch (e) {}

  $('#year').textContent = new Date().getFullYear();
  var savedMode = 'world';
  try { var m = localStorage.getItem('cb2_mode'); if (m === 'world' || m === 'list') savedMode = m; } catch (e) {}
  wireWorldHud();
  setMode(savedMode);
  applyViewUI();
  wireAuth();
  wireControls();
  wireModal();
  wirePalette();
  observeReveals();
  syncHeaderHeight();
  window.addEventListener('resize', debounce(syncHeaderHeight, 120));

  restoreSession();
});

})();

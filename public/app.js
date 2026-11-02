(function () {
  var root = document.documentElement, tg = document.getElementById('themeToggle');
  function cookieDomain() { var h = location.hostname.split('.'); return h.length >= 3 ? '; domain=.' + h.slice(1).join('.') : ''; }
  function readTheme() {
    var m = document.cookie.match(/(?:^|; )sw-theme=(light|dark)/);
    if (m) return m[1];
    try { return localStorage.getItem('sw-theme') || 'dark'; } catch (e) { return 'dark'; }
  }
  function setTheme(t) {
    root.dataset.theme = t; tg.checked = t === 'light';
    try { localStorage.setItem('sw-theme', t); } catch (e) {}
    document.cookie = 'sw-theme=' + t + '; path=/; max-age=31536000; samesite=lax' + cookieDomain();
  }
  setTheme(readTheme());
  tg.addEventListener('change', function () { setTheme(tg.checked ? 'light' : 'dark'); });
  (function () { var h = location.hostname.split('.'); var a = document.getElementById('crumb-home'); if (a && h.length >= 3) a.href = location.protocol + '//' + h.slice(1).join('.'); })();

  var DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var DATES = [];
  var THEMES = {}, PANTRY = [], GENRES = {}, DEF_THEMES = {}, DEF_PANTRY = [], prefs = { themes: null, pantry: null };
  function applyPrefs() { THEMES = prefs.themes || DEF_THEMES; PANTRY = prefs.pantry || DEF_PANTRY; }
  var AISLES = { produce: 'Produce', meat: 'Meat & seafood', dairy: 'Dairy & eggs', dry: 'Dry & canned', bread: 'Bread & tortillas' };
  var PLURAL = { handful: 1, can: 1, clove: 1, bunch: 1, stalk: 1, head: 1, jar: 1 };
  var R = [], byId = {}, CUISINES = ['All'];
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function loadData(data) {
    R = data.recipes.map(function (r) {
      r.t = esc(r.t); r.c = esc(r.c);
      r.src = { type: r.src.type, label: esc(r.src.label), url: esc(r.src.url) };
      r.ing = r.ing.map(function (g) { return [g[0], esc(g[1]), esc(g[2]), g[3]]; });
      r.steps = r.steps.map(esc);
      return r;
    });
    R.sort(function (a, b) { return a.t.localeCompare(b.t); });
    byId = {}; R.forEach(function (r) { byId[r.id] = r; });
    var st = data.settings || {};
    DEF_THEMES = st.themes || {}; DEF_PANTRY = (st.pantry || []).map(function (x) { return String(x).toLowerCase(); }); applyPrefs();
    GENRES = st.genres && Object.keys(st.genres).length ? st.genres : {};
    if (!Object.keys(GENRES).length) R.forEach(function (r) { GENRES[r.c] = [r.c]; });
    CUISINES = ['All'].concat(R.map(function (r) { return r.c; }).filter(function (c, i, a) { return a.indexOf(c) === i; }));
  }

  // ---------- dates and weeks ----------
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function mondayOf(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); }
  function shortDate(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function defaultWeekKey() { var t = new Date(), m = mondayOf(t); if (t.getDay() === 0) m = addDays(m, 7); return isoOf(m); }
  function weekLabel() { var s = parseISO(weekKey); return 'Mon ' + shortDate(s) + ' – Sun ' + shortDate(addDays(s, 6)); }
  function setDates() { var s = parseISO(weekKey); DATES = DAYS.map(function (_, i) { return shortDate(addDays(s, i)); }); }

  // ---------- plan data ----------
  function ns(mode, pick) { var m = mode === undefined ? 'cook' : mode; return { mode: m, pick: pick || null, scale: 1, open: m === 'cook' && !pick, time: 'any', all: false }; }
  function newSide() { var q = ns(); q.open = false; return q; }
  function newDay() { var d = ns('', null); d.m = { b: ns(), l: ns(), s: newSide() }; d.open = false; return d; }
  function hydrateDay(sd) {
    var d = newDay(); if (!sd) return d;
    d.mode = sd.mode || ''; d.pick = byId[sd.pick] ? sd.pick : null; d.scale = sd.scale || 1; d.open = d.mode === 'cook' && !d.pick;
    ['b', 'l'].forEach(function (k) { var q = sd.m && sd.m[k]; if (q) { var s2 = ns(q.mode, byId[q.pick] ? q.pick : null); s2.scale = q.scale || 1; d.m[k] = s2; } });
    var sq = sd.m && sd.m.s, sid = sq ? sq.pick : sd.side;
    if (sid && byId[sid]) { d.m.s.pick = sid; d.m.s.scale = (sq && sq.scale) || d.scale || 1; }
    return d;
  }
  function saveDay(d) {
    var o = { mode: d.mode, pick: d.pick, scale: d.scale, m: {} };
    ['b', 'l'].forEach(function (k) { var q = d.m[k]; o.m[k] = { mode: q.mode, pick: q.pick, scale: q.scale }; });
    o.m.s = { pick: d.m.s.pick, scale: d.m.s.scale };
    return o;
  }
  function isEmptyDay(d) { return d.mode === '' && !d.pick && !d.m.s.pick && ['b', 'l'].every(function (k) { return d.m[k].mode === 'cook' && !d.m[k].pick; }); }
  var WEEKS = {}, weekKey = defaultWeekKey(), plan = [], checked = {}, extras = [], selDay = 0;
  function getWeek(key) { if (!WEEKS[key]) WEEKS[key] = { days: DAYS.map(function () { return newDay(); }), checked: {}, extras: [] }; return WEEKS[key]; }
  function enterWeek(key, keepSel) {
    weekKey = key; var w = getWeek(key); plan = w.days; checked = w.checked; extras = w.extras; setDates();
    if (!keepSel) { selDay = 0; for (var i = 0; i < 7; i++) { if (plan[i].mode === 'cook' && !plan[i].pick) { selDay = i; break; } } }
  }
  function S(i, k) { return (!k || k === 'd') ? plan[i] : plan[i].m[k]; }
  var meals = { b: false, l: false, d: true, s: false };
  function payload() {
    var weeks = {};
    Object.keys(WEEKS).forEach(function (k) {
      var w = WEEKS[k], ck = {};
      Object.keys(w.checked).forEach(function (x) { if (w.checked[x]) ck[x] = true; });
      if (w.days.every(isEmptyDay) && !Object.keys(ck).length && !w.extras.length) return;
      weeks[k] = { days: w.days.map(saveDay), checked: ck, extras: w.extras.map(function (x) { return { id: x.id, scale: x.scale }; }) };
    });
    return { meals: meals, weeks: weeks, prefs: { themes: prefs.themes, pantry: prefs.pantry } };
  }
  function applyDoc(doc, keepSel) {
    VERSION = doc.version || 0;
    meals = Object.assign({ b: false, l: false, d: true, s: false }, doc.meals || {});
    prefs = { themes: (doc.prefs && doc.prefs.themes) || null, pantry: (doc.prefs && doc.prefs.pantry) || null }; applyPrefs();
    WEEKS = {};
    Object.keys(doc.weeks || {}).forEach(function (k) {
      var w = doc.weeks[k];
      WEEKS[k] = { days: DAYS.map(function (_, i) { return hydrateDay((w.days || [])[i]); }), checked: w.checked || {}, extras: (w.extras || []).filter(function (x) { return byId[x.id]; }).map(function (x) { return { id: x.id, scale: x.scale || 1 }; }) };
    });
    enterWeek(weekKey, keepSel);
  }
  // when each recipe was last planned on a day that has already passed
  function computeMade() {
    var t0 = new Date(); t0 = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate());
    var last = {};
    R.forEach(function (r) { last[r.id] = r.lastMade ? parseISO(r.lastMade) : null; });
    function note(id, dt) { if (id && byId[id] && (!last[id] || dt > last[id])) last[id] = dt; }
    Object.keys(WEEKS).forEach(function (k) {
      var base = parseISO(k);
      WEEKS[k].days.forEach(function (d, i) {
        var dt = addDays(base, i); if (dt >= t0) return;
        if (d.mode === 'cook') { note(d.pick, dt); note(d.m.s.pick, dt); }
        ['b', 'l'].forEach(function (m) { if (d.m[m].mode === 'cook') note(d.m[m].pick, dt); });
      });
    });
    R.forEach(function (r) { r.made = last[r.id] ? Math.round((t0 - last[r.id]) / 864e5) : null; });
  }

  // ---------- saving and sharing ----------
  var READY = false, MODE = 'init', VERSION = 0, saveTimer = null, saving = false, dirty = false, editSeq = 0;
  function getPass() { try { return localStorage.getItem('food-pass') || ''; } catch (e) { return ''; } }
  function setPass(p) { try { if (p) localStorage.setItem('food-pass', p); else localStorage.removeItem('food-pass'); } catch (e) {} }
  function getHH() { try { return localStorage.getItem('food-hh') || ''; } catch (e) { return ''; } }
  function setHH(h) { try { if (h) localStorage.setItem('food-hh', h); else localStorage.removeItem('food-hh'); } catch (e) {} }
  var HOUSEHOLD = '', gateLogin = false;
  function authHeaders(extra) { var h = { 'x-passcode': getPass() }; if (getHH()) h['x-household'] = getHH(); if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; }); return h; }
  function canEdit() { return MODE === 'local' || !!getPass(); }
  function signOut() { setPass(''); setHH(''); location.reload(); }
  function setStatus(kind, text) { var el = document.getElementById('sync'); if (!el) return; el.dataset.s = kind; el.textContent = text; }
  function toast(msg) {
    var el = document.getElementById('toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 7000);
  }
  function askPass(msg, login) {
    gateLogin = !!login;
    document.getElementById('gate-title').textContent = login ? 'Sign in' : 'Family passcode';
    document.getElementById('gate-help').textContent = login ? 'Enter your household name and passcode. This phone or computer will remember them.' : 'Enter it once on this phone or computer to make changes. Anyone with the link can view.';
    document.getElementById('gate-hh').hidden = !login;
    document.getElementById('gate-cancel').hidden = !!login;
    document.getElementById('gate-go').textContent = login ? 'Sign in' : 'Unlock';
    document.getElementById('gate-msg').textContent = msg || '';
    document.getElementById('gate').hidden = false;
    setTimeout(function () { document.getElementById(login ? 'gate-hh' : 'gate-in').focus(); }, 50);
  }
  function save() { dirty = true; editSeq++; setStatus('saving', 'Saving…'); clearTimeout(saveTimer); saveTimer = setTimeout(flush, 500); }
  function flush() {
    if (MODE === 'local') {
      try { localStorage.setItem('food-local', JSON.stringify(payload())); } catch (e) {}
      dirty = false; setStatus('local', 'Saved on this device'); return;
    }
    if (saving) { saveTimer = setTimeout(flush, 300); return; }
    saving = true;
    var seq = editSeq, body = payload(); body.baseVersion = VERSION;
    fetch('/api/plan', { method: 'PUT', headers: authHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(body) }).then(function (r) {
      if (r.status === 401) { dirty = false; if (HOUSEHOLD) { signOut(); return; } setPass(''); setStatus('view', 'View only'); askPass('That passcode was not accepted.'); return; }
      if (r.status === 409) return r.json().then(function (j) { applyDoc(j.doc, true); dirty = false; setStatus('saved', 'Saved'); toast('Your partner changed the plan at the same moment. Their version is showing. Please redo your last change.'); render(); });
      if (!r.ok) throw new Error('save failed');
      return r.json().then(function (doc) { VERSION = doc.version; if (seq === editSeq) { dirty = false; setStatus('saved', 'Saved'); } });
    }).catch(function () { setStatus('error', 'Not saved, retrying…'); saveTimer = setTimeout(flush, 5000); }).then(function () { saving = false; });
  }
  function loadRemote() {
    return fetch('/api/plan', { cache: 'no-store', headers: authHeaders() }).then(function (r) {
      if (r.status === 401) return r.json().catch(function () { return {}; }).then(function (j) { if (j.login) return 'login'; throw new Error('no storage'); });
      if (!r.ok) throw new Error('no storage');
      return r.json();
    }).then(function (doc) {
      if (doc === 'login') { MODE = 'login'; setPass(''); setStatus('view', 'Signed out'); return; }
      MODE = 'remote'; HOUSEHOLD = doc.household || ''; applyDoc(doc);
      if (getPass() || HOUSEHOLD) setStatus('saved', 'Saved'); else setStatus('view', 'View only');
    }).catch(function () {
      MODE = 'local'; var d = null;
      try { d = JSON.parse(localStorage.getItem('food-local')); } catch (e) {}
      applyDoc(d || {}); setStatus('local', 'This device only');
    });
  }
  function poll() {
    if (MODE !== 'remote' || document.hidden || saving || dirty) return;
    fetch('/api/plan', { cache: 'no-store', headers: authHeaders() }).then(function (r) { if (r.status === 401 && HOUSEHOLD) { signOut(); return null; } return r.ok ? r.json() : null; }).then(function (doc) {
      if (doc && doc.version > VERSION) { applyDoc(doc, true); render(); }
    }).catch(function () {});
  }
  var MUT = ['pick', 'change', 'keep', 'scale', 'check', 'meal', 'xscale', 'xrm', 'resetthemes', 'resetpantry'];

  var SHORTCUT = 'Add Groceries', APPLE = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  var view = 'plan', sheet = null, rFilter = 'All', rMeal = 'all', rTag = '', rQuery = '';
  var shop = { mode: 'week', day: 0, rid: null, scale: 1 }, anyChecked = {};
  var TITLES = { plan: 'Plan the week', week: 'This week', shop: 'Groceries', recipes: 'Recipes', settings: 'Settings' };
  var ICONS = {
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/></svg>',
    plan: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    week: '<svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h9"/></svg>',
    shop: '<svg viewBox="0 0 24 24"><path d="M4 5h2l2 11h10l2-8H7"/><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></svg>',
    recipes: '<svg viewBox="0 0 24 24"><path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z"/><path d="M8 9h7M8 13h5"/></svg>'
  };

  function fmtMin(m) { var h = Math.floor(m / 60), r = m % 60; return h ? (h + ' hr' + (r ? ' ' + r + ' min' : '')) : m + ' min'; }
  function fmtQty(n) {
    var r = Math.round(n * 4) / 4, w = Math.floor(r), f = r - w;
    var fr = f === 0.25 ? '¼' : f === 0.5 ? '½' : f === 0.75 ? '¾' : '';
    if (w === 0) return fr || '¼';
    return String(w) + fr;
  }
  function unitLabel(u, q) { return u ? (' ' + u + (PLURAL[u] && q > 1 ? 's' : '')) : ''; }
  function madeLabel(r) { if (r.made == null) return 'Not made yet'; if (r.made < 14) return 'Made ' + r.made + ' days ago'; return 'Made ' + Math.floor(r.made / 7) + ' wks ago'; }
  function isPantry(name) { return PANTRY.indexOf(String(name).toLowerCase()) > -1; }

  function pickedElsewhere(i, k) { return plan.map(function (p, j) { var q = S(j, k); return j !== i && q.mode === 'cook' ? q.pick : null; }).filter(Boolean); }

  function shuffled(arr, seed) {
    var a = arr.slice(), x = seed;
    for (var k = a.length - 1; k > 0; k--) { x = (x * 9301 + 49297) % 233280; var j = Math.floor(x / 233280 * (k + 1)); var t = a[k]; a[k] = a[j]; a[j] = t; }
    return a;
  }
  var MEAL_KIND = { b: 'breakfast', l: 'lunch', d: 'dinner', s: 'side' };
  function hasStyle(r, n) { n = String(n).toLowerCase(); return String(r.c).toLowerCase() === n || (r.tags || []).indexOf(n) > -1; }
  function themeOf(i, k) { return k === 'd' ? THEMES[i] : null; }
  function sortRow(i, k) {
    if (themeOf(i, k) || S(i, k).sort !== 'cuisine') return '';
    var cur = S(i, k).cuisine || '';
    return '<div class="chips wrap" role="group" aria-label="Cuisine">' + [''].concat(Object.keys(GENRES)).map(function (g) {
      return '<button class="chip" data-a="cuis" data-i="' + i + '" data-mk="' + k + '" data-g="' + g + '" aria-pressed="' + (cur === g) + '">' + (g || 'All') + '</button>';
    }).join('') + '</div>';
  }
  function headCtl(i, k) {
    if (themeOf(i, k)) return '';
    var cur = S(i, k).sort || 'stale';
    var opt = function (v, l) { return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + l + '</option>'; };
    return '<div class="sort-row"><select class="pick-sel" id="sort-' + k + '-' + i + '" data-sel="sort" data-i="' + i + '" data-mk="' + k + '" aria-label="Order">' +
      opt('stale', 'Longest since made') + opt('random', 'Random') + opt('cuisine', 'By cuisine') + opt('all', 'Show all') + '</select>' +
      (cur === 'random' ? '<button class="link-btn" data-a="shuffle" data-i="' + i + '" data-mk="' + k + '">Shuffle</button>' : '') + '</div>';
  }
  function allLink(i, k) {
    if (!themeOf(i, k)) return '';
    var n = R.filter(function (r) { return r.meal === MEAL_KIND[k]; }).length;
    return '<button class="link-btn" data-a="all" data-i="' + i + '" data-mk="' + k + '">' + (S(i, k).all ? 'Show suggestions' : 'Show all ' + n + ' recipes') + '</button>';
  }
  function sugLabel(i, k) {
    var p = S(i, k), t = themeOf(i, k);
    if (t) return p.all ? 'All recipes' : 'Suggested for ' + t + ' night';
    var c = p.sort || 'stale';
    return c === 'cuisine' ? (p.cuisine || 'All cuisines') + ' · longest since made' : c === 'random' ? 'Random picks' : c === 'all' ? 'All recipes' : 'Longest since made';
  }
  function suggestions(i, k) {
    var p = S(i, k), theme = themeOf(i, k), used = k === 's' ? [] : pickedElsewhere(i, k);
    var pool = R.filter(function (r) { return r.meal === MEAL_KIND[k] && used.indexOf(r.id) < 0; });
    if (p.time === 'quick') pool = pool.filter(function (r) { return r.total <= 40; });
    if (p.time === 'long') pool = pool.filter(function (r) { return r.total > 40; });
    var stale = function (a, b) { return (b.made == null ? 9999 : b.made) - (a.made == null ? 9999 : a.made); };
    pool.sort(stale);
    var list;
    if (theme) {
      if (p.all) { list = pool; }
      else {
        var yes = pool.filter(function (r) { return hasStyle(r, theme); }), no = pool.filter(function (r) { return !hasStyle(r, theme); });
        list = yes.concat(no).slice(0, 4);
      }
    } else {
      var m = p.sort || 'stale';
      var fp = (m === 'cuisine' && p.cuisine) ? pool.filter(function (r) { return GENRES[p.cuisine].some(function (n) { return hasStyle(r, n); }); }) : pool;
      if (m === 'all') list = fp;
      else if (m === 'random') list = shuffled(fp, (p.seed || 1) * 131 + i * 17 + (k === 'b' ? 3 : k === 'l' ? 5 : 0)).slice(0, 4);
      else list = fp.slice(0, 4);
    }
    return list;
  }
  function optHtml(r, i, act, k) {
    return '<button class="opt" data-a="' + (act || 'pick') + '" data-i="' + i + '" data-mk="' + (k || 'd') + '" data-id="' + r.id + '"><span><span class="opt-title">' + r.t + '</span><span class="opt-sub" style="display:block">' + r.c + ' · ' + madeLabel(r) + '</span></span><span class="opt-time">' + fmtMin(r.total) + '</span></button>';
  }
  var mq = window.matchMedia ? window.matchMedia('(min-width: 900px)') : { matches: false };
  function isDesk() { return mq.matches; }
  var selDay = 5;

  function dayRecipes(i, onlyDinner) {
    var p = plan[i], out = [];
    ['b', 'l', 'd'].forEach(function (k) {
      if (!meals[k] || (onlyDinner && k !== 'd')) return;
      var q = S(i, k);
      if (q.mode === 'cook' && q.pick) {
        out.push({ r: byId[q.pick], s: q.scale });
        if (k === 'd' && meals.s && p.m.s.pick && byId[p.m.s.pick]) out.push({ r: byId[p.m.s.pick], s: p.m.s.scale });
      }
    });
    return out;
  }
  function dayMinutes(i) { return dayRecipes(i).reduce(function (t, x) { return t + x.r.total; }, 0); }
  function mealChips() { return ''; }
  function sideRow(i) {
    var d = plan[i];
    if (!meals.s || !meals.d || d.mode !== 'cook' || !d.pick || d.open) return '';
    var p = d.m.s, list = R.filter(function (r) { return r.meal === 'side'; });
    var h = '<div class="side-sec"><label class="slot-l side-l" for="side-' + i + '">Side</label><select class="pick-sel" id="side-' + i + '" data-sel="side" data-i="' + i + '"><option value="">No side</option>' +
      list.map(function (r) { return '<option value="' + r.id + '"' + (p.pick === r.id ? ' selected' : '') + '>' + r.t + ' · ' + fmtMin(r.total) + '</option>'; }).join('') + '</select>';
    if (p.pick && byId[p.pick]) {
      var r = byId[p.pick];
      h += '<div class="meta"><span>Prep ' + fmtMin(r.prep) + '</span><span>Total ' + fmtMin(r.total) + '</span><span>Serves ' + (r.serves * p.scale) + '</span></div>' +
        '<div class="row-tools">' + scaleSeg(i, 's', p) + '<button class="link-btn" data-a="view" data-id="' + r.id + '">View recipe</button></div>';
    }
    return h + '</div>';
  }
  function sideDetail(i) {
    var d = plan[i], p = d.m.s;
    if (!meals.s || d.mode !== 'cook' || !d.pick || d.open || !p.pick) return '';
    return '<div class="side-detail"><div class="slot-l side-l">Side recipe</div>' + detailHtml(byId[p.pick], p.scale) + '</div>';
  }
  function modeSel(i, p, k) {
    k = k || 'd';
    return '<select class="mode" id="mode-' + (k === 'd' ? '' : k + '-') + i + '" data-sel="mode" data-i="' + i + '" data-mk="' + k + '" data-m="' + (p.mode || 'none') + '" aria-label="' + DAYS[i] + ' ' + MEAL_NAME[k] + ' plan">' +
      '<option value=""' + (p.mode === '' ? ' selected' : '') + '>Not set</option><option value="cook"' + (p.mode === 'cook' ? ' selected' : '') + '>Cook</option><option value="left"' + (p.mode === 'left' ? ' selected' : '') + '>Leftovers</option><option value="out"' + (p.mode === 'out' ? ' selected' : '') + '>Take-out</option></select>';
  }
  function srcHtml(r) {
    var s = r.src || {}, none = !s.type || s.type === 'none';
    if (!s.label && !s.url) return '';
    var lbl = s.label || (s.type === 'web' ? 'Open the web page' : s.type === 'pdf' ? 'Open the PDF' : 'Open the photo');
    var inner = s.url ? '<a href="' + s.url + '" target="_blank" rel="noopener">' + lbl + '</a>' : lbl;
    return '<div class="src"><b>Original' + (none ? '' : ' · ' + s.type) + '</b>' + inner + '</div>';
  }
  function detailHtml(r, s) {
    return '<div class="detail"><div class="detail-head"><span class="tag">' + r.c + '</span><h2>' + r.t + '</h2></div>' +
      '<div class="facts"><div class="fact"><b>' + fmtMin(r.prep) + '</b><span>Prep</span></div><div class="fact"><b>' + fmtMin(r.total) + '</b><span>Total</span></div><div class="fact"><b>' + (r.serves * s) + '</b><span>Servings</span></div></div>' +
      '<div class="sheet-cols"><div><h3>Ingredients</h3><ul class="ing">' + r.ing.map(function (g) { return '<li><span class="q">' + fmtQty(g[0] * s) + unitLabel(g[1], g[0] * s) + '</span><span>' + g[2] + '</span>' + (isPantry(g[2]) ? '<span class="pt">pantry</span>' : '') + '</li>'; }).join('') + '</ul></div>' +
      '<div><h3>Steps</h3><ol class="steps">' + r.steps.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ol></div></div>' +
      srcHtml(r) + '</div>';
  }
  var MEAL_NAME = { b: 'Breakfast', l: 'Lunch', d: 'Dinner' };
  function enabledKeys() { return ['b', 'l', 'd'].filter(function (k) { return meals[k]; }); }
  function openKey(p) { return p.x !== undefined ? p.x : (isDesk() ? 'd' : null); }
  function mealInfo(i, k) {
    var p = plan[i], q = S(i, k), o = { k: k, label: MEAL_NAME[k], text: 'Not set', time: 0, kind: 'empty', id: null, sub: '', r: null, side: null };
    if (q.mode === 'cook') { if (!q.pick) { o.text = 'Choose a recipe'; return o; } }
    else if (q.mode === 'left') { o.text = 'Leftovers'; o.kind = 'left'; return o; }
    else if (q.mode === 'out') { o.text = 'Take-out'; o.kind = 'out'; return o; }
    else return o;
    var r = byId[q.pick];
    o.text = r.t; o.time = r.total; o.kind = 'recipe'; o.id = q.pick; o.r = r;
    o.sub = r.c + ' · serves ' + r.serves * q.scale;
    if (k === 'd' && meals.s && p.m.s.pick && byId[p.m.s.pick]) o.side = byId[p.m.s.pick];
    return o;
  }
  function secHead(i, k, open) {
    var m = mealInfo(i, k);
    return '<button class="mhead" data-a="tog" data-i="' + i + '" data-k="' + k + '" aria-expanded="' + open + '"><span class="slot-l">' + m.label + '</span><span class="mname ' + m.kind + '">' + m.text + (m.side ? ' + ' + m.side.t : '') + '</span><span class="mtime">' + (m.time ? fmtMin(m.time) : '') + '</span><span class="chev" aria-hidden="true">›</span></button>';
  }
  function lineBtn(i, k) {
    var m = mealInfo(i, k), cur = i === selDay && enabledKeys().length > 1 && openKey(plan[i]) === k;
    return '<button class="ln" data-a="selmeal" data-i="' + i + '" data-k="' + k + '"' + (cur ? ' aria-current="true"' : '') + '><span class="lk">' + m.label + '</span><span class="lv ' + m.kind + '">' + m.text + (m.side ? ' + ' + m.side.t : '') + '</span><span class="lt">' + (m.time ? fmtMin(m.time) : '') + '</span></button>';
  }
  function scaleSeg(i, k, p) {
    return '<div class="seg" role="group" aria-label="Scale">' + [1,2,3].map(function (x) { return '<button data-a="scale" data-i="' + i + '" data-mk="' + k + '" data-s="' + x + '" aria-pressed="' + (p.scale === x) + '">' + x + '×</button>'; }).join('') + '</div>';
  }
  function suggestBlock(i, k, flat) {
    var p = S(i, k), list = suggestions(i, k);
    return '<div class="suggest"' + (flat ? ' style="border-top:0;padding-top:0"' : '') + '><div class="suggest-head"><span class="lbl">' + sugLabel(i, k) + '</span>' + headCtl(i, k) + '</div>' +
      sortRow(i, k) + '<div class="opts">' + (list.length ? list.map(function (x) { return optHtml(x, i, null, k); }).join('') : '<p class="empty-note">No recipes left for this choice.</p>') + '</div>' +
      '<div class="row-tools">' + allLink(i, k) + (p.pick ? '<button class="link-btn" data-a="keep" data-i="' + i + '" data-mk="' + k + '">Keep ' + byId[p.pick].t + '</button>' : '') + '</div></div>';
  }
  function backBtn(i, k) { return '<button class="link-btn" data-a="change" data-i="' + i + '" data-mk="' + k + '">← Back to suggestions</button>'; }
  function mealPane(i, k) {
    var p = S(i, k);
    if (p.mode === '') return '<p class="empty-note">Choose Cook, Leftovers or Take-out for this ' + (k === 'd' ? 'night from the list' : 'meal') + '.</p>';
    if (p.mode === 'left') return '<p class="empty-note">Leftovers. Nothing to cook.</p>';
    if (p.mode === 'out') return '<p class="empty-note">Take-out. Nothing to cook.</p>';
    if (p.pick && !p.open) return '<div class="row-tools">' + scaleSeg(i, k, p) + backBtn(i, k) + '</div>' + detailHtml(byId[p.pick], p.scale) + (k === 'd' ? sideRow(i) + sideDetail(i) : '');
    return suggestBlock(i, k, true);
  }
  function modeRow(i, k) { return '<div class="slot"><label class="slot-l" for="mode-' + (k === 'd' ? '' : k + '-') + i + '">Plan</label>' + modeSel(i, S(i, k), k) + '</div>'; }
  function paneBody(i, k) { return (k === 'd' ? '' : modeRow(i, k)) + mealPane(i, k); }
  function paneHtml(i) {
    var p = plan[i], theme = THEMES[i], keys = enabledKeys();
    var head = '<div class="pane-head"><div class="day-name">' + DAYS[i] + '</div><div class="day-date">' + DATES[i] + (theme ? ' · <span class="theme-note">' + theme + ' night</span>' : '') + '</div></div>';
    if (keys.length === 1) return head + paneBody(i, keys[0]);
    var ok = openKey(p);
    return head + keys.map(function (k) { var o = ok === k; return '<section class="msec">' + secHead(i, k, o) + (o ? '<div class="mbody">' + paneBody(i, k) + '</div>' : '') + '</section>'; }).join('');
  }
  var XLABEL = { dessert: 'Desserts', baking: 'Baking', drink: 'Drinks', other: 'Other', dinner: 'Dinners', breakfast: 'Breakfasts', lunch: 'Lunches', side: 'Sides' };
  function extrasHtml() {
    var have = extras.map(function (x) { return x.id; });
    var groups = ['dessert', 'baking', 'drink', 'other', 'dinner', 'breakfast', 'lunch', 'side'];
    var opts = groups.map(function (g) {
      var list = R.filter(function (r) { return r.meal === g && have.indexOf(r.id) < 0; });
      return list.length ? '<optgroup label="' + XLABEL[g] + '">' + list.map(function (r) { return '<option value="' + r.id + '">' + r.t + '</option>'; }).join('') + '</optgroup>' : '';
    }).join('');
    var h = '<section class="extras"><h2 class="ex-h">Extras</h2><p class="intro" style="margin:0 0 10px">Smoothies, muffins, dessert, anything not tied to a night. Their ingredients go on this week\'s grocery list.</p>';
    extras.forEach(function (x, n) {
      var r = byId[x.id];
      h += '<div class="ex-row"><button class="picked-title" data-a="view" data-id="' + r.id + '">' + r.t + '</button><div class="row-tools"><div class="seg" role="group" aria-label="Scale">' + [1, 2, 3].map(function (m) { return '<button data-a="xscale" data-n="' + n + '" data-s="' + m + '" aria-pressed="' + (x.scale === m) + '">' + m + '×</button>'; }).join('') + '</div><button class="link-btn" data-a="xrm" data-n="' + n + '">Remove</button></div></div>';
    });
    if (opts) h += '<select class="pick-sel" data-sel="xadd" aria-label="Add an extra"><option value="">+ Add an extra</option>' + opts + '</select>';
    return h + '</section>';
  }
  function renderPlanDesk() {
    var h = mealChips() + '<div class="split"><aside class="daylist" aria-label="Days">';
    plan.forEach(function (p, i) {
      h += '<div class="drow"' + (i === selDay ? ' aria-current="true"' : '') + '><div class="drow-top"><button class="drow-day" data-a="sel" data-i="' + i + '"><span class="d">' + DAYS[i] + ' <small>' + DATES[i] + (THEMES[i] ? ' · ' + THEMES[i] : '') + '</small></span></button>' + (meals.d ? modeSel(i, p, 'd') : '') + '</div><div class="lines">' + enabledKeys().map(function (k) { return lineBtn(i, k); }).join('') + '</div></div>';
    });
    return h + '</aside><section class="pane">' + paneHtml(selDay) + '</section></div>' + extrasHtml();
  }

  function mobileMeal(i, k) {
    var p = S(i, k);
    if (p.mode !== 'cook') return '';
    if (p.pick && !p.open) {
      var r = byId[p.pick];
      return '<div class="picked"><div class="picked-row"><button class="picked-title" data-a="view" data-id="' + r.id + '">' + r.t + '</button><span class="tag">' + r.c + '</span></div>' +
        '<div class="meta"><span>Prep ' + fmtMin(r.prep) + '</span><span>Total ' + fmtMin(r.total) + '</span><span>Serves ' + (r.serves * p.scale) + '</span></div>' +
        '<div class="row-tools">' + scaleSeg(i, k, p) + backBtn(i, k) + '</div>' + (k === 'd' ? sideRow(i) : '') + '</div>';
    }
    return suggestBlock(i, k, false);
  }
  function mobileBody(i, k, selInHead) {
    return ((k === 'd' && selInHead) ? '' : modeRow(i, k)) + mobileMeal(i, k);
  }
  function renderPlan() {
    if (isDesk()) return renderPlanDesk();
    var h = mealChips() + '<p class="intro">Choose what each night looks like. Cook nights suggest a few recipes that fit the day.</p><div class="days">';
    var keys = enabledKeys(), single = keys.length === 1, selInHead = single && keys[0] === 'd';
    plan.forEach(function (p, i) {
      var theme = THEMES[i];
      h += '<section class="day"><div class="day-head"><div><div class="day-name">' + DAYS[i] + '</div><div class="day-date">' + DATES[i] + (theme ? ' · <span class="theme-note">' + theme + ' night</span>' : '') + '</div></div>' + (selInHead ? modeSel(i, p, 'd') : '') + '</div>';
      if (single) h += mobileBody(i, keys[0], selInHead);
      else {
        var ok = openKey(p);
        h += '<div class="msecs">' + keys.map(function (k) { var o = ok === k; return '<div class="msec">' + secHead(i, k, o) + (o ? '<div class="mbody">' + mobileBody(i, k, false) + '</div>' : '') + '</div>'; }).join('') + '</div>';
      }
      h += '</section>';
    });
    return h + '</div>' + extrasHtml();
  }

  function weekBox(i, k) {
    var m = mealInfo(i, k);
    var sub = m.kind === 'recipe' ? '' : m.kind === 'left' ? 'Reheat, no cooking' : m.kind === 'out' ? 'No cooking tonight' : '';
    var inner = '<span class="wb-top"><span class="wb-k">' + m.label + '</span><span class="wb-t">' + (m.time ? fmtMin(m.time) : '') + '</span></span><span class="wb-n">' + m.text + '</span>' +
      (sub ? '<span class="wb-s">' + sub + '</span>' : '') + (m.side ? '<span class="wb-sub">with ' + m.side.t + '</span>' : '');
    var cls = 'wbox ' + m.kind;
    return m.id ? '<button class="' + cls + '" data-a="view" data-id="' + m.id + '">' + inner + '</button>' : '<div class="' + cls + '">' + inner + '</div>';
  }
  function renderWeek() {
    var mins = 0, nights = 0, keys = enabledKeys();
    plan.forEach(function (p, i) { mins += dayMinutes(i); if (meals.d && p.mode === 'cook' && p.pick) nights++; });
    var h = '<div class="sum">' + (meals.d ? '<div><b>' + nights + '</b><span>cooking nights</span></div>' : '') + '<div><b>' + fmtMin(mins) + '</b><span>total cook time</span></div></div><div class="wk">';
    plan.forEach(function (p, i) {
      h += '<div class="wk-day"><div class="wk-dn"><b>' + DAYS[i] + '</b><small>' + DATES[i] + '</small></div><div class="wk-boxes" style="--n:' + keys.length + '">' + keys.map(function (k) { return weekBox(i, k); }).join('') + '</div></div>';
    });
    h += '</div>';
    if (extras.length) h += '<section class="extras"><h2 class="ex-h">Extras</h2>' + extras.map(function (x) { var r = byId[x.id]; return '<button class="wrow" style="grid-template-columns:minmax(0,1fr) auto" data-a="view" data-id="' + r.id + '"><span><span class="t" style="display:block">' + r.t + (x.scale > 1 ? ' (' + x.scale + '×)' : '') + '</span><span class="s">' + (XLABEL[r.meal] || r.meal).toLowerCase() + ' · ' + r.c + '</span></span><span class="m">' + fmtMin(r.total) + '</span></button>'; }).join('') + '</section>';
    return h;
  }

  function collect(list) {
    var map = {}, order = [], hidden = {};
    list.forEach(function (x) {
      x.r.ing.forEach(function (g) {
        if (isPantry(g[2])) { hidden[g[2]] = 1; return; }
        var key = (g[2] + '|' + g[1]).toLowerCase().replace(/[^a-z0-9|]/g, '');
        if (!map[key]) { map[key] = { key: key, name: g[2], unit: g[1], q: 0, a: g[3], from: [] }; order.push(key); }
        map[key].q += g[0] * x.s;
        if (map[key].from.indexOf(x.r.t) < 0) map[key].from.push(x.r.t);
      });
    });
    return { items: order.map(function (k) { return map[k]; }), hidden: Object.keys(hidden) };
  }
  function weekItems() { var all = []; plan.forEach(function (p, i) { all = all.concat(dayRecipes(i)); }); extras.forEach(function (x) { all.push({ r: byId[x.id], s: x.scale }); }); return collect(all); }
  function oneItems(i) { return collect(dayRecipes(i, true)); }

  function shopData() {
    if (shop.mode === 'any' && byId[shop.rid]) return collect([{ r: byId[shop.rid], s: shop.scale }]);
    return shop.mode === 'one' ? oneItems(shop.day) : weekItems();
  }
  function shopText() {
    var ck = shop.mode === 'any' ? anyChecked : checked, out = [];
    Object.keys(AISLES).forEach(function (a) {
      shopData().items.filter(function (x) { return x.a === a && !ck[x.key]; }).forEach(function (x) {
        out.push((fmtQty(x.q) + unitLabel(x.unit, x.q) + ' ' + x.name).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim());
      });
    });
    return out.join('\n');
  }
  function renderShop() {
    if (shop.mode === 'any' && !byId[shop.rid]) shop.mode = 'week';
    var planned = []; plan.forEach(function (p, i) { if (meals.d && p.mode === 'cook' && p.pick) planned.push(i); });
    if (shop.mode !== 'any' && !planned.length && !weekItems().items.length) return '<p class="intro">Pick a recipe on at least one night to build a list.</p>';
    if (!planned.length && shop.mode !== 'any') shop.mode = 'week';
    if (planned.length && planned.indexOf(shop.day) < 0) shop.day = planned[0];
    var any = shop.mode === 'any', ck = any ? anyChecked : checked;
    var data = shopData();
    var h = any ? '<div class="shop-ctl"><div class="set-row" style="border:0;padding:0"><div><div class="set-t">' + byId[shop.rid].t + (shop.scale > 1 ? ' (' + shop.scale + '×)' : '') + '</div><div class="set-s">One-off list. Checks here are not saved to the week.</div></div><button class="link-btn" data-a="smode" data-m="week">Back to week list</button></div></div>' : '<div class="shop-ctl"><div class="seg wide" role="group" aria-label="List type"><button data-a="smode" data-m="week" aria-pressed="' + (shop.mode === 'week') + '">Shop for the week</button><button data-a="smode" data-m="one" aria-pressed="' + (shop.mode === 'one') + '">Shop for one recipe</button></div>';
    if (shop.mode === 'one') {
      h += '<select class="pick-sel" id="shop-day" data-sel="shopday" aria-label="Recipe">' + planned.map(function (i) { return '<option value="' + i + '"' + (i === shop.day ? ' selected' : '') + '>' + DAYS[i] + ': ' + byId[plan[i].pick].t + (plan[i].scale > 1 ? ' (' + plan[i].scale + '×)' : '') + '</option>'; }).join('') + '</select>';
    }
    if (!any) h += '</div>';
    h += '<div class="aisles">';
    Object.keys(AISLES).forEach(function (a) {
      var rows = data.items.filter(function (x) { return x.a === a; });
      if (!rows.length) return;
      var left = rows.filter(function (x) { return !ck[x.key]; }).length;
      h += '<section class="aisle"><h3><span>' + AISLES[a] + '</span><span>' + left + ' left</span></h3><ul class="items">';
      rows.forEach(function (x) {
        h += '<li><button class="item" data-a="check" data-k="' + x.key + '" aria-pressed="' + (!!ck[x.key]) + '"><span class="box" aria-hidden="true">✓</span><span class="txt"><span class="q">' + fmtQty(x.q) + unitLabel(x.unit, x.q) + '</span> ' + x.name + (x.from.length > 1 ? '<span class="from">for ' + x.from.join(' and ') + '</span>' : '') + '</span></button></li>';
      });
      h += '</ul></section>';
    });
    h += '</div>';
    h += '<div class="row-tools" style="margin-top:18px;justify-content:flex-start;gap:6px 20px;flex-wrap:wrap">' + (APPLE ? '<button class="btn" data-a="reminders">Send to Reminders</button>' : '') + '<button class="' + (APPLE ? 'link-btn' : 'btn') + '" data-a="copylist">Copy list</button>' + (navigator.share ? '<button class="link-btn" data-a="sharelist">Share</button>' : '') + '</div>';
    h += '<details class="pantry"><summary>' + data.hidden.length + ' pantry staples hidden</summary><p>' + data.hidden.join(', ') + '. Change this list in the settings.txt file.</p></details>';
    return h;
  }

  function renderRecipes() {
    var h = '<input class="search" id="rsearch" type="search" placeholder="Search recipes" aria-label="Search recipes" value="' + esc(rQuery) + '"><div class="chips" role="group" aria-label="Cuisine">' + CUISINES.map(function (c) { return '<button class="chip" data-a="rf" data-c="' + c + '" aria-pressed="' + (rFilter === c) + '">' + c + '</button>'; }).join('') + '</div><div class="chips" role="group" aria-label="Meal" style="padding-top:0">' + [['all','All'],['dinner','Dinner'],['breakfast','Breakfast'],['lunch','Lunch'],['side','Sides'],['dessert','Desserts'],['baking','Baking'],['drink','Drinks'],['other','Other']].filter(function (m) { return m[0] === 'all' || R.some(function (r) { return r.meal === m[0]; }); }).map(function (m) { return '<button class="chip" data-a="rm" data-m="' + m[0] + '" aria-pressed="' + (rMeal === m[0]) + '">' + m[1] + '</button>'; }).join('') + '</div><div class="rlist">';
    var tagSet = []; R.forEach(function (r) { (r.tags || []).forEach(function (t) { if (tagSet.indexOf(t) < 0) tagSet.push(t); }); }); tagSet.sort();
    if (rTag && tagSet.indexOf(rTag) < 0) rTag = '';
    if (tagSet.length) h = h.replace('<div class="rlist">', '<div class="chips" role="group" aria-label="Tags" style="padding-top:0">' + ['Any tag'].concat(tagSet).map(function (t) { var v = t === 'Any tag' ? '' : t; return '<button class="chip" data-a="rt" data-t="' + esc(v) + '" aria-pressed="' + (rTag === v) + '">' + esc(t) + '</button>'; }).join('') + '</div><div class="rlist">');
    R.filter(function (r) { return (rFilter === 'All' || r.c === rFilter) && (rMeal === 'all' || r.meal === rMeal) && (!rTag || (r.tags || []).indexOf(rTag) > -1); }).forEach(function (r) {
      var q = (r.t + ' ' + r.c + ' ' + r.meal + ' ' + (r.tags || []).join(' ')).toLowerCase().replace(/&amp;/g, '&');
      h += '<button class="wrow"' + (rQuery && q.indexOf(rQuery.toLowerCase()) < 0 ? ' hidden' : '') + ' data-q="' + esc(q) + '" style="grid-template-columns:minmax(0,1fr) auto" data-a="view" data-id="' + r.id + '"><span><span class="t" style="display:block">' + r.t + '</span><span class="s">' + (r.meal === 'dinner' ? '' : (r.meal === 'side' ? 'side' : r.meal) + ' · ') + r.c + ' · prep ' + fmtMin(r.prep) + ' · ' + madeLabel(r) + '</span></span><span class="m">' + fmtMin(r.total) + '</span></button>';
    });
    return h + '</div>';
  }

  function renderSheet() {
    var el = document.getElementById('sheet');
    if (!sheet) { el.hidden = true; el.innerHTML = ''; document.body.style.overflow = ''; return; }
    var r = byId[sheet.id], s = sheet.scale;
    var h = '<div class="sheet-in"><div class="sheet-top"><span class="tag">' + r.c + '</span><button class="link-btn" data-a="close">Close</button></div><h2>' + r.t + '</h2>' +
      '<div class="facts"><div class="fact"><b>' + fmtMin(r.prep) + '</b><span>Prep</span></div><div class="fact"><b>' + fmtMin(r.total) + '</b><span>Total</span></div><div class="fact"><b>' + (r.serves * s) + '</b><span>Servings</span></div></div>' +
      '<div class="row-tools"><span class="meta">Recipe makes ' + r.serves + '</span><div class="seg" role="group" aria-label="Scale">' + [1,2,3].map(function (x) { return '<button data-a="sscale" data-s="' + x + '" aria-pressed="' + (s === x) + '">' + x + '×</button>'; }).join('') + '</div></div>' +
      '<div class="sheet-cols"><div><h3>Ingredients</h3><ul class="ing">' + r.ing.map(function (g) { return '<li><span class="q">' + fmtQty(g[0] * s) + unitLabel(g[1], g[0] * s) + '</span><span>' + g[2] + '</span>' + (isPantry(g[2]) ? '<span class="pt">pantry</span>' : '') + '</li>'; }).join('') + '</ul></div>' +
      '<div><h3>Steps</h3><ol class="steps">' + r.steps.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ol></div></div>' +
      '<div style="padding-top:16px"><button class="btn" data-a="shopthis">Shop for this recipe</button></div>' + srcHtml(r) + '</div>';
    el.innerHTML = h; el.hidden = false; el.scrollTop = 0; document.body.style.overflow = 'hidden';
  }

  function styleOptions() {
    var out = [], seen = {};
    R.forEach(function (r) { [r.c].concat(r.tags || []).forEach(function (n) { var k = String(n).toLowerCase(); if (n && !seen[k]) { seen[k] = 1; out.push(n); } }); });
    return out.sort(function (a, b) { return String(a).localeCompare(String(b)); });
  }
  function themesHtml() {
    var opts = styleOptions(), full = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    var rows = full.map(function (d, i) {
      var cur = THEMES[i] || '', has = !cur || opts.some(function (o) { return o.toLowerCase() === String(cur).toLowerCase(); });
      return '<div class="set-row"><label class="set-t" for="theme-' + i + '">' + d + '</label><select class="pick-sel set-sel" id="theme-' + i + '" data-sel="theme" data-d="' + i + '"><option value="">No theme</option>' +
        (has ? '' : '<option value="' + esc(cur) + '" selected>' + esc(cur) + '</option>') +
        opts.map(function (o) { return '<option value="' + esc(o) + '"' + (String(cur).toLowerCase() === o.toLowerCase() ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>';
    }).join('');
    return '<h2 class="set-h">Theme nights</h2><p class="intro" style="margin:0 0 4px">Pick a cuisine or tag for a night and it is suggested first when you plan that night.' + (prefs.themes ? ' <button class="link-btn" data-a="resetthemes" style="display:inline;min-height:0;padding:0">Use the site defaults</button>' : '') + '</p><div class="setlist">' + rows + '</div>';
  }
  function pantryHtml() {
    return '<h2 class="set-h">Pantry staples</h2><p class="intro" style="margin:0 0 8px">Left off your grocery lists. Type ingredient names as they appear in the recipes, separated by commas.' + (prefs.pantry ? ' <button class="link-btn" data-a="resetpantry" style="display:inline;min-height:0;padding:0">Use the site defaults</button>' : '') + '</p>' +
      '<textarea class="pantry-box" id="pantry-in" data-sel="pantry" rows="4" aria-label="Pantry staples">' + esc(PANTRY.join(', ')) + '</textarea>';
  }
  function renderSettings() {
    var rows = [['d', 'Dinner', 'Plan a recipe, leftovers or take-out for each night.'], ['b', 'Breakfast', 'Add a breakfast to each day.'], ['l', 'Lunch', 'Add a lunch to each day.'], ['s', 'Sides', 'Pick an optional side on dinner nights.']];
    var access;
    if (MODE === 'remote' && HOUSEHOLD) {
      access = '<div class="set-row"><div><div class="set-t">Signed in</div><div class="set-s">Household: ' + esc(HOUSEHOLD) + '. Everyone in this household sees the same plan.</div></div><button class="link-btn" data-a="logout">Sign out</button></div>';
    } else if (MODE === 'remote') {
      access = getPass()
        ? '<div class="set-row"><div><div class="set-t">Changes</div><div class="set-s">Unlocked on this device. Your partner sees every change.</div></div><button class="link-btn" data-a="lock">Lock</button></div>'
        : '<div class="set-row"><div><div class="set-t">Changes</div><div class="set-s">View only on this device. Enter the family passcode to make changes.</div></div><button class="link-btn" data-a="unlock">Unlock</button></div>';
    } else {
      access = '<div class="set-row"><div><div class="set-t">Sharing</div><div class="set-s">Shared storage is not connected yet, so the plan is saved on this device only. See step 4 of the setup guide.</div></div></div>';
    }
    return '<p class="intro">Choose which meals to plan. Turning one off hides it. Anything you already picked is kept.</p><div class="setlist">' + rows.map(function (r) {
      return '<div class="set-row"><div><div class="set-t">' + r[1] + '</div><div class="set-s">' + r[2] + '</div></div><button class="sw" role="switch" aria-checked="' + meals[r[0]] + '" aria-label="' + r[1] + '" data-a="meal" data-k="' + r[0] + '"></button></div>';
    }).join('') + access + '</div>' + themesHtml() + pantryHtml() +
      '<div style="padding-top:12px"><button class="link-btn" data-a="tab" data-v="plan">← Back to plan</button></div>';
  }
  function render() {
    if (!READY) return;
    computeMade();
    document.getElementById('h-title').textContent = TITLES[view];
    var who = document.getElementById('who'); who.hidden = !HOUSEHOLD; document.getElementById('who-name').textContent = HOUSEHOLD;
    document.getElementById('wk-label').textContent = weekLabel();
    document.getElementById('wk-today').hidden = weekKey === defaultWeekKey();
    var m = document.getElementById('main');
    m.innerHTML = view === 'plan' ? renderPlan() : view === 'week' ? renderWeek() : view === 'shop' ? renderShop() : view === 'settings' ? renderSettings() : renderRecipes();
    var ss = document.getElementById('side-set');
    if (ss) ss.innerHTML = '<button class="tab" data-a="settings"' + (view === 'settings' ? ' aria-current="page"' : '') + '>' + ICONS.settings + 'Settings</button>';
    document.getElementById('foot').innerHTML = view === 'settings' ? '' : '<button class="link-btn" data-a="settings">Settings</button>';
    var t = document.getElementById('tabs');
    t.innerHTML = [['plan','Plan'],['week','Week'],['shop','Groceries'],['recipes','Recipes']].map(function (x) {
      return '<button class="tab" data-a="tab" data-v="' + x[0] + '"' + (view === x[0] ? ' aria-current="page"' : '') + '>' + ICONS[x[0]] + x[1] + '</button>';
    }).join('');
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]'); if (!b) return;
    var a = b.dataset.a, i = +b.dataset.i;
    if (!READY) return;
    var local = a === 'check' && view === 'shop' && shop.mode === 'any';
    if (MUT.indexOf(a) > -1 && !local && !canEdit()) { askPass(); return; }
    if (a === 'tab') { view = b.dataset.v; try { history.replaceState(null, '', '#' + view); } catch (err) {} window.scrollTo(0, 0); }
    else if (a === 'wk') { var d = +b.dataset.d; enterWeek(d === 0 ? defaultWeekKey() : isoOf(addDays(parseISO(weekKey), 7 * d))); }
    else if (a === 'logout') { signOut(); return; }
    else if (a === 'lock') { setPass(''); setStatus('view', 'View only'); }
    else if (a === 'unlock') { askPass(); return; }
    else if (a === 'settings') { view = 'settings'; window.scrollTo(0, 0); }
    else if (a === 'pick') { var P = S(i, b.dataset.mk); P.pick = b.dataset.id; P.open = false; P.all = false; P.scale = 1; }
    else if (a === 'sel') { selDay = i; }
    else if (a === 'selmeal') { selDay = i; plan[i].x = b.dataset.k; }
    else if (a === 'tog') { plan[i].x = openKey(plan[i]) === b.dataset.k ? null : b.dataset.k; }
    else if (a === 'change') { S(i, b.dataset.mk).open = true; }
    else if (a === 'keep') { S(i, b.dataset.mk).open = false; }
    else if (a === 'scale') { S(i, b.dataset.mk).scale = +b.dataset.s; }
    else if (a === 'time') { S(i, b.dataset.mk).time = b.dataset.t; }
    else if (a === 'all') { var Q = S(i, b.dataset.mk); Q.all = !Q.all; }
    else if (a === 'cuis') { S(i, b.dataset.mk).cuisine = b.dataset.g || null; }
    else if (a === 'shuffle') { var Z = S(i, b.dataset.mk); Z.seed = (Z.seed || 1) + 1; }
    else if (a === 'view') { sheet = { id: b.dataset.id, scale: 1 }; renderSheet(); return; }
    else if (a === 'close') { sheet = null; renderSheet(); return; }
    else if (a === 'sscale') { sheet.scale = +b.dataset.s; renderSheet(); return; }
    else if (a === 'smode') { shop.mode = b.dataset.m; }
    else if (a === 'check') { var tgt = local ? anyChecked : checked; tgt[b.dataset.k] = !tgt[b.dataset.k]; }
    else if (a === 'reminders') {
      var rt = shopText();
      if (!rt) { toast('Nothing left to send. Everything is checked off.'); return; }
      location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent(SHORTCUT) + '&input=text&text=' + encodeURIComponent(rt);
      return;
    }
    else if (a === 'copylist' || a === 'sharelist') {
      var txt = shopText(), n = txt ? txt.split('\n').length : 0;
      if (!n) { toast('Nothing left to copy. Everything is checked off.'); return; }
      if (a === 'sharelist') { try { navigator.share({ title: 'Groceries', text: txt }); } catch (err) {} return; }
      var done = function () { toast('Copied ' + n + ' item' + (n === 1 ? '' : 's') + '. Paste into Reminders or Notes.'); };
      var manual = function () {
        var ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (err2) { toast('Could not copy. Use Share instead.'); } document.body.removeChild(ta);
      };
      try { navigator.clipboard.writeText(txt).then(done, manual); } catch (err) { manual(); }
      return;
    }
    else if (a === 'resetthemes') { prefs.themes = null; applyPrefs(); }
    else if (a === 'resetpantry') { prefs.pantry = null; applyPrefs(); }
    else if (a === 'xscale') { extras[+b.dataset.n].scale = +b.dataset.s; }
    else if (a === 'xrm') { extras.splice(+b.dataset.n, 1); }
    else if (a === 'shopthis') { shop = { mode: 'any', day: shop.day, rid: sheet.id, scale: sheet.scale }; anyChecked = {}; sheet = null; renderSheet(); view = 'shop'; window.scrollTo(0, 0); }
    else if (a === 'rf') { rFilter = b.dataset.c; }
    else if (a === 'rm') { rMeal = b.dataset.m; }
    else if (a === 'rt') { rTag = b.dataset.t; }
    else if (a === 'meal') { var mk = b.dataset.k, nv = !meals[mk]; if (!nv && mk !== 's' && !['b','l','d'].filter(function (x) { return x !== mk && meals[x]; }).length) nv = true; meals[mk] = nv; }
    if (MUT.indexOf(a) > -1 && !local) save();
    render();
  });
  document.addEventListener('change', function (e) {
    var s = e.target.closest('[data-sel]'); if (!s) return;
    if ((s.dataset.sel === 'mode' || s.dataset.sel === 'side' || s.dataset.sel === 'xadd' || s.dataset.sel === 'theme' || s.dataset.sel === 'pantry') && !canEdit()) { askPass(); render(); return; }
    if (s.dataset.sel === 'mode') {
      var i = +s.dataset.i, mk = s.dataset.mk || 'd', p = S(i, mk);
      selDay = i; p.mode = s.value; p.open = (s.value === 'cook' && !p.pick); p.all = false;
      if (s.value !== 'cook') { p.pick = null; p.scale = 1; if (mk === 'd') { plan[i].m.s.pick = null; plan[i].m.s.open = false; plan[i].m.s.scale = 1; } }
    } else if (s.dataset.sel === 'theme') {
      var t2 = {}; Object.keys(THEMES).forEach(function (k) { t2[k] = THEMES[k]; });
      if (s.value) t2[s.dataset.d] = s.value; else delete t2[s.dataset.d];
      prefs.themes = t2; applyPrefs();
    } else if (s.dataset.sel === 'pantry') {
      var seen = {}, list = s.value.split(/[,\n]/).map(function (x) { return x.trim().toLowerCase(); }).filter(function (x) { if (!x || seen[x]) return false; seen[x] = 1; return true; });
      prefs.pantry = list; applyPrefs();
    } else if (s.dataset.sel === 'side') {
      var sp = plan[+s.dataset.i].m.s, nv2 = s.value && byId[s.value] ? s.value : null;
      if (sp.pick !== nv2) { sp.pick = nv2; sp.scale = 1; } sp.open = false;
    } else if (s.dataset.sel === 'sort') {
      var q = S(+s.dataset.i, s.dataset.mk); q.sort = s.value; if (s.value === 'random') q.seed = (q.seed || 1) + 1;
    } else if (s.dataset.sel === 'shopday') { shop.day = +s.value; }
    else if (s.dataset.sel === 'xadd') { if (s.value && byId[s.value]) extras.push({ id: s.value, scale: 1 }); }
    if (['mode', 'side', 'xadd', 'theme', 'pantry'].indexOf(s.dataset.sel) > -1) save();
    render();
  });
  if (mq.addEventListener) mq.addEventListener('change', render);
  document.addEventListener('input', function (e) {
    if (e.target.id !== 'rsearch') return;
    rQuery = e.target.value.trim();
    var q = rQuery.toLowerCase();
    document.querySelectorAll('.rlist .wrow').forEach(function (row) { row.hidden = !!q && row.dataset.q.indexOf(q) < 0; });
  });
  document.getElementById('gate-cancel').addEventListener('click', function () { document.getElementById('gate').hidden = true; });
  document.getElementById('gate-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var val = document.getElementById('gate-in').value, hh = document.getElementById('gate-hh').value.trim(), msg = document.getElementById('gate-msg');
    if (gateLogin && !hh) { msg.textContent = 'Type your household name.'; return; }
    if (!val) { msg.textContent = 'Type the passcode.'; return; }
    var hd = { 'x-passcode': val }; if (gateLogin) hd['x-household'] = hh;
    fetch('/api/unlock', { method: 'POST', headers: hd }).then(function (r) {
      if (r.ok) {
        setPass(val); document.getElementById('gate-in').value = '';
        if (gateLogin) { setHH(hh); location.reload(); return; }
        document.getElementById('gate').hidden = true; setStatus('saved', 'Saved'); render();
      }
      else if (r.status === 501) msg.textContent = 'No passcode has been set up yet. See the setup guide.';
      else msg.textContent = gateLogin ? 'That household name or passcode did not work.' : 'That passcode did not work.';
    }).catch(function () { msg.textContent = 'Could not reach the server. Try again.'; });
  });
  var hv = location.hash.slice(1); if (TITLES[hv]) view = hv;
  document.getElementById('main').innerHTML = '<p class="intro">Loading…</p>';
  fetch('data.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (data) {
    loadData(data); return loadRemote();
  }).then(function () {
    if (MODE === 'login') { document.getElementById('main').innerHTML = '<p class="intro">Sign in to see your plan.</p>'; askPass('', true); return; }
    READY = true; render(); setInterval(poll, 20000); document.addEventListener('visibilitychange', poll);
  }).catch(function () {
    document.getElementById('main').innerHTML = '<p class="intro">Could not load the recipes. Refresh to try again.</p>';
  });
})();

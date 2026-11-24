'use strict';
(() => {
  const D = window.ORBIT_DATA;
  const SAVE_KEY = 'orbit-focus-v1';
  const MAX_LVL = 5;
  const MAP_SIZE = 6;

  /* ========== أدوات مساعدة ========== */
  const $ = (s, el = document) => el.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const fmtTime = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; };
  const fmtDate = ts => { const d = new Date(ts); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`; };
  const fmtClock = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const num = str => esc(str).replace(/([+−-]\d+%?)/g, '<bdi dir="ltr">$1</bdi>');
  const randSeed = () => (Math.random() * 4294967296) >>> 0;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function R(seed) {
    const n = mulberry32(seed);
    const api = {
      next: n,
      range: (a, b) => a + n() * (b - a),
      int: (a, b) => a + Math.floor(n() * (b - a + 1)),
      pick: arr => arr[Math.floor(n() * arr.length)],
      chance: p => n() < p,
      weighted: entries => {
        const total = entries.reduce((s, e) => s + e[1], 0);
        let x = n() * total;
        for (const [k, w] of entries) { x -= w; if (x <= 0) return k; }
        return entries[entries.length - 1][0];
      }
    };
    return api;
  }
  const RND = R(randSeed()); // للأحداث غير المحددة مسبقاً

  /* ========== الحالة والحفظ ========== */
  function defaultState() {
    return {
      v: 1,
      res: { ti: 0, cr: 0, dm: 0 },
      up: { engine: 1, scanner: 1, rover: 1 },
      map: [], selected: null,
      phase: 'idle', flight: null, surface: null, summary: null,
      codex: [], planets: [],
      stats: { focusMin: 0, trips: 0, tiles: 0 },
      settings: { sound: true, test: false, breakMin: 5, wake: false, notify: false },
      created: Date.now()
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw), def = defaultState();
        return Object.assign(def, d, {
          res: Object.assign(def.res, d.res), up: Object.assign(def.up, d.up),
          stats: Object.assign(def.stats, d.stats), settings: Object.assign(def.settings, d.settings)
        });
      }
    } catch (e) { /* حفظ تالف أو التخزين مقفول */ }
    return defaultState();
  }
  let saveOK = true;
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); saveOK = true; }
    catch (e) { if (saveOK) toast('التخزين المحلي مش متاح — التقدم مش هيتحفظ', 'warn'); saveOK = false; }
  }
  let S = load();

  /* ========== الصوت ========== */
  let audioCtx = null;
  function tone(f = 660, d = 0.12, type = 'sine', vol = 0.05, delay = 0) {
    if (!S.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime + delay;
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(audioCtx.destination);
      o.start(t); o.stop(t + d + 0.02);
    } catch (e) { /* مفيش صوت */ }
  }
  const SFX = {
    click: () => tone(900, 0.03, 'square', 0.015),
    reveal: () => tone(520, 0.08, 'triangle', 0.04),
    res: () => { tone(660, 0.08); tone(880, 0.1, 'sine', 0.05, 0.08); },
    haz: () => tone(130, 0.3, 'sawtooth', 0.045),
    find: r => { const base = [523, 587, 659, 784, 880][r]; tone(base, 0.12); tone(base * 1.25, 0.12, 'sine', 0.05, 0.1); tone(base * 1.5, 0.25, 'sine', 0.05, 0.2); if (r >= 3) tone(base * 2, 0.4, 'triangle', 0.04, 0.35); },
    arrive: () => { tone(440, 0.2); tone(660, 0.2, 'sine', 0.05, 0.2); tone(880, 0.4, 'sine', 0.05, 0.4); },
    launch: () => { tone(180, 0.5, 'sawtooth', 0.03); tone(360, 0.4, 'sine', 0.03, 0.2); },
    up: () => { tone(500, 0.1); tone(750, 0.1, 'sine', 0.05, 0.1); tone(1000, 0.2, 'sine', 0.05, 0.2); }
  };
  const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } };

  /* ========== أيقونات ========== */
  const I = {
    ti: '<svg viewBox="0 0 24 24"><path d="M12 2.5l8 4.7v9.6l-8 4.7-8-4.7V7.2z" fill="currentColor" opacity=".9"/><path d="M12 2.5v19M4 7.2l16 9.6M20 7.2L4 16.8" stroke="#0a1630" stroke-width="1" opacity=".5"/></svg>',
    cr: '<svg viewBox="0 0 24 24"><path d="M12 2l5.5 7L12 22 6.5 9z" fill="currentColor"/><path d="M6.5 9h11M12 2v20" stroke="#0a1630" stroke-width="1" opacity=".45"/></svg>',
    dm: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><ellipse cx="12" cy="12" rx="10" ry="3.6" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(-25 12 12)"/></svg>',
    haz: '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="18" r="1.2" fill="currentColor"/></svg>',
    spec: '<svg viewBox="0 0 24 24"><path d="M5 19C5 10.5 10.5 5 19 5c0 8.5-5.5 14-14 14z" fill="currentColor" opacity=".9"/><path d="M5 19l8-8" stroke="#0a1630" stroke-width="1.4"/></svg>',
    anom: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".5" stroke-dasharray="3 3"/></svg>',
    rover: '<svg viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="7" rx="2" fill="currentColor"/><rect x="9" y="4.5" width="6" height="4" rx="1" fill="currentColor" opacity=".7"/><circle cx="7" cy="17.5" r="2.3" fill="currentColor"/><circle cx="12" cy="17.5" r="2.3" fill="currentColor"/><circle cx="17" cy="17.5" r="2.3" fill="currentColor"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    tabShip: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="currentColor"/><ellipse cx="12" cy="12" rx="10" ry="4.5" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(-30 12 12)"/></svg>',
    tabWork: '<svg viewBox="0 0 24 24"><path d="M14.5 6.5a4 4 0 00-5.3 5.3L3.5 17.5l3 3 5.7-5.7a4 4 0 005.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    tabCodex: '<svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4 21V5M9 8h6M9 11h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    tabLog: '<svg viewBox="0 0 24 24"><path d="M5 6h14M5 12h14M5 18h9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>'
  };
  const RES_META = { ti: { ar: 'تيتانيوم', cls: 'c-ti' }, cr: { ar: 'كريستال', cls: 'c-cr' }, dm: { ar: 'مادة مظلمة', cls: 'c-dm' } };

  /* ========== توليد الكواكب ========== */
  function planetCode(r) {
    const L = 'ABCDEFGHKLMNPRSTVXZ';
    return `${L[r.int(0, L.length - 1)]}${L[r.int(0, L.length - 1)]}-${r.int(100, 999)}`;
  }
  function genPlanet(dist) {
    const seed = randSeed(), r = R(seed);
    const types = Object.entries(D.PTYPES)
      .filter(([, t]) => t.minDist <= dist)
      .map(([k, t]) => [k, t.w * (k === 'moon' && dist === 15 ? 1.6 : 1) * (t.minDist === dist && dist > 15 ? 1.6 : 1)]);
    const type = r.weighted(types);
    const keys = Object.keys(D.TRAITS);
    const nT = r.weighted([[0, 3], [1, 5], [2, 2]]);
    const traits = [];
    while (traits.length < nT) { const t = r.pick(keys); if (!traits.includes(t)) traits.push(t); }
    return {
      id: 'p' + seed.toString(36), seed, dist, type, traits,
      ring: type === 'blackhole' ? true : r.chance(0.3),
      moon: r.chance(0.35), name: planetCode(r), custom: '', jitter: r.range(-0.25, 0.25)
    };
  }
  function ensureMap() {
    const max = D.ENGINE_DIST[S.up.engine];
    const tiers = D.DIST_OPTIONS.filter(d => d <= max);
    S.map = S.map.filter(p => p.dist <= max);
    for (const t of tiers) {
      if (S.map.some(p => p.dist === t)) continue;
      if (S.map.length >= MAP_SIZE) {
        const counts = {};
        S.map.forEach(p => { counts[p.dist] = (counts[p.dist] || 0) + 1; });
        const most = +Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        const idx = S.map.findIndex(p => p.dist === most && p.id !== S.selected);
        if (idx >= 0) S.map.splice(idx, 1);
      }
      S.map.push(genPlanet(t));
    }
    while (S.map.length < MAP_SIZE) S.map.push(genPlanet(tiers[Math.floor(Math.random() * tiers.length)]));
    S.map.sort((a, b) => a.dist - b.dist);
    if (S.selected && !S.map.some(p => p.id === S.selected)) S.selected = null;
  }
  const findPlanet = id => S.planets.find(p => p.id === id) || S.map.find(p => p.id === id) || null;
  const pName = p => p ? (p.custom || p.name) : 'كوكب مجهول';
  const effScanner = p => (p && p.traits.includes('storm') && S.up.scanner < 5) ? Math.max(1, S.up.scanner - 1) : S.up.scanner;
  const isLocked = p => D.PTYPES[p.type].minRover > S.up.rover;

  function tileWeights(p) {
    const w = Object.assign({}, D.PTYPES[p.type].tiles);
    if (p.traits.includes('rich')) { w.ti *= 1.6; w.cr *= 1.6; w.dm *= 1.4; }
    if (p.traits.includes('bio')) w.spec *= 1.8;
    if (p.traits.includes('ancient')) w.anom *= 2;
    if (p.traits.includes('unstable')) w.haz *= 1.5;
    return w;
  }
  function readings(p) {
    const w = tileWeights(p), tot = Object.values(w).reduce((a, b) => a + b, 0);
    return { life: clamp(Math.round(w.spec / tot * 230), 1, 99), haz: clamp(Math.round(w.haz / tot * 190), 1, 99) };
  }
  const roverEnergy = (p) => 6 + (S.up.rover - 1) * 2 + (p && p.traits.includes('lowg') ? 2 : 0) + (p ? Math.max(0, Math.floor((p.dist - 15) / 15)) : 0);
  const roverShield = () => 2 + S.up.rover;
  const distMult = p => 1 + (p.dist - 15) / 30;

  /* ========== رسم الكواكب (SVG إجرائي) ========== */
  let uid = 0;
  function planetColors(p) {
    const r = R(p.seed ^ 0x51ed27), t = D.PTYPES[p.type];
    const h = r.range(t.hue[0], t.hue[1]), s = r.range(t.sat[0], t.sat[1]), l = r.range(t.light[0], t.light[1]);
    return { h, s, l, r };
  }
  function blob(r, cx, cy, rad) {
    const n = r.int(6, 9), pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, rr = rad * r.range(0.55, 1.05);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    let d = `M${((pts[0][0] + pts[n - 1][0]) / 2).toFixed(1)} ${((pts[0][1] + pts[n - 1][1]) / 2).toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % n];
      d += ` Q${p0[0].toFixed(1)} ${p0[1].toFixed(1)} ${((p0[0] + p1[0]) / 2).toFixed(1)} ${((p0[1] + p1[1]) / 2).toFixed(1)}`;
    }
    return d + 'Z';
  }
  function planetGroup(p, cx, cy, R0, opts = {}) {
    const id = 'pg' + (uid++);
    if (opts.unknown) {
      return `<defs><radialGradient id="${id}u" cx="35%" cy="32%" r="75%"><stop offset="0" stop-color="#3a4d68"/><stop offset="1" stop-color="#0d1828"/></radialGradient></defs>
      <circle cx="${cx}" cy="${cy}" r="${R0}" fill="url(#${id}u)" stroke="#2a4a70" stroke-width="1"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${R0 * 1.1}" fill="#8fb4d8" font-family="monospace" font-weight="700">?</text>`;
    }
    const { h, s, l, r } = planetColors(p), t = D.PTYPES[p.type];
    const c1 = `hsl(${h},${s}%,${Math.min(92, l + 18)}%)`, c2 = `hsl(${h},${s}%,${l}%)`;
    const c3 = `hsl(${(h + t.shift + 360) % 360},${s * 0.8}%,${l * 0.42}%)`;
    const dark = `hsl(${h},${s}%,${l * 0.6}%)`, light = `hsl(${h},${Math.min(100, s + 10)}%,${Math.min(95, l + 25)}%)`;
    let defs = `<radialGradient id="${id}b" cx="35%" cy="32%" r="75%"><stop offset="0" stop-color="${c1}"/><stop offset=".55" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></radialGradient>
      <radialGradient id="${id}s" cx="32%" cy="30%" r="80%"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient>
      <clipPath id="${id}c"><circle cx="${cx}" cy="${cy}" r="${R0}"/></clipPath>`;
    let feat = '';
    const k = p.type;
    if (k === 'desert' || k === 'blackhole') {
      for (let i = 0; i < r.int(4, 7); i++) {
        const y = cy - R0 + r.range(0, R0 * 2);
        feat += `<ellipse cx="${cx}" cy="${y.toFixed(1)}" rx="${R0 * 1.3}" ry="${r.range(R0 * 0.05, R0 * 0.16).toFixed(1)}" fill="${r.chance(0.5) ? dark : light}" opacity="${r.range(0.15, 0.35).toFixed(2)}"/>`;
      }
    }
    if (k === 'moon' || k === 'desert') {
      for (let i = 0; i < r.int(4, 8); i++) {
        const a = r.range(0, Math.PI * 2), d = r.range(0, R0 * 0.85), cr = r.range(R0 * 0.06, R0 * 0.2);
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        feat += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${cr.toFixed(1)}" fill="${dark}" opacity=".45"/><circle cx="${(x - cr * 0.2).toFixed(1)}" cy="${(y - cr * 0.2).toFixed(1)}" r="${(cr * 0.75).toFixed(1)}" fill="none" stroke="${light}" stroke-width="${(R0 * 0.02).toFixed(2)}" opacity=".35"/>`;
      }
    }
    if (k === 'ice') {
      feat += `<ellipse cx="${cx}" cy="${cy - R0 * 0.92}" rx="${R0 * 0.75}" ry="${R0 * 0.32}" fill="#fff" opacity=".8"/><ellipse cx="${cx}" cy="${cy + R0 * 0.95}" rx="${R0 * 0.6}" ry="${R0 * 0.25}" fill="#fff" opacity=".7"/>`;
      for (let i = 0; i < r.int(3, 6); i++) {
        const y = cy + r.range(-R0 * 0.6, R0 * 0.6);
        feat += `<path d="M${cx - R0} ${y.toFixed(1)} Q${cx} ${(y + r.range(-R0 * 0.3, R0 * 0.3)).toFixed(1)} ${cx + R0} ${(y + r.range(-R0 * 0.2, R0 * 0.2)).toFixed(1)}" stroke="#e8fbff" stroke-width="${(R0 * 0.03).toFixed(2)}" fill="none" opacity=".4"/>`;
      }
    }
    if (k === 'ocean') {
      const land = `hsl(${r.range(80, 140).toFixed(0)},40%,${r.range(30, 42).toFixed(0)}%)`;
      for (let i = 0; i < r.int(2, 4); i++) feat += `<path d="${blob(r, cx + r.range(-R0 * 0.6, R0 * 0.6), cy + r.range(-R0 * 0.6, R0 * 0.6), r.range(R0 * 0.18, R0 * 0.38))}" fill="${land}" opacity=".9"/>`;
      for (let i = 0; i < r.int(3, 5); i++) {
        const y = cy + r.range(-R0 * 0.8, R0 * 0.8);
        feat += `<path d="M${(cx - R0 * r.range(0.2, 1)).toFixed(1)} ${y.toFixed(1)} q${(R0 * 0.4).toFixed(1)} ${(-R0 * 0.12).toFixed(1)} ${(R0 * r.range(0.6, 1.2)).toFixed(1)} 0" stroke="#fff" stroke-width="${(R0 * 0.06).toFixed(2)}" stroke-linecap="round" fill="none" opacity=".55"/>`;
      }
    }
    if (k === 'crystal') {
      for (let i = 0; i < r.int(6, 10); i++) {
        const x = cx + r.range(-R0, R0), y = cy + r.range(-R0, R0), sz = r.range(R0 * 0.15, R0 * 0.4);
        feat += `<polygon points="${x.toFixed(1)},${(y - sz).toFixed(1)} ${(x + sz * 0.6).toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${(y + sz).toFixed(1)} ${(x - sz * 0.6).toFixed(1)},${y.toFixed(1)}" fill="${r.chance(0.5) ? light : dark}" opacity="${r.range(0.25, 0.5).toFixed(2)}"/>`;
      }
    }
    if (k === 'volcanic') {
      for (let i = 0; i < r.int(4, 7); i++) {
        let x = cx + r.range(-R0 * 0.8, R0 * 0.8), y = cy + r.range(-R0 * 0.8, R0 * 0.8), d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
        for (let j = 0; j < 4; j++) { x += r.range(-R0 * 0.25, R0 * 0.25); y += r.range(-R0 * 0.25, R0 * 0.25); d += ` L${x.toFixed(1)} ${y.toFixed(1)}`; }
        feat += `<path d="${d}" stroke="#ffb347" stroke-width="${(R0 * 0.045).toFixed(2)}" fill="none" stroke-linecap="round" opacity=".9"/>`;
      }
      for (let i = 0; i < 3; i++) feat += `<circle cx="${(cx + r.range(-R0 * 0.6, R0 * 0.6)).toFixed(1)}" cy="${(cy + r.range(-R0 * 0.6, R0 * 0.6)).toFixed(1)}" r="${(R0 * 0.08).toFixed(1)}" fill="#ffd27a" opacity=".85"/>`;
    }
    let back = '', front = '';
    if (p.ring) {
      const rx = R0 * 1.8, ry = R0 * 0.42, rot = r.range(-22, 22).toFixed(1);
      const rc = k === 'blackhole' ? '#ffb347' : `hsl(${(h + 40) % 360},${s * 0.6}%,${Math.min(85, l + 15)}%)`;
      const sw = (R0 * (k === 'blackhole' ? 0.2 : 0.14)).toFixed(2);
      back = `<g transform="rotate(${rot} ${cx} ${cy})"><path d="M${cx - rx} ${cy} A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}" fill="none" stroke="${rc}" stroke-width="${sw}" opacity=".5"/></g>`;
      front = `<g transform="rotate(${rot} ${cx} ${cy})"><path d="M${cx - rx} ${cy} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy}" fill="none" stroke="${rc}" stroke-width="${sw}" opacity=".85"/></g>`;
    }
    const atmo = ['ocean', 'ice', 'desert', 'crystal'].includes(k) ? `<circle cx="${cx}" cy="${cy}" r="${(R0 * 1.04).toFixed(1)}" fill="none" stroke="${c1}" stroke-width="${(R0 * 0.07).toFixed(2)}" opacity=".3"/>` : '';
    let moon = '';
    if (p.moon && !opts.noMoon) {
      const a = r.range(0, Math.PI * 2), d = R0 * 1.55;
      moon = `<circle cx="${(cx + Math.cos(a) * d).toFixed(1)}" cy="${(cy + Math.sin(a) * d * 0.7).toFixed(1)}" r="${(R0 * 0.18).toFixed(1)}" fill="#b8c4d2"/><circle cx="${(cx + Math.cos(a) * d + R0 * 0.05).toFixed(1)}" cy="${(cy + Math.sin(a) * d * 0.7 + R0 * 0.05).toFixed(1)}" r="${(R0 * 0.16).toFixed(1)}" fill="#000" opacity=".35"/>`;
    }
    return `<defs>${defs}</defs>${back}<circle cx="${cx}" cy="${cy}" r="${R0}" fill="url(#${id}b)"/><g clip-path="url(#${id}c)">${feat}</g><circle cx="${cx}" cy="${cy}" r="${R0}" fill="url(#${id}s)"/>${atmo}${front}${moon}`;
  }
  function planetSVG(p, size, opts) {
    return `<svg class="planet-svg" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">${planetGroup(p, 50, 50, p.ring || p.moon ? 26 : 34, opts)}</svg>`;
  }

  /* ========== رسم كائنات الموسوعة ========== */
  function specGlyph(e, size = 56) {
    const r = R(e.seed), rc = D.RARITY[e.rarity].c, h = r.int(0, 359);
    const col = `hsl(${h},70%,62%)`, col2 = `hsl(${(h + 50) % 360},70%,45%)`;
    let g = '';
    switch (e.cat) {
      case 'flora': {
        g = `<path d="M24 40 Q24 30 24 22" stroke="${col2}" stroke-width="2.5" fill="none"/>`;
        const n = r.int(4, 7);
        for (let i = 0; i < n; i++) { const a = i / n * 360; g += `<ellipse cx="24" cy="15" rx="3.5" ry="7" fill="${col}" opacity=".9" transform="rotate(${a} 24 20)"/>`; }
        g += `<circle cx="24" cy="20" r="3.5" fill="${rc}"/>`; break;
      }
      case 'creature': {
        g = `<path d="${blob(r, 24, 25, 12)}" fill="${col}"/>`;
        const eyes = r.int(1, 3);
        for (let i = 0; i < eyes; i++) { const x = 24 + (i - (eyes - 1) / 2) * 6; g += `<circle cx="${x}" cy="22" r="2.6" fill="#fff"/><circle cx="${x}" cy="22.5" r="1.3" fill="#0a1630"/>`; }
        break;
      }
      case 'microbe': {
        g = `<circle cx="24" cy="24" r="9" fill="${col}" opacity=".85"/><circle cx="21" cy="22" r="3" fill="${col2}"/>`;
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g += `<line x1="${24 + Math.cos(a) * 9}" y1="${24 + Math.sin(a) * 9}" x2="${24 + Math.cos(a) * 13}" y2="${24 + Math.sin(a) * 13}" stroke="${col}" stroke-width="1.5"/>`; }
        break;
      }
      case 'fossil': {
        let d = 'M24 24'; for (let i = 0; i < 40; i++) { const a = i * 0.45, rr = i * 0.33; d += ` L${(24 + Math.cos(a) * rr).toFixed(1)} ${(24 + Math.sin(a) * rr).toFixed(1)}`; }
        g = `<circle cx="24" cy="24" r="14" fill="#3b3226" opacity=".6"/><path d="${d}" stroke="${rc}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`; break;
      }
      case 'crystal':
        g = `<polygon points="24,6 32,16 29,40 19,40 16,16" fill="${col}" opacity=".9"/><polygon points="24,6 24,40 19,40 16,16" fill="${col2}" opacity=".7"/><polygon points="35,20 39,26 37,38 32,38 31,26" fill="${col}" opacity=".6"/>`; break;
      case 'artifact':
        g = `<rect x="17" y="6" width="14" height="36" rx="1.5" fill="#141c2c" stroke="${rc}" stroke-width="1.2"/>`;
        for (let i = 0; i < 4; i++) g += `<path d="M20 ${12 + i * 7} h${r.int(4, 8)}" stroke="${col}" stroke-width="1.6"/>`;
        break;
      case 'signal':
        g = `<circle cx="14" cy="34" r="3" fill="${col}"/>`;
        for (let i = 1; i <= 3; i++) g += `<path d="M${14 + i * 6} 34 A${i * 7} ${i * 7} 0 0 0 14 ${34 - i * 7}" stroke="${col}" stroke-width="2" fill="none" opacity="${1 - i * 0.2}"/>`;
        break;
      default:
        g = `<circle cx="24" cy="24" r="12" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="4 3"/><circle cx="24" cy="24" r="6" fill="#000"/><circle cx="24" cy="24" r="7.5" fill="none" stroke="${rc}" stroke-width="1.5"/>`;
    }
    return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="${rc}" opacity=".1"/><circle cx="24" cy="24" r="23" fill="none" stroke="${rc}" stroke-width="1" opacity=".5"/>${g}</svg>`;
  }

  /* ========== الموسوعة ========== */
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  function sylName(r, n) { let s = ''; for (let i = 0; i < n; i++) s += r.pick(D.SYL); return cap(s); }
  function rollRarity(r, dist, boost = 0) {
    const f = 1 + (dist - 15) / 25 + boost;
    return r.weighted([[0, 50], [1, 28 * Math.sqrt(f)], [2, 14 * f], [3, 6 * Math.pow(f, 1.4)], [4, 2 * Math.pow(f, 1.8)]]);
  }
  function makeEntry(p, { boost = 0, cat = null, scanBonus = true } = {}) {
    const seed = randSeed(), r = R(seed);
    const c = cat || r.weighted(Object.entries(D.PTYPES[p.type].cats));
    const rarity = rollRarity(r, p.dist, boost + (scanBonus ? (S.up.scanner - 1) * 0.08 : 0));
    const meta = D.CATS[c];
    const t1 = r.pick(meta.traits);
    let t2 = r.pick(meta.traits); if (t2 === t1) t2 = meta.traits[(meta.traits.indexOf(t1) + 1) % meta.traits.length];
    const colorWord = r.pick(D.COLORS);
    const e = {
      id: 'c' + seed.toString(36), seed, cat: c, rarity,
      name: `${sylName(r, r.int(2, 3))} ${sylName(r, 2)}`,
      desc: `${meta.ar} لونه ${colorWord}، ${t1}، و${t2}.`,
      pid: p.id, date: Date.now()
    };
    S.codex.unshift(e);
    if (S.surface) S.surface.finds.push(e.id);
    SFX.find(rarity);
    if (rarity >= 3) vibrate([60, 40, 120]);
    toast(`اكتشاف جديد: <b>${esc(e.name)}</b> <span class="rtag" style="--rc:${D.RARITY[rarity].c}">${D.RARITY[rarity].en}</span>`, 'find');
    return e;
  }

  /* ========== الورشة ========== */
  const UPG = {
    engine: {
      ar: 'المحرك', en: 'HYPERDRIVE',
      info: l => `أقصى مسافة: ${D.ENGINE_DIST[l]} دقيقة · قطاع ${D.SECTOR[D.ENGINE_DIST[l]]}`,
      mult: { ti: 1.2, cr: 0.9, dm: 1 }
    },
    scanner: {
      ar: 'الرادار', en: 'DEEP SCANNER',
      info: l => ['', 'نوع الكوكب بيبان لما توصل المدار بس',
        'يكشف النوع ونسب الحياة والخطر من الخريطة',
        'كمان بيعلّم أماكن المخاطر على السطح',
        'كمان بيعلّم الكائنات والظواهر الغريبة',
        'كمان المادة المظلمة، ومش بيتأثر بالعواصف'][l],
      mult: { ti: 0.9, cr: 1.3, dm: 1 }
    },
    rover: {
      ar: 'الروفر والدروع', en: 'ROVER & SHIELDS',
      info: l => {
        const e = 6 + (l - 1) * 2, s = 2 + l;
        const un = l >= 4 ? ' · يفتح كواكب الثقوب السوداء' : l >= 3 ? ' · يفتح الكواكب البركانية' : '';
        return `${e} خطوة طاقة · ${s} درع${un}`;
      },
      mult: { ti: 1, cr: 1, dm: 1 }
    }
  };
  function upCost(key, lvl) {
    const m = UPG[key].mult;
    return {
      ti: Math.round(12 * Math.pow(lvl, 1.6) * m.ti),
      cr: Math.round(6 * Math.pow(lvl, 1.5) * m.cr),
      dm: lvl >= 2 ? Math.round((lvl - 1) * 2 * m.dm) : 0
    };
  }
  const canAfford = c => S.res.ti >= c.ti && S.res.cr >= c.cr && S.res.dm >= c.dm;

  /* ========== الرحلة ========== */
  const minuteMs = () => S.settings.test ? 1000 : 60000;
  function startFlight(id) {
    const p = S.map.find(x => x.id === id);
    if (!p || isLocked(p) || S.phase !== 'idle') return;
    S.phase = 'flight';
    S.flight = { pid: p.id, start: Date.now(), dur: p.dist * minuteMs(), test: S.settings.test };
    save(); SFX.launch(); vibrate(40);
    requestWake(); render();
  }
  function abortFlight() {
    S.phase = 'idle'; S.flight = null; save(); releaseWake(); render();
    toast('الرحلة اتلغت — مفيش مشكلة، جرب رحلة أقصر', 'warn');
  }
  function arrive() {
    const f = S.flight, p = S.map.find(x => x.id === f.pid);
    if (!p) { S.phase = 'idle'; S.flight = null; save(); render(); return; }
    if (!f.test) S.stats.focusMin += p.dist;
    S.phase = 'orbit';
    S.selected = p.id;
    S.flight = null;
    save(); releaseWake();
    SFX.arrive(); vibrate([200, 100, 200]);
    notify('Orbit Reached 🛰', `وصلت ${pName(p)}. وقت البريك — انزل استكشف!`);
    render();
  }

  /* ========== السطح ========== */
  function genTiles(p) {
    const r = R(p.seed ^ 0x9e3779b9), w = tileWeights(p);
    const entries = Object.entries(w), m = distMult(p) * (p.traits.includes('rich') ? 1.4 : 1);
    const tiles = [];
    for (let i = 0; i < 25; i++) {
      if (i === 12) { tiles.push({ k: 'empty', rev: true, landing: true, txt: 'نقطة الهبوط' }); continue; }
      const k = r.weighted(entries), t = { k, rev: false };
      if (k === 'ti') t.amt = Math.round(r.int(3, 6) * m);
      if (k === 'cr') t.amt = Math.round(r.int(2, 4) * m);
      if (k === 'dm') t.amt = Math.max(1, Math.round(r.int(1, 2) * (0.7 + m * 0.3)));
      if (k === 'empty') t.txt = r.pick(D.EMPTY_TXT[p.type]);
      if (k === 'haz') t.txt = r.pick(D.HAZ_TXT[p.type]);
      tiles.push(t);
    }
    const sc = effScanner(p);
    tiles.forEach(t => {
      if (t.rev) return;
      if (sc >= 3 && t.k === 'haz') t.hint = true;
      if (sc >= 4 && (t.k === 'spec' || t.k === 'anom')) t.hint = true;
      if (sc >= 5 && t.k === 'dm') t.hint = true;
    });
    return tiles;
  }
  function startSurface() {
    const p = S.map.find(x => x.id === S.selected);
    if (!p || S.phase !== 'orbit') return;
    if (!S.planets.some(x => x.id === p.id)) S.planets.unshift(Object.assign({}, p, { landed: Date.now() }));
    const breakMs = S.settings.test ? 60000 : S.settings.breakMin * 60000;
    const energy = roverEnergy(p), shield = roverShield();
    S.surface = {
      pid: p.id, start: Date.now(), end: Date.now() + breakMs,
      energy, maxEnergy: energy, shield, maxShield: shield,
      tiles: genTiles(p), cargo: { ti: 0, cr: 0, dm: 0 }, finds: [], usedEvents: [],
      event: null, msg: 'الروفر نزل بسلام. اختار مربع جنب نقطة الهبوط.', last: 12
    };
    S.phase = 'surface';
    save(); SFX.click(); render();
  }
  function isFrontier(tiles, i) {
    if (tiles[i].rev) return false;
    const x = i % 5, y = Math.floor(i / 5);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && nx < 5 && ny >= 0 && ny < 5 && tiles[ny * 5 + nx].rev;
    });
  }
  function revealTile(i) {
    const s = S.surface; if (!s || s.event) return;
    const t = s.tiles[i];
    if (!isFrontier(s.tiles, i)) return;
    if (s.energy <= 0) { toast('الطاقة خلصت', 'warn'); return; }
    const p = findPlanet(s.pid);
    s.energy--; t.rev = true; s.last = i; S.stats.tiles++;
    switch (t.k) {
      case 'ti': case 'cr': case 'dm':
        s.cargo[t.k] += t.amt; s.msg = `+${t.amt} ${RES_META[t.k].ar}`; SFX.res(); break;
      case 'haz': {
        const dmg = D.PTYPES[p.type].dmg || 1;
        s.shield = Math.max(0, s.shield - dmg);
        s.msg = `${t.txt} (−${dmg} درع)`; SFX.haz(); vibrate(150);
        flashTile(i);
        if (s.shield <= 0) { save(); render(); setTimeout(() => endSurface('shield'), 700); return; }
        break;
      }
      case 'spec': {
        const e = makeEntry(p);
        t.eid = e.id; s.msg = `${D.CATS[e.cat].ar}: ${e.name}`; break;
      }
      case 'anom':
        s.msg = 'ظاهرة غريبة!'; SFX.reveal(); openEvent(p); break;
      default:
        s.msg = t.txt; SFX.reveal();
    }
    save(); render();
  }
  function flashTile(i) {
    requestAnimationFrame(() => { const el = document.querySelector(`[data-i="${i}"]`); if (el) { el.classList.add('shake'); } });
  }
  function openEvent(p) {
    const s = S.surface;
    let pool = D.EVENTS.filter(e => (!e.types || e.types.includes(p.type)) && !s.usedEvents.includes(e.id));
    if (!pool.length) pool = D.EVENTS.filter(e => !e.types || e.types.includes(p.type));
    const weighted = pool.map(e => [e.id, 1 + (e.ancient && p.traits.includes('ancient') ? 3 : 0) + (e.bio && p.traits.includes('bio') ? 2 : 0)]);
    const id = RND.weighted(weighted);
    s.usedEvents.push(id);
    s.event = { id, stage: 'choose', color: RND.pick(D.COLORS) };
  }
  function fillText(str, p, ev) {
    return str.replace('{surface}', D.PTYPES[p.type].surface).replace('{color}', ev.color);
  }
  function chooseEvent(c) {
    const s = S.surface; if (!s || !s.event || s.event.stage !== 'choose') return;
    const def = D.EVENTS.find(e => e.id === s.event.id), opt = def[c], p = findPlanet(s.pid);
    const win = RND.next() < (opt.chance == null ? 1 : opt.chance);
    const fx = win ? opt.win : opt.lose;
    const lines = applyFx(fx, p);
    s.event.stage = 'result';
    s.event.win = win;
    s.event.txt = win ? opt.winTxt : opt.loseTxt;
    s.event.lines = lines;
    if (win) SFX.res(); else { SFX.haz(); vibrate(120); }
    save(); render();
  }
  function applyFx(fx, p) {
    const s = S.surface, lines = [], m = distMult(p);
    ['ti', 'cr', 'dm'].forEach(k => {
      if (fx[k]) { const a = Math.max(1, Math.round(fx[k] * (k === 'dm' ? 1 : m))); s.cargo[k] += a; lines.push(`+${a} ${RES_META[k].ar}`); }
    });
    if (fx.energy) { s.energy = Math.max(0, s.energy + fx.energy); lines.push(`${fx.energy > 0 ? '+' : '−'}${Math.abs(fx.energy)} طاقة`); }
    if (fx.shield) { s.shield = Math.max(0, s.shield + fx.shield); lines.push(`−${Math.abs(fx.shield)} درع`); }
    if (fx.reveal) {
      const cand = s.tiles.map((t, i) => [t, i]).filter(([t]) => !t.rev && !t.hint);
      cand.sort((a, b) => (a[0].k === 'empty') - (b[0].k === 'empty') || RND.next() - 0.5);
      const n = Math.min(fx.reveal, cand.length);
      cand.slice(0, n).forEach(([t]) => { t.hint = true; });
      if (n) lines.push(`${n} مواقع ظهرت على الرادار`);
    }
    if (fx.spec) { const e = makeEntry(p, fx.spec); lines.push(`${D.CATS[e.cat].ar}: ${e.name}`); }
    if (fx.art) { const e = makeEntry(p, fx.art); lines.push(`${D.CATS[e.cat].ar}: ${e.name}`); }
    return lines;
  }
  function closeEvent() {
    const s = S.surface; if (!s || !s.event) return;
    s.event = null;
    if (s.shield <= 0) { save(); endSurface('shield'); return; }
    save(); render();
  }
  function endSurface(reason) {
    const s = S.surface; if (!s) return;
    const lost = { ti: 0, cr: 0, dm: 0 };
    if (reason === 'shield') {
      ['ti', 'cr', 'dm'].forEach(k => { lost[k] = Math.ceil(s.cargo[k] / 2); s.cargo[k] -= lost[k]; });
    }
    ['ti', 'cr', 'dm'].forEach(k => { S.res[k] += s.cargo[k]; });
    S.stats.trips++;
    S.summary = { pid: s.pid, cargo: s.cargo, lost: reason === 'shield' ? lost : null, finds: s.finds, reason };
    S.map = S.map.filter(p => p.id !== s.pid);
    S.selected = null;
    ensureMap();
    S.surface = null; S.phase = 'summary';
    save();
    if (reason === 'time') notify('البريك خلص ⏱', 'الروفر رجع للسفينة بالحمولة. يلا نرجع للشغل.');
    render();
  }

  /* ========== إشعارات وقفل الشاشة ========== */
  function notify(title, body) {
    if (!S.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    if (!document.hidden) return;
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'orbit', vibrate: [200, 100, 200] }));
      } else new Notification(title, { body, icon: 'icons/icon-192.png' });
    } catch (e) { }
  }
  let wakeLock = null;
  async function requestWake() {
    if (!S.settings.wake || S.phase !== 'flight' || !('wakeLock' in navigator) || wakeLock) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch (e) { wakeLock = null; }
  }
  function releaseWake() { if (wakeLock) { wakeLock.release().catch(() => { }); wakeLock = null; } }

  /* ========== واجهة: Toast و Modal ========== */
  function toast(html, kind = '') {
    const box = $('#toasts'); if (!box) return;
    const el = document.createElement('div');
    el.className = `toast ${kind}`; el.innerHTML = html;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2600);
  }
  let modalLocked = false;
  function modal(html, { locked = false } = {}) {
    modalLocked = locked;
    $('#modal-root').innerHTML = `<div class="backdrop" data-act="${locked ? '' : 'closeModal'}"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  }
  function closeModal() { $('#modal-root').innerHTML = ''; modalLocked = false; }
  function confirmModal(text, okLabel, onOk, danger) {
    pendingConfirm = onOk;
    modal(`<p class="m-text">${text}</p><div class="m-actions"><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="confirmOk">${okLabel}</button><button class="btn btn-ghost" data-act="closeModal">رجوع</button></div>`);
  }
  let pendingConfirm = null;

  /* ========== الرسم الرئيسي ========== */
  let tab = 'ship';
  function render() {
    renderTop();
    const surf = S.phase === 'surface';
    document.body.classList.toggle('on-surface', surf);
    if (surf) tab = 'ship';
    $('#tabbar').innerHTML = [
      ['ship', 'المجرة', I.tabShip], ['workshop', 'الورشة', I.tabWork], ['codex', 'الموسوعة', I.tabCodex], ['log', 'السجل', I.tabLog]
    ].map(([k, l, ic]) => `<button class="tab ${tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${ic}<span>${l}</span>${k === 'ship' && S.phase === 'flight' && tab !== 'ship' ? '<i class="dot"></i>' : ''}</button>`).join('');
    const v = $('#view');
    let html = '';
    if (tab === 'ship') {
      html = { idle: viewMap, flight: viewFlight, orbit: viewOrbit, surface: viewSurface, summary: viewSummary }[S.phase]();
    } else if (tab === 'workshop') html = viewWorkshop();
    else if (tab === 'codex') html = viewCodex();
    else html = viewLog();
    if (S.phase === 'flight' && tab !== 'ship') html = flightMini() + html;
    v.innerHTML = html;
    v.dataset.view = tab === 'ship' ? S.phase : tab;
    if (S.phase === 'surface' && S.surface && S.surface.event) renderEvent();
    else if (modalLocked) closeModal();
    tick();
  }
  function renderTop() {
    $('#res').innerHTML = ['ti', 'cr', 'dm'].map(k => `<span class="res ${RES_META[k].cls}" title="${RES_META[k].ar}">${I[k]}<b>${S.res[k]}</b></span>`).join('');
  }

  /* ----- خريطة المجرة ----- */
  function viewMap() {
    ensureMap();
    const max = D.ENGINE_DIST[S.up.engine];
    const tiers = D.DIST_OPTIONS.filter(d => d <= max);
    const nextLocked = D.DIST_OPTIONS.find(d => d > max);
    const visible = nextLocked ? [...tiers, nextLocked] : tiers;
    const RAD = {}; visible.forEach((d, i) => { RAD[d] = Math.round(50 + (i + 1) / visible.length * 100); });
    const C = 170, sc = S.up.scanner;
    let svg = `<svg class="starmap" viewBox="0 0 340 340" role="img" aria-label="خريطة النجوم">
      <defs><radialGradient id="mapglow"><stop offset="0" stop-color="#4fd1e8" stop-opacity=".18"/><stop offset="1" stop-color="#4fd1e8" stop-opacity="0"/></radialGradient></defs>
      <circle cx="${C}" cy="${C}" r="168" fill="url(#mapglow)"/>`;
    visible.forEach(d => {
      const on = d <= max;
      svg += `<circle cx="${C}" cy="${C}" r="${RAD[d]}" fill="none" stroke="${on ? '#1f4670' : '#16294a'}" stroke-width="1" stroke-dasharray="${on ? '2 4' : '1 6'}"/>`;
      svg += `<text x="${C}" y="${C - RAD[d] - 4}" text-anchor="middle" class="ring-lbl ${on ? '' : 'off'}">${on ? d + 'm' : d + 'm · طوّر المحرك'}</text>`;
    });
    svg += `<g transform="translate(${C} ${C})"><path d="M0 -9 L6 7 L0 3 L-6 7Z" fill="#4fd1e8"/><circle r="14" fill="none" stroke="#4fd1e8" stroke-opacity=".35"/></g>`;
    const byTier = {};
    S.map.forEach(p => { (byTier[p.dist] = byTier[p.dist] || []).push(p); });
    Object.entries(byTier).forEach(([d, list]) => {
      const offset = D.DIST_OPTIONS.indexOf(+d) * 2.4 + 0.6; // زاوية ذهبية تقريباً عشان الكواكب متتراصش
      list.forEach((p, i) => {
        const a = offset + (i / list.length) * Math.PI * 2 + p.jitter;
        const x = C + Math.cos(a) * RAD[d], y = C + Math.sin(a) * RAD[d];
        const sel = S.selected === p.id, locked = isLocked(p);
        const known = sc >= 2 || locked;
        svg += `<g class="node ${sel ? 'sel' : ''}" data-act="select" data-id="${p.id}" tabindex="0" role="button" aria-label="${p.name}">
          <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="24" fill="transparent"/>
          ${sel ? `<circle class="pulse" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="21" fill="none" stroke="#5ef2a8" stroke-width="1.5"/>` : ''}
          <g transform="translate(${(x - 16).toFixed(1)} ${(y - 16).toFixed(1)}) scale(.32)">${planetGroup(p, 50, 50, p.ring ? 30 : 38, { unknown: !known, noMoon: true })}</g>
          ${known && sc >= 2 && !locked ? `<text x="${x.toFixed(1)}" y="${(y + 4.5).toFixed(1)}" text-anchor="middle" class="q">?</text>` : ''}
          ${locked ? `<circle cx="${(x + 12).toFixed(1)}" cy="${(y - 12).toFixed(1)}" r="6" fill="#ff5c7a"/><path d="M${(x + 9.8).toFixed(1)} ${(y - 12).toFixed(1)}h4.4" stroke="#0a1630" stroke-width="1.6"/>` : ''}
        </g>`;
      });
    });
    svg += '</svg>';

    const p = S.map.find(x => x.id === S.selected);
    let sheet;
    if (!p) {
      sheet = `<div class="hint-box"><b>اختار وجهة من الخريطة</b><p>كل دايرة = مدة رحلة بالدقايق. الرحلة هي وقت تركيزك، والهبوط هو البريك.</p></div>`;
    } else {
      const locked = isLocked(p), known = sc >= 2 || locked, eff = effScanner(p);
      const rd = readings(p);
      const t = D.PTYPES[p.type];
      sheet = `<div class="sheet-row">
          <div class="sheet-planet">${planetSVG(p, 84, { unknown: !known })}</div>
          <div class="sheet-info">
            <div class="kicker">SECTOR ${D.SECTOR[p.dist]} · ${p.name}</div>
            <div class="big">${p.dist} <small>دقيقة رحلة</small></div>
            <div class="muted">${known ? t.ar : 'نوع مجهول — طوّر الرادار'}</div>
          </div>
        </div>
        ${known && !locked ? `<div class="readout">
          <div><span>حياة</span><b class="c-green">${eff >= 2 ? rd.life + '%' : '###'}</b></div>
          <div><span>خطر</span><b class="c-red">${eff >= 2 ? rd.haz + '%' : '###'}</b></div>
          <div><span>طاقة الروفر</span><b>${roverEnergy(p)}</b></div>
        </div>
        <div class="chips">${p.traits.map(k => `<span class="chip" title="${D.TRAITS[k].fx}">${D.TRAITS[k].ar}</span>`).join('') || '<span class="chip dim">مفيش صفات مميزة</span>'}</div>` : ''}
        ${locked ? `<div class="warn-box">${I.lock}<span>${t.ar} — محتاج الروفر والدروع مستوى ${t.minRover} عشان تنزل عليه.</span></div>` : ''}
        <button class="btn btn-primary wide" data-act="launch" ${locked ? 'disabled' : ''}>انطلاق · ${p.dist} دقيقة تركيز</button>`;
    }
    return `<section class="stack">
      <div class="panel">
        <div class="panel-head"><span class="kicker">STAR MAP</span><button class="btn btn-ghost sm" data-act="rescan">مسح خريطة جديدة</button></div>
        ${svg}
      </div>
      <div class="panel">${sheet}</div>
    </section>`;
  }

  /* ----- الرحلة ----- */
  function viewFlight() {
    const f = S.flight, p = S.map.find(x => x.id === f.pid);
    return `<section class="stack flight">
      <div class="radar">
        <div class="r-ring r1"></div><div class="r-ring r2"></div><div class="r-ring r3"></div>
        <div class="sweep"></div>
        <div class="r-target">${planetSVG(p, 64, { unknown: S.up.scanner < 2 && !isLocked(p) })}</div>
        <div class="r-ship"></div>
      </div>
      <div class="kicker center">IN TRANSIT → ${esc(p.name)}</div>
      <div class="big-timer" id="ft">--:--</div>
      <div class="bar"><i id="fp"></i></div>
      <div class="flight-meta"><span>المسافة ${p.dist} دقيقة</span><span id="feta"></span></div>
      <div class="panel">
        <div class="row-between"><span class="muted">شحن طاقة الروفر</span><b id="fe" class="mono">0/${roverEnergy(p)}</b></div>
        <div class="pips" id="fpips">${'<i></i>'.repeat(roverEnergy(p))}</div>
        <div class="status mono" id="fs">${D.FLIGHT_MSGS[0]}</div>
      </div>
      <p class="focus-note">خليك مركز في شغلك — السفينة ماشية لوحدها. تقدر تقفل التاب وترجع وقت ما تحب.</p>
      <button class="btn btn-ghost danger wide" data-act="abort">إلغاء الرحلة</button>
    </section>`;
  }
  function flightMini() {
    return `<button class="flight-mini" data-act="tab" data-tab="ship"><span class="kicker">IN TRANSIT</span><b class="mono" id="ftm">--:--</b><div class="bar thin"><i id="fpm"></i></div></button>`;
  }

  /* ----- المدار ----- */
  function viewOrbit() {
    const p = S.map.find(x => x.id === S.selected) || S.map.find(x => S.flight && x.id === S.flight.pid);
    if (!p) { S.phase = 'idle'; save(); return viewMap(); }
    const t = D.PTYPES[p.type], rd = readings(p), eff = effScanner(p);
    const breakLbl = S.settings.test ? 'دقيقة (وضع التجربة)' : `${S.settings.breakMin} دقايق`;
    return `<section class="stack orbit">
      <div class="banner">ORBIT REACHED</div>
      <div class="hero">${planetSVG(p, 210)}</div>
      <div class="center">
        <h2 class="pname">${esc(pName(p))} <button class="icon-btn" data-act="rename" data-id="${p.id}" aria-label="سمّي الكوكب">${I.edit}</button></h2>
        <div class="muted">${t.ar} · قطاع ${D.SECTOR[p.dist]}${p.custom ? ` · ${p.name}` : ''}</div>
      </div>
      <div class="chips center">${p.traits.map(k => `<span class="chip">${D.TRAITS[k].ar} <small>${D.TRAITS[k].fx}</small></span>`).join('') || '<span class="chip dim">مفيش صفات مميزة</span>'}</div>
      <div class="readout four">
        <div><span>حياة</span><b class="c-green">${eff >= 2 ? rd.life + '%' : '###'}</b></div>
        <div><span>خطر</span><b class="c-red">${eff >= 2 ? rd.haz + '%' : '###'}</b></div>
        <div><span>طاقة</span><b>${roverEnergy(p)}</b></div>
        <div><span>درع</span><b>${roverShield()}</b></div>
      </div>
      ${eff < 2 ? '<p class="muted center small">طوّر الرادار عشان تشوف نسب الحياة والخطر قبل الهبوط.</p>' : ''}
      <button class="btn btn-primary wide" data-act="land">هبوط واستكشاف · بريك ${breakLbl}</button>
    </section>`;
  }

  /* ----- السطح ----- */
  function viewSurface() {
    const s = S.surface, p = findPlanet(s.pid), { h, s: sat } = planetColors(p);
    const tiles = s.tiles.map((t, i) => {
      const fr = isFrontier(s.tiles, i);
      let cls = 'tile', inner = '';
      if (!t.rev) {
        cls += fr && s.energy > 0 ? ' fog frontier' : ' fog';
        if (t.hint) { cls += ' hinted'; inner = `<span class="ic hint-ic k-${t.k}">${I[t.k] || ''}</span>`; }
      } else {
        cls += ` rev k-${t.k}`;
        if (t.landing) inner = `<span class="ic">${I.rover}</span>`;
        else if (t.k === 'empty') inner = '<span class="dotmark"></span>';
        else inner = `<span class="ic">${I[t.k]}</span>${t.amt ? `<small>${t.amt}</small>` : ''}`;
        if (i === s.last && !t.landing) cls += ' last';
      }
      return `<button class="${cls}" data-act="tile" data-i="${i}" ${(!fr || s.energy <= 0) ? 'aria-disabled="true"' : ''} aria-label="مربع ${i + 1}">${inner}</button>`;
    }).join('');
    const pips = (n, max, cls) => Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''} ${cls}"></i>`).join('');
    const out = s.energy <= 0 && !s.event;
    return `<section class="stack surface" style="--ph:${h.toFixed(0)};--ps:${sat.toFixed(0)}%">
      <div class="surf-head">
        <div><b>${esc(pName(p))}</b><small>${D.PTYPES[p.type].ar}</small></div>
        <div class="timer-box"><small>البريك</small><b class="mono" id="st">--:--</b></div>
      </div>
      <div class="meters">
        <div><span>طاقة <b class="mono">${s.energy}</b></span><div class="pips sm">${pips(s.energy, s.maxEnergy, 'e')}</div></div>
        <div><span>درع <b class="mono">${s.shield}</b></span><div class="pips sm">${pips(s.shield, s.maxShield, 's')}</div></div>
      </div>
      <div class="grid">${tiles}</div>
      <div class="msg">${num(s.msg)}</div>
      <div class="cargo">${['ti', 'cr', 'dm'].map(k => `<span class="res ${RES_META[k].cls}">${I[k]}<b>${s.cargo[k]}</b></span>`).join('')}<span class="res c-spec">${I.spec}<b>${s.finds.length}</b></span></div>
      ${out ? `<div class="panel center"><b>الطاقة خلصت</b><p class="muted small">الروفر محتاج يرجع يشحن في السفينة.</p><button class="btn btn-primary wide" data-act="liftoff">العودة للسفينة</button></div>`
        : `<button class="btn btn-ghost wide" data-act="liftoff">إقلاع والعودة للسفينة</button>`}
    </section>`;
  }
  function renderEvent() {
    const s = S.surface, ev = s.event, def = D.EVENTS.find(e => e.id === ev.id), p = findPlanet(s.pid);
    if (ev.stage === 'choose') {
      const risk = def.a.chance != null ? Math.round(def.a.chance * 100) : 100;
      modal(`<div class="kicker c-amber">ANOMALY DETECTED</div>
        <h3>${def.title}</h3>
        <p class="m-text">${fillText(def.text, p, ev)}</p>
        <div class="choices">
          <button class="choice risky" data-act="choose" data-c="a"><b>${def.a.label}</b><small>مخاطرة · فرصة نجاح ${risk}%</small></button>
          <button class="choice safe" data-act="choose" data-c="b"><b>${def.b.label}</b><small>آمن</small></button>
        </div>`, { locked: true });
    } else {
      modal(`<div class="kicker ${ev.win ? 'c-green' : 'c-red'}">${ev.win ? 'SUCCESS' : 'FAILURE'}</div>
        <p class="m-text">${ev.txt}</p>
        ${ev.lines.length ? `<ul class="fx-list">${ev.lines.map(l => `<li>${num(l)}</li>`).join('')}</ul>` : ''}
        <button class="btn btn-primary wide" data-act="eventDone">كمّل الاستكشاف</button>`, { locked: true });
    }
  }

  /* ----- التقرير ----- */
  function viewSummary() {
    const sm = S.summary; if (!sm) { S.phase = 'idle'; return viewMap(); }
    const p = findPlanet(sm.pid);
    const reasons = { manual: 'رجعت للسفينة بإرادتك.', energy: 'الطاقة خلصت والروفر رجع.', time: 'وقت البريك خلص والروفر رجع أوتوماتيك.', shield: 'الدرع وقع! إقلاع طوارئ وخسرت نص الحمولة.' };
    const finds = sm.finds.map(id => S.codex.find(c => c.id === id)).filter(Boolean);
    return `<section class="stack">
      <div class="panel">
        <div class="kicker">MISSION REPORT</div>
        <h2>${esc(pName(p))}</h2>
        <p class="muted">${reasons[sm.reason] || ''}</p>
        <div class="readout">${['ti', 'cr', 'dm'].map(k => `<div><span>${RES_META[k].ar}</span><b class="mono ${RES_META[k].cls}">+${sm.cargo[k]}</b>${sm.lost && sm.lost[k] ? `<small class="mono c-red">−${sm.lost[k]}</small>` : ''}</div>`).join('')}</div>
      </div>
      ${finds.length ? `<div class="panel"><div class="kicker">اكتشافات جديدة (${finds.length})</div><div class="codex-grid">${finds.map(codexCard).join('')}</div></div>` : ''}
      <div class="panel center">
        <p>البريك خلص — ارجع لشغلك، وجهّز الرحلة الجاية لما تبقى جاهز.</p>
        <button class="btn btn-primary wide" data-act="summaryDone">رجوع لخريطة المجرة</button>
      </div>
    </section>`;
  }

  /* ----- الورشة ----- */
  function viewWorkshop() {
    const cards = Object.entries(UPG).map(([k, u]) => {
      const lvl = S.up[k], maxed = lvl >= MAX_LVL, c = upCost(k, lvl), ok = canAfford(c);
      const cost = ['ti', 'cr', 'dm'].filter(r => c[r] > 0).map(r => `<span class="res ${RES_META[r].cls} ${S.res[r] >= c[r] ? '' : 'short'}">${I[r]}<b>${c[r]}</b></span>`).join('');
      return `<div class="panel upg">
        <div class="row-between"><div><div class="kicker">${u.en}</div><h3>${u.ar}</h3></div><div class="lvl mono">LV ${lvl}<small>/${MAX_LVL}</small></div></div>
        <div class="lvl-bar">${Array.from({ length: MAX_LVL }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
        <p class="now">${u.info(lvl)}</p>
        ${maxed ? '<p class="c-green small">أقصى مستوى ✓</p>' : `<p class="next small"><span class="muted">المستوى الجاي:</span> ${u.info(lvl + 1)}</p>
        <div class="row-between"><div class="cost">${cost}</div><button class="btn btn-primary" data-act="upgrade" data-k="${k}" ${ok ? '' : 'disabled'}>طوّر</button></div>`}
      </div>`;
    }).join('');
    return `<section class="stack"><div class="panel-title"><span class="kicker">WORKSHOP</span><h2>الورشة</h2><p class="muted small">طوّر سفينتك بالموارد اللي جمعتها من الكواكب.</p></div>${cards}</section>`;
  }

  /* ----- الموسوعة ----- */
  let codexFilter = -1;
  function codexCard(e) {
    const r = D.RARITY[e.rarity];
    return `<button class="codex-card" data-act="codexItem" data-id="${e.id}" style="--rc:${r.c}">
      ${specGlyph(e, 52)}
      <b>${esc(e.name)}</b>
      <small>${D.CATS[e.cat].ar}</small>
      <span class="rtag" style="--rc:${r.c}">${r.en}</span>
    </button>`;
  }
  function viewCodex() {
    const counts = [0, 0, 0, 0, 0]; S.codex.forEach(e => counts[e.rarity]++);
    const list = codexFilter < 0 ? S.codex : S.codex.filter(e => e.rarity === codexFilter);
    return `<section class="stack">
      <div class="panel-title"><span class="kicker">THE GALACTIC CODEX</span><h2>موسوعة المجرة</h2><p class="muted small">${S.codex.length} اكتشاف من ${S.planets.length} كوكب</p></div>
      <div class="rarity-row">${D.RARITY.map((r, i) => `<div style="--rc:${r.c}"><b class="mono">${counts[i]}</b><small>${r.ar}</small></div>`).join('')}</div>
      <div class="filters">
        <button class="chip ${codexFilter < 0 ? 'on' : ''}" data-act="codexFilter" data-r="-1">الكل</button>
        ${D.RARITY.map((r, i) => `<button class="chip ${codexFilter === i ? 'on' : ''}" style="--rc:${r.c}" data-act="codexFilter" data-r="${i}">${r.ar}</button>`).join('')}
      </div>
      ${list.length ? `<div class="codex-grid">${list.map(codexCard).join('')}</div>` : `<div class="panel center muted">${S.codex.length ? 'مفيش اكتشافات بالندرة دي لسه.' : 'الموسوعة فاضية. انزل على أول كوكب وابدأ تكتشف!'}</div>`}
    </section>`;
  }
  function codexDetail(id) {
    const e = S.codex.find(c => c.id === id); if (!e) return;
    const p = findPlanet(e.pid), r = D.RARITY[e.rarity];
    modal(`<div class="center">${specGlyph(e, 110)}</div>
      <div class="center"><span class="rtag" style="--rc:${r.c}">${r.en} · ${r.ar}</span></div>
      <h3 class="center">${esc(e.name)}</h3>
      <p class="m-text center">${esc(e.desc)}</p>
      <div class="kv"><span>النوع</span><b>${D.CATS[e.cat].ar}</b></div>
      <div class="kv"><span>اتكتشف على</span><b>${esc(pName(p))}</b></div>
      <div class="kv"><span>التاريخ</span><b class="mono">${fmtDate(e.date)}</b></div>
      <button class="btn btn-ghost wide" data-act="closeModal">قفل</button>`);
  }

  /* ----- السجل والإعدادات ----- */
  let installEvt = null;
  function viewLog() {
    const st = S.stats, set = S.settings;
    const hrs = st.focusMin >= 60 ? `${(st.focusMin / 60).toFixed(1)} س` : `${st.focusMin} د`;
    const planets = S.planets.map(p => {
      const n = S.codex.filter(c => c.pid === p.id).length;
      return `<button class="log-row" data-act="rename" data-id="${p.id}">
        ${planetSVG(p, 44, { noMoon: true })}
        <div><b>${esc(pName(p))}</b><small>${D.PTYPES[p.type].ar} · ${fmtDate(p.landed)}</small></div>
        <span class="mono small">${n} ${I.spec}</span>
      </button>`;
    }).join('');
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const toggle = (k, label, sub) => `<label class="setting"><div><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</div><input type="checkbox" data-set="${k}" ${set[k] ? 'checked' : ''}><span class="sw"></span></label>`;
    return `<section class="stack">
      <div class="panel-title"><span class="kicker">CAPTAIN'S LOG</span><h2>السجل</h2></div>
      <div class="readout four">
        <div><span>وقت تركيز</span><b class="c-cyan">${hrs}</b></div>
        <div><span>بعثات</span><b>${st.trips}</b></div>
        <div><span>كواكب</span><b>${S.planets.length}</b></div>
        <div><span>اكتشافات</span><b>${S.codex.length}</b></div>
      </div>
      <div class="panel"><div class="kicker">الكواكب اللي نزلت عليها</div>
        ${planets || '<p class="muted small">لسه منزلتش على أي كوكب.</p>'}
        ${planets ? '<p class="muted small">دوس على أي كوكب عشان تسميه.</p>' : ''}
      </div>
      <div class="panel"><div class="kicker">الإعدادات</div>
        ${toggle('sound', 'الأصوات')}
        ${toggle('notify', 'إشعار الوصول', 'بيشتغل لما التطبيق مفتوح في الخلفية')}
        ${toggle('wake', 'خلي الشاشة منورة أثناء الرحلة', 'مفيد لو سايب الموبايل جنبك')}
        <div class="setting"><div><b>مدة البريك</b></div><div class="seg">${[3, 5].map(m => `<button class="${set.breakMin === m ? 'on' : ''}" data-act="breakMin" data-m="${m}">${m} د</button>`).join('')}</div></div>
        ${toggle('test', 'وضع التجربة', 'الدقيقة = ثانية في الرحلة، ومش بيتحسب وقت تركيز')}
      </div>
      ${!standalone ? `<div class="panel"><div class="kicker">تثبيت التطبيق</div>
        ${installEvt ? '<button class="btn btn-primary wide" data-act="install">ثبّت Orbit على الجهاز</button>'
          : isIOS ? '<p class="small">على iPhone: افتح الصفحة من Safari ← زرار المشاركة ← <b>Add to Home Screen</b>.</p>'
            : '<p class="small">من قايمة المتصفح اختار <b>Install app</b> أو <b>Add to Home screen</b>.</p>'}
      </div>` : ''}
      <div class="panel"><div class="kicker">بياناتك</div>
        <p class="muted small">كل حاجة متخزنة على جهازك بس. خد نسخة احتياطية قبل ما تمسح بيانات المتصفح.</p>
        <div class="btn-row"><button class="btn btn-ghost" data-act="export">تصدير نسخة</button><button class="btn btn-ghost" data-act="import">استيراد نسخة</button></div>
        <button class="btn btn-ghost danger wide" data-act="reset">مسح كل التقدم</button>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
      </div>
      <p class="muted small center">Orbit · v1.0</p>
    </section>`;
  }
  function renameModal(id) {
    const p = findPlanet(id); if (!p) return;
    modal(`<h3>سمّي الكوكب</h3><p class="muted small">الكود الأصلي: ${p.name}</p>
      <input class="input" id="renameInput" maxlength="24" value="${esc(p.custom || '')}" placeholder="مثلاً: واحة هادي">
      <div class="m-actions"><button class="btn btn-primary" data-act="renameSave" data-id="${id}">حفظ</button><button class="btn btn-ghost" data-act="closeModal">رجوع</button></div>`);
    setTimeout(() => { const i = $('#renameInput'); if (i) i.focus(); }, 50);
  }

  /* ========== المؤقت ========== */
  let lastMsgIdx = -1;
  function tick() {
    const now = Date.now();
    if (S.phase === 'flight' && S.flight) {
      const f = S.flight, el = now - f.start, rem = f.dur - el, prog = clamp(el / f.dur, 0, 1);
      if (rem <= 0) { arrive(); return; }
      const t = fmtTime(rem);
      const ft = $('#ft'); if (ft) ft.textContent = t;
      const fp = $('#fp'); if (fp) fp.style.width = (prog * 100).toFixed(2) + '%';
      const ftm = $('#ftm'); if (ftm) ftm.textContent = t;
      const fpm = $('#fpm'); if (fpm) fpm.style.width = (prog * 100).toFixed(2) + '%';
      const feta = $('#feta'); if (feta) feta.textContent = `الوصول ${fmtClock(f.start + f.dur)}`;
      const p = S.map.find(x => x.id === f.pid);
      if (p) {
        const max = roverEnergy(p), cur = Math.floor(prog * max);
        const fe = $('#fe'); if (fe) fe.textContent = `${cur}/${max}`;
        const pips = $('#fpips'); if (pips) [...pips.children].forEach((c, i) => c.classList.toggle('on', i < cur));
      }
      const mi = Math.floor(el / 8000) % D.FLIGHT_MSGS.length;
      if (mi !== lastMsgIdx) { lastMsgIdx = mi; const fs = $('#fs'); if (fs) fs.textContent = '› ' + D.FLIGHT_MSGS[mi]; }
      document.title = `${t} · Orbit`;
    } else if (S.phase === 'surface' && S.surface) {
      const rem = S.surface.end - now;
      if (rem <= 0) { closeModal(); endSurface('time'); return; }
      const st = $('#st'); if (st) { st.textContent = fmtTime(rem); st.classList.toggle('c-red', rem < 30000); }
      document.title = `بريك ${fmtTime(rem)} · Orbit`;
    } else {
      document.title = S.phase === 'orbit' ? 'Orbit Reached · Orbit' : 'Orbit — رحلة التركيز';
    }
  }

  /* ========== الأحداث ========== */
  const actions = {
    tab: d => { tab = d.tab; SFX.click(); render(); window.scrollTo(0, 0); },
    select: d => { S.selected = d.id; SFX.click(); save(); render(); },
    rescan: () => {
      S.map = []; S.selected = null; ensureMap(); save(); SFX.reveal(); render();
      toast('اتعمل مسح لقطاع جديد');
    },
    launch: () => startFlight(S.selected),
    abort: () => confirmModal('متأكد إنك عايز تلغي الرحلة؟ وقت التركيز ده مش هيتحسب.', 'إلغاء الرحلة', abortFlight, true),
    land: () => startSurface(),
    tile: d => revealTile(+d.i),
    liftoff: () => endSurface(S.surface && S.surface.energy <= 0 ? 'energy' : 'manual'),
    choose: d => chooseEvent(d.c),
    eventDone: () => { closeModal(); closeEvent(); },
    summaryDone: () => { S.summary = null; S.phase = 'idle'; save(); render(); },
    upgrade: d => {
      const k = d.k, lvl = S.up[k]; if (lvl >= MAX_LVL) return;
      const c = upCost(k, lvl); if (!canAfford(c)) return;
      S.res.ti -= c.ti; S.res.cr -= c.cr; S.res.dm -= c.dm; S.up[k]++;
      if (k === 'engine') ensureMap();
      save(); SFX.up(); vibrate(60);
      toast(`${UPG[k].ar} بقى مستوى ${S.up[k]}`, 'good');
      render();
    },
    codexFilter: d => { codexFilter = +d.r; render(); },
    codexItem: d => codexDetail(d.id),
    rename: d => renameModal(d.id),
    renameSave: d => {
      const v = ($('#renameInput').value || '').trim().slice(0, 24);
      [S.planets.find(p => p.id === d.id), S.map.find(p => p.id === d.id)].forEach(p => { if (p) p.custom = v; });
      save(); closeModal(); render();
    },
    closeModal: () => { if (!modalLocked) closeModal(); },
    confirmOk: () => { const f = pendingConfirm; pendingConfirm = null; closeModal(); if (f) f(); },
    breakMin: d => { S.settings.breakMin = +d.m; save(); render(); },
    install: async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) { } installEvt = null; render(); },
    export: () => {
      const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `orbit-save-${fmtDate(Date.now()).replace(/\//g, '-')}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    import: () => $('#importFile').click(),
    reset: () => confirmModal('ده هيمسح كل الموارد والموسوعة والسجل نهائياً. متأكد؟', 'امسح كل حاجة', () => {
      releaseWake(); S = defaultState(); ensureMap(); save(); tab = 'ship'; render(); toast('بداية جديدة');
    }, true)
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || !el.dataset.act) return;
    if (el.hasAttribute('disabled')) return;
    if (el.classList.contains('backdrop') && e.target !== el) return;
    const fn = actions[el.dataset.act];
    if (fn) fn(el.dataset, el);
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('g[data-act]')) { e.preventDefault(); actions[e.target.dataset.act](e.target.dataset); }
    if (e.key === 'Escape' && !modalLocked) closeModal();
  });
  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset.set) {
      const k = t.dataset.set;
      if (k === 'notify' && t.checked) {
        if (!('Notification' in window)) { toast('المتصفح ده مش بيدعم الإشعارات', 'warn'); t.checked = false; return; }
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { toast('الإذن اترفض', 'warn'); t.checked = false; return; }
      }
      if (k === 'test' && S.phase === 'flight') { toast('غيّر وضع التجربة بعد ما الرحلة تخلص', 'warn'); t.checked = S.settings.test; return; }
      S.settings[k] = t.checked; save();
      if (k === 'wake') { if (t.checked) requestWake(); else releaseWake(); }
    }
    if (t.id === 'importFile' && t.files && t.files[0]) {
      try {
        const d = JSON.parse(await t.files[0].text());
        if (!d || d.v !== 1 || !d.res || !d.up) throw new Error('bad');
        confirmModal('النسخة دي هتستبدل تقدمك الحالي. نكمل؟', 'استيراد', () => {
          try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (err) { }
          S = load(); if (!saveOK || !localStorage.getItem(SAVE_KEY)) S = Object.assign(defaultState(), d);
          ensureMap(); save(); render(); toast('النسخة اتستوردت', 'good');
        });
      } catch (err) { toast('الملف ده مش نسخة Orbit صالحة', 'warn'); }
      t.value = '';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { tick(); if (S.phase === 'flight') requestWake(); }
  });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (tab === 'log') render(); });

  /* ========== خلفية النجوم ========== */
  function starfield() {
    const cv = $('#stars'), ctx = cv.getContext('2d');
    let w, h, dpr, stars = [];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = cv.width = innerWidth * dpr; h = cv.height = innerHeight * dpr;
      cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
      stars = Array.from({ length: Math.round(Math.min(160, innerWidth * innerHeight / 5000)) }, () => ({ x: Math.random() * w - w / 2, y: Math.random() * h - h / 2, z: Math.random() * 0.9 + 0.1 }));
    }
    resize(); addEventListener('resize', resize);
    let last = 0;
    function frame(ts) {
      requestAnimationFrame(frame);
      if (ts - last < 33) return; // ~30fps يوفر بطارية
      const dt = Math.min(100, ts - last); last = ts;
      const speed = reduce ? 0 : S.phase === 'flight' ? 0.00035 : 0.00004;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.x *= 1 + speed * dt / s.z; s.y *= 1 + speed * dt / s.z;
        if (Math.abs(s.x) > w / 2 || Math.abs(s.y) > h / 2) { s.x = (Math.random() - 0.5) * w * 0.3; s.y = (Math.random() - 0.5) * h * 0.3; s.z = Math.random() * 0.9 + 0.1; }
        const a = 0.25 + (1 - s.z) * 0.6, r = (1.3 - s.z) * dpr;
        ctx.fillStyle = `rgba(190,225,255,${a.toFixed(2)})`;
        ctx.fillRect(w / 2 + s.x, h / 2 + s.y, r, r);
      }
    }
    requestAnimationFrame(frame);
  }

  /* ========== تشغيل ========== */
  function boot() {
    // استرجاع الحالة لو التطبيق اتقفل في نص رحلة أو بريك
    if (S.phase === 'flight' && S.flight && Date.now() >= S.flight.start + S.flight.dur) arrive();
    if (S.phase === 'surface' && S.surface && Date.now() >= S.surface.end) { S.surface.event = null; endSurface('time'); }
    if (S.phase === 'orbit' && !S.selected) S.phase = 'idle';
    ensureMap(); save();
    render(); starfield();
    setInterval(tick, 500);
    if (S.phase === 'flight') requestWake();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => { });
    }
  }
  boot();
})();

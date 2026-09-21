/* Конструктор баннера: форма (по schema шаблона) → config → template.generate → SVG → превью → WebM (SvgEngine).
 * Контракт шаблонов: docs/TEMPLATE_API.md */
(function () {
  const $ = id => document.getElementById(id);
  const state = {
    tpl: null, cfg: null,
    uploads: {},            // name -> dataUrl, общие для всех шаблонов
    processed: new Map(),   // кэш готовых картинок
    fontCache: {}, metricsCache: {}, assetCache: {},
    svg: '', duration: 16, playing: true, sceneStarts: []
  };
  const lsKey = id => `banner-constructor:${id}`;
  const LS_TPL = 'banner-constructor:template';
  const lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };

  // ------------------------------------------------------------ IndexedDB для загруженных картинок
  const idb = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('banner-constructor', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('uploads');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const tx = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => { const t = db.transaction('uploads', mode); fn(t.objectStore('uploads')); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
    };
    return {
      put: (k, v) => tx('readwrite', st => st.put(v, k)).catch(() => {}),
      del: k => tx('readwrite', st => st.delete(k)).catch(() => {}),
      clear: () => tx('readwrite', st => st.clear()).catch(() => {}),
      all: async () => {
        try {
          const db = await open();
          return await new Promise((res, rej) => {
            const out = {}; const req = db.transaction('uploads', 'readonly').objectStore('uploads').openCursor();
            req.onsuccess = () => { const c = req.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
            req.onerror = () => rej(req.error);
          });
        } catch (_) { return {}; }
      }
    };
  })();

  // ------------------------------------------------------------ пути в config
  const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  function setPath(obj, path, val) {
    const ks = path.split('.'); let o = obj;
    for (let i = 0; i < ks.length - 1; i++) {
      if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {};
      o = o[ks[i]];
    }
    o[ks[ks.length - 1]] = val;
  }
  function deepMerge(base, over) {
    if (Array.isArray(base) || Array.isArray(over)) return over !== undefined ? over : base;
    if (base && typeof base === 'object' && over && typeof over === 'object') {
      const out = { ...base };
      for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
      return out;
    }
    return over !== undefined ? over : base;
  }
  const normalize = (tpl, c) => {
    const d = tpl.defaults(); const m = deepMerge(d, c || {});
    if (!Array.isArray(m.scenes) || !m.scenes.length) m.scenes = d.scenes;
    m.template = tpl.id; return m;
  };

  // ------------------------------------------------------------ картинки
  const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Не удалось открыть картинку')); im.src = src; });
  function isGreenScreen(d, w, h) {
    let hits = 0;
    for (const [x, y] of [[2, 2], [w - 3, 2], [2, h >> 1], [w - 3, h >> 1], [w >> 1, 2]]) {
      const p = (y * w + x) * 4; if (d[p + 3] > 200 && d[p + 1] - Math.max(d[p], d[p + 2]) > 60) hits++;
    }
    return hits >= 3;
  }
  function keyGreen(img) {   // рецепт из build.py: «зелёность» -> альфа, эрозия 3×3, лёгкий blur, despill
    const { data: d, width: w, height: h } = img;
    const a = new Float32Array(w * h);
    for (let i = 0, p = 0; i < a.length; i++, p += 4) a[i] = 1 - Math.min(1, Math.max(0, (d[p + 1] - Math.max(d[p], d[p + 2]) - 38) / 72));
    const er = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = 1;
      for (let dy = -1; dy <= 1; dy++) { const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) { const v = a[yy * w + Math.min(w - 1, Math.max(0, x + dx))]; if (v < m) m = v; } }
      er[y * w + x] = m;
    }
    const K = [0.0625, 0.125, 0.0625, 0.125, 0.25, 0.125, 0.0625, 0.125, 0.0625];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++) { const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) s += er[yy * w + Math.min(w - 1, Math.max(0, x + dx))] * K[k++]; }
      const p = (y * w + x) * 4, lim = Math.max(d[p], d[p + 2]) * 1.02 + 6;
      if (d[p + 1] > lim) d[p + 1] = lim;
      d[p + 3] = Math.round(s * 255);
    }
  }
  const imgSrc = n => state.uploads[n] || (state.tpl.builtinImages.includes(n) ? state.tpl.assetDir + n : null);

  async function processImage(name) {
    const opt = state.tpl.imageOptions(state.cfg, name);
    const key = `${name}|${opt.scale}|${!!opt.mirror}`;
    if (state.processed.has(key)) return state.processed.get(key);
    const src = imgSrc(name);
    if (!src) throw new Error(`Нет картинки «${name}» — загрузи её или выбери другую в сцене.`);
    const im = await loadImg(src);
    let cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    let g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
    let px = g.getImageData(0, 0, cv.width, cv.height);
    if (isGreenScreen(px.data, cv.width, cv.height)) {
      keyGreen(px); g.putImageData(px, 0, 0);
      if (cv.width >= 1600) {        // сырой скрин 2560×1440 -> тот же масштаб, что у встроенных u1..u10
        const k = 1536 / cv.width, c2 = document.createElement('canvas');
        c2.width = Math.round(cv.width * k); c2.height = Math.round(cv.height * k);
        c2.getContext('2d').drawImage(cv, 0, 0, c2.width, c2.height);
        cv = c2; g = cv.getContext('2d', { willReadFrequently: true }); px = g.getImageData(0, 0, cv.width, cv.height);
      }
    }
    const d = px.data, W = cv.width, H = cv.height;
    let x0 = W, x1 = -1, y0 = H;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; }
    if (x1 < 0) throw new Error(`Картинка «${name}» полностью прозрачная.`);
    const cw = x1 - x0 + 1, chh = H - y0;
    const ow = Math.max(1, Math.round(cw * opt.scale)), oh = Math.max(1, Math.round(chh * opt.scale));
    const out = document.createElement('canvas'); out.width = ow; out.height = oh;
    const og = out.getContext('2d'); og.imageSmoothingQuality = 'high';
    if (opt.mirror) { og.translate(ow, 0); og.scale(-1, 1); }
    og.drawImage(cv, x0, y0, cw, chh, 0, 0, ow, oh);
    const res = { w: ow, h: oh, dataUrl: out.toDataURL('image/png') };
    state.processed.set(key, res);
    return res;
  }
  const allImageNames = () => [...state.tpl.builtinImages, ...Object.keys(state.uploads)];
  const imgLabel = n => state.tpl.emotionNames[n] ? `${n.replace('.png', '')} — ${state.tpl.emotionNames[n]}` : n;

  // ------------------------------------------------------------ ассеты шаблона
  async function fetchB64(url) {
    const r = await fetch(url); if (!r.ok) throw new Error('нет файла ' + url);
    const u = new Uint8Array(await r.arrayBuffer()); let s = '';
    for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
    return btoa(s);
  }
  async function tplCtx(tpl) {
    const fonts = {};
    for (const [n, url] of Object.entries(tpl.fonts || {})) fonts[n] = state.fontCache[url] || (state.fontCache[url] = await fetchB64(url));
    const murl = tpl.metrics || 'assets/fonts/metrics.json';
    const metrics = state.metricsCache[murl] || (state.metricsCache[murl] = await (await fetch(murl)).json());
    const assets = {};
    for (const [n, url] of Object.entries(tpl.extraAssets || {})) assets[n] = state.assetCache[url] ?? (state.assetCache[url] = await (await fetch(url)).text());
    return { fonts, metrics, assets };
  }

  // ------------------------------------------------------------ генерация + превью
  async function build(cfg = state.cfg) {
    const base = await tplCtx(state.tpl);
    const images = {};
    for (const n of state.tpl.usedImages(cfg)) images[n] = await processImage(n);
    return state.tpl.generate(cfg, { ...base, images });
  }
  let buildSeq = 0;
  async function refresh() {
    const seq = ++buildSeq;
    lsSet(lsKey(state.tpl.id), JSON.stringify(state.cfg));
    try {
      const r = await build();
      if (seq !== buildSeq) return;
      state.svg = r.svg; state.duration = r.duration;
      let t = 0; state.sceneStarts = state.cfg.scenes.map(s => { const a = t; t += Number(s.duration) || 0; return a; });
      showPreview(r);
      msg(r.warnings && r.warnings.length ? '⚠ ' + r.warnings.join('\n⚠ ') : `Луп ${+r.duration.toFixed(2)} с · сцен: ${state.cfg.scenes.length} · всё ок`);
      $('loopInfo').textContent = `· луп ${+r.duration.toFixed(2)} с`;
    } catch (e) {
      if (seq === buildSeq) msg('Ошибка: ' + e.message, true);
    }
  }
  const refreshSoon = debounce(refresh, 350);

  function showPreview(r) {
    const fr = $('preview'); const keepT = currentTime();
    fr.style.aspectRatio = `${r.width} / ${r.height}`;
    fr.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><style>:root{color-scheme:dark}html,body{margin:0;height:100%;background:transparent;overflow:hidden}svg{width:100%;height:100%;display:block}</style></head><body>${r.svg}</body></html>`;
    fr.onload = () => { const s = svgEl(); if (!s) return; s.setCurrentTime(Math.min(keepT, r.duration - 0.01)); if (!state.playing) s.pauseAnimations(); };
    $('scrub').max = String(r.duration);
    renderChips();
  }
  const svgEl = () => { try { return $('preview').contentDocument.querySelector('svg'); } catch (_) { return null; } };
  const currentTime = () => { const s = svgEl(); return s ? s.getCurrentTime() % (state.duration || 16) : 0; };
  const seek = t => { const s = svgEl(); if (s) s.setCurrentTime(t); };
  function tick() {
    const t = currentTime();
    if (document.activeElement !== $('scrub')) $('scrub').value = String(t);
    $('timeLabel').textContent = `${t.toFixed(1)} с`;
    const idx = state.sceneStarts.reduce((a, st, i) => (t >= st ? i : a), 0);
    document.querySelectorAll('.scene-chips button').forEach((b, i) => b.classList.toggle('on', i === idx));
    requestAnimationFrame(tick);
  }
  const sceneTitle = s => (state.tpl.schema.sceneTitle ? state.tpl.schema.sceneTitle(s) : state.tpl.schema.sceneTypes[s.type]) || s.type;
  function renderChips() {
    const box = $('sceneChips'); box.innerHTML = '';
    state.cfg.scenes.forEach((s, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost';
      b.textContent = `${i + 1}. ${sceneTitle(s)}`;
      b.onclick = () => seek(state.sceneStarts[i] + (Number(s.duration) || 4) * 0.72);
      box.appendChild(b);
    });
  }
  function msg(text, err) { const m = $('messages'); m.textContent = text; m.classList.toggle('error', !!err); }

  // ------------------------------------------------------------ поля формы по schema
  const colorKeys = () => { const c = state.tpl.schema.colors; return c ? Object.keys(getPath(state.cfg, c.path) || {}) : []; };
  const colorLabel = k => ((state.tpl.schema.colors || {}).labels || {})[k] || k;

  function makeField(f, obj, onChange) {
    if (f.showIf && !f.showIf(obj)) return null;
    const val = getPath(obj, f.path);
    const set = v => { setPath(obj, f.path, v); onChange(f); };
    let input;
    switch (f.kind) {
      case 'number':
        input = document.createElement('input'); input.type = 'number'; input.value = val ?? '';
        if (f.min != null) input.min = f.min; if (f.max != null) input.max = f.max; if (f.step != null) input.step = f.step;
        input.oninput = () => { const v = Number(input.value); if (input.value !== '' && Number.isFinite(v)) set(f.min != null ? Math.max(f.min, v) : v); };
        break;
      case 'check': {
        const l = document.createElement('label'); l.className = 'check';
        input = document.createElement('input'); input.type = 'checkbox'; input.checked = val === undefined ? !!f.default : !!val;
        input.onchange = () => set(input.checked);
        const sp = document.createElement('span'); sp.textContent = f.label; l.append(input, sp);
        if (f.hint) { const h = document.createElement('small'); h.className = 'hint'; h.textContent = f.hint; l.appendChild(h); }
        return l;
      }
      case 'select':
        input = document.createElement('select');
        for (const [k, lab] of Object.entries(f.options || {})) { const o = document.createElement('option'); o.value = k; o.textContent = lab; input.appendChild(o); }
        input.value = val ?? Object.keys(f.options || {})[0]; input.onchange = () => set(input.value);
        break;
      case 'color-name':
        input = document.createElement('select');
        for (const k of colorKeys()) { const o = document.createElement('option'); o.value = k; o.textContent = colorLabel(k); input.appendChild(o); }
        input.value = val; input.onchange = () => set(input.value);
        break;
      case 'image': {
        input = document.createElement('select');
        if (f.optional) { const o = document.createElement('option'); o.value = ''; o.textContent = '— без смены —'; input.appendChild(o); }
        for (const n of allImageNames()) { const o = document.createElement('option'); o.value = n; o.textContent = imgLabel(n); input.appendChild(o); }
        input.value = val || '';
        input.onchange = () => {
          if (f.optional) {
            if (!input.value) { delete obj[f.optional]; onChange(f, true); return; }
            if (!obj[f.optional]) { obj[f.optional] = { ...(f.optionalInit || {}) }; setPath(obj, f.path, input.value); onChange(f, true); return; }
          }
          set(input.value);
        };
        break;
      }
      case 'list':
        input = document.createElement('input'); input.type = 'text'; input.value = (val || []).join(', ');
        input.oninput = () => set(input.value.split(',').map(s => s.trim()).filter(Boolean));
        break;
      default:
        input = document.createElement('input'); input.type = 'text'; input.value = val ?? '';
        if (f.placeholder) input.placeholder = f.placeholder;
        input.oninput = () => set(input.value);
    }
    const l = document.createElement('label'); l.className = 'field' + (f.half ? ' half' : '') + (f.third ? ' third' : '');
    const sp = document.createElement('span'); sp.textContent = f.label; l.append(sp, input);
    if (f.hint) { const h = document.createElement('small'); h.className = 'hint'; h.innerHTML = f.hint; l.appendChild(h); }
    return l;
  }
  function fieldGrid(fields, obj, onChange) {
    const box = document.createElement('div'); box.className = 'fgrid';
    for (const f of fields) { const el = makeField(f, obj, onChange); if (el) box.appendChild(el); }
    return box;
  }

  function renderSections() {
    const top = $('sectionsTop'), bottom = $('sectionsBottom'); top.innerHTML = ''; bottom.innerHTML = '';
    (state.tpl.schema.sections || []).forEach((sec, i) => {
      const d = document.createElement('details'); if (sec.open) d.open = true;
      const sm = document.createElement('summary'); sm.textContent = sec.title; d.appendChild(sm);
      if (sec.hint) { const p = document.createElement('p'); p.className = 'hint'; p.innerHTML = sec.hint; d.appendChild(p); }
      d.appendChild(fieldGrid(sec.fields, state.cfg, () => { state.processed.clear(); refreshSoon(); }));
      (i === 0 || sec.top ? top : bottom).appendChild(d);
    });
  }

  function renderScenes() {
    const box = $('scenes'); box.innerHTML = '';
    $('sceneHint').innerHTML = state.tpl.schema.sceneHint || '';
    const scenes = state.cfg.scenes;
    scenes.forEach((s, i) => {
      const card = document.createElement('div'); card.className = 'scene-card' + (s.off ? ' off' : '');
      const head = document.createElement('div'); head.className = 'scene-head';
      const title = document.createElement('strong'); title.textContent = `${i + 1}. ${state.tpl.schema.sceneTypes[s.type] || s.type}`;
      const tools = document.createElement('div'); tools.className = 'scene-tools';
      const btn = (txt, tip, fn, dis) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost'; b.textContent = txt; b.title = tip; b.disabled = !!dis; b.onclick = fn; tools.appendChild(b); };
      btn('↑', 'Выше', () => move(i, -1), i === 0);
      btn('↓', 'Ниже', () => move(i, 1), i === scenes.length - 1);
      btn('⧉', 'Дублировать', () => { scenes.splice(i + 1, 0, JSON.parse(JSON.stringify(s))); renderScenes(); refreshSoon(); });
      btn('✕', 'Удалить', () => { scenes.splice(i, 1); renderScenes(); refreshSoon(); }, scenes.length === 1);
      head.append(title, tools); card.appendChild(head);
      const fields = (state.tpl.schema.sceneFields || {})[s.type] || [];
      card.appendChild(fieldGrid(fields, s, (f, structural) => { if (structural) renderScenes(); refreshSoon(); }));
      box.appendChild(card);
    });
    const nt = $('newSceneType'); const cur = nt.value; nt.innerHTML = '';
    for (const [k, v] of Object.entries(state.tpl.schema.sceneTypes)) { const o = document.createElement('option'); o.value = k; o.textContent = v; nt.appendChild(o); }
    if (cur && state.tpl.schema.sceneTypes[cur]) nt.value = cur;
  }
  function move(i, d) { const a = state.cfg.scenes; [a[i], a[i + d]] = [a[i + d], a[i]]; renderScenes(); refreshSoon(); }

  function renderGallery() {
    const g = $('gallery'); g.innerHTML = '';
    for (const n of allImageNames()) {
      const it = document.createElement('div'); it.className = 'thumb';
      const im = document.createElement('img'); im.src = imgSrc(n); im.alt = n; im.loading = 'lazy';
      const cap = document.createElement('span'); cap.textContent = imgLabel(n);
      it.append(im, cap);
      if (state.uploads[n]) {
        const del = document.createElement('button'); del.type = 'button'; del.className = 'ghost del'; del.textContent = '✕'; del.title = 'Удалить';
        del.onclick = () => {
          if (state.tpl.usedImages(state.cfg).includes(n)) { msg(`Картинка «${n}» используется в сцене — сначала выбери там другую.`, true); return; }
          delete state.uploads[n]; idb.del(n); renderGallery(); renderScenes();
        };
        it.appendChild(del);
      }
      g.appendChild(it);
    }
  }

  const toHex6 = v => /^#[0-9a-f]{3}$/i.test(v) ? '#' + [...v.slice(1)].map(x => x + x).join('') : v;
  function renderColors() {
    const box = $('colors'); box.innerHTML = '';
    const sc = state.tpl.schema.colors; if (!sc) { box.closest('details').classList.add('hidden'); return; }
    box.closest('details').classList.remove('hidden');
    const obj = getPath(state.cfg, sc.path) || {};
    for (const [k, v] of Object.entries(obj)) {
      const l = document.createElement('label'); l.className = 'color-row';
      const i = document.createElement('input'); i.type = 'color';
      const isAuto = !/^#[0-9a-f]{3,6}$/i.test(String(v));
      i.value = isAuto ? '#888888' : toHex6(v);
      const sp = document.createElement('span'); sp.textContent = colorLabel(k) + (isAuto ? ' · авто' : '');
      i.oninput = () => { obj[k] = i.value.toUpperCase(); sp.textContent = colorLabel(k); refreshSoon(); };
      l.append(i, sp); box.appendChild(l);
    }
  }

  function renderAll() {
    renderSections(); renderScenes(); renderGallery(); renderColors(); refresh();
  }

  // ------------------------------------------------------------ шаблоны
  const templates = () => Object.values(window.Templates || {});
  async function useTemplate(id) {
    const tpl = window.Templates[id] || templates()[0];
    state.tpl = tpl; lsSet(LS_TPL, tpl.id);
    let saved = null; try { saved = JSON.parse(lsGet(lsKey(tpl.id)) || 'null'); } catch (_) {}
    state.cfg = normalize(tpl, saved);
    state.processed.clear();
    $('templateSelect').value = tpl.id;
    renderAll();
  }

  // ------------------------------------------------------------ экспорт
  async function measureViewBox() {
    const wide = state.tpl.wideViewBox;
    const r = await build({ ...state.cfg, viewBox: wide });
    const k = 0.25, W = Math.round(wide[2] * k), H = Math.round(wide[3] * k);
    const snap = await SvgEngine.createSnapshotter(r.svg, wide[2], wide[3]);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    try {
      const steps = Math.ceil(r.duration / 0.25);
      for (let i = 0; i < steps; i++) {
        await SvgEngine.drawSvgString(g, await snap.snapshot(i * 0.25 + 0.05), W, H);
        const d = g.getImageData(0, 0, W, H).data;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 3) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        setProgress((i + 1) / steps * 0.08, `Замеряю границы… ${i + 1}/${steps}`);
      }
    } finally { snap.destroy(); }
    if (x1 < 0) return null;
    const pad = 12;
    let vw = Math.ceil((x1 - x0 + 1) / k + 2 * pad), vh = Math.ceil((y1 - y0 + 1) / k + 2 * pad);
    vw += vw % 2; vh += vh % 2;
    return [Math.floor(wide[0] + x0 / k - pad), Math.floor(wide[1] + y0 / k - pad), vw, vh];
  }

  let abort = null;
  function setProgress(v, text) { $('progress').classList.remove('hidden'); $('progress').value = v; if (text) $('exportLog').textContent = text; }
  const fmtT = s => { s = Math.max(0, Math.round(s)); return s >= 60 ? `${Math.floor(s / 60)} мин ${s % 60} с` : `${s} с`; };
  const fileBase = () => `banner_${state.tpl.id}_${String(state.cfg.promo_code || 'banner').replace(/[^\wА-Яа-яЁё-]+/g, '_')}`;

  async function renderWebm() {
    if (abort) { abort.abort(); return; }
    const btn = $('renderWebm'); const label = btn.textContent;
    abort = new AbortController(); btn.textContent = 'Остановить';
    try {
      if (!(await SvgEngine.isOfflineSupported())) throw new Error('Нужен свежий Chrome или Edge (WebCodecs).');
      let cfg = state.cfg;
      if ($('trim').checked) { const vb = await measureViewBox(); if (vb) cfg = { ...state.cfg, viewBox: vb }; }
      const r = await build(cfg);
      const fps = Number($('fps').value), scale = Number($('scale').value);
      const blob = await SvgEngine.renderWebM({
        svgText: r.svg, width: r.width, height: r.height, fps, duration: r.duration, scale, signal: abort.signal,
        onProgress: p => setProgress(0.08 + 0.92 * p.frame / p.total, `Кадр ${p.frame} из ${p.total} · прошло ${fmtT(p.elapsed)} · осталось ~${fmtT(p.eta)}`)
      });
      const url = URL.createObjectURL(blob), name = fileBase() + '.webm';
      $('video').src = url; $('videoLink').href = url; $('videoLink').download = name;
      $('videoShell').classList.remove('hidden'); $('videoActions').classList.remove('hidden');
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
      $('exportLog').textContent = `Готово: ${name}, ${(blob.size / 1024 / 1024).toFixed(1)} МБ, ${Math.round(r.width * scale)}×${Math.round(r.height * scale)}, ${fps} fps, прозрачный фон. В OBS: «Медиа-источник» + «Повтор».`;
    } catch (e) {
      $('exportLog').textContent = 'Ошибка: ' + e.message;
    } finally { abort = null; btn.textContent = label; $('progress').classList.add('hidden'); }
  }
  async function downloadSvg() {
    try {
      const r = await build();
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' }));
      a.download = fileBase() + '.svg'; a.click();
    } catch (e) { msg('Ошибка: ' + e.message, true); }
  }

  // ------------------------------------------------------------ проект
  function saveProject() {
    const data = { app: 'svg-to-webm/constructor', version: 2, template: state.tpl.id, config: state.cfg, uploads: state.uploads };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = fileBase() + '.json'; a.click();
  }
  async function loadProject(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data.config || !Array.isArray(data.config.scenes)) throw new Error('Это не файл проекта конструктора.');
      const id = data.template || data.config.template || 'v3d';
      if (!window.Templates[id]) throw new Error(`В этой версии нет шаблона «${id}».`);
      state.uploads = { ...state.uploads, ...(data.uploads || {}) };
      for (const [k, v] of Object.entries(data.uploads || {})) await idb.put(k, v);
      lsSet(lsKey(id), JSON.stringify(data.config));
      await useTemplate(id); msg('Проект открыт.');
    } catch (e) { msg('Ошибка: ' + e.message, true); }
  }
  async function uploadFiles(files) {
    for (const f of files) {
      let name = f.name.replace(/[^\w.а-яА-ЯёЁ-]+/g, '_');
      if (!/\.(png|webp|jpe?g)$/i.test(name)) name += '.png';
      while (templates().some(t => t.builtinImages.includes(name))) name = 'my_' + name;
      const url = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
      state.uploads[name] = url; idb.put(name, url);
      [...state.processed.keys()].filter(k => k.startsWith(name + '|')).forEach(k => state.processed.delete(k));
    }
    renderGallery(); renderScenes();
    msg(`Загружено: ${files.length}. Выбери картинку в нужной сцене.`);
  }

  // ------------------------------------------------------------ старт
  function debounce(fn, ms) { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  async function init() {
    const st = $('status');
    const list = templates();
    if (!list.length) { st.textContent = 'Шаблоны не загрузились'; st.classList.add('warn'); return; }
    const ts = $('templateSelect');
    for (const t of list) { const o = document.createElement('option'); o.value = t.id; o.textContent = t.title; ts.appendChild(o); }
    ts.onchange = () => useTemplate(ts.value);
    state.uploads = await idb.all();

    $('addScene').onclick = () => { state.cfg.scenes.push(state.tpl.schema.newScene[$('newSceneType').value]()); renderScenes(); refreshSoon(); };
    $('upload').onchange = e => { if (e.target.files.length) uploadFiles([...e.target.files]); e.target.value = ''; };
    $('resetColors').onclick = () => { const sc = state.tpl.schema.colors; setPath(state.cfg, sc.path, JSON.parse(JSON.stringify(getPath(state.tpl.defaults(), sc.path)))); renderColors(); refreshSoon(); };
    $('saveProject').onclick = saveProject;
    $('loadProject').onchange = e => { if (e.target.files[0]) loadProject(e.target.files[0]); e.target.value = ''; };
    $('resetAll').onclick = () => {
      if (!confirm('Сбросить тексты, сцены и цвета этого шаблона к исходным? Загруженные картинки останутся.')) return;
      state.cfg = normalize(state.tpl, null); state.processed.clear(); renderAll();
    };
    $('renderWebm').onclick = renderWebm;
    $('downloadSvg').onclick = downloadSvg;
    $('playPause').onclick = () => {
      const s = svgEl(); if (!s) return;
      state.playing = !state.playing;
      if (state.playing) s.unpauseAnimations(); else s.pauseAnimations();
      $('playPause').textContent = state.playing ? '❚❚' : '▶';
    };
    $('scrub').oninput = e => seek(Number(e.target.value));
    document.querySelectorAll('[data-bg]').forEach(b => b.onclick = () => {
      const sh = $('previewShell'); sh.classList.remove('stream-bg', 'checker', 'black-bg'); sh.classList.add(b.dataset.bg);
    });

    try { await useTemplate(lsGet(LS_TPL) || list[0].id); }
    catch (e) { st.textContent = 'Не загрузились файлы шаблона — открой страницу через сервер, не file://'; st.classList.add('warn'); return; }
    const ok = await SvgEngine.isOfflineSupported();
    st.textContent = ok ? 'Готово · экспорт WebM с прозрачностью доступен' : 'Превью работает, но для экспорта нужен свежий Chrome/Edge';
    st.classList.add(ok ? 'ok' : 'warn');
    requestAnimationFrame(tick);
  }
  window.addEventListener('DOMContentLoaded', init);
})();

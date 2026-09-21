/* Конструктор баннера: форма → config → шаблон → SVG → живое превью → WebM через SvgEngine. */
(function () {
  const $ = id => document.getElementById(id);
  const TPL = window.Templates.v3d;
  const LS_KEY = 'banner-constructor:v3d';
  const state = {
    cfg: null,
    uploads: {},        // name -> dataUrl (исходник, загруженный пользователем)
    processed: new Map(),
    fonts: null, metrics: null,
    svg: '', duration: 16, playing: true, sceneStarts: []
  };

  // ------------------------------------------------------------ хранение
  const idb = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('banner-constructor', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('uploads');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const tx = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('uploads', mode); const st = t.objectStore('uploads');
        const out = fn(st); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error);
      });
    };
    return {
      put: (k, v) => tx('readwrite', st => st.put(v, k)).catch(() => {}),
      del: k => tx('readwrite', st => st.delete(k)).catch(() => {}),
      clear: () => tx('readwrite', st => st.clear()).catch(() => {}),
      all: async () => {
        try {
          const db = await open();
          return await new Promise((res, rej) => {
            const out = {}; const t = db.transaction('uploads', 'readonly'); const req = t.objectStore('uploads').openCursor();
            req.onsuccess = () => { const c = req.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
            req.onerror = () => rej(req.error);
          });
        } catch (_) { return {}; }
      }
    };
  })();
  const saveCfg = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(state.cfg)); } catch (_) {} };
  const loadCfg = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (_) { return null; } };

  // ------------------------------------------------------------ картинки
  const loadImg = src => new Promise((res, rej) => {
    const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Не удалось открыть картинку')); im.src = src;
  });

  function isGreenScreen(d, w, h) {
    const pts = [[2, 2], [w - 3, 2], [2, h >> 1], [w - 3, h >> 1], [w >> 1, 2]];
    let hits = 0;
    for (const [x, y] of pts) {
      const p = (y * w + x) * 4;
      if (d[p + 3] > 200 && d[p + 1] - Math.max(d[p], d[p + 2]) > 60) hits++;
    }
    return hits >= 3;
  }

  function keyGreen(img) {   // тот же рецепт, что в build.py
    const { data: d, width: w, height: h } = img;
    const a = new Float32Array(w * h);
    for (let i = 0, p = 0; i < a.length; i++, p += 4) {
      const gr = d[p + 1] - Math.max(d[p], d[p + 2]);
      a[i] = 1 - Math.min(1, Math.max(0, (gr - 38) / 72));
    }
    const er = new Float32Array(w * h);           // MinFilter 3×3
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = 1;
      for (let dy = -1; dy <= 1; dy++) { const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) { const v = a[yy * w + Math.min(w - 1, Math.max(0, x + dx))]; if (v < m) m = v; } }
      er[y * w + x] = m;
    }
    const K = [0.0625, 0.125, 0.0625, 0.125, 0.25, 0.125, 0.0625, 0.125, 0.0625];   // лёгкий blur
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++) { const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) s += er[yy * w + Math.min(w - 1, Math.max(0, x + dx))] * K[k++]; }
      const p = (y * w + x) * 4;
      const lim = Math.max(d[p], d[p + 2]) * 1.02 + 6;
      if (d[p + 1] > lim) d[p + 1] = lim;
      d[p + 3] = Math.round(s * 255);
    }
    return img;
  }

  async function processImage(name) {
    const ch = state.cfg.character || {};
    const tk = (state.cfg.image_tweaks || {})[name] || {};
    const scale = (Number(ch.scale) || 0.86) * (Number(tk.scale) || 1);
    const key = `${name}|${scale}|${ch.mirror !== false}`;
    if (state.processed.has(key)) return state.processed.get(key);
    const src = state.uploads[name] || (TPL.builtinImages.includes(name) ? TPL.assetDir + name : null);
    if (!src) throw new Error(`Нет картинки «${name}»`);
    const im = await loadImg(src);
    let cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    let g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
    let px = g.getImageData(0, 0, cv.width, cv.height);
    if (isGreenScreen(px.data, cv.width, cv.height)) {
      keyGreen(px); g.putImageData(px, 0, 0);
      if (cv.width >= 1600) {                   // сырой скрин 2560×1440 -> масштаб как у готовых u1..u10
        const k = 1536 / cv.width, c2 = document.createElement('canvas');
        c2.width = Math.round(cv.width * k); c2.height = Math.round(cv.height * k);
        c2.getContext('2d').drawImage(cv, 0, 0, c2.width, c2.height);
        cv = c2; g = cv.getContext('2d', { willReadFrequently: true }); px = g.getImageData(0, 0, cv.width, cv.height);
      }
    }
    // обрезка по непрозрачному (низ оставляем — обрез по поясу)
    const d = px.data, W = cv.width, H = cv.height;
    let x0 = W, x1 = -1, y0 = H;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; }
    if (x1 < 0) throw new Error(`Картинка «${name}» полностью прозрачная`);
    const cw = x1 - x0 + 1, chh = H - y0;
    const ow = Math.max(1, Math.round(cw * scale)), oh = Math.max(1, Math.round(chh * scale));
    const out = document.createElement('canvas'); out.width = ow; out.height = oh;
    const og = out.getContext('2d'); og.imageSmoothingQuality = 'high';
    if (ch.mirror !== false) { og.translate(ow, 0); og.scale(-1, 1); }
    og.drawImage(cv, x0, y0, cw, chh, 0, 0, ow, oh);
    const res = { w: ow, h: oh, dataUrl: out.toDataURL('image/png') };
    state.processed.set(key, res);
    return res;
  }

  function usedImages() {
    const s = new Set();
    for (const sc of state.cfg.scenes) { if (sc.emotion) s.add(sc.emotion); if (sc.react && sc.react.emotion) s.add(sc.react.emotion); }
    return [...s];
  }
  const allImageNames = () => [...TPL.builtinImages, ...Object.keys(state.uploads)];
  const imgLabel = n => TPL.emotionNames[n] ? `${n.replace('.png', '')} — ${TPL.emotionNames[n]}` : n;
  const imgSrc = n => state.uploads[n] || TPL.assetDir + n;

  // ------------------------------------------------------------ генерация + превью
  async function build(cfg = state.cfg) {
    const images = {};
    for (const n of usedImages()) images[n] = await processImage(n);
    return TPL.generate(cfg, { fonts: state.fonts, metrics: state.metrics, images });
  }

  let buildSeq = 0;
  async function refresh() {
    const seq = ++buildSeq;
    saveCfg();
    try {
      const r = await build();
      if (seq !== buildSeq) return;
      state.svg = r.svg; state.duration = r.duration;
      let t = 0; state.sceneStarts = state.cfg.scenes.map(s => { const a = t; t += Number(s.duration); return a; });
      showPreview(r);
      msg(r.warnings.length ? '⚠ ' + r.warnings.join('\n⚠ ') : `Луп ${r.duration} с · ${state.cfg.scenes.length} сцен(ы) · всё ок`);
      $('loopInfo').textContent = `· луп ${r.duration} с`;
    } catch (e) {
      if (seq === buildSeq) msg('Ошибка: ' + e.message, true);
    }
  }
  const refreshSoon = debounce(refresh, 350);

  function showPreview(r) {
    const fr = $('preview');
    const keepT = currentTime();
    fr.style.aspectRatio = `${r.width} / ${r.height}`;
    fr.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><style>:root{color-scheme:dark}html,body{margin:0;height:100%;background:transparent;overflow:hidden}svg{width:100%;height:100%;display:block}</style></head><body>${r.svg}</body></html>`;
    fr.onload = () => {
      const s = svgEl(); if (!s) return;
      s.setCurrentTime(Math.min(keepT, r.duration - 0.01));
      if (!state.playing) s.pauseAnimations();
    };
    $('scrub').max = String(r.duration);
    renderChips();
  }
  const svgEl = () => { try { return $('preview').contentDocument.querySelector('svg'); } catch (_) { return null; } };
  const currentTime = () => { const s = svgEl(); return s ? s.getCurrentTime() % (state.duration || 16) : 0; };
  function seek(t) { const s = svgEl(); if (s) { s.setCurrentTime(t); } }
  function tick() {
    const t = currentTime();
    if (document.activeElement !== $('scrub')) $('scrub').value = String(t);
    $('timeLabel').textContent = `${t.toFixed(1)} с`;
    const idx = state.sceneStarts.reduce((a, st, i) => (t >= st ? i : a), 0);
    document.querySelectorAll('.scene-chips button').forEach((b, i) => b.classList.toggle('on', i === idx));
    requestAnimationFrame(tick);
  }
  function renderChips() {
    const box = $('sceneChips'); box.innerHTML = '';
    state.cfg.scenes.forEach((s, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost';
      b.textContent = `${i + 1}. ${TPL.sceneTypes[s.type].split(':')[0]}`;
      b.onclick = () => { seek(state.sceneStarts[i] + Number(s.duration) * 0.72); };
      box.appendChild(b);
    });
  }
  function msg(text, err) { const m = $('messages'); m.textContent = text; m.classList.toggle('error', !!err); }

  // ------------------------------------------------------------ форма
  const COLOR_OPTIONS = () => Object.keys(state.cfg.colors);
  function colorSelect(value, onChange) {
    const s = document.createElement('select');
    for (const k of COLOR_OPTIONS()) { const o = document.createElement('option'); o.value = k; o.textContent = TPL.colorLabels[k] || k; s.appendChild(o); }
    s.value = value; s.onchange = () => onChange(s.value); return s;
  }
  function imageSelect(value, onChange, allowNone) {
    const s = document.createElement('select');
    if (allowNone) { const o = document.createElement('option'); o.value = ''; o.textContent = '— без смены —'; s.appendChild(o); }
    for (const n of allImageNames()) { const o = document.createElement('option'); o.value = n; o.textContent = imgLabel(n); s.appendChild(o); }
    s.value = value || ''; s.onchange = () => onChange(s.value); return s;
  }
  function field(label, input, cls) {
    const l = document.createElement('label'); l.className = 'field' + (cls ? ' ' + cls : '');
    const sp = document.createElement('span'); sp.textContent = label; l.append(sp, input); return l;
  }
  function textInput(value, onInput, ph) {
    const i = document.createElement('input'); i.type = 'text'; i.value = value ?? ''; if (ph) i.placeholder = ph;
    i.oninput = () => onInput(i.value); return i;
  }
  function numInput(value, onInput, min, max, step) {
    const i = document.createElement('input'); i.type = 'number'; i.value = value; i.min = min; i.max = max; i.step = step;
    i.oninput = () => { const v = Number(i.value); if (Number.isFinite(v)) onInput(v); }; return i;
  }

  function renderScenes() {
    const box = $('scenes'); box.innerHTML = '';
    state.cfg.scenes.forEach((s, i) => {
      const card = document.createElement('div'); card.className = 'scene-card';
      const head = document.createElement('div'); head.className = 'scene-head';
      const title = document.createElement('strong'); title.textContent = `${i + 1}. ${TPL.sceneTypes[s.type]}`;
      const tools = document.createElement('div'); tools.className = 'scene-tools';
      const btn = (txt, tip, fn, dis) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost'; b.textContent = txt; b.title = tip; b.disabled = !!dis; b.onclick = fn; tools.appendChild(b); };
      btn('↑', 'Выше', () => move(i, -1), i === 0);
      btn('↓', 'Ниже', () => move(i, 1), i === state.cfg.scenes.length - 1);
      btn('⧉', 'Дублировать', () => { state.cfg.scenes.splice(i + 1, 0, JSON.parse(JSON.stringify(s))); rerender(); });
      btn('✕', 'Удалить', () => { if (state.cfg.scenes.length > 1) { state.cfg.scenes.splice(i, 1); rerender(); } }, state.cfg.scenes.length === 1);
      head.append(title, tools);
      card.appendChild(head);

      const upd = (k, v) => { s[k] = v; refreshSoon(); };
      const row = document.createElement('div'); row.className = 'fields two';
      row.append(field('Длительность, с', numInput(s.duration, v => { s.duration = Math.max(2.5, v); refreshSoon(); }, 2.5, 20, 0.5)),
        field('Картинка персонажа', imageSelect(s.emotion, v => upd('emotion', v))));
      card.appendChild(row);
      const r2 = document.createElement('div'); r2.className = 'fields two';
      const react = s.react || {};
      r2.append(field('Сменить эмоцию на (удар)', imageSelect(react.emotion, v => {
        if (!v) delete s.react; else s.react = { at: (s.react && s.react.at) || 0.9, emotion: v };
        refreshSoon(); rerender(false);
      }, true)));
      if (s.react) r2.append(field('…через, с от начала сцены', numInput(react.at, v => { s.react.at = v; refreshSoon(); }, 0.1, 19, 0.05)));
      card.appendChild(r2);
      card.appendChild(field('Подводка (маленькая строка сверху)', textInput(s.kicker, v => upd('kicker', v))));

      if (s.type === 'text') {
        const lines = s.lines || (s.lines = ['', '']);
        card.appendChild(field('Строка 1', textInput(lines[0], v => { lines[0] = v; refreshSoon(); }, 'ГОТОВАЯ МОДЕЛЬ')));
        card.appendChild(field('Строка 2 (можно пусто)', textInput(lines[1], v => { lines[1] = v; refreshSoon(); }, '{ОТ 490 ₽}')));
        card.appendChild(field('Подчеркнуть (кусок последней строки)', textInput(s.underline, v => upd('underline', v), '490 ₽')));
        card.appendChild(field('Строка под заголовком (если строка одна)', textInput(s.sub, v => upd('sub', v))));
      } else if (s.type === 'counter') {
        const r3 = document.createElement('div'); r3.className = 'fields three';
        r3.append(field('Число', numInput(s.number, v => upd('number', Math.round(v)), 0, 1e9, 1)),
          field('Суффикс', textInput(s.suffix, v => upd('suffix', v), '+')),
          field('Слово', textInput(s.word, v => upd('word', v), 'ТОВАРОВ')));
        card.appendChild(r3);
        card.appendChild(field('Строка под числом', textInput(s.sub, v => upd('sub', v))));
      } else if (s.type === 'promo') {
        card.appendChild(field('Заголовок (часть в {} впечатывается ударом)', textInput(s.headline, v => upd('headline', v), 'СКИДКА {10%}')));
        card.appendChild(field('Слово перед кодом', textInput(s.label, v => upd('label', v), 'промокод')));
      } else if (s.type === 'site') {
        card.appendChild(field('Как написать сайт (пусто = из поля «Сайт»)', textInput(s.site_display, v => upd('site_display', v), 'VTUBIKA{.STORE}')));
        card.appendChild(field('Строка под сайтом', textInput(s.sub, v => upd('sub', v))));
      }
      box.appendChild(card);
    });
  }
  function move(i, d) { const a = state.cfg.scenes; [a[i], a[i + d]] = [a[i + d], a[i]]; rerender(); }

  const NEW_SCENE = {
    text: () => ({ type: 'text', duration: 4, emotion: 'u3.png', kicker: 'Подводка', lines: ['НОВАЯ СЦЕНА', '{ТЕКСТ}'] }),
    counter: () => ({ type: 'counter', duration: 4, emotion: 'u2.png', kicker: 'Подводка', number: 100, suffix: '+', word: 'МОДЕЛЕЙ', sub: '' }),
    promo: () => ({ type: 'promo', duration: 4, emotion: 'u7.png', react: { at: 0.95, emotion: 'u10.png' }, kicker: 'Подводка', headline: 'СКИДКА {10%}', label: 'промокод' }),
    site: () => ({ type: 'site', duration: 4, emotion: 'u5.png', kicker: 'Подводка', sub: '' })
  };

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
          if (usedImages().includes(n)) { msg(`Картинка «${n}» используется в сцене — сначала выбери там другую.`, true); return; }
          delete state.uploads[n]; idb.del(n); renderGallery(); renderScenes();
        };
        it.appendChild(del);
      }
      g.appendChild(it);
    }
  }

  function renderColors() {
    const box = $('colors'); box.innerHTML = '';
    for (const [k, v] of Object.entries(state.cfg.colors)) {
      const l = document.createElement('label'); l.className = 'color-row';
      const i = document.createElement('input'); i.type = 'color'; i.value = v.length === 4 ? '#' + [...v.slice(1)].map(x => x + x).join('') : v;
      i.oninput = () => { state.cfg.colors[k] = i.value.toUpperCase(); refreshSoon(); };
      const sp = document.createElement('span'); sp.textContent = TPL.colorLabels[k] || k;
      l.append(i, sp); box.appendChild(l);
    }
  }

  function bindStatic() {
    const cfg = state.cfg;
    const bind = (id, get, set, ev = 'input') => { const el = $(id); get(el); el.addEventListener(ev, () => { set(el); refreshSoon(); }); };
    bind('promo', el => el.value = cfg.promo_code, el => cfg.promo_code = el.value.trim());
    bind('site', el => el.value = cfg.site, el => cfg.site = el.value.trim());
    bind('chScale', el => el.value = cfg.character.scale, el => { const v = Number(el.value); if (v > 0) cfg.character.scale = v; });
    bind('chMirror', el => el.checked = cfg.character.mirror !== false, el => cfg.character.mirror = el.checked, 'change');
    bind('chRays', el => el.checked = cfg.character.rays !== false, el => cfg.character.rays = el.checked, 'change');
    const glow = $('chGlow'); glow.innerHTML = '';
    for (const k of Object.keys(cfg.colors)) { const o = document.createElement('option'); o.value = k; o.textContent = TPL.colorLabels[k] || k; glow.appendChild(o); }
    glow.value = cfg.character.glow || 'lavender'; glow.onchange = () => { cfg.character.glow = glow.value; refreshSoon(); };
    bind('rbFrontOn', el => el.checked = cfg.ribbons.front.enabled !== false, el => cfg.ribbons.front.enabled = el.checked, 'change');
    bind('rbBackOn', el => el.checked = cfg.ribbons.back.enabled !== false, el => cfg.ribbons.back.enabled = el.checked, 'change');
    bind('rbFrontWords', el => el.value = cfg.ribbons.front.words.join(', '), el => cfg.ribbons.front.words = el.value.split(',').map(s => s.trim()).filter(Boolean));
    bind('rbBackWords', el => el.value = cfg.ribbons.back.words.join(', '), el => cfg.ribbons.back.words = el.value.split(',').map(s => s.trim()).filter(Boolean));
    bind('decObjects', el => el.checked = cfg.decor.objects !== false, el => cfg.decor.objects = el.checked, 'change');
    bind('decProgress', el => el.checked = cfg.decor.progress !== false, el => cfg.decor.progress = el.checked, 'change');
  }

  function rerender(all = true) {
    renderScenes();
    if (all) { renderGallery(); renderColors(); }
    refreshSoon();
  }

  function fullRender() {
    // статичные поля переназначаем через клон, чтобы не копились обработчики
    ['promo', 'site', 'chScale', 'chMirror', 'chRays', 'rbFrontOn', 'rbBackOn', 'rbFrontWords', 'rbBackWords', 'decObjects', 'decProgress'].forEach(id => {
      const el = $(id); const cl = el.cloneNode(true); el.replaceWith(cl);
    });
    bindStatic(); renderScenes(); renderGallery(); renderColors(); refresh();
  }

  // ------------------------------------------------------------ экспорт
  async function measureViewBox() {
    const wide = TPL.wideViewBox;
    const r = await build({ ...state.cfg, viewBox: wide });
    const k = 0.25, W = Math.round(wide[2] * k), H = Math.round(wide[3] * k);
    const snap = await SvgEngine.createSnapshotter(r.svg, wide[2], wide[3]);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    try {
      const steps = Math.ceil(r.duration / 0.25);
      for (let i = 0; i < steps; i++) {
        const svg = await snap.snapshot(i * 0.25 + 0.05);
        await SvgEngine.drawSvgString(g, svg, W, H);
        const d = g.getImageData(0, 0, W, H).data;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 3) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        setProgress((i + 1) / steps * 0.08, `Замеряю границы… ${i + 1}/${steps}`);
      }
    } finally { snap.destroy(); }
    if (x1 < 0) return null;
    const pad = 12;
    const vx = Math.floor(wide[0] + x0 / k - pad), vy = Math.floor(wide[1] + y0 / k - pad);
    let vw = Math.ceil((x1 - x0 + 1) / k + 2 * pad), vh = Math.ceil((y1 - y0 + 1) / k + 2 * pad);
    vw += vw % 2; vh += vh % 2;
    return [vx, vy, vw, vh];
  }

  let abort = null;
  function setProgress(v, text) {
    $('progress').classList.remove('hidden'); $('progress').value = v;
    if (text) $('exportLog').textContent = text;
  }
  const fmtT = s => { s = Math.max(0, Math.round(s)); return s >= 60 ? `${Math.floor(s / 60)} мин ${s % 60} с` : `${s} с`; };

  async function renderWebm() {
    if (abort) { abort.abort(); return; }
    const btn = $('renderWebm'); const label = btn.textContent;
    abort = new AbortController(); btn.textContent = 'Остановить';
    try {
      if (!(await SvgEngine.isOfflineSupported())) throw new Error('Нужен свежий Chrome или Edge (WebCodecs).');
      let cfg = state.cfg;
      if ($('trim').checked) {
        const vb = await measureViewBox();
        if (vb) cfg = { ...state.cfg, viewBox: vb };
      }
      const r = await build(cfg);
      const fps = Number($('fps').value), scale = Number($('scale').value);
      const blob = await SvgEngine.renderWebM({
        svgText: r.svg, width: r.width, height: r.height, fps, duration: r.duration, scale, signal: abort.signal,
        onProgress: p => setProgress(0.08 + 0.92 * p.frame / p.total, `Кадр ${p.frame} из ${p.total} · прошло ${fmtT(p.elapsed)} · осталось ~${fmtT(p.eta)}`)
      });
      const url = URL.createObjectURL(blob);
      const name = `banner_${(state.cfg.promo_code || 'banner').replace(/[^\wА-Яа-яЁё-]+/g, '_')}.webm`;
      $('video').src = url; $('videoLink').href = url; $('videoLink').download = name;
      $('videoShell').classList.remove('hidden'); $('videoActions').classList.remove('hidden');
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
      $('exportLog').textContent = `Готово: ${name}, ${(blob.size / 1024 / 1024).toFixed(1)} МБ, ${Math.round(r.width * scale)}×${Math.round(r.height * scale)}, ${fps} fps, прозрачный фон. В OBS: «Медиа-источник» + «Повтор».`;
    } catch (e) {
      $('exportLog').textContent = 'Ошибка: ' + e.message;
    } finally {
      abort = null; btn.textContent = label; $('progress').classList.add('hidden');
    }
  }

  async function downloadSvg() {
    try {
      let cfg = state.cfg;
      const r = await build(cfg);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' }));
      a.download = 'banner.svg'; a.click();
    } catch (e) { msg('Ошибка: ' + e.message, true); }
  }

  // ------------------------------------------------------------ проект
  function saveProject() {
    const data = { app: 'svg-to-webm/constructor', version: 1, config: state.cfg, uploads: state.uploads };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = `banner_${(state.cfg.promo_code || 'project').replace(/[^\wА-Яа-яЁё-]+/g, '_')}.json`; a.click();
  }
  async function loadProject(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data.config || !Array.isArray(data.config.scenes)) throw new Error('Это не файл проекта конструктора.');
      state.cfg = normalize(data.config);
      state.uploads = data.uploads || {};
      await idb.clear(); for (const [k, v] of Object.entries(state.uploads)) await idb.put(k, v);
      state.processed.clear(); fullRender(); msg('Проект открыт.');
    } catch (e) { msg('Ошибка: ' + e.message, true); }
  }
  function normalize(c) {
    const d = TPL.defaults();
    return {
      ...d, ...c,
      colors: { ...d.colors, ...(c.colors || {}) },
      character: { ...d.character, ...(c.character || {}) },
      ribbons: { front: { ...d.ribbons.front, ...((c.ribbons || {}).front || {}) }, back: { ...d.ribbons.back, ...((c.ribbons || {}).back || {}) } },
      decor: { ...d.decor, ...(c.decor || {}) },
      image_tweaks: c.image_tweaks || {},
      scenes: c.scenes && c.scenes.length ? c.scenes : d.scenes
    };
  }

  async function uploadFiles(files) {
    for (const f of files) {
      let name = f.name.replace(/[^\w.а-яА-ЯёЁ-]+/g, '_');
      if (!/\.(png|webp|jpe?g)$/i.test(name)) name += '.png';
      while (TPL.builtinImages.includes(name)) name = 'my_' + name;
      const url = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
      state.uploads[name] = url; idb.put(name, url);
      [...state.processed.keys()].filter(k => k.startsWith(name + '|')).forEach(k => state.processed.delete(k));
    }
    renderGallery(); renderScenes();
    msg(`Загружено: ${files.length}. Выбери картинку в нужной сцене («Картинка персонажа»).`);
  }

  // ------------------------------------------------------------ старт
  function debounce(fn, ms) { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  async function fetchB64(url) {
    const buf = await (await fetch(url)).arrayBuffer(); const u = new Uint8Array(buf); let s = '';
    for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
    return btoa(s);
  }

  async function init() {
    const st = $('status');
    try {
      const [unb, man, metrics] = await Promise.all([fetchB64('assets/fonts/unbounded-800.woff2'), fetchB64('assets/fonts/manrope-800.woff2'),
        fetch('assets/fonts/metrics.json').then(r => r.json())]);
      state.fonts = { unbounded: unb, manrope: man }; state.metrics = metrics;
    } catch (e) {
      st.textContent = 'Не загрузились шрифты — открой страницу через сервер, не file://'; st.classList.add('warn'); return;
    }
    const ts = $('templateSelect'); const o = document.createElement('option'); o.value = 'v3d'; o.textContent = TPL.title; ts.appendChild(o);
    const nt = $('newSceneType');
    for (const [k, v] of Object.entries(TPL.sceneTypes)) { const op = document.createElement('option'); op.value = k; op.textContent = v; nt.appendChild(op); }
    state.cfg = normalize(loadCfg() || TPL.defaults());
    state.uploads = await idb.all();

    $('addScene').onclick = () => { state.cfg.scenes.push(NEW_SCENE[nt.value]()); rerender(false); };
    $('upload').onchange = e => { if (e.target.files.length) uploadFiles([...e.target.files]); e.target.value = ''; };
    $('resetColors').onclick = () => { state.cfg.colors = { ...TPL.defaults().colors }; renderColors(); refreshSoon(); };
    $('saveProject').onclick = saveProject;
    $('loadProject').onchange = e => { if (e.target.files[0]) loadProject(e.target.files[0]); e.target.value = ''; };
    $('resetAll').onclick = async () => {
      if (!confirm('Сбросить все тексты, сцены и цвета к исходным? Загруженные картинки останутся.')) return;
      state.cfg = TPL.defaults(); fullRender();
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

    const ok = await SvgEngine.isOfflineSupported();
    st.textContent = ok ? 'Готово · экспорт WebM с прозрачностью доступен' : 'Превью работает, но для экспорта нужен свежий Chrome/Edge';
    st.classList.add(ok ? 'ok' : 'warn');
    fullRender();
    requestAnimationFrame(tick);
  }
  window.addEventListener('DOMContentLoaded', init);
})();

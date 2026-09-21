/*
 * Шаблон «v3d» — рекламный баннер vtubika: объёмная карточка, персонаж со сменой эмоций,
 * бегущие ленты, сцены (text / counter / promo / site). Порт build.py из конструктора.
 *
 * window.Templates.v3d = {
 *   defaults(): config,
 *   sceneTypes, emotionNames,
 *   generate(config, ctx) -> { svg, duration, viewBox, width, height, warnings }
 * }
 * ctx = { fonts: { unbounded: b64, manrope: b64 }, metrics, images: { name: { w, h, dataUrl } } }
 * images[name] — уже обработанные картинки (обрезка, зеркало, масштаб character.scale * tweak.scale).
 */
(function () {
  const DEFAULT_COLORS = {
    accent: '#FF8A4C', accent_dark: '#C7461A', peach: '#FFD7BF', mint: '#8EDFD1', lavender: '#BDA7F7',
    pink: '#F47CC4', white: '#FFFFFF', gray: '#8A8F9C', ink: '#15171C',
    card_top: '#2A2E3A', card_bottom: '#14161C', extrude_white: '#E0561C', extrude_accent: '#8E2E0B'
  };
  const COLOR_LABELS = {
    accent: 'Главный (акцент)', accent_dark: 'Акцент тёмный (толщина карточки)', extrude_white: 'Объём белых заголовков',
    extrude_accent: 'Объём цветных заголовков', peach: 'Персиковый (подводки)', mint: 'Мятный', lavender: 'Лавандовый',
    pink: 'Розовый (подчёркивание)', gray: 'Серый', white: 'Белый', ink: 'Тёмный (текст кода)',
    card_top: 'Карточка сверху', card_bottom: 'Карточка снизу'
  };

  function defaults() {
    return {
      template: 'v3d',
      promo_code: 'КУМЕЛИ10',
      site: 'VTUBIKA.STORE',
      colors: { ...DEFAULT_COLORS },
      character: { scale: 0.86, mirror: true, center_x: 1590, top: 408, glow: 'lavender', rays: true, rays_color: 'lavender' },
      image_tweaks: {},
      ribbons: {
        front: { enabled: true, words: ['VTUBIKA.STORE', 'ГОТОВЫЕ VTUBER-МОДЕЛИ', 'LIVE2D', 'PNGTUBER', '3D'], color: 'accent', text_color: '#1C1F26' },
        back: { enabled: true, words: ['ОПЛАТА В РУБЛЯХ', 'КАРТОЙ ИЛИ СБП', 'ОТ 490 ₽'], color: 'lavender', text_color: '#1C1830' }
      },
      decor: { objects: true, progress: true },
      scenes: [
        { type: 'text', duration: 4, emotion: 'u1.png', kicker: 'Хочешь стать витубером?', lines: ['ГОТОВАЯ МОДЕЛЬ', '{ОТ 490 ₽}'], underline: '490 ₽' },
        { type: 'counter', duration: 4, emotion: 'u1.png', react: { at: 0.8, emotion: 'u2.png' }, kicker: 'Всё для стрима — в одном месте',
          number: 540, suffix: '+', word: 'ТОВАРОВ', sub: '{Live2D} / {PNGTuber|mint} / {3D|lavender} / {оформление|peach}' },
        { type: 'promo', duration: 4, emotion: 'u7.png', react: { at: 0.95, emotion: 'u10.png' }, kicker: 'Дорого? Не для зрителей этого стрима',
          headline: 'СКИДКА {10%}', label: 'промокод' },
        { type: 'site', duration: 4, emotion: 'u5.png', kicker: 'Оплата в рублях · картой или СБП', sub: 'Live2D, PNG и 3D-модели — от 490 ₽' }
      ]
    };
  }

  const SCENE_TYPES = {
    text: 'Текст: 1–2 крупные строки',
    counter: 'Счётчик: число накручивается',
    promo: 'Скидка + промокод',
    site: 'Адрес сайта волной'
  };
  const BUILTIN_IMAGES = ['u1.png', 'u2.png', 'u3.png', 'u4.png', 'u5.png', 'u6.png', 'u7.png', 'u8.png', 'u9.png', 'u10.png'];
  const EMOTION_NAMES = {
    'u1.png': 'хитрый взгляд', 'u2.png': '«вау»', 'u3.png': 'улыбка', 'u4.png': 'уверенная', 'u5.png': 'ухмылка',
    'u6.png': 'мрачная', 'u7.png': 'мрачная 2', 'u8.png': 'мрачная 3', 'u9.png': 'радость со слезами', 'u10.png': 'радость'
  };

  function generate(CFG, ctx) {
    const warnings = [];
    const fail = msg => { throw new Error(msg); };
    const COL = { ...DEFAULT_COLORS, ...(CFG.colors || {}) };
    const HEX = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;
    const c = (name, where = 'цвет') => {
      if (name == null) return null;
      if (typeof name === 'string' && HEX.test(name)) return name;
      if (name in COL) {
        if (!HEX.test(COL[name])) fail(`Цвет ${name} = ${COL[name]} — нужен формат #RRGGBB`);
        return COL[name];
      }
      fail(`${where}: неизвестный цвет «${name}»`);
    };
    const OR = c('accent'), OR2 = c('accent_dark'), PE = c('peach'), MI = c('mint'), LA = c('lavender'), WH = c('white'), PK = c('pink');

    const SCENES = CFG.scenes || [];
    if (!SCENES.length) fail('Добавь хотя бы одну сцену.');
    SCENES.forEach((s, i) => {
      if (!SCENE_TYPES[s.type]) fail(`Сцена ${i + 1}: неизвестный тип ${s.type}`);
      const d = Number(s.duration);
      if (!(d >= 2.5)) fail(`Сцена ${i + 1}: длительность минимум 2.5 с`);
      if (!s.emotion) fail(`Сцена ${i + 1}: не выбрана картинка персонажа`);
    });
    const D = SCENES.reduce((a, s) => a + Number(s.duration), 0);
    const PROMO = String(CFG.promo_code || '').trim();
    const SITE = String(CFG.site || '').trim();
    if (SCENES.some(s => s.type === 'promo') && !PROMO) fail('Есть сцена с промокодом, но промокод пустой.');
    const per = p => D / Math.max(1, Math.round(D / p));

    // ---- разметка {текст|цвет}
    const MARK = /\{([^{}|]*)(?:\|([^{}]*))?\}/g;
    const parse = (text, base, where) => {
      const out = []; let pos = 0; let m;
      text = String(text || '');
      MARK.lastIndex = 0;
      while ((m = MARK.exec(text))) {
        if (m.index > pos) out.push([text.slice(pos, m.index), c(base, where), false]);
        out.push([m[1], c(m[2] ? m[2].trim() : 'accent', where), true]);
        pos = m.index + m[0].length;
      }
      if (pos < text.length) out.push([text.slice(pos), c(base, where), false]);
      return out.filter(p => p[0]);
    };
    const plain = text => String(text || '').replace(MARK, (_, a) => a);

    // ---- метрики шрифтов (те же, что в Python: hmtx из шрифта wght=800)
    const UNB = ctx.metrics.unbounded, MAN = ctx.metrics.manrope;
    const tw = (t, font, size) => {
      let s = 0;
      for (const ch of String(t)) {
        const a = font.adv[ch.codePointAt(0)];
        s += a === undefined ? font.upm * 0.6 : a;
      }
      return s * size / font.upm;
    };
    const fit = (text, font, size, maxw, minsize = 30) => {
      while (tw(text, font, size) > maxw && size > minsize) size -= 1;
      return size;
    };
    // предупреждение о символах, которых нет в шрифте
    {
      const all = [PROMO, SITE, ...SCENES.flatMap(s => [s.kicker, s.word, s.sub, s.label, s.headline, s.site_display, ...(s.lines || [])])].map(plain).join('');
      const miss = new Set();
      for (const ch of all) if (ch.trim() && UNB.adv[ch.codePointAt(0)] === undefined && MAN.adv[ch.codePointAt(0)] === undefined) miss.add(ch);
      if (miss.size) warnings.push(`В шрифтах нет символов: ${[...miss].join(' ')} — они будут системным шрифтом.`);
    }

    // ---- SMIL-хелперы
    const EO = '0.22 0.9 0.25 1', EIO = '0.45 0 0.55 1';
    const f5 = t => Math.max(0, Math.min(1, t / D)).toFixed(5);
    const kt = (...ts) => ts.map(f5).join(';');
    const sp = (n, s = EO) => Array(n).fill(s).join(';');
    const A_op = (keys, vals, spline = true) =>
      `<animate attributeName="opacity" dur="${D}s" repeatCount="indefinite" keyTimes="${kt(...keys)}" values="${vals}"` +
      (spline ? ` calcMode="spline" keySplines="${sp(keys.length - 1)}"` : '') + '/>';
    const A_tr = (typ, keys, vals, { additive = false, spline = true, s = EO, dur = null } = {}) => {
      const d = dur || D;
      const kk = keys.map(t => Math.max(0, Math.min(1, t / d)).toFixed(5)).join(';');
      return `<animateTransform attributeName="transform" type="${typ}" dur="${d}s" repeatCount="indefinite" keyTimes="${kk}" values="${vals}"` +
        (additive ? ' additive="sum"' : '') + (spline ? ` calcMode="spline" keySplines="${sp(keys.length - 1, s)}"` : '') + '/>';
    };
    const vis = (tin, tout, dy = 30, fi = 0.45, fo = 0.28) => {
      const k = [0, tin, tin + fi, tout - fo, tout, D];
      return A_op(k, '0;0;1;1;0;0') + A_tr('translate', k, `0 ${dy};0 ${dy};0 0;0 0;0 -12;0 -12`);
    };
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const n1 = x => (Math.round(x * 10) / 10).toFixed(1);
    const n0 = x => String(Math.round(x));

    // ---- геометрия
    const CX0 = 70, CY0 = 712, CX1 = 1850, CY1 = 1030, LX = 120, MAXW = 1130;
    const Y_K = 800, Y_H1 = 888, Y_H2 = 972, H1 = 74;
    const CH = CFG.character || {};
    const TOP = CH.top ?? 408, CXC = CH.center_x ?? 1590;

    const ext_filter = (fid, color, depth = 7) => {
      let offs = '', merge = '';
      for (let i = 1; i <= depth; i++) offs += `<feOffset in="s" dx="${(i * 0.55).toFixed(2)}" dy="${i}" result="o${i}"/>`;
      for (let i = depth; i >= 1; i--) merge += `<feMergeNode in="o${i}"/>`;
      return `<filter id="${fid}" x="-5%" y="-20%" width="115%" height="160%" color-interpolation-filters="sRGB">` +
        `<feFlood flood-color="${color}" result="c"/><feComposite in="c" in2="SourceAlpha" operator="in" result="s"/>${offs}` +
        `<feOffset in="s" dx="${(depth * 0.55 + 2).toFixed(1)}" dy="${depth + 8}" result="sh0"/><feGaussianBlur in="sh0" stdDeviation="6" result="sh1"/>` +
        `<feFlood flood-color="#000" flood-opacity=".45"/><feComposite in2="sh1" operator="in" result="sh"/>` +
        `<feMerge><feMergeNode in="sh"/>${merge}<feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    };

    // ---- слоты эмоций
    const slots = []; let t = 0;
    SCENES.forEach((s, si) => {
      const d = Number(s.duration);
      const seq = [[0, s.emotion]];
      const reacts = Array.isArray(s.react) ? s.react : (s.react ? [s.react] : []);
      for (const r of reacts) {
        if (!r || !r.emotion) continue;
        const at = Number(r.at);
        if (!(at > 0 && at < d)) fail(`Сцена ${si + 1}: смена эмоции должна быть между 0 и ${d} с`);
        seq.push([at, r.emotion]);
      }
      seq.sort((a, b) => a[0] - b[0]);
      seq.forEach(([at, em], i) => {
        const end = i + 1 < seq.length ? seq[i + 1][0] : d;
        const last = slots[slots.length - 1];
        if (last && last[0] === em && Math.abs(last[2] - (t + at)) < 1e-6) last[2] = t + end;
        else slots.push([em, t + at, t + end]);
      });
      t += d;
    });
    const IMG_ID = {};
    for (const [em] of slots) {
      if (!(em in IMG_ID)) {
        if (!ctx.images[em]) fail(`Нет картинки «${em}»`);
        IMG_ID[em] = `e${Object.keys(IMG_ID).length}`;
      }
    }

    const o = [];
    const A = s => o.push(s);
    const glow = c(CH.glow || 'lavender', 'свечение персонажа');

    A(`<style>
@font-face{font-family:"VUnb";src:url(data:font/woff2;base64,${ctx.fonts.unbounded}) format("woff2");font-weight:800}
@font-face{font-family:"VMan";src:url(data:font/woff2;base64,${ctx.fonts.manrope}) format("woff2");font-weight:800}
.u{font-family:"VUnb","Unbounded","Arial Black",sans-serif;font-weight:800}
.m{font-family:"VMan","Manrope","Segoe UI",Arial,sans-serif;font-weight:800}
</style>
<defs>
  <linearGradient id="cardFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c('card_top')}"/><stop offset="1" stop-color="${c('card_bottom')}"/></linearGradient>
  <linearGradient id="slab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${OR}"/><stop offset="1" stop-color="${OR2}"/></linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".35" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="leftShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c('card_bottom')}" stop-opacity=".55"/><stop offset=".6" stop-color="${c('card_bottom')}" stop-opacity=".25"/><stop offset="1" stop-color="${c('card_bottom')}" stop-opacity="0"/></linearGradient>
  <linearGradient id="cardStroke" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${OR}"/><stop offset="0.45" stop-color="${LA}" stop-opacity="0.7"/>
    <stop offset="0.75" stop-color="${MI}" stop-opacity="0.6"/><stop offset="1" stop-color="${OR}"/>
    <animateTransform attributeName="gradientTransform" type="rotate" values="0 .5 .5;360 .5 .5" dur="${D}s" repeatCount="indefinite"/>
  </linearGradient>
  <radialGradient id="rayFade" cx=".5" cy=".5" r=".5"><stop offset=".15" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <mask id="rayMask" maskUnits="userSpaceOnUse" x="${CXC - 550}" y="90" width="1100" height="1100"><circle cx="${CXC}" cy="640" r="360" fill="url(#rayFade)"/></mask>
  <radialGradient id="warm" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${OR}" stop-opacity=".6"/><stop offset=".55" stop-color="${LA}" stop-opacity=".22"/><stop offset="1" stop-color="${LA}" stop-opacity="0"/></radialGradient>
  <linearGradient id="fadeBottom" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".9" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="gStar" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE7B8"/><stop offset=".5" stop-color="${OR}"/><stop offset="1" stop-color="${OR2}"/></linearGradient>
  <linearGradient id="gHeart" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFC6E6"/><stop offset=".55" stop-color="${PK}"/><stop offset="1" stop-color="#B8328A"/></linearGradient>
  <linearGradient id="gGem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E9FFFA"/><stop offset=".5" stop-color="${MI}"/><stop offset="1" stop-color="#3E9C8E"/></linearGradient>
  <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.6" fill="#fff" fill-opacity=".07"/></pattern>
  <filter id="blur60" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="60"/></filter>
  <filter id="cardShadow" x="-10%" y="-40%" width="120%" height="180%"><feDropShadow dx="0" dy="24" stdDeviation="26" flood-color="#000" flood-opacity=".5"/></filter>
  <filter id="soft" x="-20%" y="-40%" width="140%" height="180%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity=".4"/></filter>
  <filter id="sticker" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feMorphology in="SourceAlpha" operator="dilate" radius="4" result="d0"/><feGaussianBlur in="d0" stdDeviation="2.2" result="d1"/><feComponentTransfer in="d1" result="d"><feFuncA type="linear" slope="3" intercept="-0.6"/></feComponentTransfer>
    <feFlood flood-color="#fff"/><feComposite in2="d" operator="in" result="outline"/>
    <feGaussianBlur in="d" stdDeviation="16" result="gb"/><feFlood flood-color="${glow}" flood-opacity=".85"/><feComposite in2="gb" operator="in" result="glow"/>
    <feOffset in="d" dx="10" dy="16" result="s0"/><feGaussianBlur in="s0" stdDeviation="10" result="s1"/><feFlood flood-color="#000" flood-opacity=".4"/><feComposite in2="s1" operator="in" result="shadow"/>
    <feMerge><feMergeNode in="glow"/><feMergeNode in="shadow"/><feMergeNode in="outline"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  ${ext_filter('extW', c('extrude_white'))}
  ${ext_filter('extO', c('extrude_accent'))}
  <clipPath id="cardClip"><rect x="${CX0}" y="${CY0}" width="${CX1 - CX0}" height="${CY1 - CY0}" rx="40"/></clipPath>
  <clipPath id="charClip"><path d="M-200 0H2200V${CY0}H${CX1 + 40}V${CY1 + 6}H-200Z"/></clipPath>
  <mask id="charMask" maskUnits="userSpaceOnUse" x="-200" y="0" width="2400" height="1080"><rect x="-200" y="300" width="2400" height="${CY1 - 300}" fill="url(#fadeBottom)"/></mask>
  <path id="spark" d="M0-1C.12-.12.12-.12 1 0 .12.12.12.12 0 1-.12.12-.12.12-1 0-.12-.12-.12-.12 0-1Z"/>
  <g id="star3d"><path d="M0-50 14-16 50-14 22 9 31 45 0 25-31 45-22 9-50-14-14-16Z" fill="url(#gStar)" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>
    <path d="M-8-30 0-44 6-28Z" fill="#fff" fill-opacity=".85"/><ellipse cx="-14" cy="-8" rx="9" ry="5" fill="#fff" fill-opacity=".55" transform="rotate(-30 -14 -8)"/></g>
  <g id="heart3d"><path d="M0 42C-46 12-58-12-44-32-32-48-10-44 0-26 10-44 32-48 44-32 58-12 46 12 0 42Z" fill="url(#gHeart)" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>
    <ellipse cx="-24" cy="-22" rx="11" ry="7" fill="#fff" fill-opacity=".7" transform="rotate(-35 -24 -22)"/></g>
  <g id="gem3d"><path d="M0-40 34-12 0 44-34-12Z" fill="url(#gGem)" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>
    <path d="M-34-12H34M0-40-12-12 0 44 12-12Z" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.5" stroke-linejoin="round"/></g>
`);
    for (const em in IMG_ID) {
      const im = ctx.images[em];
      const tk = (CFG.image_tweaks || {})[em] || {};
      A(`  <image id="${IMG_ID[em]}" x="${n1(-im.w / 2 + (Number(tk.dx) || 0))}" y="${Number(tk.dy) || 0}" width="${im.w}" height="${im.h}" href="${im.dataUrl}"/>\n`);
    }
    A('</defs>\n');

    // ---- лучи и свечение
    if (CH.rays !== false) {
      const rays = [];
      for (let i = 0; i < 16; i++) {
        const a0 = (i * 22.5) * Math.PI / 180, a1 = (i * 22.5 + 11.25) * Math.PI / 180;
        rays.push(`M${CXC} 640L${n0(CXC + 700 * Math.cos(a0))} ${n0(640 + 700 * Math.sin(a0))}L${n0(CXC + 700 * Math.cos(a1))} ${n0(640 + 700 * Math.sin(a1))}Z`);
      }
      A(`<g mask="url(#rayMask)" opacity=".38"><g fill="${c(CH.rays_color || 'lavender', 'цвет лучей')}">` +
        `${A_tr('rotate', [0, D], `0 ${CXC} 640;22.5 ${CXC} 640`, { spline: false })}<path d="${rays.join(' ')}"/></g></g>`);
      A(`<ellipse cx="${CXC}" cy="660" rx="380" ry="340" fill="url(#warm)"><animate attributeName="opacity" values=".6;1;.6" dur="${per(4)}s" repeatCount="indefinite" calcMode="spline" keySplines="${EIO};${EIO}"/></ellipse>`);
    }

    // ---- ленты
    const tail_path = (cx, y, width, hgt, n = 22) => {
      const x0 = cx - width / 2, x1 = cx + width / 2, tt = y - hgt / 2, b = y + hgt / 2;
      return `M${n1(x0)} ${n1(tt)}H${n1(x1)}L${n1(x1 - n)} ${n1(y)}L${n1(x1)} ${n1(b)}H${n1(x0)}L${n1(x0 + n)} ${n1(y)}Z`;
    };
    const ribbon = (y, angle, words, fill, fg, size, dur, direction, cx, width, hgt, rid) => {
      const unit = []; let x = 0; const gap = size * 0.9;
      for (const w of words) {
        unit.push([x, w]); x += tw(w, UNB, size) + gap;
        unit.push([x + size * 0.28, null]); x += size * 0.56 + gap;
      }
      const U = x;
      if (U <= 0) return '';
      const reps = Math.floor(width / U) + 3;
      const items = [];
      for (let r = 0; r < reps; r++) {
        for (const [ux, w] of unit) {
          const xx = r * U + ux;
          if (w) items.push(`<text class="u" x="${n1(xx)}" y="${n1(y + size * 0.36)}" font-size="${size}" fill="${fg}">${esc(w)}</text>`);
          else items.push(`<use href="#spark" fill="${fg}" transform="translate(${n1(xx)} ${y}) scale(${n1(size * 0.42)})"/>`);
        }
      }
      const [xf, xt] = direction < 0 ? [0, -U] : [-U, 0];
      return `<g transform="rotate(${angle} ${cx} ${y})" filter="url(#soft)">` +
        `<clipPath id="${rid}"><path d="${tail_path(cx, y, width, hgt)}"/></clipPath>` +
        `<g clip-path="url(#${rid})"><rect x="${cx - width / 2 - 30}" y="${y - hgt / 2}" width="${width + 60}" height="${hgt}" fill="${fill}"/>` +
        `<rect x="${cx - width / 2 - 30}" y="${y - hgt / 2}" width="${width + 60}" height="4" fill="#fff" fill-opacity=".35"/></g>` +
        `<g clip-path="url(#${rid})"><g transform="translate(${cx - width / 2} 0)"><g>` +
        `<animateTransform attributeName="transform" type="translate" values="${n1(xf)} 0;${n1(xt)} 0" dur="${dur}s" repeatCount="indefinite"/>` +
        `${items.join('')}</g></g></g></g>`;
    };
    const RB = CFG.ribbons || {};
    const words = r => (Array.isArray(r.words) ? r.words : String(r.words || '').split(',')).map(w => String(w).trim()).filter(Boolean);
    const rbBack = RB.back || {};
    if (rbBack.enabled !== false && words(rbBack).length) {
      A(`<mask id="rb2m" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080"><rect x="0" y="0" width="1920" height="1080" fill="url(#rb2g)"/></mask>` +
        `<linearGradient id="rb2g" gradientUnits="userSpaceOnUse" x1="${CXC - 510}" y1="0" x2="${CXC - 270}" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient>` +
        '<g mask="url(#rb2m)">' + ribbon(560, 7, words(rbBack), c(rbBack.color || 'lavender'), c(rbBack.text_color || '#1C1830'), 24, per(8), +1, CXC - 85, 710, 50, 'rb2') + '</g>');
    }

    // ---- карточка
    A(`<g filter="url(#cardShadow)">
  <rect x="${CX0 + 12}" y="${CY0 + 16}" width="${CX1 - CX0}" height="${CY1 - CY0}" rx="40" fill="url(#slab)"/>
  <rect x="${CX0}" y="${CY0}" width="${CX1 - CX0}" height="${CY1 - CY0}" rx="40" fill="url(#cardFill)"/>
  <g clip-path="url(#cardClip)">
    <g filter="url(#blur60)">
      <circle cx="420" cy="1000" r="230" fill="${OR}" fill-opacity=".5">${A_tr('translate', [0, D / 2, D], '0 0;260 -60;0 0', { s: EIO })}</circle>
      <circle cx="1000" cy="760" r="220" fill="${LA}" fill-opacity=".45">${A_tr('translate', [0, D / 2, D], '0 0;-240 90;0 0', { s: EIO })}</circle>
      <circle cx="1350" cy="1040" r="200" fill="${MI}" fill-opacity=".32">${A_tr('translate', [0, D / 4, D / 2, 3 * D / 4, D], '0 0;-120 -40;-40 -90;80 -30;0 0', { s: EIO })}</circle>
    </g>
    <rect x="${CX0}" y="${CY0}" width="${CX1 - CX0}" height="${CY1 - CY0}" fill="url(#leftShade)"/>
    <rect x="${CX0}" y="${CY0}" width="${CX1 - CX0}" height="${CY1 - CY0}" fill="url(#dots)"/>
    <rect x="${CX0}" y="${CY0}" width="${CX1 - CX0}" height="${Math.round((CY1 - CY0) * 0.55)}" fill="url(#glass)"/>
    <rect x="-400" y="${CY0}" width="160" height="${CY1 - CY0}" fill="#fff" fill-opacity=".07" transform="skewX(-20)">
      <animate attributeName="x" values="-400;-400;2400" keyTimes="0;.7;1" dur="${per(8)}s" repeatCount="indefinite"/></rect>
  </g>
  <rect x="${CX0 + 1.5}" y="${CY0 + 1.5}" width="${CX1 - CX0 - 3}" height="${CY1 - CY0 - 3}" rx="38.5" fill="none" stroke="url(#cardStroke)" stroke-width="3"/>
</g>
`);
    const rbFront = RB.front || {};
    if (rbFront.enabled !== false && words(rbFront).length) {
      A(ribbon(690, -2.5, words(rbFront), c(rbFront.color || 'accent'), c(rbFront.text_color || '#1C1F26'), 26, per(8), -1, 870, 1660, 52, 'rb1'));
    }

    // ---- персонаж
    A('<g clip-path="url(#charClip)"><g mask="url(#charMask)"><g filter="url(#sticker)">');
    const pb = per(3.2), pr = per(4);
    A(`<g>${A_tr('translate', [0, pb / 2, pb], '0 0;0 -10;0 0', { s: EIO, dur: pb })}` +
      `${A_tr('rotate', [0, pr / 2, pr], `-1.2 ${CXC} ${CY1};1.2 ${CXC} ${CY1};-1.2 ${CXC} ${CY1}`, { additive: true, s: EIO, dur: pr })}`);
    for (const [em, tin, tout] of slots) {
      let ok, ov;
      if (tin <= 0 && tout >= D) { ok = [0, D]; ov = '1;1'; }
      else if (tin <= 0) { ok = [0, tout, tout + 0.001, D]; ov = '1;1;0;0'; }
      else if (tout >= D) { ok = [0, tin, tin + 0.001, D]; ov = '0;0;1;1'; }
      else { ok = [0, tin, tin + 0.001, tout, tout + 0.001, D]; ov = '0;0;1;1;0;0'; }
      const hop = tin > 0 ? A_tr('scale', [0, tin, tin + 0.14, tin + 0.3, tin + 0.48, D], '0.92 1.06;0.92 1.06;1.04 0.96;0.99 1.01;1 1;1 1') : '';
      A(`<g opacity="${tin > 0 ? 0 : 1}">${A_op(ok, ov, false)}<g transform="translate(${CXC} ${CY1})"><g>${hop}` +
        `<g transform="translate(0 ${TOP - CY1})"><use href="#${IMG_ID[em]}"/></g></g></g></g>`);
    }
    A('</g></g></g></g>\n');

    // ---- объёмные объекты
    if ((CFG.decor || {}).objects !== false) {
      const dx = CXC - 1590;
      for (const [sym, x, y, s, d0, rot] of [['star3d', 1300, 470, 0.9, 4, -12], ['heart3d', 1868, 470, 0.8, 4, 14],
        ['gem3d', 1235, 640, 0.6, 8, 0], ['star3d', 1790, 360, 0.5, 8, 18]]) {
        const d = per(d0);
        A(`<g transform="translate(${x + dx} ${y})"><g filter="url(#soft)">${A_tr('translate', [0, d / 2, d], '0 0;0 -16;0 0', { s: EIO, dur: d })}` +
          `<g>${A_tr('rotate', [0, d / 2, d], `${rot - 8};${rot + 8};${rot - 8}`, { s: EIO, dur: d })}<use href="#${sym}" transform="scale(${s})"/></g></g></g>`);
      }
    }

    // ================= сцены
    const kicker = (idx, txt, t0, t1) => {
      if (!txt) return;
      const size = fit(txt, MAN, 36, MAXW - 30);
      const w = tw(txt, MAN, size) + 40;
      A(`<clipPath id="kc${idx}"><rect x="${LX - 6}" y="${Y_K - 44}" width="0" height="62">` +
        `<animate attributeName="width" dur="${D}s" repeatCount="indefinite" keyTimes="${kt(0, t0 + 0.05, t0 + 0.55, D)}" values="0;0;${n0(w + 12)};${n0(w + 12)}" calcMode="spline" keySplines="${sp(3)}"/></rect></clipPath>`);
      A(`<g clip-path="url(#kc${idx})"><g opacity="0">${vis(t0 + 0.05, t1, 0, 0.15)}` +
        `<rect x="${LX}" y="${Y_K - 28}" width="8" height="32" fill="${OR}"/>` +
        `<text class="m" x="${LX + 24}" y="${Y_K - 1}" font-size="${size}" fill="${PE}">${esc(txt)}</text></g></g>`);
    };

    const words_line = (parts, size, y, t0, t1, delay, cid, stagger = 0.075, skipMarked = false) => {
      A(`<clipPath id="${cid}"><rect x="${LX - 10}" y="${y - size * 1.05}" width="1260" height="${size * 1.5}"/></clipPath><g clip-path="url(#${cid})">`);
      let x = LX, i = 0; const skipped = []; const spW = tw(' ', UNB, size);
      for (const [text, color, marked] of parts) {
        if (skipMarked && marked) { skipped.push([x, text, color]); x += tw(text, UNB, size); continue; }
        const flt = color !== WH ? 'extO' : 'extW';
        for (const tok of text.split(/( +)/)) {
          if (!tok) continue;
          if (!tok.trim()) { x += spW * tok.length; continue; }
          const tin = t0 + delay + i * stagger;
          const rk = [0, tin, tin + 0.5, D];
          A(`<g opacity="0">${vis(tin, t1, Math.round(size * 1.2))}` +
            `<g>${A_tr('rotate', rk, `7 ${n0(x)} ${y};7 ${n0(x)} ${y};0 ${n0(x)} ${y};0 ${n0(x)} ${y}`)}` +
            `<text class="u" x="${n1(x)}" y="${y}" font-size="${size}" fill="${color}" filter="url(#${flt})">${esc(tok)}</text></g></g>`);
          i++;
          x += tw(tok, UNB, size);
        }
      }
      A('</g>');
      return [x, skipped];
    };

    const sub_line = (text, base, t0, t1, y = Y_H2 - 4, size = 40, delay = 0.8) => {
      if (!text) return;
      const parts = parse(text, base, 'подстрока');
      size = fit(plain(text), MAN, size, MAXW);
      A(`<g opacity="0">${vis(t0 + delay, t1, 18)}<text class="m" x="${LX}" y="${y}" font-size="${size}">` +
        parts.map(([tt, col]) => `<tspan fill="${col}">${esc(tt)}</tspan>`).join('') + '</text></g>');
    };

    const scene_text = (k, s, t0, t1) => {
      const lines = (s.lines || []).filter(l => String(l).trim());
      if (!lines.length) fail(`Сцена ${k + 1}: напиши хотя бы одну строку`);
      if (lines.length > 2) fail(`Сцена ${k + 1}: максимум 2 строки`);
      const size = Math.min(...lines.map(ln => fit(plain(ln), UNB, H1, MAXW)));
      const ys = lines.length === 2 ? [Y_H1, Y_H2] : [s.sub ? Y_H1 : Y_H1 + 30];
      lines.forEach((ln, j) => words_line(parse(ln, 'white', `сцена ${k + 1}`), size, ys[j], t0, t1, 0.15 + 0.3 * j, `s${k}l${j}`));
      const ul = s.underline && String(s.underline).trim();
      if (ul) {
        const last = plain(lines[lines.length - 1]); const pos = last.indexOf(ul);
        if (pos < 0) warnings.push(`Сцена ${k + 1}: «${ul}» не найдено в последней строке — подчёркивание пропущено.`);
        else {
          const xa = LX + tw(last.slice(0, pos), UNB, size), xb = xa + tw(ul, UNB, size), y = ys[ys.length - 1];
          A(`<path d="M${n0(xa - 6)} ${y + 20} Q${n0((xa + xb) / 2)} ${y + 38} ${n0(xb + 10)} ${y + 12}" fill="none" stroke="${c(s.underline_color || 'pink')}" stroke-width="8" stroke-linecap="round" ` +
            `pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" filter="url(#soft)">` +
            `<animate attributeName="stroke-dashoffset" dur="${D}s" repeatCount="indefinite" keyTimes="${kt(0, t0 + 1.0, t0 + 1.45, D)}" values="1;1;0;0" calcMode="spline" keySplines="${sp(3)}"/>` +
            `${A_op([0, t0 + 1.0, t0 + 1.05, t1 - 0.28, t1, D], '0;0;1;1;0;0', false)}</path>`);
        }
      }
      if (lines.length === 1) sub_line(s.sub, s.sub_color || 'gray', t0, t1);
    };

    const nice_steps = (n, k = 7) => {
      const out = [];
      const mag = Math.pow(10, Math.max(0, String(Math.trunc(n)).length - 2));
      for (let i = 0; i < k; i++) out.push(i < k - 1 ? Math.round(n * i / (k - 1) / mag) * mag : n);
      return out;
    };

    const scene_counter = (k, s, t0, t1) => {
      const n = Math.trunc(Number(s.number));
      if (!(n >= 0)) fail(`Сцена ${k + 1}: число должно быть целым, например 540`);
      const suf = s.suffix ?? '+', word = s.word || '';
      const size = fit(`${n}${suf} ${word}`, UNB, H1, MAXW);
      const nums = nice_steps(n).map(v => `${v}${suf}`);
      const xnEnd = LX + tw(nums[nums.length - 1], UNB, size);
      A(`<clipPath id="c${k}a"><rect x="${LX - 10}" y="${Y_H1 - 80}" width="1260" height="110"/></clipPath><g clip-path="url(#c${k}a)"><g opacity="0">${vis(t0 + 0.15, t1, 90)}`);
      const step = 0.085;
      nums.forEach((nv, i) => {
        const a = t0 + 0.2 + i * step, b = a + step, last = i === nums.length - 1;
        const [kk, vv] = last ? [[0, a, D], '0;1;1'] : [[0, a, b, D], '0;1;0;0'];
        A(`<text class="u" x="${n1(xnEnd)}" y="${Y_H1}" font-size="${size}" fill="${last ? OR : WH}" text-anchor="end" opacity="0" filter="url(#${last ? 'extO' : 'extW'})">` +
          `<animate attributeName="opacity" dur="${D}s" repeatCount="indefinite" calcMode="discrete" keyTimes="${kt(...kk)}" values="${vv}"/>${esc(nv)}</text>`);
      });
      A('</g></g>');
      if (word) {
        A(`<clipPath id="c${k}b"><rect x="${n0(xnEnd + 10)}" y="${Y_H1 - 80}" width="900" height="110"/></clipPath><g clip-path="url(#c${k}b)"><g opacity="0">${vis(t0 + 0.35, t1, 90)}` +
          `<text class="u" x="${n1(xnEnd + tw(' ', UNB, size))}" y="${Y_H1}" font-size="${size}" fill="${WH}" filter="url(#extW)">${esc(word)}</text></g></g>`);
      }
      sub_line(s.sub, s.sub_color || 'gray', t0, t1);
    };

    const scene_promo = (k, s, t0, t1) => {
      const head = s.headline || 'СКИДКА {10%}';
      const size = fit(plain(head), UNB, H1, MAXW);
      const [, pops] = words_line(parse(head, 'white', `сцена ${k + 1}`), size, Y_H1, t0, t1, 0.75, `p${k}h`, 0.075, true);
      pops.forEach(([x, text, color], j) => {
        const T = t0 + 0.95 + 0.15 * j, w = tw(text, UNB, size);
        A(`<g transform="translate(${n1(x + w / 2)} ${n1(Y_H1 - size * 0.36)})"><g opacity="0">${A_op([0, T, T + 0.12, t1 - 0.28, t1, D], '0;0;1;1;0;0', false)}` +
          `${A_tr('scale', [0, T, T + 0.2, T + 0.38, T + 0.55, D], '2.3;2.3;.9;1.08;1;1')}${A_tr('rotate', [0, T, T + 0.2, T + 0.55, D], '-14;-14;4;0;0', { additive: true })}` +
          `<text class="u" x="0" y="${n1(size * 0.36)}" font-size="${size}" fill="${color}" text-anchor="middle" filter="url(#extO)">${esc(text)}</text></g></g>`);
      });
      const lab = s.label ?? 'промокод';
      const hgt = 84, top = 906;
      let csz = 56;
      const lw = lab ? tw(lab, MAN, 38) : 0;
      while (lw + (lab ? 22 : 0) + tw(PROMO, UNB, csz) + 56 > MAXW && csz > 30) csz--;
      const cw = tw(PROMO, UNB, csz);
      const xb = LX + (lab ? lw + 22 : 0), w = cw + 56;
      const tcx = xb + w / 2, tcy = top + hgt / 2, TS = t0 + 1.35;
      const kk = [0, TS, TS + 0.16, TS + 0.3, TS + 0.44, t1 - 0.28, t1, D];
      if (lab) A(`<g opacity="0">${vis(TS - 0.15, t1, 16)}<text class="m" x="${LX}" y="${top + hgt / 2 + 13}" font-size="38" fill="${PE}">${esc(lab)}</text></g>`);
      A(`<g transform="translate(${n1(tcx)} ${tcy}) rotate(-2)"><g opacity="0">${A_op(kk, '0;0;1;1;1;1;0;0', false)}` +
        `${A_tr('scale', kk, '1.6;1.6;.94;1.03;1;1;.96;.96')}<g transform="translate(${n1(-tcx)} ${-tcy})">` +
        `<rect x="${n1(xb + 9)}" y="${top + 9}" width="${n1(w)}" height="${hgt}" rx="8" fill="${c('ink')}"/>` +
        `<rect x="${n1(xb)}" y="${top}" width="${n1(w)}" height="${hgt}" rx="8" fill="${c(s.code_bg || 'accent')}"/>` +
        `<text id="promo_code" class="u" x="${n1(xb + 28)}" y="${n1(top + hgt / 2 + csz * 0.36)}" font-size="${csz}" fill="${c(s.code_color || 'ink')}">${esc(PROMO)}</text>` +
        '</g></g></g>');
    };

    const scene_site = (k, s, t0, t1) => {
      let disp = s.site_display || CFG.site_display || SITE;
      if (!disp) fail(`Сцена ${k + 1}: не указан адрес сайта`);
      if (!disp.includes('{') && disp.includes('.')) { const i = disp.lastIndexOf('.'); disp = disp.slice(0, i) + '{' + disp.slice(i) + '}'; }
      const parts = parse(disp, 'white', `сцена ${k + 1}`);
      const text = plain(disp); let size = 100;
      while (tw(text, UNB, size) > MAXW) size -= 2;
      const yU = Y_H1 + 12;
      A(`<clipPath id="u${k}"><rect x="${LX - 10}" y="${yU - size * 1.1}" width="1300" height="${size * 1.5}"/></clipPath><g clip-path="url(#u${k})">`);
      let x = LX, i = 0;
      for (const [ptxt, col] of parts) {
        for (const ch of ptxt) {
          const tin = t0 + 0.15 + i * 0.035, th = t0 + 2.3 + i * 0.045;
          const kk = [0, tin, tin + 0.45, th, th + 0.14, th + 0.3, t1 - 0.28, t1, D];
          const dy = n0(size * 1.2);
          A(`<g opacity="0">${A_op([0, tin, tin + 0.3, t1 - 0.28, t1, D], '0;0;1;1;0;0')}` +
            `${A_tr('translate', kk, `0 ${dy};0 ${dy};0 0;0 0;0 -16;0 0;0 0;0 -12;0 -12`)}` +
            `<text class="u" x="${n1(x)}" y="${yU}" font-size="${size}" fill="${col}" filter="url(#${col === WH ? 'extW' : 'extO'})">${esc(ch)}</text></g>`);
          x += tw(ch, UNB, size); i++;
        }
      }
      const wurl = x - LX;
      A(`<linearGradient id="shU${k}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="300" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/>` +
        `<stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>` +
        `<animateTransform attributeName="gradientTransform" type="translate" dur="${D}s" repeatCount="indefinite" keyTimes="${kt(0, t0 + 1.0, t0 + 2.1, D)}" values="-400 0;-400 0;${n0(LX + wurl + 120)} 0;${n0(LX + wurl + 120)} 0"/></linearGradient>`);
      A(`<g opacity="0">${A_op([0, t0 + 0.8, t0 + 0.81, t1 - 0.28, t1, D], '0;0;1;1;0;0', false)}<text class="u" x="${LX}" y="${yU}" font-size="${size}" fill="url(#shU${k})">${esc(text)}</text></g>`);
      A('</g>');
      if (s.sub) {
        const sz = fit(plain(s.sub), MAN, 34, MAXW);
        const sp2 = parse(s.sub, s.sub_color || 'peach', `сцена ${k + 1}`);
        A(`<g opacity="0">${vis(t0 + 0.55, t1, 20)}<text class="m" x="${LX}" y="${Y_H2 + 2}" font-size="${sz}" filter="url(#soft)">` +
          sp2.map(([tt, col]) => `<tspan fill="${col}">${esc(tt)}</tspan>`).join('') + '</text></g>');
      }
    };

    const RUN = { text: scene_text, counter: scene_counter, promo: scene_promo, site: scene_site };
    let t0 = 0;
    SCENES.forEach((s, k) => {
      const t1 = t0 + Number(s.duration);
      kicker(k, s.kicker || '', t0, t1);
      RUN[s.type](k, s, t0, t1);
      t0 = t1;
    });

    if ((CFG.decor || {}).progress !== false) {
      const n = SCENES.length, bw = Math.min(66, (MAXW - 12 * (n - 1)) / n); let tt = 0;
      SCENES.forEach((s, k) => {
        const d = Number(s.duration), x = LX + k * (bw + 12);
        A(`<rect x="${n1(x)}" y="1004" width="${n1(bw)}" height="6" rx="3" fill="#fff" fill-opacity=".16"/>` +
          `<rect x="${n1(x)}" y="1004" width="0" height="6" rx="3" fill="${OR}"><animate attributeName="width" dur="${D}s" repeatCount="indefinite" keyTimes="${kt(0, tt, tt + d, D)}" values="0;0;${n1(bw)};${n1(bw)}"/></rect>`);
        tt += d;
      });
    }

    const vb = CFG.viewBox || [15, 286, 1952, 857];
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- vtubika banner (шаблон v3d, собран в svg-to-webm). Прозрачный фон, бесшовный луп ${D} с -->\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${vb[2]}" height="${vb[3]}" viewBox="${vb.join(' ')}">\n` +
      o.join('') + '</svg>\n';
    return { svg, duration: D, viewBox: vb, width: vb[2], height: vb[3], warnings };
  }

  const common = [
    { path: 'duration', label: 'Длительность, с', kind: 'number', min: 2.5, max: 20, step: 0.5, half: true },
    { path: 'emotion', label: 'Картинка персонажа', kind: 'image', half: true },
    { path: 'react.emotion', label: 'Сменить эмоцию на (удар)', kind: 'image', optional: 'react', optionalInit: { at: 0.9 }, half: true },
    { path: 'react.at', label: '…через, с от начала сцены', kind: 'number', min: 0.1, max: 19, step: 0.05, half: true, showIf: s => !!s.react },
    { path: 'kicker', label: 'Подводка (маленькая строка сверху)', kind: 'text' }
  ];
  const NEW_SCENE = {
    text: () => ({ type: 'text', duration: 4, emotion: 'u3.png', kicker: 'Подводка', lines: ['НОВАЯ СЦЕНА', '{ТЕКСТ}'] }),
    counter: () => ({ type: 'counter', duration: 4, emotion: 'u2.png', kicker: 'Подводка', number: 100, suffix: '+', word: 'МОДЕЛЕЙ', sub: '' }),
    promo: () => ({ type: 'promo', duration: 4, emotion: 'u7.png', react: { at: 0.95, emotion: 'u10.png' }, kicker: 'Подводка', headline: 'СКИДКА {10%}', label: 'промокод' }),
    site: () => ({ type: 'site', duration: 4, emotion: 'u5.png', kicker: 'Подводка', sub: '' })
  };
  const schema = {
    sections: [
      { title: 'Промокод и сайт', open: true, fields: [
        { path: 'promo_code', label: 'Промокод', kind: 'text', half: true },
        { path: 'site', label: 'Сайт', kind: 'text', half: true }
      ] },
      { title: 'Персонаж', fields: [
        { path: 'character.scale', label: 'Размер', kind: 'number', min: 0.3, max: 2, step: 0.02, half: true },
        { path: 'character.glow', label: 'Свечение вокруг', kind: 'color-name', half: true },
        { path: 'character.mirror', label: 'Отзеркалить (чтобы смотрела на текст)', kind: 'check' },
        { path: 'character.rays', label: 'Вращающиеся лучи за персонажем', kind: 'check' }
      ] },
      { title: 'Ленты и декор', fields: [
        { path: 'ribbons.front.enabled', label: 'Лента поверх карточки', kind: 'check' },
        { path: 'ribbons.front.words', label: 'Слова ленты (через запятую)', kind: 'list' },
        { path: 'ribbons.back.enabled', label: 'Лента за персонажем', kind: 'check' },
        { path: 'ribbons.back.words', label: 'Слова ленты (через запятую)', kind: 'list' },
        { path: 'decor.objects', label: 'Звезда, сердце, кристалл', kind: 'check' },
        { path: 'decor.progress', label: 'Полоски прогресса сцен', kind: 'check' }
      ] }
    ],
    colors: { path: 'colors', labels: COLOR_LABELS },
    sceneTypes: SCENE_TYPES,
    sceneHint: 'Слово в фигурных скобках красится: <code>ОТ {490 ₽}</code> — главным цветом, <code>{PNGTuber|mint}</code> — мятным.',
    sceneFields: {
      text: [...common,
        { path: 'lines.0', label: 'Строка 1', kind: 'text', placeholder: 'ГОТОВАЯ МОДЕЛЬ' },
        { path: 'lines.1', label: 'Строка 2 (можно пусто)', kind: 'text', placeholder: '{ОТ 490 ₽}' },
        { path: 'underline', label: 'Подчеркнуть (кусок последней строки)', kind: 'text', placeholder: '490 ₽' },
        { path: 'sub', label: 'Строка под заголовком (если строка одна)', kind: 'text' }],
      counter: [...common,
        { path: 'number', label: 'Число', kind: 'number', min: 0, max: 1e9, step: 1, third: true },
        { path: 'suffix', label: 'Суффикс', kind: 'text', placeholder: '+', third: true },
        { path: 'word', label: 'Слово', kind: 'text', placeholder: 'ТОВАРОВ', third: true },
        { path: 'sub', label: 'Строка под числом', kind: 'text' }],
      promo: [...common,
        { path: 'headline', label: 'Заголовок (часть в {} впечатывается ударом)', kind: 'text', placeholder: 'СКИДКА {10%}' },
        { path: 'label', label: 'Слово перед кодом', kind: 'text', placeholder: 'промокод' }],
      site: [...common,
        { path: 'site_display', label: 'Как написать сайт (пусто = из поля «Сайт»)', kind: 'text', placeholder: 'VTUBIKA{.STORE}' },
        { path: 'sub', label: 'Строка под сайтом', kind: 'text' }]
    },
    newScene: NEW_SCENE,
    sceneTitle: s => SCENE_TYPES[s.type].split(':')[0]
  };

  window.Templates = window.Templates || {};
  window.Templates.v3d = {
    id: 'v3d', title: 'Карточка с персонажем (v3d)', defaults, generate, schema,
    assetDir: 'assets/v3d/', builtinImages: BUILTIN_IMAGES, emotionNames: EMOTION_NAMES,
    fonts: { unbounded: 'assets/fonts/unbounded-800.woff2', manrope: 'assets/fonts/manrope-800.woff2' },
    metrics: 'assets/fonts/metrics.json',
    wideViewBox: [-80, 0, 2080, 1160],
    imageOptions: (cfg, name) => {
      const ch = cfg.character || {}; const tk = (cfg.image_tweaks || {})[name] || {};
      return { scale: (Number(ch.scale) || 0.86) * (Number(tk.scale) || 1), mirror: ch.mirror !== false };
    },
    usedImages: cfg => {
      const s = new Set();
      for (const sc of cfg.scenes || []) { if (sc.emotion) s.add(sc.emotion); if (sc.react && sc.react.emotion) s.add(sc.react.emotion); }
      return [...s];
    }
  };
})();

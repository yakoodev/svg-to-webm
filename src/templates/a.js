/*
 * Шаблон «a» — «Аниме-опенинг (манга-панель)»: скошенная манга-панель, удары текста, шторки-слэши,
 * импакт-кадр на промокоде и героиня, реагирующая на каждый удар. Точный порт constructor_A/build.py
 * (функции validate / resolve_palette / generate). Контракт — docs/TEMPLATE_API.md.
 *
 * Для совпадения с Python до байта здесь повторены: форматирование чисел Python (:.Nf, :g, repr float,
 * банковское округление), генератор случайных чисел Python (MT19937, random.seed/uniform/choice)
 * и colorsys (пересчёт оттенков оранжевого).
 */
(function () {
  'use strict';

  // ======================================================================== Python-совместимые числа
  // точная десятичная запись |x| (для наших величин toFixed(100) даёт все цифры двоичного числа)
  function exactParts(a) {
    const s = a.toFixed(100);
    const dot = s.indexOf('.');
    return { int: s.slice(0, dot), frac: s.slice(dot + 1) };
  }
  // округление строки цифр «half-even» по точному значению (как Python)
  function roundDigits(digits, rest) {
    let up = false;
    if (rest.length) {
      const f = rest.charCodeAt(0) - 48;
      if (f > 5) up = true;
      else if (f === 5) up = /[1-9]/.test(rest.slice(1)) || ((digits.charCodeAt(digits.length - 1) - 48) % 2 === 1);
    }
    if (!up) return digits;
    const arr = digits.split('');
    let i = arr.length - 1;
    while (i >= 0) {
      if (arr[i] === '9') { arr[i] = '0'; i--; } else { arr[i] = String.fromCharCode(arr[i].charCodeAt(0) + 1); break; }
    }
    return (i < 0 ? '1' : '') + arr.join('');
  }
  const isNeg = x => x < 0 || Object.is(x, -0);
  // f"{x:.{n}f}"
  function fx(x, n) {
    const neg = isNeg(x), p = exactParts(Math.abs(x));
    let d = roundDigits(p.int + p.frac.slice(0, n), p.frac.slice(n));
    let out;
    if (n > 0) {
      d = d.padStart(n + 1, '0');
      out = d.slice(0, d.length - n) + '.' + d.slice(d.length - n);
    } else out = d;
    out = out.replace(/^0+(?=\d)/, '');
    return (neg ? '-' : '') + out;
  }
  // f"{x:.{p}g}" / f"{x:g}"
  function fg(x, prec = 6) {
    const neg = isNeg(x), a = Math.abs(x);
    if (a === 0) return (neg ? '-' : '') + '0';
    const p = exactParts(a);
    const all = p.int + p.frac;
    const first = all.search(/[1-9]/);
    let e = p.int.length - 1 - first;                       // десятичный порядок
    let d = roundDigits(all.slice(first, first + prec).padEnd(prec, '0'), all.slice(first + prec));
    if (d.length > prec) { d = d.slice(0, prec); e += 1; }
    let out;
    if (e >= -4 && e < prec) {
      if (e >= 0) out = d.slice(0, e + 1).padEnd(e + 1, '0') + (d.length > e + 1 ? '.' + d.slice(e + 1) : '');
      else out = '0.' + '0'.repeat(-e - 1) + d;
      if (out.includes('.')) out = out.replace(/0+$/, '').replace(/\.$/, '');
    } else {
      let m = d[0] + (d.length > 1 ? '.' + d.slice(1) : '');
      if (m.includes('.')) m = m.replace(/0+$/, '').replace(/\.$/, '');
      out = m + 'e' + (e < 0 ? '-' : '+') + String(Math.abs(e)).padStart(2, '0');
    }
    return (neg ? '-' : '') + out;
  }
  const F = x => String(x) + (Number.isInteger(x) ? '.0' : '');   // str(float) в Python
  const pyRound = (x, n) => Number(fx(x, n));                        // round(x, n)
  const pyRoundInt = x => Number(fx(x, 0));                          // round(x)
  const pyMod1 = a => { let m = a % 1; if (m !== 0 && m < 0) m += 1; return m; };

  // ======================================================================== Python random (MT19937)
  function PyRandom() {
    const N = 624, M = 397, mt = new Array(N);
    let mti = N + 1;
    function initGenrand(s) {
      mt[0] = s >>> 0;
      for (mti = 1; mti < N; mti++) {
        const p = mt[mti - 1] ^ (mt[mti - 1] >>> 30);
        mt[mti] = (Math.imul(1812433253, p) + mti) >>> 0;
      }
    }
    function initByArray(key) {
      initGenrand(19650218);
      let i = 1, j = 0, k = Math.max(N, key.length);
      for (; k; k--) {
        const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
        mt[i] = (((mt[i] ^ Math.imul(p, 1664525)) >>> 0) + key[j] + j) >>> 0;
        i++; j++;
        if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
        if (j >= key.length) j = 0;
      }
      for (k = N - 1; k; k--) {
        const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
        mt[i] = (((mt[i] ^ Math.imul(p, 1566083941)) >>> 0) - i) >>> 0;
        i++;
        if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
      }
      mt[0] = 0x80000000;
      mti = N;
    }
    function genrand() {
      let y;
      if (mti >= N) {
        let kk;
        for (kk = 0; kk < N - M; kk++) {
          y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff);
          mt[kk] = (mt[kk + M] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0)) >>> 0;
        }
        for (; kk < N - 1; kk++) {
          y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff);
          mt[kk] = (mt[kk + (M - N)] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0)) >>> 0;
        }
        y = (mt[N - 1] & 0x80000000) | (mt[0] & 0x7fffffff);
        mt[N - 1] = (mt[M - 1] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0)) >>> 0;
        mti = 0;
      }
      y = mt[mti++];
      y ^= (y >>> 11);
      y ^= (y << 7) & 0x9d2c5680;
      y ^= (y << 15) & 0xefc60000;
      y ^= (y >>> 18);
      return y >>> 0;
    }
    return {
      seed(n) {                                    // random.seed(int)
        n = Math.abs(Math.trunc(n));
        const key = [];
        if (n === 0) key.push(0);
        while (n > 0) { key.push(n % 4294967296); n = Math.floor(n / 4294967296); }
        initByArray(key);
      },
      random() {
        const a = genrand() >>> 5, b = genrand() >>> 6;
        return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
      },
      uniform(a, b) { return a + (b - a) * this.random(); },
      choice(seq) {
        const n = seq.length, k = n.toString(2).length;
        let r = genrand() >>> (32 - k);
        while (r >= n) r = genrand() >>> (32 - k);
        return seq[r];
      }
    };
  }

  // ======================================================================== colorsys
  const ONE_THIRD = 1.0 / 3.0, ONE_SIXTH = 1.0 / 6.0, TWO_THIRD = 2.0 / 3.0;
  function rgbToHls(r, g, b) {
    const maxc = Math.max(r, g, b), minc = Math.min(r, g, b);
    const sumc = maxc + minc, rangec = maxc - minc, l = sumc / 2.0;
    if (minc === maxc) return [0.0, l, 0.0];
    const s = l <= 0.5 ? rangec / sumc : rangec / (2.0 - maxc - minc);
    const rc = (maxc - r) / rangec, gc = (maxc - g) / rangec, bc = (maxc - b) / rangec;
    let h;
    if (r === maxc) h = bc - gc;
    else if (g === maxc) h = 2.0 + rc - bc;
    else h = 4.0 + gc - rc;
    h = pyMod1(h / 6.0);
    return [h, l, s];
  }
  function _v(m1, m2, hue) {
    hue = pyMod1(hue);
    if (hue < ONE_SIXTH) return m1 + (m2 - m1) * hue * 6.0;
    if (hue < 0.5) return m2;
    if (hue < TWO_THIRD) return m1 + (m2 - m1) * (TWO_THIRD - hue) * 6.0;
    return m1;
  }
  function hlsToRgb(h, l, s) {
    if (s === 0.0) return [l, l, l];
    const m2 = l <= 0.5 ? l * (1.0 + s) : l + s - (l * s);
    const m1 = 2.0 * l - m2;
    return [_v(m1, m2, h + ONE_THIRD), _v(m1, m2, h), _v(m1, m2, h - ONE_THIRD)];
  }
  const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgbToHex = c => '#' + c.map(v => Math.max(0, Math.min(255, pyRoundInt(v))).toString(16).toUpperCase().padStart(2, '0')).join('');
  function shiftLike(derivedDef, baseDef, baseNew) {
    if (baseNew.toUpperCase() === baseDef.toUpperCase()) return derivedDef;
    const [h0, l0, s0] = rgbToHls(...hexToRgb(baseDef).map(v => v / 255));
    const [h1, l1, s1] = rgbToHls(...hexToRgb(baseNew).map(v => v / 255));
    let [h, l, s] = rgbToHls(...hexToRgb(derivedDef).map(v => v / 255));
    h = pyMod1(h + h1 - h0);
    s = Math.max(0.0, Math.min(1.0, s * (s0 > 0 ? s1 / s0 : 1.0)));
    l = Math.max(0.0, Math.min(1.0, l + (l1 - l0)));
    return rgbToHex(hlsToRgb(h, l, s).map(v => v * 255));
  }

  // ======================================================================== конфиг
  const TYPES = ['big', 'price', 'promo', 'site'];
  const REACTIONS = ['!!', 'sparkles', 'hearts', 'none'];
  const DEF_REACTION = { big: '!!', site: '!!', price: 'sparkles', promo: 'hearts' };
  const DEF_BEAT = { big: 0.95, site: 0.95, price: 0.6, promo: 0.7 };
  const HEX = /^#[0-9A-Fa-f]{6}$/;
  const DEFAULT_PALETTE = {
    orange: '#FF8A4C', orange_dark: 'auto', peach: '#FFD7BF', mint: '#8EDFD1',
    lavender: '#BDA7F7', pink: '#FF6FB5', ink: '#170F2C', white: '#FFFFFF',
    panel_top: '#2C1F5E', panel_mid: '#1C1440', panel_bottom: '#120C28', shadow: '#07040F'
  };
  // оттенки, которые считаются от «orange» (для исходного #FF8A4C — ровно эти значения)
  const ORANGE_DERIVED = {
    orange_dark: '#C4521F', slab_light: '#FFB07A', slab_dark: '#E4602A',
    num_top: '#FFC08F', num_bottom: '#FF6A2B', extrude_num: '#5A1E0A', extrude_code: '#8E3512',
    ticket_stripe: '#FFD2B5', text_warm: '#FFE1CC', ticket_warm: '#FFE6D6'
  };
  const COLOR_LABELS = {
    orange: 'Главный (цифры, купон, блок, «.STORE», «!!»)',
    peach: 'Персиковый (полоса, блик, искры)',
    mint: 'Мятный (искры)',
    lavender: 'Лавандовый (задний слой, точки, шторка)',
    pink: 'Розовый (маркер цены, бейдж, сердечки)',
    ink: 'Тёмный (обводки, тени)',
    white: 'Белый (плашка, шторка, обводка персонажа)',
    panel_top: 'Панель сверху',
    panel_mid: 'Панель в середине',
    panel_bottom: 'Панель снизу',
    shadow: 'Мягкая тень'
  };
  const BUILTIN_IMAGES = ['u1.png', 'u2.png', 'u3.png', 'u4.png', 'u5.png', 'u6.png', 'u7.png', 'u8.png', 'u9.png', 'u10.png'];
  const EMOTION_NAMES = {
    'u1.png': 'хитрый взгляд вбок', 'u2.png': '«вау», рот открыт', 'u3.png': 'улыбка, взгляд вбок', 'u4.png': 'уверенная',
    'u5.png': 'хитрая ухмылка', 'u6.png': 'мрачная', 'u7.png': 'мрачная 2', 'u8.png': 'мрачная 3',
    'u9.png': 'радость со слезами', 'u10.png': 'радость с румянцем'
  };

  function defaults() {
    return {
      template: 'a',
      site: 'VTUBIKA.STORE',
      promo_code: 'КУМЕЛИ10',
      discount: '−10%',
      palette: { ...DEFAULT_PALETTE },
      font: { file: 'Unbounded.ttf', weight: 900 },
      character: { scale: 0.68, mirror: true, offset_x: 0, offset_y: 0, outline: false, flash: false },
      plate: { show: true, text: '{site}' },
      logo: { show: true, file: 'logo.svg' },
      scenes: [
        { type: 'big', duration: 2.95, beat: 0.95, text: '420+', sub: 'VTUBER-МОДЕЛЕЙ', emotion_intro: 'u1.png', emotion: 'u2.png', reaction: '!!' },
        { type: 'price', duration: 2.7, beat: 0.6, prefix: 'ОТ', text: '490 ₽', underline: true, emotion: 'u5.png', reaction: 'sparkles' },
        { type: 'promo', duration: 6.35, beat: 0.7, text: '{promo}', badge: '{discount}', impact: true, emotion: 'u10.png', reaction: 'hearts',
          rekick: { at: 3.55, emotion: 'u4.png', reaction: 'hearts' } }
      ],
      video: { fps: 30, preview_bg: '#2A2E38', stream_bg: 'stream_bg.png', stream_width_pct: 42, stream_margin: 28 }
    };
  }

  const J = v => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
  function num(v, where, lo, hi) {
    if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) v = Number(v);
    if (typeof v !== 'number' || !isFinite(v)) throw new Error(`${where}: нужно число, а записано ${v === undefined ? 'пусто' : J(v)}`);
    if (lo !== undefined && v < lo) throw new Error(`${where}: значение ${v} слишком маленькое (минимум ${lo})`);
    if (hi !== undefined && v > hi) throw new Error(`${where}: значение ${v} слишком большое (максимум ${hi})`);
    return v;
  }
  function textOf(v, where, allowEmpty) {
    if (v === null || v === undefined) v = '';
    if (typeof v !== 'string') throw new Error(`${where}: нужен текст, а записано ${J(v)}`);
    if (!v.trim() && !allowEmpty) throw new Error(`${where}: текст пустой`);
    return v;
  }
  const bool = (v, def) => (v === undefined || v === null) ? def : !!v;

  function resolvePalette(user) {
    const pal = { ...DEFAULT_PALETTE };
    user = user || {};
    if (typeof user !== 'object' || Array.isArray(user)) throw new Error('Цвета (palette): должен быть набор «имя → #RRGGBB»');
    for (const [k, v] of Object.entries(user)) {
      if (k.startsWith('_')) continue;
      if (!(k in DEFAULT_PALETTE) && !(k in ORANGE_DERIVED))
        throw new Error(`Цвета: неизвестный цвет «${k}». Доступные: ${[...Object.keys(DEFAULT_PALETTE), ...Object.keys(ORANGE_DERIVED)].join(', ')}`);
      if (!(typeof v === 'string' && (HEX.test(v) || v === 'auto')))
        throw new Error(`Цвет «${COLOR_LABELS[k] || k}»: нужно #RRGGBB (например #FF8A4C) или auto, а записано ${J(v)}`);
      pal[k] = v;
    }
    for (const [k, v] of Object.entries(pal))
      if (v === 'auto' && !(k in ORANGE_DERIVED)) throw new Error(`Цвет «${COLOR_LABELS[k] || k}»: auto можно только для оттенков оранжевого`);
    for (const [k, d] of Object.entries(ORANGE_DERIVED))
      if ((pal[k] === undefined ? 'auto' : pal[k]) === 'auto') pal[k] = shiftLike(d, DEFAULT_PALETTE.orange, pal.orange);
    return pal;
  }

  function validate(cfg0, ctx, warns) {
    if (!cfg0 || typeof cfg0 !== 'object') throw new Error('Нет настроек баннера');
    const cfg = JSON.parse(JSON.stringify(cfg0));
    const names = { site: 'Сайт', promo_code: 'Промокод', discount: 'Скидка' };
    for (const k of ['site', 'promo_code', 'discount']) cfg[k] = textOf(cfg[k], names[k], k === 'discount');
    const fill = s => s.split('{promo}').join(cfg.promo_code).split('{site}').join(cfg.site).split('{discount}').join(cfg.discount);
    const ch = cfg.character = cfg.character || {};
    ch.scale = num(ch.scale === undefined ? 0.68 : ch.scale, 'Персонаж: размер', 0.2, 1.5);
    ch.mirror = bool(ch.mirror, true);
    ch.offset_x = num(ch.offset_x === undefined ? 0 : ch.offset_x, 'Персонаж: сдвиг по X', -600, 600);
    ch.offset_y = num(ch.offset_y === undefined ? 0 : ch.offset_y, 'Персонаж: сдвиг по Y', -400, 400);
    const pl = cfg.plate = cfg.plate || {};
    pl.show = bool(pl.show, true);
    pl.text = fill(textOf(pl.text === undefined ? '{site}' : pl.text, 'Плашка: текст', !pl.show));
    const lg = cfg.logo = cfg.logo || {};
    lg.show = bool(lg.show, true);
    if (lg.show && !(ctx.assets && ctx.assets.logo)) throw new Error('Логотип: файл logo.svg не загрузился (или выключите логотип)');
    const f = cfg.font || {};
    if ((f.file && f.file !== 'Unbounded.ttf') || (f.weight !== undefined && Number(f.weight) !== 900))
      warns.push('В веб-конструкторе шрифт всегда Unbounded 900 — настройки font не применяются.');

    const all = cfg.scenes;
    if (!Array.isArray(all)) throw new Error('Сцены: нужен список хотя бы из одной сцены');
    const scenes = all.filter(s => !(s && typeof s === 'object' && s.off));
    if (!scenes.length) throw new Error('Сцены: нужна хотя бы одна включённая сцена');
    const imgs = ctx.images || {};
    const checkImage = (name, where) => {
      if (typeof name !== 'string') throw new Error(`${where}: нужно имя картинки, например u2.png`);
      if (!imgs[name]) throw new Error(`${where}: нет картинки «${name}»`);
    };
    const out = scenes.map((s0, idx) => {
      const W = `Сцена ${idx + 1}`;
      if (!s0 || typeof s0 !== 'object') throw new Error(`${W}: сцена должна быть объектом`);
      const t = s0.type;
      if (!TYPES.includes(t)) throw new Error(`${W}: неизвестный тип «${t}». Доступные: ${TYPES.join(', ')}`);
      const s = { ...s0 };
      s.duration = num(s.duration, `${W}: длительность, с`, 1.5, 30);
      s.beat = num(s.beat === undefined || s.beat === null || s.beat === '' ? DEF_BEAT[t] : s.beat, `${W}: момент удара`, 0.3);
      if (s.beat > s.duration - 1.5)
        throw new Error(`${W}: удар (${fg(s.beat)} с) слишком близко к концу сцены — нужно не позже ${fg(s.duration - 1.5)} с (длительность − 1.5)`);
      if (t === 'big') {
        s.text = fill(textOf(s.text, `${W}: крупный текст`));
        s.sub = fill(textOf(s.sub, `${W}: строка под ним`, true));
      } else if (t === 'site') {
        s.text = fill(textOf(s.text === undefined ? '{site}' : s.text, `${W}: крупный текст`));
        s.sub = fill(textOf(s.sub, `${W}: строка под ним`, true));
      } else if (t === 'price') {
        s.text = fill(textOf(s.text, `${W}: цена`));
        s.prefix = fill(textOf(s.prefix, `${W}: слово над ценой`, true));
        s.underline = bool(s.underline, true);
      } else if (t === 'promo') {
        s.text = fill(textOf(s.text === undefined ? '{promo}' : s.text, `${W}: промокод`));
        s.badge = fill(textOf(s.badge === undefined ? '{discount}' : s.badge, `${W}: бейдж`, true));
        s.impact = bool(s.impact, true);
      }
      s.reaction = s.reaction === undefined ? DEF_REACTION[t] : s.reaction;
      if (!REACTIONS.includes(s.reaction)) throw new Error(`${W}: реакция «${s.reaction}» — можно только ${REACTIONS.join(', ')}`);
      for (const key of ['emotion', 'emotion_intro']) {
        if (s[key] !== undefined && s[key] !== null && s[key] !== '') checkImage(s[key], `${W}: ${key === 'emotion' ? 'эмоция' : 'эмоция до удара'}`);
        else s[key] = null;
      }
      if (!s.emotion) throw new Error(`${W}: не выбрана эмоция персонажа`);
      let rk = s.rekick;
      if (rk) {
        if (typeof rk !== 'object') throw new Error(`${W}: повторный удар должен быть объектом {at, emotion, reaction}`);
        rk = { ...rk };
        if (rk.at === undefined || rk.at === null || rk.at === '') rk.at = pyRound((s.beat + 1 + s.duration - 1.5) / 2, 2);
        rk.at = num(rk.at, `${W}: момент повторного удара`, 0);
        if (rk.at < s.beat + 1.0 || rk.at > s.duration - 1.5)
          throw new Error(`${W}: повторный удар в ${fg(rk.at)} с — нужно между ${fg(s.beat + 1)} (удар + 1) и ${fg(s.duration - 1.5)} (длительность − 1.5)`);
        if (rk.emotion) checkImage(rk.emotion, `${W}: эмоция повторного удара`);
        else rk.emotion = null;
        rk.reaction = rk.reaction === undefined || rk.reaction === '' ? 'hearts' : rk.reaction;
        if (!REACTIONS.includes(rk.reaction)) throw new Error(`${W}: реакция повторного удара — можно только ${REACTIONS.join(', ')}`);
        s.rekick = rk;
      } else s.rekick = null;
      return s;
    });
    cfg._scenes = out;
    cfg._palette = resolvePalette(cfg.palette);
    return cfg;
  }

  // ======================================================================== генератор SVG
  const EO = '0.2 0.9 0.25 1', EIO = '0.45 0 0.55 1', EIN = '0.6 0 0.9 0.4', LIN = '0 0 1 1';
  const HW = 0.17;                          // полуширина шторки по времени
  const PW = 1395, PH = 320, S = 60;        // панель: ширина, высота, скос
  const R0 = 1210;                          // опорная точка героини
  const TAN = S / PH, SKA = Math.atan(TAN) * (180.0 / Math.PI);
  const PANEL = `M${S} 0H${PW}L${PW - S} ${PH}H0Z`;
  const GX = 70, GY = 330, GROT = -4.5;
  const TX = 78, TXT_MAX = 690, SKX = -9;
  const REF_H = 734;                        // эталонная высота эмоции (u4) — по ней ставится верх героини
  const KIND = {  // шейк камеры, сжатие панели, наклон героини, центр 集中線
    big: [7, 0.035, 4, [280, 160]], site: [7, 0.035, 4, [280, 160]],
    price: [8, 0.04, 3, [330, 190]], promo: [12, 0.06, 5, null], rekick: [5, 0.025, 3, [420, 190]]
  };
  const WIDE_VB = [-500, -700, 2600, 1800];

  function generate(config, ctx) {
    ctx = ctx || {};
    const warns = [];
    const M = ctx.metrics && ctx.metrics.unbounded900;
    if (!M || !M.adv) throw new Error('Не загрузились метрики шрифта Unbounded 900 (assets/fonts/metrics.json)');
    if (!ctx.fonts || !ctx.fonts.unbounded900) throw new Error('Не загрузился шрифт Unbounded 900 (assets/fonts/unbounded-900.woff2)');
    const cfg = validate(config, ctx, warns);
    const P = cfg._palette;
    const OR = P.orange, PE = P.peach, MI = P.mint, LA = P.lavender, INK = P.ink, PK = P.pink;
    const ORD = P.orange_dark;
    const WH = P.white.toUpperCase();
    const white = WH === '#FFFFFF' ? '#fff' : WH;
    const scenes = cfg._scenes;
    const rnd = PyRandom();

    // ---------------- ширины текста
    const tw = (t, size) => {
      let sum = 0;
      for (const c of t) { const a = M.adv[c.codePointAt(0)]; if (a !== undefined) sum += a; }
      return sum * size / M.upm;
    };
    const missing = new Set();
    const noteMissing = t => { for (const c of t) if (c.trim() && M.adv[c.codePointAt(0)] === undefined) missing.add(c); };
    const fit = (t, size, maxw) => {
      noteMissing(t);
      const s0 = size;
      while (tw(t, size) > maxw && size > 8) size -= 1;
      if (size < s0 * 0.45) {
        const w = `текст «${t}» длинный — ужат до ${pyRoundInt(100 * size / s0)}% размера, на маленьком баннере может плохо читаться`;
        if (!warns.includes(w)) warns.push(w);
      }
      return size;
    };

    // ---------------- картинки: id и размеры (нормализация к ~830 px, как в build.py)
    const names = [];
    for (const s of scenes)
      for (const nm of [s.emotion_intro, s.emotion, s.rekick ? s.rekick.emotion : null])
        if (nm && !names.includes(nm)) names.push(nm);
    const imgs = {}, ids = {};
    names.forEach((nm, k) => {
      const im = ctx.images[nm];
      let w = im.w, h = im.h;
      const sc = cfg.character.scale;
      const w0 = w / sc, h0 = h / sc, m = Math.max(w0, h0);
      if (m < 700 || m > 900) {
        const kk = 830 / m;
        w = pyRoundInt(Math.max(1, pyRoundInt(w0 * kk)) * sc);
        h = pyRoundInt(Math.max(1, pyRoundInt(h0 * kk)) * sc);
      }
      imgs[nm] = [w, h, im.dataUrl];
      const mm = /^u(\d+)\.png$/i.exec(nm);
      ids[nm] = mm ? `e${mm[1]}` : `em${k}`;
    });

    // ---------------- таймлайн
    const starts = []; let t = 0.0;
    for (const s of scenes) { starts.push(pyRound(t, 4)); t += s.duration; }
    const D = pyRound(t, 4);
    const n = scenes.length;
    scenes.forEach((s, i) => {
      const st = starts[i];
      s._s = st; s._e = pyRound(st + s.duration, 4); s._T = pyRound(st + s.beat, 4);
      if (s.rekick) s.rekick._T = pyRound(st + s.rekick.at, 4);
    });
    const WIPES = [...starts.slice(1), D];
    const beats = [];   // [T, kind, scene, isRekick]
    for (const s of scenes) {
      beats.push([s._T, s.type, s, false]);
      if (s.rekick) beats.push([s.rekick._T, 'rekick', s, true]);
    }
    beats.sort((a, b) => a[0] - b[0]);

    const per = p => { const k = Math.max(1, pyRoundInt(D / p)); return D / k; };   // период, делящий луп
    const kt = ks => ks.map(k => fx(Math.max(0.0, Math.min(1.0, k / D)), 5)).join(';');
    const vstr = vals => vals.map(v => typeof v === 'string' ? v : String(v)).join(';');
    const splAttr = (spl, calc, len) => {
      if (calc) return ` calcMode="${calc}"`;
      if (spl) { const sp = Array.isArray(spl) ? spl : Array(len - 1).fill(spl); return ` calcMode="spline" keySplines="${sp.join(';')}"`; }
      return '';
    };
    const DG = fg(D);
    const AN = (attr, ks, vals, spl, calc) => {
      if (ks.length !== vals.length) throw new Error('внутренняя ошибка: keyTimes/values');
      return `<animate attributeName="${attr}" dur="${DG}s" repeatCount="indefinite" keyTimes="${kt(ks)}" values="${vstr(vals)}"${splAttr(spl, calc, ks.length)}/>`;
    };
    const AT = (typ, ks, vals, spl, additive, calc) => {
      if (ks.length !== vals.length) throw new Error('внутренняя ошибка: keyTimes/values');
      return `<animateTransform attributeName="transform" type="${typ}" dur="${DG}s" repeatCount="indefinite" ` +
        `keyTimes="${kt(ks)}" values="${vstr(vals)}"${splAttr(spl, calc, ks.length)}` + (additive ? ' additive="sum"' : '') + '/>';
    };
    const ATd = (typ, d, vals, spl = EIO) => {
      d = per(d);
      const n_ = vals.length, ks = vals.map((_, i) => fx(i / (n_ - 1), 4)).join(';');
      return `<animateTransform attributeName="transform" type="${typ}" dur="${fg(d, 10)}s" repeatCount="indefinite" keyTimes="${ks}" ` +
        `values="${vals.join(';')}" calcMode="spline" keySplines="${Array(n_ - 1).fill(spl).join(';')}"/>`;
    };
    const esc = s => s.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;');
    const win = (t0, t1) => {
      let ks, vs;
      if (t1 <= D) {
        ks = t0 > 0 ? [0, t0, t1, D] : [0, t1, D];
        vs = t0 > 0 ? [0, 1, 0, 0] : [1, 0, 0];
        if (t1 >= D) { if (t0 > 0) { ks = [0, t0, D]; vs = [0, 1, 1]; } else { ks = [0, D]; vs = [1, 1]; } }
      } else {
        const w = t1 - D;
        ks = [0, w, t0, D]; vs = [1, 0, 1, 1];
      }
      return AN('opacity', ks, vs, null, 'discrete');
    };

    const o = []; const A = s => o.push(s);

    // ---------------- логотип
    let LOGO = '', LOGO_VB = '0 0 76 76';
    if (cfg.logo.show) {
      const logo = String(ctx.assets.logo);
      const i0 = logo.indexOf('<svg');
      if (i0 < 0 || logo.lastIndexOf('</svg>') < 0) throw new Error('Логотип: это не SVG-файл');
      const i1 = logo.indexOf('>', i0);
      const mv = /viewBox="([^"]+)"/.exec(logo.slice(i0, i1));
      if (mv) LOGO_VB = mv[1];
      LOGO = logo.slice(i1 + 1, logo.lastIndexOf('</svg>'));
      const lids = [...new Set([...LOGO.matchAll(/id="([^"]+)"/g)].map(m => m[1]))];
      for (const lid of lids) {
        const nid = lid === 'awn' ? 'logoAwn' : 'logo_' + lid;
        LOGO = LOGO.split(`id="${lid}"`).join(`id="${nid}"`).split(`url(#${lid})`).join(`url(#${nid})`).split(`href="#${lid}"`).join(`href="#${nid}"`);
      }
    }

    // ---------------- эмоции: слоты
    const sw = [];
    for (const s of scenes) {
      if (s.emotion_intro) sw.push([s._s, s.emotion_intro]);
      sw.push([s._T, s.emotion]);
      if (s.rekick && s.rekick.emotion) sw.push([s.rekick._T, s.rekick.emotion]);
    }
    sw.sort((a, b) => a[0] - b[0]);
    const SLOTS = sw.map(([t0, nm], i) => [nm, t0, i + 1 < sw.length ? sw[i + 1][0] : (sw[0][0] > 0 ? D + sw[0][0] : D)]);
    const SWAPS = sw.filter(([t0]) => t0 > 0).map(([t0]) => t0);
    const used = [];
    for (const [, nm] of sw) if (!used.includes(nm)) used.push(nm);
    for (const s of scenes) if (s.type === 'promo' && s.impact && !used.includes(s.emotion)) used.push(s.emotion);

    const ch = cfg.character;
    const MCX = R0 - 150 + ch.offset_x;
    const MTOP = PH + 26 - pyRoundInt(REF_H * ch.scale) + ch.offset_y;
    const topOf = nm => Math.max(MTOP, PH + 26 + ch.offset_y - imgs[nm][1]);

    // ================= SVG =================
    const vb = Array.isArray(config.viewBox) && config.viewBox.length === 4 ? config.viewBox.map(Number) : WIDE_VB.slice();
    A(`<?xml version="1.0" encoding="UTF-8"?>
<!-- ${esc(cfg.site.toLowerCase())} — рекламный оверлей «Anime OP bumper» (конструктор A). SMIL, без JS, прозрачный фон, бесшовный луп ${DG} с.
     Собрано веб-конструктором (шаблон a). Шрифт Unbounded (OFL) вшит сабсетом. -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${vb[2]}" height="${vb[3]}" viewBox="${vb.join(' ')}">
<style>
@font-face{font-family:"VUnbA";src:url(data:font/woff2;base64,${ctx.fonts.unbounded900}) format("woff2");font-weight:900}
.u{font-family:"VUnbA","Unbounded","Arial Black",sans-serif;font-weight:900}
</style>
<defs>
  <linearGradient id="pan" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="${P.panel_top}"/><stop offset=".55" stop-color="${P.panel_mid}"/><stop offset="1" stop-color="${P.panel_bottom}"/></linearGradient>
  <linearGradient id="slabO" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P.slab_light}"/><stop offset=".45" stop-color="${OR}"/><stop offset="1" stop-color="${P.slab_dark}"/></linearGradient>
  <linearGradient id="fW" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="${WH}"/><stop offset="1" stop-color="${P.text_warm}"/></linearGradient>
  <linearGradient id="fO" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.num_top}"/><stop offset=".55" stop-color="${OR}"/><stop offset="1" stop-color="${P.num_bottom}"/></linearGradient>
  <linearGradient id="tkt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${WH}"/><stop offset="1" stop-color="${P.ticket_warm}"/></linearGradient>
  <clipPath id="panClip"><path d="${PANEL}"/></clipPath>
  <path id="spark" d="M0-1C.1-.1.1-.1 1 0 .1.1.1.1 0 1-.1.1-.1.1-1 0-.1-.1-.1-.1 0-1Z"/>
  <filter id="drop" x="-10%" y="-20%" width="125%" height="150%"><feDropShadow dx="6" dy="14" stdDeviation="10" flood-color="${P.shadow}" flood-opacity=".55"/></filter>
`);

    const extFilter = (fid, ext, R = 5, N = 9, dx = 1.1, dy = 1.5) => {
      let offs = '', merge = '';
      for (let i = 1; i <= N; i++) {
        offs += `<feOffset in="o" dx="${fx(i * dx, 2)}" dy="${fx(i * dy, 2)}" result="e${i}"/>`;
        merge += `<feMergeNode in="e${i}"/>`;
      }
      return `<filter id="${fid}" x="-8%" y="-35%" width="120%" height="190%" color-interpolation-filters="sRGB">` +
        `<feMorphology in="SourceAlpha" operator="dilate" radius="${R}" result="o"/>${offs}` +
        `<feMerge result="eu">${merge}</feMerge>` +
        `<feMorphology in="eu" operator="dilate" radius="2" result="eo"/>` +
        `<feFlood flood-color="${INK}"/><feComposite in2="eo" operator="in" result="rim"/>` +
        `<feFlood flood-color="${ext}"/><feComposite in2="eu" operator="in" result="ex"/>` +
        `<feFlood flood-color="${INK}"/><feComposite in2="o" operator="in" result="ol"/>` +
        `<feMerge><feMergeNode in="rim"/><feMergeNode in="ex"/><feMergeNode in="ol"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    };
    A(extFilter('xW', ORD));
    A(extFilter('xO', P.extrude_num));
    A(extFilter('xS', ORD, 4, 6));
    A(extFilter('xK', P.extrude_code, 3, 6, 1, 1.3));

    // стикер-обводка: вспышка яркости на сменах эмоций
    let fk, fv;
    if (sw[0][0] === 0) { fk = [0, 0.04, 0.16]; fv = ['1', '1.45', '1']; }
    else { fk = [0]; fv = ['1']; }
    for (const t0 of SWAPS) { fk.push(t0 - 0.001, t0 + 0.04, t0 + 0.16); fv.push('1', '1.45', '1'); }
    fk.push(D); fv.push('1');
    const chOpt = cfg.character || {};
    const flash = chOpt.flash ? AN('slope', fk, fv) : '';          // вспышка яркости на смене эмоции (по умолчанию выкл.)
    const outlineNode = chOpt.outline ? '<feMergeNode in="w"/>' : '';   // белая обводка (по умолчанию выкл.)
    A(`<filter id="stk" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feComponentTransfer in="SourceGraphic" result="br"><feFuncR type="linear" slope="1">${flash}</feFuncR><feFuncG type="linear" slope="1">${flash}</feFuncG><feFuncB type="linear" slope="1">${flash}</feFuncB></feComponentTransfer>
    <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="sab"/><feComponentTransfer in="sab" result="sa"><feFuncA type="linear" slope="5" intercept="-1.6"/></feComponentTransfer>
    <feMorphology in="sa" operator="dilate" radius="5" result="d1"/>
    <feMorphology in="sa" operator="dilate" radius="9" result="d2"/>
    <feFlood flood-color="${white}"/><feComposite in2="d1" operator="in" result="w"/>
    <feFlood flood-color="${INK}"/><feComposite in2="d2" operator="in" result="k"/>
    <feOffset in="d2" dx="10" dy="12" result="s0"/><feFlood flood-color="${OR}"/><feComposite in2="s0" operator="in" result="sh"/>
    <feMerge><feMergeNode in="sh"/><feMergeNode in="k"/>${outlineNode}<feMergeNode in="br"/></feMerge>
  </filter>
  <filter id="sil" x="-15%" y="-15%" width="130%" height="130%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="sab"/><feComponentTransfer in="sab" result="sa"><feFuncA type="linear" slope="5" intercept="-1.6"/></feComponentTransfer>
    <feMorphology in="sa" operator="dilate" radius="9" result="d2"/>
    <feFlood flood-color="${white}"/><feComposite in2="d2" operator="in" result="w"/>
    <feFlood flood-color="${INK}"/><feComposite in2="sa" operator="in" result="k"/>
    <feMerge><feMergeNode in="w"/><feMergeNode in="k"/></feMerge>
  </filter>
`);
    for (const nm of used) {
      const [w, h, url] = imgs[nm];
      A(`<image id="${ids[nm]}" x="${fx(-w / 2, 1)}" y="0" width="${w}" height="${h}" href="${url}"/>\n`);
    }
    A('</defs>\n');

    // ================= шейк камеры на ударах =================
    const sk = [0], sv = ['0 0'];
    for (const [T, kind] of beats) {
      const a = KIND[kind][0];
      const seq = [[0, '0 0'], [0.03, `${-a} ${fx(a * 0.6, 1)}`], [0.07, `${fx(a * 0.8, 1)} ${fx(-a * 0.5, 1)}`],
        [0.11, `${fx(-a * 0.5, 1)} ${fx(-a * 0.4, 1)}`], [0.16, `${fx(a * 0.3, 1)} ${fx(a * 0.3, 1)}`], [0.24, '0 0']];
      for (const [dt, v] of seq) { sk.push(T + dt); sv.push(v); }
    }
    sk.push(D); sv.push('0 0');
    A(`<g>${AT('translate', sk, sv, null, false, 'linear')}`);
    A(`<g transform="translate(${GX} ${GY}) rotate(${GROT})">`);

    // ---- удар-сжатие панели ----
    const pk = [0], pv = ['1 1'];
    for (const [T, kind] of beats) {
      const a = KIND[kind][1];
      pk.push(T - 0.001, T + 0.05, T + 0.16, T + 0.3);
      pv.push('1 1', `${fx(1 + a * 0.6, 3)} ${fx(1 - a, 3)}`, `${fx(1 - a * 0.3, 3)} ${fx(1 + a * 0.5, 3)}`, '1 1');
    }
    pk.push(D); pv.push('1 1');
    const CX0 = PW / 2, CY0 = PH;
    A(`<g transform="translate(${F(CX0)} ${CY0})"><g>${AT('scale', pk, pv, EO)}<g transform="translate(${F(-CX0)} ${-CY0})">`);

    // ================= задние слои панели =================
    A(`<g filter="url(#drop)">` +
      `<path d="${PANEL}" transform="translate(26 30)" fill="${LA}"/>` +
      `<path d="${PANEL}" transform="translate(26 30)" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>` +
      `<path d="${PANEL}" transform="translate(13 15)" fill="${ORD}"/>` +
      `<path d="${PANEL}" transform="translate(13 15)" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>` +
      `</g>`);

    // ================= тело панели =================
    A(`<path d="${PANEL}" fill="url(#pan)"/>`);
    A('<g clip-path="url(#panClip)">');
    A(`<path d="M${R0 - 470} 0H${PW + 40}V${PH}H${R0 - 620}Z" fill="url(#slabO)"/>`);
    A(`<path d="M${R0 - 470} 0L${R0 - 620} ${PH}" stroke="${INK}" stroke-width="9"/>`);
    A(`<path d="M${R0 - 500} 0L${R0 - 650} ${PH}" stroke="${PE}" stroke-width="5"/>`);

    const halftone = (x0, y0, x1, y1, step, rfun, color, op) => {
      const ds = [];
      let j = 0;
      for (let yy = Math.trunc(y0); yy < Math.trunc(y1); yy += step, j++) {
        for (let xx = Math.trunc(x0); xx < Math.trunc(x1); xx += step) {
          const x = xx + (j % 2 ? step / 2 : 0);
          const r = rfun(x, yy);
          if (r > 0.5) ds.push(`M${fx(x - r, 1)} ${yy}a${fx(r, 1)} ${fx(r, 1)} 0 1 0 ${fx(2 * r, 1)} 0a${fx(r, 1)} ${fx(r, 1)} 0 1 0 ${fx(-2 * r, 1)} 0`);
        }
      }
      return `<path d="${ds.join('')}" fill="${color}" fill-opacity="${op}"/>`;
    };
    A(halftone(R0 - 650, 0, PW + 10, PH + 10, 17, (x, y) => Math.max(0, 7.5 * ((y / PH) * 0.7 + (x - (R0 - 650)) / 900 * 0.5) - 1.2), ORD, '0.55'));
    A(halftone(-10, 150, 560, PH + 10, 20, (x, y) => Math.max(0, 6.5 * ((y - 150) / (PH - 150)) * (1 - x / 560) - 0.3), LA, '0.22'));
    const lines = [];
    rnd.seed(3);
    for (let i = 0; i < 26; i++) {
      const y = rnd.uniform(8, PH - 8), L = rnd.uniform(80, 320), x = rnd.uniform(0, PW * 2);
      const wgt = rnd.choice([2, 2, 3, 4]);
      lines.push(`<rect x="${fx(x, 0)}" y="${fx(y, 0)}" width="${fx(L, 0)}" height="${wgt}" rx="${F(wgt / 2)}"/>`);
      lines.push(`<rect x="${fx(x + PW * 2, 0)}" y="${fx(y, 0)}" width="${fx(L, 0)}" height="${wgt}" rx="${F(wgt / 2)}"/>`);
    }
    A(`<g fill="${white}" fill-opacity=".10"><g>${ATd('translate', 1.5, ['0 0', `${-PW * 2} 0`], LIN)}${lines.join('')}</g></g>`);

    const focus = (cx, cy, n_, rin, rout, seed, color, wmax = 10) => {
      rnd.seed(seed); const ps = [];
      for (let i = 0; i < n_; i++) {
        const a = 2 * Math.PI * i / n_ + rnd.uniform(-0.04, 0.04);
        const r0 = rin * rnd.uniform(0.85, 1.35), w = rnd.uniform(2, wmax) / 2;
        const pa = [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.62];
        const ang2 = a + Math.PI / 2;
        const p1 = [cx + Math.cos(a) * rout + Math.cos(ang2) * w * 3, cy + Math.sin(a) * rout * 0.62 + Math.sin(ang2) * w * 3];
        const p2 = [cx + Math.cos(a) * rout - Math.cos(ang2) * w * 3, cy + Math.sin(a) * rout * 0.62 - Math.sin(ang2) * w * 3];
        ps.push(`M${fx(pa[0], 0)} ${fx(pa[1], 0)}L${fx(p1[0], 0)} ${fx(p1[1], 0)}L${fx(p2[0], 0)} ${fx(p2[1], 0)}Z`);
      }
      return `<path d="${ps.join('')}" fill="${color}"/>`;
    };
    const flick = (T, dur = 0.5) => {
      const k1 = [0, T, T + 0.067, T + 0.133, T + 0.2, T + 0.267, T + 0.333, Math.min(T + dur, D - 0.001), D];
      return [AN('opacity', k1, [0, 1, 0, 1, 0, 1, 0, 0, 0], null, 'discrete'),
        AN('opacity', k1, [0, 0, 1, 0, 1, 0, 1, 0, 0], null, 'discrete')];
    };
    for (const [T, kind] of beats) {
      const c = KIND[kind][3];
      if (!c) continue;
      const [a1, a2] = flick(T);
      A(`<g opacity="0">${a1}${focus(c[0], c[1], 70, 230, 900, Math.trunc(T * 10), white, 9)}</g>`);
      A(`<g opacity="0">${a2}${focus(c[0], c[1], 70, 250, 900, Math.trunc(T * 10) + 1, white, 9)}</g>`);
    }
    A('</g>');
    A(`<path d="${PANEL}" fill="none" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/>`);
    A(`<path d="${PANEL}" fill="none" stroke="${white}" stroke-width="5" stroke-linejoin="round"/>`);
    A('</g></g></g>');

    // ================= шторка-слэш =================
    const BW = 170, XS = -420, XE = PW + 160;
    const mid = (XS + XE) / 2;
    const bk = [0, HW, HW + 0.001], bv = [mid, XE, XS];
    for (const W_ of WIPES.slice(0, -1)) { bk.push(W_ - HW, W_ + HW, W_ + HW + 0.001); bv.push(XS, XE, XS); }
    bk.push(D - HW, D); bv.push(XS, mid);
    const bspl = bk.slice(0, -1).map((_, i) => (i % 3 === 0 ? EIO : LIN));
    const bandX = AN('x', bk, bv.map(v => fx(v, 0)), bspl);
    const clipX = AN('x', bk, bv.map(v => fx(v + BW * 0.55, 0)), bspl);
    A(`<clipPath id="oldClip"><rect transform="skewX(${fx(-SKA, 3)})" x="${XS}" y="-700" width="4000" height="1800">${clipX}</rect></clipPath>`);

    // ================= сцены =================
    const slam = (cx, cy, T, inner, s0 = 2.6, rot = -10) => {
      const k = [0, T - 0.14, T, T + 0.07, T + 0.2, T + 0.34, D];
      return `<g transform="translate(${fx(cx, 1)} ${fx(cy, 1)})"><g>${AN('opacity', [0, T - 0.14, T - 0.1, D], [0, 0, 1, 1])}` +
        `${AT('scale', k, [s0, s0, 0.86, 1.07, 0.98, 1, 1], [LIN, EIN, EO, EIO, EIO, LIN])}` +
        `<g>${AT('rotate', k, [rot, rot, 2, -1, 0, 0, 0], [LIN, EIN, EO, EIO, EIO, LIN])}` +
        `<g transform="translate(${fx(-cx, 1)} ${fx(-cy, 1)})">${inner}</g></g></g></g>`;
    };
    const slide = (T, inner, dx = -160) => {
      const k = [0, T, T + 0.16, T + 0.3, D];
      return `<g opacity="0">${AN('opacity', [0, T, T + 0.08, D], [0, 0, 1, 1])}` +
        `<g>${AT('translate', k, [`${dx} 0`, `${dx} 0`, '10 0', '0 0', '0 0'], [LIN, EO, EIO, LIN])}${inner}</g></g>`;
    };
    const T_ = (txt, x, y, size, fill, flt, extra = '', anchor = 'start') =>
      `<text class="u" x="${fx(x, 1)}" y="${fx(y, 1)}" font-size="${size}" fill="${fill}" filter="url(#${flt})" ` +
      `text-anchor="${anchor}" ${extra}>${esc(txt)}</text>`;
    const scene = (i, body) => {
      const s = scenes[i];
      if (n === 1) {
        A(`<g clip-path="url(#panClip)"><g clip-path="url(#oldClip)"><g>` +
          `<g transform="skewX(${SKX})">${body}</g></g></g></g>`);
        return;
      }
      const t0 = i === 0 ? 0.0 : s._s + HW;
      const t1 = s._e + HW;
      A(`<g clip-path="url(#panClip)"><g clip-path="url(#oldClip)"><g opacity="0">${win(t0, t1)}` +
        `<g transform="skewX(${SKX})">${body}</g></g></g></g>`);
    };

    const promoGeo = new Map();
    let promoK = 0;
    scenes.forEach((s, i) => {
      const T = s._T, st = s._s;
      const body = [];
      if (s.type === 'big' || s.type === 'site') {
        const hasSub = !!s.sub.trim();
        const xBig = TX + 44;
        const szBig = fit(s.text, s.type === 'big' ? 186 : 120, TXT_MAX - 30);
        const yBig = pyRound((hasSub ? 138 : 165) + szBig * 0.36, 2);   // центр прописных держится на месте
        const wBig = tw(s.text, szBig);
        body.push(slam(xBig + wBig / 2, yBig - szBig * 0.36, T, T_(s.text, xBig, yBig, szBig, 'url(#fO)', 'xO')));
        if (hasSub) {
          const sz2 = fit(s.sub, 62, TXT_MAX - 10);
          body.push(slide(st + 0.2, T_(s.sub, TX + 34, 296, sz2, 'url(#fW)', 'xS')));
        }
      } else if (s.type === 'price') {
        const hasPre = !!s.prefix.trim();
        if (hasPre) {
          const szo = fit(s.prefix, 78, TXT_MAX - 80);
          body.push(slide(st + HW + 0.05, T_(s.prefix, TX + 58, 108, szo, 'url(#fW)', 'xS')));
        }
        const szp = fit(s.text, 176, TXT_MAX - 40);
        const xp = TX + 26, yp = hasPre ? 285 : 250, wp = tw(s.text, szp);
        body.push(slam(xp + wp / 2, yp - szp * 0.36, T, T_(s.text, xp, yp, szp, 'url(#fO)', 'xO')));
        if (s.underline) {
          body.push(`<path d="M${fx(xp + wp * 0.05, 0)} ${yp + 22} Q${fx(xp + wp * 0.5, 0)} ${yp + 36} ${fx(xp + wp + 4, 0)} ${yp + 10}" fill="none" stroke="${PK}" stroke-width="11" stroke-linecap="round" ` +
            `pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1">${AN('stroke-dashoffset', [0, T + 0.25, T + 0.55, D], [1, 1, 0, 0], EO)}</path>`);
        }
      } else if (s.type === 'promo') {
        const sfx = promoK === 0 ? '' : String(promoK + 1);
        const code = s.text;
        const hasBadge = !!s.badge.trim();
        const szc = fit(code, 110, TXT_MAX - 90 - (hasBadge ? 0 : -40));
        const cw = tw(code, szc), tpad = 36, th = 142;
        const tx0 = TX - 6, ty0 = (PH - th) / 2 + 6, tw_ = cw + tpad * 2;   // ty0 — float в Python
        const tk = `M${tx0 + 18} ${F(ty0)}H${F(tx0 + tw_)}V${F(ty0 + th / 2 - 15)}a15 15 0 0 0 0 30V${F(ty0 + th)}H${tx0}V${F(ty0 + th / 2 + 15)}a15 15 0 0 0 0 -30V${F(ty0 + 18)}Z`;
        const tcx = tx0 + tw_ / 2, tcy = ty0 + th / 2;
        const idattr = promoK === 0 ? ' id="promo_code"' : ` id="promo_code${sfx}"`;
        let inner = `<path d="${tk}" transform="translate(12 14)" fill="${INK}"/>` +
          `<path d="${tk}" fill="${OR}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>` +
          `<path d="M${tx0 + 14} ${F(ty0 + 10)}H${F(tx0 + tw_ - 12)}" stroke="${P.ticket_stripe}" stroke-width="5" stroke-linecap="round"/>` +
          `<path d="M${F(tx0 + tw_ - 26)} ${F(ty0 + 14)}V${F(ty0 + th - 14)}" stroke="${INK}" stroke-width="3" stroke-dasharray="7 7" stroke-opacity=".6"/>` +
          `<text${idattr} class="u" x="${fx(tcx - 8, 1)}" y="${fx(tcy + szc * 0.37, 1)}" font-size="${szc}" fill="${white}" filter="url(#xK)" text-anchor="middle">${esc(code)}</text>`;
        const R = s.rekick ? s.rekick._T : null;
        let shk, shv;
        const far = `${fx(tx0 + tw_ + 60, 0)} 0`, near = `${tx0 - 240} 0`;
        if (R !== null) { shk = [0, T + 0.5, T + 1.1, R + 0.05, R + 0.65, D]; shv = [near, near, far, near, far, far]; }
        else { shk = [0, T + 0.5, T + 1.1, D]; shv = [near, near, far, far]; }
        inner += `<clipPath id="tkc${sfx}"><path d="${tk}"/></clipPath><linearGradient id="shT${sfx}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="160" y2="0">` +
          `<stop offset="0" stop-color="${white}" stop-opacity="0"/><stop offset=".5" stop-color="${white}" stop-opacity=".7"/><stop offset="1" stop-color="${white}" stop-opacity="0"/>` +
          AT('translate', shk, shv).replace('attributeName="transform"', 'attributeName="gradientTransform"') +
          `</linearGradient><rect x="${tx0}" y="${F(ty0)}" width="${fx(tw_, 0)}" height="${th}" fill="url(#shT${sfx})" clip-path="url(#tkc${sfx})"/>`;
        body.push(slam(tcx, tcy, T, inner, 2.4, 8));
        promoGeo.set(i, { tk, tcx, tcy, szc, code, tx0, ty0, tw_, sfx, hasBadge });
        promoK += 1;
      }
      scene(i, body.join(''));
    });

    // шторка поверх текста
    A(`<g clip-path="url(#panClip)"><g transform="skewX(${fx(-SKA, 3)})">` +
      `<rect y="-80" width="${BW}" height="${PH + 160}" fill="${white}" x="${XS}">${bandX}</rect>` +
      `<rect y="-80" width="18" height="${PH + 160}" fill="${OR}" x="${XS}">${AN('x', bk, bv.map(v => fx(v + BW + 10, 0)), bspl)}</rect>` +
      `<rect y="-80" width="10" height="${PH + 160}" fill="${LA}" x="${XS}">${AN('x', bk, bv.map(v => fx(v - 40, 0)), bspl)}</rect>` +
      `</g></g>`);

    // ================= постоянная плашка с адресом =================
    const promoBeats = scenes.filter(s => s.type === 'promo').map(s => s._T);
    if (cfg.plate.show) {
      const URL = cfg.plate.text, szu = fit(URL, 80, 640);
      const PLH = 104, PLY = -PLH + 18, PLX0 = 44;
      const wurl = tw(URL, szu);
      const PLX1 = PLX0 + 40 + wurl + 40;
      const pk_ = PLH * TAN;
      const PLATE = `M${fx(PLX0 + pk_, 0)} ${PLY}H${fx(PLX1 + pk_, 0)}L${fx(PLX1, 0)} ${PLY + PLH}H${fx(PLX0, 0)}Z`;
      A(`<g filter="url(#drop)"><path d="${PLATE}" transform="translate(12 13)" fill="${ORD}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/></g>`);
      A(`<path d="${PLATE}" fill="${white}"/>`);
      A(`<clipPath id="plClip"><path d="${PLATE}"/></clipPath><g clip-path="url(#plClip)">` +
        halftone(PLX1 - 260, PLY, PLX1 + 40, PLY + PLH, 12, (x, y) => Math.max(0, 5.2 * (x - (PLX1 - 260)) / 300 - 0.4), LA, '0.55') +
        `<rect x="${PLX0 - 20}" y="${PLY + PLH - 12}" width="${F(PLX1 - PLX0 + 80)}" height="12" fill="${OR}"/>`);
      A(`<linearGradient id="shP" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="140" y2="0"><stop offset="0" stop-color="${OR}" stop-opacity="0"/>` +
        `<stop offset=".5" stop-color="${PE}" stop-opacity=".9"/><stop offset="1" stop-color="${OR}" stop-opacity="0"/>` +
        ATd('translate', 6, [`${PLX0 - 300} 0`, `${PLX0 - 300} 0`, `${fx(PLX1 + 200, 0)} 0`, `${fx(PLX1 + 200, 0)} 0`], EIO).replace('attributeName="transform"', 'attributeName="gradientTransform"') +
        `</linearGradient><rect x="${PLX0 - 20}" y="${PLY}" width="${fx(PLX1 - PLX0 + 100, 0)}" height="${PLH}" fill="url(#shP)" opacity=".55"/>` +
        '</g>');
      A(`<path d="${PLATE}" fill="none" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>`);
      let x = PLX0 + 42;
      const yu = PLY + PLH / 2 + szu * 0.37 - 4;
      const chars = Array.from(URL);
      const dot = chars.lastIndexOf('.');
      A(`<g transform="skewX(${SKX})">`);
      chars.forEach((chr, i) => {
        const k = [0], vv = ['0 0'];
        for (const B of promoBeats) {
          const t1 = B + 0.1 + i * 0.035;
          k.push(t1, t1 + 0.09, t1 + 0.22); vv.push('0 0', '0 -16', '0 0');
        }
        k.push(D); vv.push('0 0');
        const col = (dot > 0 && i >= dot) ? OR : INK;
        const stA = col === OR ? `stroke="${INK}" stroke-width="7" paint-order="stroke" stroke-linejoin="round"` : '';
        const spl = [LIN]; for (let q = 0; q < promoBeats.length; q++) spl.push(EO, EIO, LIN);
        const anim = promoBeats.length ? AT('translate', k, vv, spl) : '';
        A(`<g>${anim}` +
          `<text class="u" x="${fx(x, 1)}" y="${fx(yu, 1)}" font-size="${szu}" fill="${col}" ${stA}>${esc(chr)}</text></g>`);
        x += tw(chr, szu);
      });
      A('</g>');
    }

    // ================= героиня =================
    const impacts = scenes.filter(s => s.type === 'promo' && s.impact).map(s => s._T);
    A(`<clipPath id="heroClip"><path d="M-400 -900H${fx(PW + 900 * TAN - 6, 1)}L${fx(PW - S * (PH - 4) / PH - 6, 1)} ${PH - 4}H-400Z"/></clipPath>`);
    if (impacts.length) {
      const hk = [0], hv = [1];
      for (const B of impacts) { hk.push(B, B + 0.133); hv.push(0, 1); }
      hk.push(D); hv.push(1);
      A(`<g clip-path="url(#heroClip)"><g>${AN('opacity', hk, hv, null, 'discrete')}`);
    } else A('<g clip-path="url(#heroClip)"><g>');
    const MCXg = fg(MCX);
    A(`<g>${ATd('translate', 3, ['0 0', '0 -6', '0 0'])}<g>${ATd('rotate', 4, [`-1.4 ${MCXg} ${PH}`, `1.4 ${MCXg} ${PH}`, `-1.4 ${MCXg} ${PH}`])}`);

    const heroLayer = filt => {
      const out = [`<g filter="url(${filt})">`];
      for (const [nm, t0, t1] of SLOTS) {
        const vis = SLOTS.length === 1 ? '' : win(t0 === 0 ? 0 : t0, t1);
        const tt = t0;
        let jk, jv, qk, qv;
        if (t0 === 0) {
          jk = [0, 0.09, 0.24, 0.34, 0.42, D]; jv = ['0 0', '0 -30', '0 0', '0 -6', '0 0', '0 0'];
          qk = [0, 0.06, 0.2, 0.34, D]; qv = ['1.05 .94', '0.97 1.05', '1.02 .98', '1 1', '1 1'];
        } else {
          jk = [0, tt, tt + 0.09, tt + 0.24, tt + 0.34, tt + 0.42, D]; jv = ['0 0', '0 0', '0 -30', '0 0', '0 -6', '0 0', '0 0'];
          qk = [0, tt, tt + 0.06, tt + 0.2, tt + 0.34, D]; qv = ['1 1', '1.05 .94', '0.97 1.05', '1.02 .98', '1 1', '1 1'];
        }
        const vis0 = (t0 === 0 || t1 > D || SLOTS.length === 1) ? 1 : 0;
        out.push(`<g opacity="${vis0}">${vis}<g>${AT('translate', jk, jv, EO)}` +
          `<g transform="translate(${MCXg} ${PH})"><g>${AT('scale', qk, qv, EO)}` +
          `<g transform="translate(0 ${fg(topOf(nm) - PH)})"><use href="#${ids[nm]}"/></g></g></g></g></g>`);
      }
      out.push('</g>');
      return out.join('');
    };
    const lk = [0], lv = [`0 ${MCXg} ${PH}`];
    for (const [T, kind] of beats) {
      const a = KIND[kind][2];
      lk.push(T - 0.16, T - 0.02, T + 0.1, T + 0.5);
      lv.push(`0 ${MCXg} ${PH}`, `${fx(a * 0.5, 1)} ${MCXg} ${PH}`, `${-a} ${MCXg} ${PH}`, `0 ${MCXg} ${PH}`);
    }
    lk.push(D); lv.push(`0 ${MCXg} ${PH}`);
    A(`<g>${AT('rotate', lk, lv, EO)}`);
    A(heroLayer('#stk'));
    A('</g></g></g></g></g>');

    // ================= манга-значки =================
    const HX = MCX - 40, HY = MTOP + 150;
    const pop = (T, hold = 0.7, s1 = 1.25) => {
      const k = [0, T, T + 0.1, T + 0.2, T + hold, T + hold + 0.14, D];
      return AN('opacity', k, [0, 0, 1, 1, 1, 0, 0]) + AT('scale', k, [0, 0, s1, 1, 1, 1.15, 1.15], EO);
    };
    const HEART = 'M0 14C-16 4-20-4-15-11-11-16-4-15 0-9 4-15 11-16 15-11 20-4 16 4 0 14Z';
    const rad = d => d * (Math.PI / 180.0);
    for (const [T, , s, rk] of beats) {
      const reac = rk ? s.rekick.reaction : s.reaction;
      if (reac === '!!') {
        let spokes = '';
        for (const a of [190, 225, 260]) {
          const d = `M${fx(Math.cos(rad(a)) * 70, 0)} ${fx(Math.sin(rad(a)) * 70, 0)}L${fx(Math.cos(rad(a)) * 105, 0)} ${fx(Math.sin(rad(a)) * 105, 0)}`;
          spokes += `<path d="${d}" stroke="${INK}" stroke-width="13" stroke-linecap="round"/>` +
            `<path d="${d}" stroke="${white}" stroke-width="6" stroke-linecap="round"/>`;
        }
        A(`<g transform="translate(${fg(HX - 190)} ${fg(HY - 110)}) rotate(-12)"><g opacity="0">${pop(T + 0.02, 0.9)}` +
          `<text class="u" x="0" y="30" font-size="96" fill="${OR}" stroke="${INK}" stroke-width="16" paint-order="stroke" stroke-linejoin="round" text-anchor="middle">!!</text>` +
          spokes + '</g></g>');
      } else if (reac === 'sparkles') {
        [[-175, -70, 30, white], [-120, -150, 18, PE], [120, -170, 22, MI]].forEach(([dx, dy, sc, c], j) => {
          const Tj = T + 0.03 + j * 0.06;
          A(`<g transform="translate(${fg(HX + dx)} ${fg(HY + dy)})"><g opacity="0">${pop(Tj, 0.8, 1.4)}` +
            `<g>${AT('rotate', [0, Tj, Tj + 0.8, D], [0, 0, 90, 90], EO)}` +
            `<use href="#spark" transform="scale(${sc + 6})" fill="${INK}"/><use href="#spark" transform="scale(${sc})" fill="${c}"/></g></g></g>`);
        });
      } else if (reac === 'hearts') {
        [[-190, -40, 2.4], [-140, -150, 1.7], [150, -120, 2.0], [190, -20, 1.5]].forEach(([dx, dy, sc], j) => {
          const t1 = T + 0.04 + j * 0.05;
          const k = [0, t1, t1 + 0.12, t1 + 1.0, t1 + 1.2, D];
          A(`<g transform="translate(${fg(HX + dx)} ${fg(HY + dy)})"><g opacity="0">${AN('opacity', k, [0, 0, 1, 1, 0, 0])}` +
            `${AT('translate', k, ['0 20', '0 20', '0 -6', '0 -70', '0 -84', '0 -84'], EO)}` +
            `<g>${AT('scale', k, [0, 0, F(sc * 1.3), F(sc), F(sc * 0.8), F(sc * 0.8)], EO)}` +
            `<path d="${HEART}" fill="${PK}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/><ellipse cx="-7" cy="-7" rx="3.5" ry="2.2" fill="${white}"/></g></g></g>`);
        });
      }
    }

    // ================= бейдж-взрыв скидки =================
    const burstPath = (r1, r2, n_, seed) => {
      rnd.seed(seed); const pts = [];
      for (let i = 0; i < n_ * 2; i++) {
        const a = Math.PI * i / n_ - Math.PI / 2;
        const r = (i % 2 === 0 ? r1 : r2) * rnd.uniform(0.9, 1.08);
        pts.push(`${fx(Math.cos(a) * r, 1)} ${fx(Math.sin(a) * r, 1)}`);
      }
      return 'M' + pts.join('L') + 'Z';
    };
    for (const [i, g] of promoGeo) {
      const s = scenes[i];
      if (!g.hasBadge) continue;
      const T = s._T, E = s._e;
      const BX = g.tx0 + g.tw_ + 78, BY = g.ty0 + 20;
      const bp = burstPath(98, 70, 12, 5);
      const TB = T + 0.12;
      const kb = [0, TB, TB + 0.12, TB + 0.24, TB + 0.36], vb2 = [0, 0, 1.3, 0.92, 1];
      if (s.rekick) {
        const R = s.rekick._T;
        kb.push(R, R + 0.08, R + 0.2, R + 0.34); vb2.push(1, 1.25, 0.95, 1);
      }
      kb.push(E - HW, E); vb2.push(1, 0);
      const ok = [0, TB, TB + 0.02, E - HW, E - HW + 0.001], ov = [0, 0, 1, 1, 0];
      if (E < D) { kb.push(D); vb2.push(0); }
      ok.push(D); ov.push(0);
      const szb = fit(s.badge, 50, 178);
      A(`<g transform="translate(${F(BX)} ${F(BY)}) rotate(10)"><g opacity="0">${AN('opacity', ok, ov)}` +
        `<g>${AT('scale', kb, vb2, EO)}` +
        `<g>${ATd('rotate', 1.5, ['-4', '4', '-4'])}` +
        `<path d="${bp}" transform="translate(9 11)" fill="${INK}"/>` +
        `<path d="${bp}" fill="${PK}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>` +
        `<path d="${burstPath(80, 58, 12, 5)}" fill="none" stroke="${white}" stroke-width="3" stroke-opacity=".7" stroke-linejoin="round"/>` +
        `<text class="u" x="0" y="${fg(17 * szb / 50, 3)}" font-size="${szb}" fill="${white}" filter="url(#xK)" text-anchor="middle">${esc(s.badge)}</text>` +
        `</g></g></g></g>`);
    }

    // ================= импакт-кадр (инверсия ч/б) =================
    for (const [i, g] of promoGeo) {
      const s = scenes[i];
      if (!s.impact) continue;
      const B = s._T;
      const IK = [0, B, B + 0.067, B + 0.133, D];
      const { tk, tcx, tcy, szc, code } = g;
      A(`<g opacity="0">${AN('opacity', IK, [0, 1, 1, 0, 0], null, 'discrete')}`);
      A(`<g clip-path="url(#panClip)"><rect x="-20" y="-20" width="${PW + 40}" height="${PH + 40}" fill="${white}">` +
        `${AN('fill', IK, [white, white, INK, white, white], null, 'discrete')}</rect>` +
        `<g>${AN('opacity', IK, [1, 1, 0, 1, 1], null, 'discrete')}${focus(tcx, tcy, 90, 170, 1000, 91, INK, 12)}</g>` +
        `<g opacity="0">${AN('opacity', IK, [0, 0, 1, 0, 0], null, 'discrete')}${focus(tcx, tcy, 90, 190, 1000, 92, white, 12)}</g>` +
        `<g transform="skewX(${SKX})"><path d="${tk}" fill="none" stroke-width="9" stroke-linejoin="round">${AN('stroke', IK, [INK, INK, white, INK, INK], null, 'discrete')}</path>` +
        `<text class="u" x="${fx(tcx - 8, 1)}" y="${fx(tcy + szc * 0.37, 1)}" font-size="${szc}" text-anchor="middle">${AN('fill', IK, [INK, INK, white, INK, INK], null, 'discrete')}${esc(code)}</text></g>` +
        `</g>`);
      const nm = s.emotion;
      A(`<g clip-path="url(#heroClip)"><g filter="url(#sil)"><g transform="translate(${MCXg} ${fg(topOf(nm) - 14)})"><use href="#${ids[nm]}"/></g></g></g>`);
      A(`<path d="${PANEL}" fill="none" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/>`);
      A('</g>');
    }

    // ================= лого-значок =================
    if (LOGO) {
      A(`<g transform="translate(${-6} ${PH - 14})"><g>${ATd('rotate', 2, ['-8', '6', '-8'])}` +
        `<circle r="50" fill="${INK}" transform="translate(6 8)"/><circle r="50" fill="${white}" stroke="${INK}" stroke-width="7"/>` +
        `<circle r="41" fill="${INK}"/><svg x="-32" y="-32" width="64" height="64" viewBox="${LOGO_VB}">${LOGO}</svg></g></g>`);
    }

    // искры
    for (const [x, y, r, c, d, b] of [[R0 - 40, -120, 16, MI, 2, '-0.4'], [R0 - 520, -60, 12, PE, 3, '-1.3'], [PW + 20, 150, 14, OR, 1.5, '-0.9'], [-18, PH - 30, 12, LA, 3, '-2.1']]) {
      A(`<g transform="translate(${x} ${y})"><use href="#spark" fill="${c}" stroke="${INK}" stroke-width=".12" transform="scale(0)">` +
        `<animateTransform attributeName="transform" type="scale" values="0;${r};0" keyTimes="0;.5;1" dur="${fg(per(d), 10)}s" begin="${b}s" ` +
        `repeatCount="indefinite" calcMode="spline" keySplines=".3 0 .3 1;.7 0 .7 1"/></use></g>`);
    }

    A('</g></g>\n</svg>\n');
    if (missing.size) warnings(warns, `В шрифте Unbounded нет символов: ${[...missing].join(' ')} — они нарисуются системным шрифтом, ширина может поехать.`);
    const svg = o.join('');
    if (svg.length > 5 * 1024 * 1024)
      warnings(warns, 'SVG больше 5 МБ — OBS может грузить его долго. Уменьшите размер персонажа или число разных эмоций (для WebM это не важно).');
    return { svg, duration: D, width: vb[2], height: vb[3], viewBox: vb, warnings: warns };
  }
  const warnings = (list, w) => { if (!list.includes(w)) list.push(w); };

  // ======================================================================== схема формы
  const TEXT_HINT = 'Можно вставлять {promo}, {site}, {discount} — подставятся значения из «Промокод и сайт».';
  const SCENE_TYPES = {
    big: 'Ударная надпись + строка',
    site: 'Адрес сайта ударом',
    price: 'Цена с маркером',
    promo: 'Купон-промокод + бейдж скидки'
  };
  const REACTION_OPTIONS = { '!!': '«!!» — восклицание', sparkles: 'блики-звёзды', hearts: 'сердечки', none: 'нет' };
  const common = [
    { path: 'duration', label: 'Длительность, с', kind: 'number', min: 1.5, max: 30, step: 0.05, half: true },
    { path: 'beat', label: 'Удар, с от начала', kind: 'number', min: 0.3, max: 28.5, step: 0.05, half: true,
      hint: 'На ударе прилетает крупный текст, трясётся камера и меняется эмоция. Не позже, чем длительность − 1.5 с.' },
    { path: 'emotion_intro', label: 'Эмоция до удара (пусто — как в прошлой сцене)', kind: 'image', optional: 'emotion_intro' },
    { path: 'emotion', label: 'Эмоция с удара', kind: 'image' },
    { path: 'reaction', label: 'Значок у лица на ударе', kind: 'select', options: REACTION_OPTIONS },
    { path: 'rekick.emotion', label: 'Повторный удар: эмоция (пусто — без повторного удара)', kind: 'image', optional: 'rekick' },
    { path: 'rekick.at', label: 'Повторный удар, с от начала', kind: 'number', min: 1.3, max: 28.5, step: 0.05, half: true,
      showIf: s => !!s.rekick, hint: 'Между «удар + 1» и «длительность − 1.5».' },
    { path: 'rekick.reaction', label: 'Повторный удар: значок', kind: 'select', options: REACTION_OPTIONS, half: true, showIf: s => !!s.rekick },
    { path: 'off', label: 'Выключить сцену (не попадёт в луп)', kind: 'check' }
  ];
  const schema = {
    sections: [
      { title: 'Промокод и сайт', open: true, fields: [
        { path: 'promo_code', label: 'Промокод', kind: 'text', placeholder: 'КУМЕЛИ10', half: true },
        { path: 'discount', label: 'Скидка', kind: 'text', placeholder: '−10%', half: true },
        { path: 'site', label: 'Сайт', kind: 'text', placeholder: 'VTUBIKA.STORE' }
      ] },
      { title: 'Персонаж', fields: [
        { path: 'character.scale', label: 'Размер', kind: 'number', min: 0.2, max: 1.5, step: 0.01, half: true, hint: '0.68 — как в оригинале' },
        { path: 'character.mirror', label: 'Отзеркалить (чтобы смотрела на текст)', kind: 'check', half: true },
        { path: 'character.outline', label: 'Белая обводка вокруг персонажа', kind: 'check', half: true },
        { path: 'character.flash', label: 'Вспышка яркости при смене эмоции', kind: 'check', half: true },
        { path: 'character.offset_x', label: 'Сдвиг вправо, px', kind: 'number', min: -600, max: 600, step: 1, half: true },
        { path: 'character.offset_y', label: 'Сдвиг вниз, px', kind: 'number', min: -400, max: 400, step: 1, half: true }
      ] },
      { title: 'Плашка и логотип', fields: [
        { path: 'plate.show', label: 'Белая плашка с адресом над панелью', kind: 'check' },
        { path: 'plate.text', label: 'Текст плашки', kind: 'text', placeholder: '{site}', showIf: c => !c.plate || c.plate.show !== false,
          hint: 'Часть после последней точки красится главным цветом. ' + TEXT_HINT },
        { path: 'logo.show', label: 'Круглый значок с логотипом слева внизу', kind: 'check' }
      ] }
    ],
    colors: { path: 'palette', labels: COLOR_LABELS },
    sceneTypes: SCENE_TYPES,
    sceneHint: TEXT_HINT,
    sceneFields: {
      big: [
        { path: 'text', label: 'Крупный текст (удар)', kind: 'text', placeholder: '420+', hint: TEXT_HINT },
        { path: 'sub', label: 'Строка под ним (можно пусто)', kind: 'text', placeholder: 'VTUBER-МОДЕЛЕЙ' },
        ...common],
      site: [
        { path: 'text', label: 'Крупный текст (удар)', kind: 'text', placeholder: '{site}', hint: TEXT_HINT },
        { path: 'sub', label: 'Строка под ним (можно пусто)', kind: 'text' },
        ...common],
      price: [
        { path: 'prefix', label: 'Слово над ценой (можно пусто)', kind: 'text', placeholder: 'ОТ', half: true },
        { path: 'text', label: 'Цена (удар)', kind: 'text', placeholder: '490 ₽', half: true },
        { path: 'underline', label: 'Розовый маркер под ценой', kind: 'check' },
        ...common],
      promo: [
        { path: 'text', label: 'Код на купоне', kind: 'text', placeholder: '{promo}', half: true, hint: TEXT_HINT },
        { path: 'badge', label: 'Бейдж-взрыв (пусто — без бейджа)', kind: 'text', placeholder: '{discount}', half: true },
        { path: 'impact', label: 'Импакт-кадр (ч/б вспышка на ударе)', kind: 'check' },
        ...common]
    },
    newScene: {
      big: () => ({ type: 'big', duration: 3, beat: 0.95, text: 'LIVE2D', sub: 'И PNGTUBER-МОДЕЛИ', emotion: 'u3.png', reaction: 'sparkles' }),
      site: () => ({ type: 'site', duration: 3, beat: 0.95, text: '{site}', sub: 'ГОТОВЫЕ VTUBER-МОДЕЛИ', emotion: 'u9.png', reaction: '!!' }),
      price: () => ({ type: 'price', duration: 2.7, beat: 0.6, prefix: 'ОТ', text: '490 ₽', underline: true, emotion: 'u5.png', reaction: 'sparkles' }),
      promo: () => ({ type: 'promo', duration: 5, beat: 0.7, text: '{promo}', badge: '{discount}', impact: true, emotion: 'u10.png', reaction: 'hearts' })
    },
    sceneTitle: s => {
      const short = { big: 'Удар', site: 'Сайт', price: 'Цена', promo: 'Промокод' }[s.type] || s.type;
      const txt = s.type === 'price' ? [s.prefix, s.text].filter(Boolean).join(' ') : (s.text || '');
      return txt ? `${short}: ${txt}` : short;
    }
  };

  const usedImages = cfg => {
    const out = [];
    for (const s of (cfg && cfg.scenes) || []) {
      if (!s || s.off) continue;
      for (const nm of [s.emotion_intro, s.emotion, s.rekick && s.rekick.emotion]) if (nm && !out.includes(nm)) out.push(nm);
    }
    return out;
  };

  window.Templates = window.Templates || {};
  window.Templates.a = {
    id: 'a',
    title: 'Аниме-опенинг (манга-панель)',
    assetDir: 'assets/v3d/',
    builtinImages: BUILTIN_IMAGES,
    emotionNames: EMOTION_NAMES,
    fonts: { unbounded900: 'assets/fonts/unbounded-900.woff2' },
    metrics: 'assets/fonts/metrics.json',
    extraAssets: { logo: 'assets/a/logo.svg' },
    wideViewBox: WIDE_VB.slice(),
    previewViewBox: [18, -8, 1534, 732],   // холст эталона (замер build.py) — для превью; экспорт замеряет заново
    defaults,
    // build.py: картинка уже обрезана страницей, зеркало и масштаб character.scale;
    // приведение размера к ~830 px (если картинка сильно меньше/больше родных) делает generate()
    imageOptions: (cfg, name) => {
      const ch = (cfg && cfg.character) || {};
      const sc = Number(ch.scale);
      return { scale: sc > 0 ? sc : 0.68, mirror: ch.mirror !== false };
    },
    usedImages,
    generate,
    schema,
    // для отладки/тестов
    _py: { fx, fg, F, pyRound, PyRandom, shiftLike, resolvePalette }
  };
})();

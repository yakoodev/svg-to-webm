(function () {
  const els = {
    svgInput: document.getElementById('svgInput'),
    widthInput: document.getElementById('widthInput'),
    heightInput: document.getElementById('heightInput'),
    fpsInput: document.getElementById('fpsInput'),
    durationInput: document.getElementById('durationInput'),
    autoDurationInput: document.getElementById('autoDurationInput'),
    recordScaleInput: document.getElementById('recordScaleInput'),
    bitrateInput: document.getElementById('bitrateInput'),
    transparentInput: document.getElementById('transparentInput'),
    stripBgInput: document.getElementById('stripBgInput'),
    renderBtn: document.getElementById('renderBtn'),
    exportBtn: document.getElementById('exportBtn'),
    downloadSvgBtn: document.getElementById('downloadSvgBtn'),
    loadExampleBtn: document.getElementById('loadExampleBtn'),
    previewFrame: document.getElementById('previewFrame'),
    previewShell: document.getElementById('previewShell'),
    videoPanel: document.getElementById('videoPanel'),
    videoShell: document.getElementById('videoShell'),
    webmPreview: document.getElementById('webmPreview'),
    downloadLink: document.getElementById('downloadLink'),
    progressBar: document.getElementById('progressBar'),
    log: document.getElementById('log'),
    supportStatus: document.getElementById('supportStatus'),
    previewCheckerBtn: document.getElementById('previewCheckerBtn'),
    previewBlackBtn: document.getElementById('previewBlackBtn'),
    previewWhiteBtn: document.getElementById('previewWhiteBtn'),
    videoCheckerBtn: document.getElementById('videoCheckerBtn'),
    videoBlackBtn: document.getElementById('videoBlackBtn'),
    videoWhiteBtn: document.getElementById('videoWhiteBtn')
  };

  let lastVideoUrl = '';

  const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240" viewBox="0 0 800 240">
  <defs>
    <linearGradient id="textGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#7c3aed">
        <animate attributeName="stop-color" values="#7c3aed;#06b6d4;#22c55e;#f59e0b;#7c3aed" dur="5s" repeatCount="indefinite"/>
      </stop>
      <stop offset="100%" stop-color="#06b6d4">
        <animate attributeName="stop-color" values="#06b6d4;#22c55e;#f59e0b;#ef4444;#06b6d4" dur="5s" repeatCount="indefinite"/>
      </stop>
    </linearGradient>
  </defs>

  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="58"
        font-weight="800"
        fill="url(#textGradient)">
    Тестовый SVG
    <animate attributeName="font-size" values="54;64;54" dur="2.4s" repeatCount="indefinite"/>
    <animateTransform attributeName="transform" type="translate"
                      values="0 0; 0 -10; 0 0"
                      dur="2.4s" repeatCount="indefinite"/>
  </text>
</svg>`;

  els.svgInput.value = defaultSvg;
  checkSupport();
  updateAutoDurationFromSvg(true);
  renderPreview();

  els.renderBtn.addEventListener('click', renderPreview);
  els.loadExampleBtn.addEventListener('click', () => {
    els.svgInput.value = defaultSvg;
    autoSizeFromSvg();
    renderPreview();
  });
  els.downloadSvgBtn.addEventListener('click', downloadSvg);
  els.autoDurationInput.addEventListener('change', () => updateAutoDurationFromSvg(false));
  els.exportBtn.addEventListener('click', exportWebM);
  els.svgInput.addEventListener('input', debounce(() => {
    autoSizeFromSvg();
    updateAutoDurationFromSvg(false);
    renderPreview();
  }, 350));

  els.previewCheckerBtn.addEventListener('click', () => setShellBg(els.previewShell, 'checker'));
  els.previewBlackBtn.addEventListener('click', () => setShellBg(els.previewShell, 'black-bg'));
  els.previewWhiteBtn.addEventListener('click', () => setShellBg(els.previewShell, 'white-bg'));
  els.videoCheckerBtn.addEventListener('click', () => setShellBg(els.videoShell, 'checker'));
  els.videoBlackBtn.addEventListener('click', () => setShellBg(els.videoShell, 'black-bg'));
  els.videoWhiteBtn.addEventListener('click', () => setShellBg(els.videoShell, 'white-bg'));

  function setShellBg(el, cls) {
    el.classList.remove('checker', 'black-bg', 'white-bg');
    el.classList.add(cls);
  }

  function checkSupport() {
    const canRecord = typeof MediaRecorder !== 'undefined' && HTMLCanvasElement.prototype.captureStream;
    const canCssSnapshot = typeof document.getAnimations === 'function';
    if (canRecord) {
      els.supportStatus.textContent = canCssSnapshot
        ? 'Браузерный экспорт доступен, CSS-анимации поддерживаются'
        : 'Браузерный экспорт доступен, но CSS-анимации могут быть ограничены';
      els.supportStatus.classList.add('ok');
    } else {
      els.supportStatus.textContent = 'MediaRecorder недоступен';
      els.supportStatus.classList.add('warn');
      els.exportBtn.disabled = true;
    }
  }

  function log(message) {
    els.log.textContent = message;
  }

  function getPreparedSvg() {
    let svg = els.svgInput.value.trim();
    if (!svg) throw new Error('Вставь SVG-код.');
    if (els.stripBgInput.checked) svg = stripRootBackgroundRect(svg);
    return svg;
  }

  function renderPreview() {
    try {
      const svg = getPreparedSvg();
      const metrics = getSvgMetrics(svg);
      if (metrics.width && metrics.height) {
        els.widthInput.value = metrics.width;
        els.heightInput.value = metrics.height;
        applyMediaSize(els.previewFrame, metrics.width, metrics.height);
      }
      updateAutoDurationFromSvg(false);
      const previewSvg = ensureSvgViewport(svg, metrics.width, metrics.height, true);
      const srcdoc = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;background:transparent;display:grid;place-items:center;overflow:hidden;}
svg{width:100%;height:100%;display:block;text-rendering:geometricPrecision;shape-rendering:auto;}
text{-webkit-font-smoothing:antialiased;paint-order:stroke fill markers;}
</style></head><body>${previewSvg}</body></html>`;
      els.previewFrame.srcdoc = srcdoc;
      const animationInfo = detectAnimationInfo(svg);
      const cssAnimations = countCssAnimationHints(svg);
      log(`Превью обновлено: ${metrics.width}×${metrics.height}. Авто-длительность: ${animationInfo.duration}s (${animationInfo.sources.join(', ') || 'анимации не найдены'}).${cssAnimations ? ` Найдены CSS-анимации/keyframes: ${cssAnimations}; экспорт будет делать live snapshot.` : ''}`);
    } catch (err) {
      log('Ошибка превью: ' + err.message);
    }
  }

  function autoSizeFromSvg() {
    try {
      const metrics = getSvgMetrics(els.svgInput.value.trim());
      if (metrics.width && metrics.height) {
        els.widthInput.value = metrics.width;
        els.heightInput.value = metrics.height;
        applyMediaSize(els.previewFrame, metrics.width, metrics.height);
      }
    } catch (_) {}
  }

  function updateAutoDurationFromSvg(force) {
    if (!els.autoDurationInput || (!els.autoDurationInput.checked && !force)) return;
    try {
      const info = detectAnimationInfo(els.svgInput.value.trim());
      if (info.duration && Number.isFinite(info.duration)) {
        els.durationInput.value = String(info.duration);
        els.durationInput.title = `Авто: ${info.duration}s — ${info.sources.join(', ') || 'fallback'}`;
      }
    } catch (_) {}
  }

  function detectAnimationInfo(svgText) {
    const durations = [];
    const sources = new Set();

    try {
      const doc = parseSvg(svgText);
      const smilTags = 'animate, animateTransform, animateMotion, set';
      for (const anim of Array.from(doc.querySelectorAll(smilTags))) {
        const dur = parseDuration(anim.getAttribute('dur'));
        const begin = Math.max(0, parseBegin(anim.getAttribute('begin')) || 0);
        const repeatDur = parseDuration(anim.getAttribute('repeatDur'));
        const repeatCountRaw = anim.getAttribute('repeatCount');
        let total = 0;
        if (repeatDur && Number.isFinite(repeatDur)) {
          total = begin + repeatDur;
        } else if (dur && Number.isFinite(dur)) {
          const repeatCount = repeatCountRaw && repeatCountRaw !== 'indefinite' ? Number(repeatCountRaw) : 1;
          total = begin + dur * (Number.isFinite(repeatCount) && repeatCount > 0 ? repeatCount : 1);
        }
        if (total > 0.01) {
          durations.push(total);
          sources.add('SMIL');
        }
      }
    } catch (_) {}

    for (const d of extractCssAnimationDurations(svgText)) {
      if (d > 0.01) {
        durations.push(d);
        sources.add('CSS');
      }
    }

    const picked = pickAutoDuration(durations);
    return {
      duration: picked,
      durations: durations.map(roundDuration),
      sources: Array.from(sources)
    };
  }

  function pickAutoDuration(durations) {
    if (!durations.length) return 5;
    // Pick the dominant duration, not always the longest one.
    // Heavy SVGs often have tiny jitter loops and long subtle background gradients; the main timeline is usually the most repeated duration.
    const usable = durations.map(roundDuration).filter(d => d >= 1 && d <= 120);
    const list = usable.length ? usable : durations.map(roundDuration).filter(d => d > 0 && d <= 120);
    if (!list.length) return 5;
    const counts = new Map();
    for (const d of list) {
      const key = String(Math.round(d * 10) / 10);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const ranked = Array.from(counts.entries())
      .map(([key, count]) => ({ duration: Number(key), count }))
      .sort((a, b) => b.count - a.count || b.duration - a.duration);
    return roundDuration(ranked[0].duration);
  }

  function extractCssAnimationDurations(text) {
    const out = [];
    const css = String(text || '');

    const durationProp = /animation-duration\s*:\s*([^;}]+)/gi;
    let match;
    while ((match = durationProp.exec(css))) {
      for (const part of match[1].split(',')) {
        const time = parseCssTime(part.trim());
        if (time !== null) out.push(time);
      }
    }

    const shorthand = /(?:^|[;{\s])animation\s*:\s*([^;}]+)/gi;
    while ((match = shorthand.exec(css))) {
      for (const part of splitCssList(match[1])) {
        const times = extractCssTimes(part);
        if (times.length) out.push(times[0]); // CSS shorthand: first time is duration, second time is delay.
      }
    }

    return out;
  }

  function splitCssList(value) {
    const parts = [];
    let current = '';
    let depth = 0;
    for (const ch of String(value)) {
      if (ch === '(') depth++;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if (ch === ',' && depth === 0) {
        parts.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current);
    return parts;
  }

  function extractCssTimes(value) {
    const times = [];
    const re = /(^|[^\w.-])(-?(?:\d+\.?\d*|\.\d+)(?:ms|s))\b/gi;
    let m;
    while ((m = re.exec(value))) {
      const t = parseCssTime(m[2]);
      if (t !== null) times.push(t);
    }
    return times;
  }

  function parseCssTime(value) {
    const m = String(value || '').trim().match(/^(-?(?:\d+\.?\d*|\.\d+))(ms|s)$/i);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    return m[2].toLowerCase() === 'ms' ? n / 1000 : n;
  }

  function roundDuration(n) {
    return Math.round(n * 100) / 100;
  }

  function getSvgMetrics(svgText) {
    const doc = parseSvg(svgText);
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') throw new Error('Корневой элемент должен быть <svg>.');
    const viewBox = parseViewBox(svg.getAttribute('viewBox'));
    const widthAttr = parseSvgLength(svg.getAttribute('width'));
    const heightAttr = parseSvgLength(svg.getAttribute('height'));

    let width = widthAttr;
    let height = heightAttr;

    if ((!width || !height) && viewBox) {
      width = width || viewBox.width;
      height = height || viewBox.height;
    }

    width = Math.round(width || 800);
    height = Math.round(height || 600);
    return { width, height, viewBox };
  }

  function parseViewBox(value) {
    const nums = (value || '').trim().split(/[\s,]+/).map(Number);
    if (nums.length === 4 && nums.every(Number.isFinite) && nums[2] > 0 && nums[3] > 0) {
      return { x: nums[0], y: nums[1], width: nums[2], height: nums[3] };
    }
    return null;
  }

  function parseSvgLength(value) {
    if (!value) return null;
    const v = String(value).trim();
    if (!v || v.endsWith('%')) return null;
    const match = v.match(/^(-?\d*\.?\d+(?:e[-+]?\d+)?)(px)?$/i);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function applyMediaSize(el, width, height) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    el.style.setProperty('--media-width', `${w}px`);
    el.style.setProperty('--media-height', `${h}px`);
    el.style.setProperty('--media-aspect', `${w} / ${h}`);
    el.style.width = `min(100%, ${w}px)`;
    el.style.aspectRatio = `${w} / ${h}`;
  }

  function ensureSvgViewport(svgText, width, height, forceTransparentRoot) {
    try {
      const doc = parseSvg(svgText);
      const svg = doc.documentElement;
      if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      if (!svg.getAttribute('width') || String(svg.getAttribute('width')).trim().endsWith('%')) svg.setAttribute('width', String(width));
      if (!svg.getAttribute('height') || String(svg.getAttribute('height')).trim().endsWith('%')) svg.setAttribute('height', String(height));
      if (forceTransparentRoot) {
        svg.style.setProperty('background', 'transparent', 'important');
        svg.style.setProperty('background-color', 'transparent', 'important');
      }
      return new XMLSerializer().serializeToString(svg);
    } catch (_) {
      return svgText;
    }
  }

  function parseSvg(svgText) {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) throw new Error('SVG не парсится. Проверь закрывающие теги и кавычки.');
    return doc;
  }

  function stripRootBackgroundRect(svgText) {
    try {
      const doc = parseSvg(svgText);
      const svg = doc.documentElement;
      const viewBox = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
      const w = parseFloat(svg.getAttribute('width')) || (viewBox.length === 4 ? viewBox[2] : NaN);
      const h = parseFloat(svg.getAttribute('height')) || (viewBox.length === 4 ? viewBox[3] : NaN);
      const children = Array.from(svg.children);
      const firstDrawable = children.find(el => !['defs', 'style', 'title', 'desc', 'metadata'].includes(el.tagName.toLowerCase()));
      if (firstDrawable && firstDrawable.tagName.toLowerCase() === 'rect' && looksLikeBackgroundRect(firstDrawable, w, h)) {
        firstDrawable.remove();
      }
      svg.style.setProperty('background', 'transparent', 'important');
      svg.style.setProperty('background-color', 'transparent', 'important');
      return new XMLSerializer().serializeToString(svg);
    } catch (_) {
      return svgText;
    }
  }

  function looksLikeBackgroundRect(rect, w, h) {
    const x = rect.getAttribute('x') || '0';
    const y = rect.getAttribute('y') || '0';
    const rw = rect.getAttribute('width') || '';
    const rh = rect.getAttribute('height') || '';
    const hasFill = rect.hasAttribute('fill') && rect.getAttribute('fill') !== 'none';
    const noStroke = !rect.hasAttribute('stroke') || rect.getAttribute('stroke') === 'none';
    const xOk = parseFloat(x) === 0;
    const yOk = parseFloat(y) === 0;
    const wOk = rw === '100%' || Math.abs(parseFloat(rw) - w) < 0.5;
    const hOk = rh === '100%' || Math.abs(parseFloat(rh) - h) < 0.5;
    return hasFill && noStroke && xOk && yOk && wOk && hOk;
  }

  async function exportWebM() {
    if (lastVideoUrl) URL.revokeObjectURL(lastVideoUrl);
    els.videoPanel.classList.add('hidden');
    els.webmPreview.removeAttribute('src');
    els.downloadLink.removeAttribute('href');
    els.progressBar.classList.remove('hidden');
    els.progressBar.value = 0;
    els.exportBtn.disabled = true;

    let snapshotter = null;

    try {
      const svgText = getPreparedSvg();
      const baseWidth = clampInt(els.widthInput.value, 16, 8192);
      const baseHeight = clampInt(els.heightInput.value, 16, 8192);
      const scale = clampInt(els.recordScaleInput.value, 1, 4);
      const outWidth = baseWidth * scale;
      const outHeight = baseHeight * scale;
      const fps = clampInt(els.fpsInput.value, 1, 120);
      let duration = Math.max(0.1, Number(els.durationInput.value) || 5);
      if (els.autoDurationInput.checked) {
        const info = detectAnimationInfo(svgText);
        duration = info.duration;
        els.durationInput.value = String(duration);
      }
      const theoreticalFrames = Math.max(1, Math.round(duration * fps));
      const transparent = els.transparentInput.checked;
      const bitrate = clampInt(els.bitrateInput.value, 1, 200) * 1_000_000;
      const mimeType = pickMimeType();
      if (!mimeType) throw new Error('Браузер не поддерживает WebM через MediaRecorder. Используй локальный export-node.');

      const cssAnimations = countCssAnimationHints(svgText);
      log(`Быстрый экспорт: ${outWidth}×${outHeight} (${scale}×), ${fps} FPS, ${duration}s, до ${theoreticalFrames} кадров, bitrate ${(bitrate / 1_000_000).toFixed(0)} Mbps.\nРежим v7: запись идёт в реальном времени, поэтому WebM не растягивается и не становится медленным. Если браузер не успевает, кадры пропускаются, но скорость остаётся правильной.\n${cssAnimations ? 'CSS keyframes/SMIL фиксируются по текущему времени перед каждым кадром.' : 'SMIL/CSS состояние фиксируется по текущему времени перед каждым кадром.'}\nДля идеального production alpha всё равно лучше npm run export:svg.`);

      const canvas = document.createElement('canvas');
      canvas.width = outWidth;
      canvas.height = outHeight;
      const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const stream = canvas.captureStream(fps);
      const track = stream.getVideoTracks()[0];
      const chunks = [];
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: bitrate
      });

      recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise(resolve => { recorder.onstop = resolve; });
      snapshotter = await createSvgSnapshotter(svgText, baseWidth, baseHeight, transparent);

      // IMPORTANT: MediaRecorder timestamps are wall-clock based.
      // v6 rendered every SVG frame sequentially, so heavy SVGs produced slow/long WebM files.
      // v7 records for exactly `duration` seconds and maps animation time to real elapsed time.
      // If rendering is slower than target FPS, we skip frames instead of stretching the video.
      const firstSvg = await snapshotter.snapshot(0);
      await drawSvgString(ctx, firstSvg, outWidth, outHeight, transparent);
      if (track && typeof track.requestFrame === 'function') track.requestFrame();

      recorder.start(250);
      const startMs = performance.now();
      let lastFrameIndex = -1;

      while (true) {
        const elapsed = (performance.now() - startMs) / 1000;
        if (elapsed >= duration) break;

        const frameIndex = Math.floor(elapsed * fps);
        if (frameIndex !== lastFrameIndex) {
          const t = elapsed;
          const frameSvg = await snapshotter.snapshot(t);
          await drawSvgString(ctx, frameSvg, outWidth, outHeight, transparent);
          if (track && typeof track.requestFrame === 'function') track.requestFrame();
          lastFrameIndex = frameIndex;
          els.progressBar.value = Math.min(1, elapsed / duration);
        } else {
          await sleep(1);
        }

        const nextFrameAt = startMs + ((lastFrameIndex + 1) * 1000 / fps);
        const waitMs = nextFrameAt - performance.now();
        if (waitMs > 1) await sleep(Math.min(waitMs, 8));
      }

      els.progressBar.value = 1;
      recorder.stop();
      await stopped;
      stream.getTracks().forEach(t => t.stop());

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      lastVideoUrl = url;
      els.downloadLink.href = url;
      els.downloadLink.download = 'animation.webm';
      els.webmPreview.src = url;
      applyMediaSize(els.webmPreview, baseWidth, baseHeight);
      els.videoPanel.classList.remove('hidden');
      log(`Готово: ${(blob.size / 1024 / 1024).toFixed(2)} MB. Ниже превью WebM в размере ${baseWidth}×${baseHeight}. Проверяй прозрачность на шахматке, чёрном и белом фоне.`);
    } catch (err) {
      log('Ошибка экспорта: ' + err.message);
    } finally {
      if (snapshotter) snapshotter.destroy();
      els.exportBtn.disabled = false;
      els.progressBar.classList.add('hidden');
    }
  }

  function pickMimeType() {
    const types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    return types.find(type => MediaRecorder.isTypeSupported(type)) || '';
  }

  async function createSvgSnapshotter(svgText, width, height, transparent) {
    const svg = ensureSvgViewport(svgText, width, height, transparent);
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.style.cssText = [
      'position:fixed',
      'left:-100000px',
      'top:0',
      `width:${width}px`,
      `height:${height}px`,
      'border:0',
      'opacity:0.001',
      'pointer-events:none',
      'z-index:-1'
    ].join(';');

    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Не удалось загрузить SVG в hidden iframe для snapshot.')), 5000);
      iframe.onload = () => {
        clearTimeout(timer);
        resolve();
      };
    });

    iframe.srcdoc = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent;}
body{display:block;}
svg{display:block;width:${width}px;height:${height}px;background:transparent;text-rendering:geometricPrecision;shape-rendering:auto;}
*{-webkit-font-smoothing:antialiased;}
</style></head><body>${svg}</body></html>`;

    document.body.appendChild(iframe);
    await loaded;

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    const liveSvg = doc && doc.querySelector('svg');
    if (!doc || !win || !liveSvg) throw new Error('В hidden iframe не найден <svg>.');
    if (doc.fonts && doc.fonts.ready) {
      try { await doc.fonts.ready; } catch (_) {}
    }

    return {
      async snapshot(time) {
        setNativeAnimationTime(doc, liveSvg, time);
        await raf();
        setNativeAnimationTime(doc, liveSvg, time);
        const clone = liveSvg.cloneNode(true);
        clone.setAttribute('width', String(width));
        clone.setAttribute('height', String(height));
        if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
        clone.style.setProperty('background', 'transparent', 'important');
        clone.style.setProperty('background-color', 'transparent', 'important');
        inlineComputedSvgStyles(liveSvg, clone, win);
        applySmilAnimationsToSnapshot(clone, time);
        freezeSnapshot(clone);
        return new XMLSerializer().serializeToString(clone);
      },
      destroy() {
        iframe.remove();
      }
    };
  }

  function setNativeAnimationTime(doc, svg, time) {
    if (svg && typeof svg.pauseAnimations === 'function' && typeof svg.setCurrentTime === 'function') {
      try {
        svg.pauseAnimations();
        svg.setCurrentTime(time);
      } catch (_) {}
    }
    if (doc && typeof doc.getAnimations === 'function') {
      for (const anim of doc.getAnimations({ subtree: true })) {
        try {
          anim.pause();
          anim.currentTime = time * 1000;
        } catch (_) {}
      }
    }
  }

  function inlineComputedSvgStyles(sourceSvg, targetSvg, win) {
    const props = [
      'opacity', 'visibility', 'mix-blend-mode',
      'transform', 'transform-origin', 'transform-box',
      'filter', 'clip-path', 'mask',
      'fill', 'fill-opacity', 'fill-rule',
      'stroke', 'stroke-opacity', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
      'stop-color', 'stop-opacity', 'flood-color', 'flood-opacity', 'lighting-color',
      'font-family', 'font-size', 'font-style', 'font-weight', 'font-stretch', 'font-variant', 'letter-spacing', 'word-spacing',
      'text-anchor', 'dominant-baseline', 'alignment-baseline', 'baseline-shift',
      'paint-order', 'text-rendering', 'shape-rendering', 'color',
      'display'
    ];

    const sourceElements = [sourceSvg, ...sourceSvg.querySelectorAll('*')];
    const targetElements = [targetSvg, ...targetSvg.querySelectorAll('*')];

    for (let i = 0; i < sourceElements.length; i++) {
      const src = sourceElements[i];
      const dst = targetElements[i];
      if (!src || !dst || dst.nodeType !== 1) continue;
      if (dst.tagName && dst.tagName.toLowerCase() === 'style') continue;

      const cs = win.getComputedStyle(src);
      for (const prop of props) {
        const value = cs.getPropertyValue(prop);
        if (!value || value === 'normal' || value === 'auto') continue;
        if (prop === 'transform' && value === 'none') continue;
        if (prop === 'display' && value !== 'none') continue;
        if ((prop === 'clip-path' || prop === 'mask' || prop === 'filter') && value === 'none') continue;
        dst.style.setProperty(prop, value);
      }
      dst.style.setProperty('animation', 'none', 'important');
      dst.style.setProperty('transition', 'none', 'important');
    }
  }

  function applySmilAnimationsToSnapshot(svg, t) {
    const animations = Array.from(svg.querySelectorAll('animate, animateTransform'));
    for (const anim of animations) {
      try { applyAnimation(anim, t); } catch (_) {}
    }
  }

  function freezeSnapshot(svg) {
    svg.querySelectorAll('style').forEach(el => el.remove());
    svg.querySelectorAll('animate, animateTransform, animateMotion, set').forEach(el => el.remove());
    svg.querySelectorAll('*').forEach(el => {
      if (el.style) {
        el.style.setProperty('animation', 'none', 'important');
        el.style.setProperty('transition', 'none', 'important');
      }
    });
  }

  function applyAnimation(anim, t) {
    const target = anim.parentElement;
    if (!target) return;
    const tag = anim.tagName.toLowerCase();
    const dur = parseDuration(anim.getAttribute('dur')) || 1;
    const begin = parseBegin(anim.getAttribute('begin'));
    const repeat = anim.getAttribute('repeatCount');
    const attr = anim.getAttribute('attributeName') || '';
    if (!attr) return;

    const values = getAnimationValues(anim);
    if (values.length === 0) return;

    let localT = t - begin;
    if (repeat === 'indefinite') {
      localT = ((localT % dur) + dur) % dur;
    } else {
      localT = Math.max(0, Math.min(localT, dur));
    }
    const p = dur === 0 ? 1 : Math.max(0, Math.min(1, localT / dur));
    const keyTimes = parseKeyTimes(anim.getAttribute('keyTimes'), values.length);
    const value = interpolateValuesWithKeyTimes(values, keyTimes, p, anim.getAttribute('calcMode'));

    if (tag === 'animatetransform') {
      const type = anim.getAttribute('type') || 'translate';
      target.setAttribute(attr, `${type}(${value})`);
    } else {
      target.setAttribute(attr, value);
    }
  }

  function getAnimationValues(anim) {
    const valuesRaw = anim.getAttribute('values');
    if (valuesRaw) return valuesRaw.split(';').map(v => v.trim()).filter(Boolean);
    const from = anim.getAttribute('from');
    const to = anim.getAttribute('to');
    const by = anim.getAttribute('by');
    if (from !== null && to !== null) return [from.trim(), to.trim()];
    if (to !== null) return [anim.parentElement.getAttribute(anim.getAttribute('attributeName')) || '', to.trim()].filter(Boolean);
    if (from !== null && by !== null) return [from.trim(), by.trim()];
    return [];
  }

  function parseKeyTimes(value, expectedLength) {
    if (!value) return null;
    const times = value.split(';').map(v => Number(v.trim()));
    if (times.length !== expectedLength || !times.every(Number.isFinite)) return null;
    if (times[0] !== 0) times[0] = 0;
    if (times[times.length - 1] !== 1) times[times.length - 1] = 1;
    return times;
  }

  function interpolateValuesWithKeyTimes(values, keyTimes, progress, calcMode) {
    if (values.length === 1) return values[0];
    if (!keyTimes) return interpolateValues(values, progress, calcMode);

    let segment = 0;
    for (let i = 0; i < keyTimes.length - 1; i++) {
      if (progress >= keyTimes[i] && progress <= keyTimes[i + 1]) {
        segment = i;
        break;
      }
    }
    const start = keyTimes[segment];
    const end = keyTimes[Math.min(segment + 1, keyTimes.length - 1)];
    const local = end === start ? 0 : (progress - start) / (end - start);
    return interpolatePair(values[segment], values[Math.min(segment + 1, values.length - 1)], local, calcMode);
  }

  function interpolateValues(values, progress, calcMode) {
    if (values.length === 1) return values[0];
    const scaled = Math.min(0.999999, Math.max(0, progress)) * (values.length - 1);
    const i = Math.floor(scaled);
    const local = scaled - i;
    return interpolatePair(values[i], values[Math.min(i + 1, values.length - 1)], local, calcMode);
  }

  function interpolatePair(a, b, local, calcMode) {
    if (calcMode === 'discrete') return local < 1 ? a : b;

    const colorA = parseColor(a);
    const colorB = parseColor(b);
    if (colorA && colorB) return colorToString(lerpArray(colorA, colorB, local));

    const numsA = parseNumberList(a);
    const numsB = parseNumberList(b);
    if (numsA && numsB && numsA.numbers.length === numsB.numbers.length) {
      const numbers = lerpArray(numsA.numbers, numsB.numbers, local);
      return rebuildNumberList(numsA, numbers);
    }

    return local < 0.5 ? a : b;
  }

  function parseDuration(s) {
    if (!s) return 1;
    const value = parseFloat(s);
    if (!Number.isFinite(value)) return 1;
    return s.trim().endsWith('ms') ? value / 1000 : value;
  }

  function parseBegin(s) {
    if (!s) return 0;
    const first = String(s).split(';')[0].trim();
    if (!first || first === 'indefinite') return 0;
    const value = parseFloat(first);
    if (!Number.isFinite(value)) return 0;
    return first.endsWith('ms') ? value / 1000 : value;
  }

  function parseColor(s) {
    const v = s.trim().toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(v)) {
      return [parseInt(v[1] + v[1], 16), parseInt(v[2] + v[2], 16), parseInt(v[3] + v[3], 16)];
    }
    if (/^#[0-9a-f]{6}$/.test(v)) {
      return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
    }
    const rgb = v.match(/^rgba?\(([^)]+)\)$/);
    if (rgb) {
      const parts = rgb[1].split(',').map(x => parseFloat(x.trim()));
      if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) return parts.slice(0, 3);
    }
    return null;
  }

  function colorToString(rgb) {
    return `rgb(${rgb.map(n => Math.round(Math.max(0, Math.min(255, n)))).join(',')})`;
  }

  function parseNumberList(s) {
    const matches = [...s.matchAll(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)];
    if (!matches.length) return null;
    return { source: s, numbers: matches.map(m => Number(m[0])), matches };
  }

  function rebuildNumberList(parsed, numbers) {
    let out = '';
    let last = 0;
    parsed.matches.forEach((m, i) => {
      out += parsed.source.slice(last, m.index) + trimNumber(numbers[i]);
      last = m.index + m[0].length;
    });
    out += parsed.source.slice(last);
    return out;
  }

  function trimNumber(n) {
    return String(Math.round(n * 1000) / 1000);
  }

  function lerpArray(a, b, t) {
    return a.map((x, i) => x + (b[i] - x) * t);
  }

  function drawSvgString(ctx, svgString, width, height, transparent) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          ctx.clearRect(0, 0, width, height);
          if (!transparent) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);
          }
          ctx.drawImage(img, 0, 0, width, height);
          URL.revokeObjectURL(url);
          resolve();
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Не удалось отрисовать SVG-кадр. Проверь внешние ссылки/картинки в SVG.'));
      };
      img.src = url;
    });
  }

  function downloadSvg() {
    try {
      const svg = getPreparedSvg();
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'animation.svg';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) {
      log('Ошибка скачивания SVG: ' + err.message);
    }
  }

  function countCssAnimationHints(svgText) {
    const matches = svgText.match(/@keyframes|animation\s*:|animation-name\s*:/gi);
    return matches ? matches.length : 0;
  }

  function clampInt(value, min, max) {
    const n = Math.round(Number(value));
    return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
  }

  function raf() {
    return new Promise(resolve => requestAnimationFrame(resolve));
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function debounce(fn, wait) {
    let timer = 0;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }
})();

(function () {
  const els = {
    svgInput: document.getElementById('svgInput'),
    widthInput: document.getElementById('widthInput'),
    heightInput: document.getElementById('heightInput'),
    fpsInput: document.getElementById('fpsInput'),
    durationInput: document.getElementById('durationInput'),
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
  renderPreview();

  els.renderBtn.addEventListener('click', renderPreview);
  els.loadExampleBtn.addEventListener('click', () => {
    els.svgInput.value = defaultSvg;
    autoSizeFromSvg();
    renderPreview();
  });
  els.downloadSvgBtn.addEventListener('click', downloadSvg);
  els.exportBtn.addEventListener('click', exportWebM);
  els.svgInput.addEventListener('input', debounce(() => {
    autoSizeFromSvg();
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
    if (canRecord) {
      els.supportStatus.textContent = 'Браузерный экспорт доступен';
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
      const previewSvg = ensureSvgViewport(svg, metrics.width, metrics.height);
      const srcdoc = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;background:transparent;display:grid;place-items:center;overflow:hidden;}
svg{width:100%;height:100%;display:block;background:transparent;text-rendering:geometricPrecision;shape-rendering:auto;}
text{-webkit-font-smoothing:antialiased;paint-order:stroke fill markers;}
</style></head><body>${previewSvg}</body></html>`;
      els.previewFrame.srcdoc = srcdoc;
      log(`Превью обновлено: ${metrics.width}×${metrics.height}. Блок превью теперь держит пропорции SVG.`);
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


  function ensureSvgViewport(svgText, width, height) {
    try {
      const doc = parseSvg(svgText);
      const svg = doc.documentElement;
      if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      if (!svg.getAttribute('width') || String(svg.getAttribute('width')).trim().endsWith('%')) svg.setAttribute('width', String(width));
      if (!svg.getAttribute('height') || String(svg.getAttribute('height')).trim().endsWith('%')) svg.setAttribute('height', String(height));
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
      const firstDrawable = children.find(el => !['defs', 'title', 'desc', 'metadata'].includes(el.tagName.toLowerCase()));
      if (firstDrawable && firstDrawable.tagName.toLowerCase() === 'rect' && looksLikeBackgroundRect(firstDrawable, w, h)) {
        firstDrawable.remove();
      }
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

    try {
      const svgText = getPreparedSvg();
      const baseWidth = clampInt(els.widthInput.value, 16, 8192);
      const baseHeight = clampInt(els.heightInput.value, 16, 8192);
      const scale = clampInt(els.recordScaleInput.value, 1, 4);
      const outWidth = baseWidth * scale;
      const outHeight = baseHeight * scale;
      const fps = clampInt(els.fpsInput.value, 1, 120);
      const duration = Math.max(0.1, Number(els.durationInput.value) || 5);
      const frames = Math.max(1, Math.round(duration * fps));
      const transparent = els.transparentInput.checked;
      const bitrate = clampInt(els.bitrateInput.value, 1, 200) * 1_000_000;
      const mimeType = pickMimeType();
      if (!mimeType) throw new Error('Браузер не поддерживает WebM через MediaRecorder. Используй локальный export-node.');

      log(`Быстрый экспорт: ${outWidth}×${outHeight} (${scale}×), ${fps} FPS, ${duration}s, ${frames} кадров, bitrate ${(bitrate / 1_000_000).toFixed(0)} Mbps.\nЭто браузерный export, для чистого alpha и лучших границ используй npm run export:svg.`);

      const canvas = document.createElement('canvas');
      canvas.width = outWidth;
      canvas.height = outHeight;
      const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0];
      const chunks = [];
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: bitrate
      });

      recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise(resolve => { recorder.onstop = resolve; });
      recorder.start();

      const baseDoc = parseSvg(svgText);
      for (let frame = 0; frame < frames; frame++) {
        const t = frame / fps;
        const frameSvg = renderSvgAtTime(baseDoc, t, baseWidth, baseHeight);
        await drawSvgString(ctx, frameSvg, outWidth, outHeight, transparent);
        if (track && typeof track.requestFrame === 'function') track.requestFrame();
        els.progressBar.value = (frame + 1) / frames;
        await nextFrame();
      }

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
      log(`Готово: ${(blob.size / 1024 / 1024).toFixed(2)} MB. Ниже появилось превью WebM в размере ${baseWidth}×${baseHeight}. Проверяй прозрачность на шахматке, чёрном и белом фоне.`);
    } catch (err) {
      log('Ошибка экспорта: ' + err.message);
    } finally {
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

  function renderSvgAtTime(baseDoc, t, width, height) {
    const svg = baseDoc.documentElement.cloneNode(true);
    if (!svg.getAttribute('width')) svg.setAttribute('width', String(width));
    if (!svg.getAttribute('height')) svg.setAttribute('height', String(height));
    if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('style', `${svg.getAttribute('style') || ''}; text-rendering: geometricPrecision; shape-rendering: auto;`);

    const animations = Array.from(svg.querySelectorAll('animate, animateTransform'));
    for (const anim of animations) {
      try { applyAnimation(anim, t); } catch (_) {}
    }
    for (const anim of animations) anim.remove();
    return new XMLSerializer().serializeToString(svg);
  }

  function applyAnimation(anim, t) {
    const target = anim.parentElement;
    if (!target) return;
    const tag = anim.tagName.toLowerCase();
    const dur = parseDuration(anim.getAttribute('dur')) || 1;
    const repeat = anim.getAttribute('repeatCount');
    const valuesRaw = anim.getAttribute('values');
    const attr = anim.getAttribute('attributeName') || '';
    if (!valuesRaw || !attr) return;

    const values = valuesRaw.split(';').map(v => v.trim()).filter(Boolean);
    if (values.length === 0) return;
    const localT = repeat === 'indefinite' || repeat === null ? ((t % dur) + dur) % dur : Math.min(t, dur);
    const p = dur === 0 ? 1 : localT / dur;
    const value = interpolateValues(values, p);

    if (tag === 'animatetransform') {
      const type = anim.getAttribute('type') || 'translate';
      target.setAttribute('transform', `${type}(${value})`);
    } else {
      target.setAttribute(attr, value);
    }
  }

  function interpolateValues(values, progress) {
    if (values.length === 1) return values[0];
    const scaled = Math.min(0.999999, Math.max(0, progress)) * (values.length - 1);
    const i = Math.floor(scaled);
    const local = scaled - i;
    const a = values[i];
    const b = values[Math.min(i + 1, values.length - 1)];

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

  function clampInt(value, min, max) {
    const n = Math.round(Number(value));
    return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
  }

  function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
  }

  function debounce(fn, wait) {
    let timer = 0;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }
})();

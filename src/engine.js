/*
 * SVG → WebM engine (offline, frame-accurate).
 *
 * 1. The SVG lives in a hidden iframe; the browser itself evaluates SMIL/CSS
 *    (pauseAnimations + setCurrentTime), so keySplines, additive, discrete etc. are exact.
 * 2. For every frame we copy the *animated* values (animVal / computed style) onto a
 *    static clone, serialize it and draw it to a canvas. <style> with @font-face stays,
 *    so embedded fonts keep working.
 * 3. Frames are encoded with WebCodecs, one by one (no real-time recording → no dropped
 *    frames, exact fps). Alpha: Chrome's VideoEncoder can't keep alpha, so we run a second
 *    VP9 encoder on the alpha plane and mux it as WebM BlockAdditions — the same layout
 *    libvpx/ffmpeg produce. OBS, Chrome and ffmpeg read it as a transparent WebM.
 *
 * Public API (window.SvgEngine):
 *   isOfflineSupported() -> Promise<boolean>
 *   renderWebM({ svgText, width, height, fps, duration, scale, bitrate, onProgress, signal }) -> Promise<Blob>
 *   createSnapshotter(svgText, width, height) -> { snapshot(t) -> svgString, destroy() }
 *   drawSvgString(ctx, svgString, w, h)
 */
(function () {
  const TRANSFORM_ATTRS = new Set(['transform', 'gradientTransform', 'patternTransform']);
  const SMIL_SELECTOR = 'animate, animateTransform, animateMotion, set, animateColor';

  function raf() { return new Promise(r => requestAnimationFrame(() => r())); }

  function matrixOf(list) {
    let m = new DOMMatrix();
    for (let i = 0; i < list.numberOfItems; i++) {
      const x = list.getItem(i).matrix;
      m = m.multiply(new DOMMatrix([x.a, x.b, x.c, x.d, x.e, x.f]));
    }
    return m;
  }

  function fmt(n) { return String(Math.round(n * 10000) / 10000); }

  function animatedValue(el, attr, win) {
    // 1) transforms: SVGAnimatedTransformList
    const prop = attr === 'transform' ? 'transform' : attr;
    if (TRANSFORM_ATTRS.has(attr) && el[prop] && el[prop].animVal) {
      const list = el[prop].animVal;
      if (!list.numberOfItems) return null;
      const m = matrixOf(list);
      return `matrix(${fmt(m.a)} ${fmt(m.b)} ${fmt(m.c)} ${fmt(m.d)} ${fmt(m.e)} ${fmt(m.f)})`;
    }
    // 2) geometry / numbers: SVGAnimatedLength / Number / String / Enumeration
    const camel = attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const a = el[camel];
    if (a && typeof a === 'object' && 'animVal' in a) {
      const v = a.animVal;
      if (v && typeof v === 'object' && 'value' in v) return fmt(v.value);            // SVGLength
      if (typeof v === 'number') return fmt(v);                                         // SVGNumber / enum
      if (typeof v === 'string') return v;                                              // SVGAnimatedString (href, class)
      if (v && typeof v.numberOfItems === 'number') {                                   // SVGLengthList / NumberList
        const out = [];
        for (let i = 0; i < v.numberOfItems; i++) {
          const it = v.getItem(i); out.push(fmt(typeof it === 'number' ? it : it.value));
        }
        return out.join(' ');
      }
    }
    // 3) presentation attributes (opacity, fill, stroke-dashoffset, stop-color, d, …)
    const cs = win.getComputedStyle(el);
    const v = cs.getPropertyValue(attr);
    if (v) {
      if (attr === 'd' && v.startsWith('path(')) {
        const m = v.match(/^path\(["'](.*)["']\)$/);
        return m ? m[1] : null;
      }
      return v.trim();
    }
    return null;
  }

  async function createSnapshotter(svgText, width, height) {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;border:0;opacity:0.001;pointer-events:none;z-index:-1`;
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SVG слишком долго грузится в скрытый iframe.')), 60000);
      iframe.onload = () => { clearTimeout(timer); resolve(); };
    });
    iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent}
svg{display:block;width:${width}px;height:${height}px}</style></head><body>${svgText}</body></html>`;
    document.body.appendChild(iframe);
    await loaded;
    const doc = iframe.contentDocument, win = iframe.contentWindow;
    const live = doc.querySelector('svg');
    if (!live) { iframe.remove(); throw new Error('В SVG нет корневого <svg>.'); }
    if (doc.fonts && doc.fonts.ready) { try { await doc.fonts.ready; } catch (_) {} }
    await raf();

    // --- which (element, attribute) pairs are animated by SMIL
    const liveAll = [live, ...live.querySelectorAll('*')];
    const indexOf = new Map(liveAll.map((el, i) => [el, i]));
    const targets = new Map();   // liveEl -> Set(attr)
    for (const an of live.querySelectorAll(SMIL_SELECTOR)) {
      let tgt = an.parentElement;
      const href = an.getAttribute('href') || an.getAttribute('xlink:href');
      if (href && href.startsWith('#')) tgt = doc.getElementById(href.slice(1)) || tgt;
      if (!tgt) continue;
      let attr = an.getAttribute('attributeName');
      if (an.tagName === 'animateMotion') attr = 'transform';
      if (!attr) continue;
      attr = attr.replace(/^xlink:/, '');
      if (!targets.has(tgt)) targets.set(tgt, new Set());
      targets.get(tgt).add(attr);
    }
    const hasCss = typeof doc.getAnimations === 'function' && doc.getAnimations().length > 0;

    // --- static clone that we update in place for every frame
    const clone = live.cloneNode(true);
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const cloneAll = [clone, ...clone.querySelectorAll('*')];
    const jobs = [];
    for (const [el, attrs] of targets) {
      const i = indexOf.get(el);
      if (i === undefined) continue;
      jobs.push({ live: el, dst: cloneAll[i], attrs: [...attrs] });
    }
    const cssJobs = [];
    if (hasCss) {
      const animated = new Set(doc.getAnimations().map(a => a.effect && a.effect.target).filter(Boolean));
      for (const el of animated) {
        const i = indexOf.get(el);
        if (i !== undefined) cssJobs.push({ live: el, dst: cloneAll[i] });
      }
      const kill = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
      kill.textContent = '*{animation:none!important;transition:none!important}';
      clone.appendChild(kill);
    }
    clone.querySelectorAll(SMIL_SELECTOR).forEach(el => el.remove());
    const CSS_PROPS = ['opacity', 'transform', 'transform-origin', 'fill', 'fill-opacity', 'stroke', 'stroke-opacity',
      'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stop-color', 'stop-opacity', 'filter', 'visibility',
      'display', 'color', 'offset-distance', 'clip-path'];
    const ser = new XMLSerializer();

    function setTime(t) {
      if (typeof live.pauseAnimations === 'function') { live.pauseAnimations(); live.setCurrentTime(t); }
      if (hasCss) for (const a of doc.getAnimations()) { try { a.pause(); a.currentTime = t * 1000; } catch (_) {} }
    }

    return {
      jobs: jobs.length,
      async snapshot(t) {
        setTime(t);
        if (hasCss) await raf();
        for (const j of jobs) {
          for (const attr of j.attrs) {
            let v = null;
            try { v = animatedValue(j.live, attr, win); } catch (_) {}
            if (v === null || v === '') { if (TRANSFORM_ATTRS.has(attr)) j.dst.removeAttribute(attr); continue; }
            if (attr === 'href') j.dst.setAttribute('href', v);
            else j.dst.setAttribute(attr, v);
          }
        }
        for (const j of cssJobs) {
          const cs = win.getComputedStyle(j.live);
          for (const p of CSS_PROPS) {
            const v = cs.getPropertyValue(p);
            if (v) j.dst.style.setProperty(p, v);
          }
        }
        return ser.serializeToString(clone);
      },
      destroy() { iframe.remove(); }
    };
  }

  function drawSvgString(ctx, svgString, w, h) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }));
      const img = new Image();
      img.decoding = 'sync';
      img.onload = () => {
        try { ctx.clearRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h); resolve(); }
        catch (e) { reject(e); }
        finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Браузер не смог нарисовать кадр SVG (битый SVG или внешние ссылки).')); };
      img.src = url;
    });
  }

  // RGBA (unpremultiplied) -> two I420 buffers: colour (BT.601 limited) and alpha (Y = alpha, full range)
  function rgbaToI420Pair(rgba, w, h, colorBuf, alphaBuf) {
    const cw = w >> 1, chh = h >> 1, ySize = w * h, cSize = cw * chh;
    const Y = colorBuf.subarray(0, ySize), U = colorBuf.subarray(ySize, ySize + cSize), V = colorBuf.subarray(ySize + cSize);
    const AY = alphaBuf.subarray(0, ySize);
    alphaBuf.fill(128, ySize);
    for (let i = 0, p = 0; i < ySize; i++, p += 4) {
      const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
      Y[i] = (16 + ((66 * r + 129 * g + 25 * b + 128) >> 8));
      AY[i] = rgba[p + 3];
    }
    for (let y = 0; y < chh; y++) {
      for (let x = 0; x < cw; x++) {
        let r = 0, g = 0, b = 0, wsum = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const p = ((y * 2 + dy) * w + (x * 2 + dx)) * 4;
          const a = rgba[p + 3] + 1;                 // alpha-weighted chroma: no dark fringes
          r += rgba[p] * a; g += rgba[p + 1] * a; b += rgba[p + 2] * a; wsum += a;
        }
        r /= wsum; g /= wsum; b /= wsum;
        const o = y * cw + x;
        U[o] = 128 + ((-38 * r - 74 * g + 112 * b + 128) >> 8);
        V[o] = 128 + ((112 * r - 94 * g - 18 * b + 128) >> 8);
      }
    }
  }

  const vp9For = (w, h) => { const n = w * h; return n <= 2228224 ? 'vp09.00.41.08' : n <= 8912896 ? 'vp09.00.51.08' : 'vp09.00.61.08'; };

  async function isOfflineSupported(width = 1920, height = 1080) {
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined' || typeof WebMMuxer === 'undefined') return false;
    try {
      const s = await VideoEncoder.isConfigSupported({ codec: vp9For(width, height), width: width & ~1, height: height & ~1, bitrate: 8e6 });
      return !!s.supported;
    } catch (_) { return false; }
  }

  async function renderWebM(opts) {
    const { svgText, fps = 30, duration, scale = 1, onProgress, signal } = opts;
    const W = Math.round(opts.width * scale) & ~1, H = Math.round(opts.height * scale) & ~1;
    const bitrate = opts.bitrate || Math.min(40e6, Math.round(W * H * fps * 0.18));
    const total = Math.max(1, Math.round(duration * fps));
    if (!(await isOfflineSupported(W, H))) throw new Error('Этот браузер не умеет WebCodecs VP9 — открой в свежем Chrome/Edge.');

    const snap = await createSnapshotter(svgText, opts.width, opts.height);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';

    const muxer = new WebMMuxer.Muxer({
      target: new WebMMuxer.ArrayBufferTarget(),
      video: { codec: 'V_VP9', width: W, height: H, frameRate: fps, alpha: true },
      firstTimestampBehavior: 'offset'
    });

    const colorChunks = new Map(), alphaChunks = new Map();
    let colorMeta = null, err = null, written = 0;
    const flushReady = () => {
      while (colorChunks.has(written) && alphaChunks.has(written)) {
        const c = colorChunks.get(written), a = alphaChunks.get(written);
        const data = new Uint8Array(c.chunk.byteLength); c.chunk.copyTo(data);
        const ad = new Uint8Array(a.byteLength); a.copyTo(ad);
        const meta = { alphaData: ad };
        if (c.meta && c.meta.decoderConfig) meta.decoderConfig = c.meta.decoderConfig;
        muxer.addVideoChunkRaw(data, c.chunk.type, c.chunk.timestamp, meta);
        colorChunks.delete(written); alphaChunks.delete(written); written++;
      }
    };
    const frameIdx = ts => Math.round(ts * fps / 1e6);
    const cfg = { codec: vp9For(W, H), width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality' };
    const encC = new VideoEncoder({
      output: (chunk, meta) => { colorChunks.set(frameIdx(chunk.timestamp), { chunk, meta }); flushReady(); },
      error: e => { err = e; }
    });
    const encA = new VideoEncoder({
      output: chunk => { alphaChunks.set(frameIdx(chunk.timestamp), chunk); flushReady(); },
      error: e => { err = e; }
    });
    encC.configure(cfg);
    encA.configure({ ...cfg, bitrate: Math.round(bitrate * 0.4) });

    const ySize = W * H, cSize = (W >> 1) * (H >> 1);
    const colorBuf = new Uint8Array(ySize + 2 * cSize), alphaBuf = new Uint8Array(ySize + 2 * cSize);
    const cs601 = { primaries: 'smpte170m', transfer: 'smpte170m', matrix: 'smpte170m', fullRange: false };
    const t0 = performance.now();
    try {
      for (let i = 0; i < total; i++) {
        if (signal && signal.aborted) throw new Error('Экспорт остановлен.');
        if (err) throw err;
        const svg = await snap.snapshot(i / fps);
        await drawSvgString(ctx, svg, W, H);
        const px = ctx.getImageData(0, 0, W, H).data;
        rgbaToI420Pair(px, W, H, colorBuf, alphaBuf);
        const ts = Math.round(i * 1e6 / fps), dur = Math.round(1e6 / fps);
        const key = i % (fps * 2) === 0;
        const fc = new VideoFrame(colorBuf, { format: 'I420', codedWidth: W, codedHeight: H, timestamp: ts, duration: dur, colorSpace: cs601 });
        const fa = new VideoFrame(alphaBuf, { format: 'I420', codedWidth: W, codedHeight: H, timestamp: ts, duration: dur, colorSpace: { ...cs601, fullRange: true } });
        encC.encode(fc, { keyFrame: key }); encA.encode(fa, { keyFrame: key });
        fc.close(); fa.close();
        while (encC.encodeQueueSize > 4 || encA.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 5));
        if (onProgress) {
          const el = (performance.now() - t0) / 1000;
          onProgress({ frame: i + 1, total, elapsed: el, eta: el / (i + 1) * (total - i - 1) });
        }
      }
      await encC.flush(); await encA.flush();
      if (err) throw err;
      flushReady();
      if (written !== total) throw new Error(`Кодировщик вернул ${written} из ${total} кадров.`);
      muxer.finalize();
      return new Blob([muxer.target.buffer], { type: 'video/webm' });
    } finally {
      try { encC.close(); } catch (_) {}
      try { encA.close(); } catch (_) {}
      snap.destroy();
    }
  }

  window.SvgEngine = { isOfflineSupported, renderWebM, createSnapshotter, drawSvgString };
})();

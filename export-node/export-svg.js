#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

function usage() {
  console.log(`SVG → transparent WebM

Usage:
  node export-node/export-svg.js input.svg output.webm [options]
  npm run export:svg -- input.svg output.webm --duration=5 --fps=60 --strip-bg --scale=2 --crf=10

Options:
  --duration=5        Duration in seconds
  --fps=60            Frames per second
  --width=800         Override base width
  --height=240        Override base height
  --scale=2           Render/output scale. 2 means 800×240 SVG becomes 1600×480 WebM
  --downscale         Render at scale, then downscale video back to base width/height
  --strip-bg          Remove the first root <rect> that covers the whole SVG
  --keep-frames       Do not delete PNG frames
  --crf=10            VP9 quality, lower = better/larger. Try 8-14
  --lossless          Use VP9 lossless mode, very large files
  --no-preview        Do not generate output.preview.html

Examples:
  npm run export:example
  npm run export:svg -- examples/text-gradient-with-bg.svg output.webm --duration=5 --fps=60 --strip-bg --scale=2 --crf=10
  node export-node/export-svg.js my.svg my.webm --duration=3 --fps=60 --scale=3 --strip-bg --lossless
`);
}

function parseArgs(argv) {
  const tokens = [];
  for (const raw of argv) {
    if (raw === '--') continue;
    tokens.push(raw);
  }

  if (tokens.includes('--help') || tokens.includes('-h')) return { help: true };

  const opts = {
    duration: 5,
    fps: 60,
    width: null,
    height: null,
    scale: 2,
    downscale: false,
    stripBg: false,
    keepFrames: false,
    crf: 10,
    lossless: false,
    preview: true
  };
  const positional = [];
  const arity = new Set(['--duration', '--fps', '--width', '--height', '--scale', '--crf']);
  const flags = new Set(['--strip-bg', '--keep-frames', '--downscale', '--lossless', '--no-preview']);

  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];

    if (!token.startsWith('-')) {
      positional.push(token);
      continue;
    }

    let key = token;
    let value = null;
    if (token.includes('=')) {
      const idx = token.indexOf('=');
      key = token.slice(0, idx);
      value = token.slice(idx + 1);
    }

    if (arity.has(key)) {
      if (value === null) {
        value = tokens[i + 1];
        i++;
      }
      if (value === undefined || value.startsWith('--')) throw new Error(`${key} needs a value`);
      const num = Number(value);
      if (!Number.isFinite(num)) throw new Error(`${key} must be a number`);
      if (key === '--duration') opts.duration = num;
      if (key === '--fps') opts.fps = num;
      if (key === '--width') opts.width = num;
      if (key === '--height') opts.height = num;
      if (key === '--scale') opts.scale = num;
      if (key === '--crf') opts.crf = num;
      continue;
    }

    if (flags.has(key)) {
      if (key === '--strip-bg') opts.stripBg = true;
      if (key === '--keep-frames') opts.keepFrames = true;
      if (key === '--downscale') opts.downscale = true;
      if (key === '--lossless') opts.lossless = true;
      if (key === '--no-preview') opts.preview = false;
      continue;
    }

    throw new Error(`Unknown option: ${key}`);
  }

  const [input, output] = positional;
  if (!input || !output) return { help: true };
  if (!Number.isFinite(opts.duration) || opts.duration <= 0) throw new Error('--duration must be positive');
  if (!Number.isFinite(opts.fps) || opts.fps <= 0) throw new Error('--fps must be positive');
  if (!Number.isFinite(opts.scale) || opts.scale <= 0) throw new Error('--scale must be positive');
  opts.duration = Number(opts.duration);
  opts.fps = Math.round(Number(opts.fps));
  opts.scale = Math.max(1, Math.min(6, Number(opts.scale)));
  opts.crf = Math.max(0, Math.min(63, Math.round(Number(opts.crf))));
  return { input, output, opts };
}

function svgMetrics(svg) {
  const viewBoxMatch = svg.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  const viewBoxNums = viewBoxMatch ? viewBoxMatch[1].trim().split(/[\s,]+/).map(Number) : [];
  const viewBox = viewBoxNums.length === 4 && viewBoxNums.every(Number.isFinite) && viewBoxNums[2] > 0 && viewBoxNums[3] > 0
    ? viewBoxNums
    : null;
  const widthMatch = svg.match(/<svg\b[^>]*\bwidth\s*=\s*["']([^"']+)["']/i);
  const heightMatch = svg.match(/<svg\b[^>]*\bheight\s*=\s*["']([^"']+)["']/i);
  const widthAttr = parseSvgLength(widthMatch && widthMatch[1]);
  const heightAttr = parseSvgLength(heightMatch && heightMatch[1]);
  const width = widthAttr || (viewBox ? viewBox[2] : 800);
  const height = heightAttr || (viewBox ? viewBox[3] : 600);
  return {
    width: Math.round(Number.isFinite(width) ? width : 800),
    height: Math.round(Number.isFinite(height) ? height : 600),
    viewBox
  };
}

function parseSvgLength(value) {
  if (!value) return null;
  const v = String(value).trim();
  if (!v || v.endsWith('%')) return null;
  const m = v.match(/^(-?\d*\.?\d+(?:e[-+]?\d+)?)(px)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function htmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function writePreviewHtml(outputPath, width, height) {
  const fileName = path.basename(outputPath);
  const previewPath = outputPath.replace(/\.webm$/i, '') + '.preview.html';
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WebM alpha preview</title>
<style>
  :root{color-scheme:dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#09090b;color:#f7f7fb}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}
  main{width:min(1100px,100%)}
  .bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-bottom:14px}
  h1{font-size:24px;margin:0}.hint{color:#a7a7b4;margin:8px 0 0;line-height:1.5}
  button{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:white;border-radius:12px;padding:10px 12px;font-weight:800;cursor:pointer}
  .stage{min-height:0;border:1px solid rgba(255,255,255,.14);border-radius:20px;display:grid;place-items:center;padding:24px;overflow:auto}
  .checker{background-color:#15151d;background-image:linear-gradient(45deg,rgba(255,255,255,.18) 25%,transparent 25%),linear-gradient(-45deg,rgba(255,255,255,.18) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,rgba(255,255,255,.18) 75%),linear-gradient(-45deg,transparent 75%,rgba(255,255,255,.18) 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0}
  .black{background:#000}.white{background:#fff}
  video{width:min(100%, ${width}px);aspect-ratio:${width}/${height};height:auto;display:block;background:transparent}
  code{color:#ddd6fe}
</style>
</head>
<body>
<main>
  <div class="bar">
    <div>
      <h1>${htmlEscape(fileName)}</h1>
      <p class="hint">Размер: ${width}×${height}. Переключай фон, чтобы проверить alpha-канал и грязные края.</p>
    </div>
    <div>
      <button data-bg="checker">Шахматка</button>
      <button data-bg="black">Чёрный</button>
      <button data-bg="white">Белый</button>
    </div>
  </div>
  <div id="stage" class="stage checker">
    <video src="${htmlEscape(fileName)}" controls loop autoplay muted playsinline></video>
  </div>
  <p class="hint">Если края всё ещё грубые: экспортируй с <code>--scale=3</code> или <code>--lossless</code>, либо показывай 2×/3× видео меньшим CSS-размером.</p>
</main>
<script>
  const stage = document.getElementById('stage');
  document.querySelectorAll('button[data-bg]').forEach(btn => btn.addEventListener('click', () => {
    stage.className = 'stage ' + btn.dataset.bg;
  }));
</script>
</body>
</html>`;
  fs.writeFileSync(previewPath, html, 'utf8');
  return previewPath;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) return usage();
  const { input, output, opts } = parsed;

  const inputPath = path.resolve(input);
  const outputPath = path.resolve(output);
  const svg = fs.readFileSync(inputPath, 'utf8');
  const metrics = svgMetrics(svg);
  const baseWidth = Math.round(opts.width || metrics.width);
  const baseHeight = Math.round(opts.height || metrics.height);
  const outWidth = opts.downscale ? baseWidth : Math.round(baseWidth * opts.scale);
  const outHeight = opts.downscale ? baseHeight : Math.round(baseHeight * opts.scale);
  const totalFrames = Math.max(1, Math.round(opts.duration * opts.fps));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svg-webm-frames-'));

  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (_) {
    throw new Error('Puppeteer is not installed. Run: npm install');
  }

  const ffmpegCheck = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (ffmpegCheck.error) {
    throw new Error('ffmpeg not found. Install ffmpeg and make sure it is available in PATH.');
  }

  console.log(`Input SVG: ${inputPath}`);
  console.log(`Base size: ${baseWidth}×${baseHeight}`);
  console.log(`Render scale: ${opts.scale}×${opts.downscale ? ' with downscale' : ''}`);
  console.log(`Output WebM: ${outWidth}×${outHeight}, ${opts.fps} FPS, ${opts.duration}s`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--font-render-hinting=none']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: baseWidth, height: baseHeight, deviceScaleFactor: opts.scale });
    await page.setContent(`<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${baseWidth}px;height:${baseHeight}px;overflow:hidden;background:transparent;}
body{display:block;}
svg{display:block;width:${baseWidth}px;height:${baseHeight}px;background:transparent;text-rendering:geometricPrecision;shape-rendering:auto;}
*{-webkit-font-smoothing:antialiased;}
</style></head><body>${svg}</body></html>`, { waitUntil: 'load' });

    await page.evaluate((stripBg, width, height) => {
      const svg = document.querySelector('svg');
      if (!svg) throw new Error('No <svg> element found');
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.style.background = 'transparent';
      svg.style.textRendering = 'geometricPrecision';
      svg.style.shapeRendering = 'auto';

      if (stripBg) {
        const skip = new Set(['defs', 'title', 'desc', 'metadata']);
        const firstDrawable = Array.from(svg.children).find(el => !skip.has(el.tagName.toLowerCase()));
        if (firstDrawable && firstDrawable.tagName.toLowerCase() === 'rect') {
          const rw = firstDrawable.getAttribute('width') || '';
          const rh = firstDrawable.getAttribute('height') || '';
          const x = parseFloat(firstDrawable.getAttribute('x') || '0');
          const y = parseFloat(firstDrawable.getAttribute('y') || '0');
          const fill = firstDrawable.getAttribute('fill');
          const stroke = firstDrawable.getAttribute('stroke');
          const covers = (rw === '100%' || Math.abs(parseFloat(rw) - width) < 0.5) &&
            (rh === '100%' || Math.abs(parseFloat(rh) - height) < 0.5) &&
            x === 0 && y === 0 && fill && fill !== 'none' && (!stroke || stroke === 'none');
          if (covers) firstDrawable.remove();
        }
      }
    }, opts.stripBg, baseWidth, baseHeight);

    await page.evaluateHandle('document.fonts ? document.fonts.ready : Promise.resolve()');

    for (let frame = 0; frame < totalFrames; frame++) {
      const t = frame / opts.fps;
      await page.evaluate((time) => {
        const svg = document.querySelector('svg');
        if (svg && typeof svg.pauseAnimations === 'function') {
          svg.pauseAnimations();
          svg.setCurrentTime(time);
        }
        if (document.getAnimations) {
          for (const anim of document.getAnimations({ subtree: true })) {
            try {
              anim.pause();
              anim.currentTime = time * 1000;
            } catch (_) {}
          }
        }
      }, t);

      const framePath = path.join(tempDir, `frame_${String(frame).padStart(5, '0')}.png`);
      await page.screenshot({
        path: framePath,
        omitBackground: true,
        clip: { x: 0, y: 0, width: baseWidth, height: baseHeight }
      });
      const percent = Math.round(((frame + 1) / totalFrames) * 100);
      process.stdout.write(`\rRendering PNG frames: ${percent}%`);
    }
    process.stdout.write('\n');
  } finally {
    await browser.close();
  }

  const inputPattern = path.join(tempDir, 'frame_%05d.png');
  const ffmpegArgs = [
    '-y',
    '-framerate', String(opts.fps),
    '-i', inputPattern,
    '-c:v', 'libvpx-vp9',
    '-pix_fmt', 'yuva420p',
    '-auto-alt-ref', '0',
    '-metadata:s:v:0', 'alpha_mode=1',
    '-deadline', 'best',
    '-cpu-used', '0',
    '-row-mt', '1'
  ];

  if (opts.downscale) {
    ffmpegArgs.push('-vf', `scale=${baseWidth}:${baseHeight}:flags=lanczos,format=yuva420p`);
  }

  if (opts.lossless) {
    ffmpegArgs.push('-lossless', '1');
  } else {
    ffmpegArgs.push('-b:v', '0', '-crf', String(opts.crf));
  }

  ffmpegArgs.push(outputPath);

  console.log('Encoding WebM with ffmpeg...');
  const ffmpeg = spawnSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
  if (ffmpeg.status !== 0) throw new Error('ffmpeg failed');

  if (!opts.keepFrames) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } else {
    console.log(`Frames kept at: ${tempDir}`);
  }

  if (opts.preview) {
    const previewPath = writePreviewHtml(outputPath, outWidth, outHeight);
    console.log(`Preview HTML: ${previewPath}`);
  }
  console.log(`Done: ${outputPath}`);
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});

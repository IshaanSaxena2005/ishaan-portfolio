const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const url = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const outDir = path.resolve(__dirname, '_verify_frames');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

// Runs inside the page, right after the galaxy stage starts.
function samplerFactory() {
  const canvas = document.getElementById('intro-galaxy-canvas');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function grab() {
    const W = canvas.width,
      H = canvas.height;
    const d = ctx.getImageData(0, 0, W, H).data;
    let minX = 1e9,
      minY = 1e9,
      maxX = -1,
      maxY = -1,
      lit = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] < 30) continue;
        lit++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return { d, W, H, lit, minX, minY, maxX, maxY };
  }

  // Fine ASCII map cropped to the lit bbox (padded) so facial features show.
  function cropMap(C, R) {
    const g = grab();
    if (g.maxX < 0) return ['(empty)'];
    const pw = (g.maxX - g.minX) * 0.06;
    const ph = (g.maxY - g.minY) * 0.06;
    const x0 = Math.max(0, g.minX - pw),
      x1 = Math.min(g.W - 1, g.maxX + pw);
    const y0 = Math.max(0, g.minY - ph),
      y1 = Math.min(g.H - 1, g.maxY + ph);
    const bw = x1 - x0,
      bh = y1 - y0;
    const sum = Array.from({ length: R }, () => new Float64Array(C));
    const cnt = Array.from({ length: R }, () => new Int32Array(C));
    for (let y = Math.floor(y0); y <= Math.floor(y1); y++) {
      for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
        const i = (y * g.W + x) * 4;
        if (g.d[i + 3] < 30) continue;
        const L = 0.299 * g.d[i] + 0.587 * g.d[i + 1] + 0.114 * g.d[i + 2];
        const gx = Math.min(C - 1, Math.floor(((x - x0) / bw) * C));
        const gy = Math.min(R - 1, Math.floor(((y - y0) / bh) * R));
        sum[gy][gx] += L;
        cnt[gy][gx]++;
      }
    }
    const RAMP = ' .:-=+*#%@';
    const lines = [];
    for (let r = 0; r < R; r++) {
      let line = '';
      for (let cc = 0; cc < C; cc++) {
        if (!cnt[r][cc]) {
          line += ' ';
          continue;
        }
        const L = sum[r][cc] / cnt[r][cc];
        line += RAMP[Math.min(RAMP.length - 1, Math.max(1, Math.round((L / 255) * (RAMP.length - 1))))];
      }
      lines.push(line);
    }
    return lines;
  }

  // Colour-classified map of the formed bbox: s=skin, h=dark(hair), W=white(glasses),
  // b=blue-ish, .=dim. Lets us confirm real facial structure, not a flat blob.
  function classMap(C, R) {
    const g = grab();
    if (g.maxX < 0) return ['(empty)'];
    const x0 = g.minX, x1 = g.maxX, y0 = g.minY, y1 = g.maxY;
    const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
    const acc = Array.from({ length: R }, () => Array.from({ length: C }, () => ({ s: 0, h: 0, w: 0, b: 0, n: 0 })));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * g.W + x) * 4;
        if (g.d[i + 3] < 30) continue;
        const Rr = g.d[i], Gg = g.d[i + 1], Bb = g.d[i + 2];
        const L = 0.299 * Rr + 0.587 * Gg + 0.114 * Bb;
        const gx = Math.min(C - 1, Math.floor(((x - x0) / bw) * C));
        const gy = Math.min(R - 1, Math.floor(((y - y0) / bh) * R));
        const c = acc[gy][gx];
        c.n++;
        if (L > 170) c.w++;
        else if (L < 60) c.h++;
        else if (Rr > Gg + 8 && Gg > Bb + 4) c.s++;
        else if (Bb > Rr + 10) c.b++;
      }
    }
    const lines = [];
    for (let r = 0; r < R; r++) {
      let line = '';
      for (let cc = 0; cc < C; cc++) {
        const c = acc[r][cc];
        if (!c.n) { line += ' '; continue; }
        const best = Math.max(c.s, c.h, c.w, c.b);
        const minFrac = 0.34;
        if (best / c.n < minFrac) { line += '.'; continue; }
        line += best === c.s ? 's' : best === c.h ? 'h' : best === c.w ? 'W' : 'b';
      }
      lines.push(line);
    }
    return lines;
  }

  function meta() {
    const letters = Array.from(document.querySelectorAll('.intro-letter'));
    let tTop = 1e9,
      tBottom = -1;
    for (const el of letters) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.top < tTop) tTop = r.top;
      if (r.bottom > tBottom) tBottom = r.bottom;
    }
    const photo = document.getElementById('intro-galaxy-photo');
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      title: tBottom < 0 ? null : { top: +tTop.toFixed(1), bottom: +tBottom.toFixed(1) },
      photoDisplay: photo ? getComputedStyle(photo).display : 'none',
      stageGalaxy: document.getElementById('cinematic-intro').classList.contains('stage-galaxy'),
      formed: document.getElementById('intro-galaxy-portrait').classList.contains('is-formed'),
    };
  }

  return new Promise((resolve) => {
    const marks = [1200, 2000, 2700, 3500, 4150];
    const out = [];
    let ki = 0;
    const t0 = performance.now();
    function step() {
      const g = grab();
      const rec = {
        t: Math.round(performance.now() - t0),
        lit: g.lit,
        bbox:
          g.maxX < 0
            ? null
            : {
                x0: +(g.minX / dpr).toFixed(1),
                y0: +(g.minY / dpr).toFixed(1),
                x1: +(g.maxX / dpr).toFixed(1),
                y1: +(g.maxY / dpr).toFixed(1),
              },
        meta: meta(),
      };
      if (ki >= 1) { rec.map = cropMap(96, 68); rec.cls = classMap(72, 54); }
      out.push(rec);
      ki++;
      if (ki < marks.length) setTimeout(step, marks[ki] - marks[ki - 1]);
      else resolve(out);
    }
    setTimeout(step, marks[0]);
  });
}

(async () => {
  const browser = await chromium.launch();
  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.getElementById('intro-galaxy').classList.contains('is-active'),
      null,
      { timeout: 25000 }
    );
    const seq = await page.evaluate(samplerFactory);

    console.log(`\n########## ${vp.name} (${vp.width}x${vp.height}) ##########`);
    for (const rec of seq) {
      console.log(
        `t=${rec.t}ms lit=${rec.lit} bbox=${JSON.stringify(rec.bbox)} stageGalaxy=${rec.meta.stageGalaxy} formed=${rec.meta.formed} title=${JSON.stringify(rec.meta.title)} photo=${rec.meta.photoDisplay}`
      );
    }
    const lit = seq.filter((r) => r.lit > 0 && r.bbox);
    const area = (r) => (r.bbox.x1 - r.bbox.x0) * (r.bbox.y1 - r.bbox.y0);
    // most-converged frame = the one whose lit bbox is tightest
    const last = lit.length ? lit.reduce((a, b) => (area(a) <= area(b) ? a : b)) : seq[seq.length - 1];
    if (last.bbox && last.meta.title) {
      const gap = last.bbox.y0 - last.meta.title.bottom;
      console.log(`FORMED FRAME t=${last.t}ms lit=${last.lit}`);
      console.log(`GAP face-top/title-bottom = ${gap.toFixed(1)}px  OVERLAP=${gap < 0}`);
      console.log(
        `face centerX=${((last.bbox.x0 + last.bbox.x1) / 2).toFixed(1)} (vw/2=${last.meta.vw / 2}) size=${(last.bbox.x1 - last.bbox.x0).toFixed(0)}x${(last.bbox.y1 - last.bbox.y0).toFixed(0)}`
      );
    }
    if (last.map) {
      console.log('--- formed face (fine crop) ---');
      console.log(last.map.join('\n'));
    }
    if (last.cls) {
      console.log('--- colour classes (s=skin h=hair W=white . =dim) ---');
      console.log(last.cls.join('\n'));
    }
    console.log(`CONSOLE ERRORS: ${errors.length ? JSON.stringify(errors) : 'none'}`);
    await page.screenshot({ path: path.join(outDir, `${vp.name}-formed.png`) });
    await page.close();
  }

  await browser.close();
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});

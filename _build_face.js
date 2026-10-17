const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Face box in normalized coords of My-Photo-Cutout.png (570x1104).
// The cutout carries a real alpha channel, so the silhouette is exact: only
// the head (hair crown -> jaw -> collar) is sampled.
const FACE = { x0: 0.1, y0: 0.04, x1: 0.9, y1: 0.72 };
const STEP = 4;     // smaller step for more detail
const KEEP = 0.5;   // lower keep for more "galaxy" feel, less "block"

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const b64 = fs.readFileSync(path.resolve(__dirname, 'My-Photo-Cutout.png')).toString('base64');
  const dataUrl = 'data:image/png;base64,' + b64;

  const res = await page.evaluate(async ({ url, FACE, step, keep }) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };

    const X0 = Math.floor(FACE.x0 * W), X1 = Math.floor(FACE.x1 * W);
    const Y0 = Math.floor(FACE.y0 * H), Y1 = Math.floor(FACE.y1 * H);
    const boxW = X1 - X0, boxH = Y1 - Y0;
    const cols = Math.floor(boxW / step), rows = Math.floor(boxH / step);

    // pass 1: occupancy + alpha-weighted colour per cell (alpha = ground truth mask)
    const occ = new Uint8Array(cols * rows);
    const col = new Uint8Array(cols * rows * 3);
    for (let r = 0; r < rows; r++) {
      for (let cc = 0; cc < cols; cc++) {
        let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
        for (let yy = 0; yy < step; yy++) for (let xx = 0; xx < step; xx++) {
          const x = Math.min(X0 + cc * step + xx, W - 1);
          const y = Math.min(Y0 + r * step + yy, H - 1);
          const [rr, gg, bb2, aa] = at(x, y);
          const a = aa / 255;
          sr += rr * a; sg += gg * a; sb += bb2 * a; sa += a; n++;
        }
        if (sa / n < 0.7) continue;               // mostly transparent -> not the subject
        const k = r * cols + cc;
        occ[k] = 1;
        col[k * 3] = Math.round(sr / sa); col[k * 3 + 1] = Math.round(sg / sa); col[k * 3 + 2] = Math.round(sb / sa);
      }
    }

    // pass 2: denoise — drop isolated specks (fewer than 2 occupied neighbours)
    const isOn = (r, cc) => r >= 0 && cc >= 0 && r < rows && cc < cols && occ[r * cols + cc];
    const pts = [];
    for (let r = 0; r < rows; r++) {
      for (let cc = 0; cc < cols; cc++) {
        const k = r * cols + cc;
        if (!occ[k]) continue;
        let nb = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (isOn(r + dy, cc + dx)) nb++;
        }
        if (nb < 2) continue;
        if (((r * 73856093) ^ (cc * 19349663)) % 1000 >= keep * 1000) continue;
        pts.push([Math.round(((cc * step + step / 2) / boxW) * 255),
                  Math.round(((r * step + step / 2) / boxH) * 255),
                  col[k * 3], col[k * 3 + 1], col[k * 3 + 2]]);
      }
    }

    // pack x,y,r,g,b -> base64
    const buf = new Uint8Array(pts.length * 5);
    pts.forEach((p, i) => {
      buf[i * 5] = p[0]; buf[i * 5 + 1] = p[1];
      buf[i * 5 + 2] = p[2]; buf[i * 5 + 3] = p[3]; buf[i * 5 + 4] = p[4];
    });
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const out = btoa(bin);

    // ASCII luminance preview
    const PC = 72, PR = 60, RAMP = ' .:-=+*#%@';
    const sum = Array.from({ length: PR }, () => new Float64Array(PC));
    const cnt = Array.from({ length: PR }, () => new Int32Array(PC));
    let minx = 255, maxx = 0, miny = 255, maxy = 0;
    for (const p of pts) {
      const gx = Math.min(PC - 1, Math.floor((p[0] / 255) * PC));
      const gy = Math.min(PR - 1, Math.floor((p[1] / 255) * PR));
      sum[gy][gx] += 0.299 * p[2] + 0.587 * p[3] + 0.114 * p[4];
      cnt[gy][gx]++;
      minx = Math.min(minx, gx); maxx = Math.max(maxx, gx);
      miny = Math.min(miny, gy); maxy = Math.max(maxy, gy);
    }
    const lines = [];
    for (let r = 0; r < PR; r++) {
      let line = '';
      for (let cc = 0; cc < PC; cc++) {
        if (!cnt[r][cc]) { line += ' '; continue; }
        const L = sum[r][cc] / cnt[r][cc];
        line += RAMP[Math.min(RAMP.length - 1, Math.max(1, Math.round((L / 255) * (RAMP.length - 1))))];
      }
      lines.push(String(r).padStart(2, ' ') + '|' + line);
    }
    return { count: pts.length, boxW, boxH, out, ascii: lines.join('\n'),
             content: [minx, miny, maxx, maxy] };
  }, { url: dataUrl, FACE, step: STEP, keep: KEEP });

  console.log('CONTENT_GRID', res.content.join(','));
  console.log(res.ascii);
  console.log('PTS=' + res.count, 'BOX=' + res.boxW + 'x' + res.boxH,
    'ASPECT=' + (res.boxW / res.boxH).toFixed(4), 'B64LEN=' + res.out.length);

  const file = `/* Auto-generated from My-Photo.png (face region only). Do not edit by hand.
   Intro-scoped face particle source: x,y normalised 0..255 + r,g,b per point. */
window.__INTRO_FACE = {
  aspect: ${(res.boxW / res.boxH).toFixed(5)},
  count: ${res.count},
  b64: "${res.out}"
};
`;
  fs.writeFileSync(path.resolve(__dirname, 'intro-face-data.js'), file);
  console.log('WROTE intro-face-data.js');
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });

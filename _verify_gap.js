const { chromium } = require('playwright');
const path = require('path');

const url = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

// Exact landing = the last falling letter's CSS animation `finished` promise.
// Morph start = first mutation of the letters root after landing.
// Morph end   = when the intro sets aria-label="PORTFOLIO".
function instrument() {
  return new Promise((resolve) => {
    const root = document.getElementById('intro-letters');
    if (!root) { resolve(null); return; }

    let landing = null;
    let firstMut = null;
    let endT = null;

    // Attach to the falling animations as soon as the letters exist.
    const attach = setInterval(() => {
      const els = [...root.querySelectorAll('.intro-letter.is-falling')];
      if (!els.length) return;
      clearInterval(attach);
      els.forEach((el) => {
        (el.getAnimations ? el.getAnimations() : []).forEach((a) => {
          a.finished.then(() => {
            const t = performance.now();
            if (landing === null || t > landing) landing = t;
          }).catch(() => {});
        });
      });
    }, 25);

    const obs = new MutationObserver(() => {
      if (landing !== null && firstMut === null) firstMut = performance.now();
      if (root.getAttribute('aria-label') === 'PORTFOLIO') endT = performance.now();
    });
    obs.observe(root, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['aria-label'],
    });

    const done = setInterval(() => {
      if (landing !== null && firstMut !== null && endT !== null) {
        clearInterval(done);
        obs.disconnect();
        resolve({ landing, firstMut, endT });
      }
    }, 15);
    setTimeout(() => { obs.disconnect(); resolve(null); }, 20000);
  });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(url, { waitUntil: 'load' });

  const r = await page.evaluate(instrument);
  if (!r) { console.log('INSTRUMENT FAILED'); await browser.close(); return; }

  console.log(`last letter landed (animation finished) = t+${Math.round(r.landing)}ms`);
  console.log(`first morph mutation                    = t+${Math.round(r.firstMut)}ms`);
  console.log(`IDLE GAP after landing                  = ${Math.round(r.firstMut - r.landing)}ms`);
  console.log(`MORPH (start -> PORTFOLIO formed)       = ${Math.round(r.endT - r.firstMut)}ms`);
  console.log(`CONSOLE ERRORS: ${errors.length ? JSON.stringify(errors) : 'none'}`);
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });

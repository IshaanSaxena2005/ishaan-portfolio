/* ========================================
   CINEMATIC INTRO
   ISHAAN → PORTFOLIO → portrait reveal → the whole composition dissolves
   into particles as the hero appears (no travel/landing into the hero photo)
   Plays on every full page reload; respects prefers-reduced-motion
   ======================================== */
(function initCinematicIntro() {
  const FROM_WORD = 'ISHAAN';
  const TO_WORD = 'PORTFOLIO';
  const PORTRAIT_SRC = 'Linkedin profile.png';

  const intro = document.getElementById('cinematic-intro');
  const canvas = document.getElementById('intro-particles');
  const lettersRoot = document.getElementById('intro-letters');
  const portraitEl = document.getElementById('intro-portrait');
  const portraitImg = document.getElementById('intro-portrait-img');

  if (!intro || !lettersRoot) return;

  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const timers = [];
  let particleRaf = null;
  let morphRaf = null;
  let dissolveRaf = null;
  let ambientParticles = [];
  let trailParticles = [];
  let particleCtx = null;
  let onResize = null;
  let finished = false;

  function trackTimeout(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  function wait(ms) {
    return new Promise((resolve) => trackTimeout(resolve, ms));
  }

  function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function cubicBezierPoint(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return (
      u * u * u * p0 +
      3 * u * u * t * p1 +
      3 * u * t * t * p2 +
      t * t * t * p3
    );
  }

  function getNameFontSize() {
    const w = window.innerWidth;
    if (w < 480) return Math.max(42, w * 0.14);
    if (w < 768) return Math.min(72, w * 0.13);
    return Math.min(136, w * 0.11);
  }

  function getTitleFontSize() {
    // Use ISHAAN's size for PORTFOLIO to maintain visual prominence
    const w = window.innerWidth;
    if (w < 480) return Math.max(42, w * 0.14);
    if (w < 768) return Math.min(72, w * 0.13);
    return Math.min(136, w * 0.11);
  }

  function getTitleTracking() {
    // During transformation, use same tracking as ISHAAN (0.1)
    // For final PORTFOLIO, use tighter spacing to fit at same visual size
    return 0.1;
  }

  /** Measure centered layout for a word; returns [{char,x,y,w,h,fontSize}] */
  function measureWordLayout(word, fontSize, trackingEm) {
    const canvasEl = document.createElement('canvas');
    const ctx = canvasEl.getContext('2d');
    ctx.font = `700 ${fontSize}px Cinzel, serif`;

    const gap = fontSize * trackingEm;
    const widths = [];
    let total = 0;

    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      const w = ch === ' ' ? fontSize * 0.45 : ctx.measureText(ch).width;
      widths.push(w);
      total += w;
      if (i < word.length - 1) total += gap;
    }

    const startX = (window.innerWidth - total) / 2;
    const y = window.innerHeight / 2 - fontSize / 2;
    const slots = [];
    let x = startX;

    for (let i = 0; i < word.length; i++) {
      slots.push({
        char: word[i],
        x: x,
        y: y,
        w: widths[i],
        h: fontSize,
        fontSize: fontSize,
      });
      x += widths[i] + gap;
    }
    return slots;
  }

  /**
   * Assign ISHAAN letters to THE PORTFOLIO slots.
   * Prefer exact character matches; leftover sources morph into leftover targets.
   */
  function buildMorphPlan(fromSlots, toSlots) {
    const usedTo = new Set();
    const moves = []; // { fromIndex, toIndex, keepChar }

    // Pass 1: exact non-space matches
    for (let i = 0; i < fromSlots.length; i++) {
      const ch = fromSlots[i].char;
      let best = -1;
      for (let j = 0; j < toSlots.length; j++) {
        if (usedTo.has(j)) continue;
        if (toSlots[j].char === ch && ch !== ' ') {
          best = j;
          break;
        }
      }
      if (best !== -1) {
        usedTo.add(best);
        moves.push({ fromIndex: i, toIndex: best, keepChar: true });
      }
    }

    // Pass 2: remaining from letters → remaining non-space to letters
    const freeFrom = [];
    for (let i = 0; i < fromSlots.length; i++) {
      if (!moves.some((m) => m.fromIndex === i)) freeFrom.push(i);
    }
    const freeTo = [];
    for (let j = 0; j < toSlots.length; j++) {
      if (!usedTo.has(j) && toSlots[j].char !== ' ') freeTo.push(j);
    }

    const pairCount = Math.min(freeFrom.length, freeTo.length);
    for (let k = 0; k < pairCount; k++) {
      usedTo.add(freeTo[k]);
      moves.push({
        fromIndex: freeFrom[k],
        toIndex: freeTo[k],
        keepChar: false,
      });
    }

    // Remaining to-slots (including space) are new arrivals
    const births = [];
    for (let j = 0; j < toSlots.length; j++) {
      if (!usedTo.has(j)) births.push(j);
    }

    return { moves, births };
  }

  function spawnTrail(x, y, intensity) {
    const n = intensity > 0.7 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      trailParticles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        r: Math.random() * 2.2 + 0.6,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8 - 0.2,
        life: 1,
        decay: 0.018 + Math.random() * 0.02,
      });
    }
  }

  function stopParticles() {
    if (particleRaf) cancelAnimationFrame(particleRaf);
    particleRaf = null;
  }

  function stopMorph() {
    if (morphRaf) cancelAnimationFrame(morphRaf);
    morphRaf = null;
  }

  function cleanupListeners() {
    if (onResize) {
      window.removeEventListener('resize', onResize);
      onResize = null;
    }
    timers.forEach(clearTimeout);
    timers.length = 0;
  }

  function finishIntro() {
    if (finished) return;
    finished = true;
    stopParticles();
    stopMorph();
    if (dissolveRaf) {
      cancelAnimationFrame(dissolveRaf);
      dissolveRaf = null;
    }
    cleanupListeners();
    document.documentElement.classList.remove('intro-pending');
    document.documentElement.classList.add('intro-done');
    document.body.classList.remove('intro-active');

    // Last line of defence: browsers can restore the previous scroll position
    // asynchronously — after the load event and while the intro is still on
    // screen. Snap back to the very top once the overlay is gone so the main
    // portfolio always opens at the beginning.
    if (typeof window.__forceScrollTop === 'function') window.__forceScrollTop();

    intro.className = 'cinematic-intro';
    intro.setAttribute('hidden', '');
    intro.setAttribute('aria-hidden', 'true');
    lettersRoot.innerHTML = '';
    window.dispatchEvent(new Event('scroll'));
  }

  if (prefersReducedMotion) {
    finishIntro();
    return;
  }

  intro.removeAttribute('hidden');
  intro.setAttribute('aria-hidden', 'false');
  document.body.classList.add('intro-active');

  /* ---- Ambient + trail particles on one canvas ---- */
  function setupParticles() {
    if (!canvas) return;
    particleCtx = canvas.getContext('2d');
    if (!particleCtx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      particleCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    onResize = resize;
    window.addEventListener('resize', onResize, { passive: true });

    const count = window.innerWidth < 768 ? 34 : 56;
    ambientParticles = Array.from({ length: count }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.8 + 0.4,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.35 - 0.05,
      a: Math.random() * 0.45 + 0.15,
    }));

    const draw = () => {
      if (!particleCtx || finished) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      particleCtx.clearRect(0, 0, w, h);

      for (const p of ambientParticles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        particleCtx.beginPath();
        particleCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        particleCtx.fillStyle = `rgba(192, 132, 252, ${p.a})`;
        particleCtx.fill();
      }

      for (let i = trailParticles.length - 1; i >= 0; i--) {
        const t = trailParticles[i];
        t.x += t.vx;
        t.y += t.vy;
        t.life -= t.decay;
        if (t.life <= 0) {
          trailParticles.splice(i, 1);
          continue;
        }
        particleCtx.beginPath();
        particleCtx.arc(t.x, t.y, t.r * t.life, 0, Math.PI * 2);
        particleCtx.fillStyle = `rgba(196, 148, 255, ${0.55 * t.life})`;
        particleCtx.fill();
      }

      particleRaf = requestAnimationFrame(draw);
    };
    draw();
  }

  function createLetterEl(char, fontSize, x, y, options) {
    const el = document.createElement('span');
    el.className = 'intro-letter';
    el.textContent = char === ' ' ? '\u00A0' : char;
    if (char === ' ') el.classList.add('is-space');
    el.style.fontSize = fontSize + 'px';
    el.style.width = options && options.w ? options.w + 'px' : 'auto';
    el.style.height = fontSize + 'px';
    el.style.setProperty('--x', x + 'px');
    el.style.setProperty('--y', y + 'px');
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    lettersRoot.appendChild(el);
    return el;
  }

  function waitForFall(els) {
    return new Promise((resolve) => {
      if (!els.length) {
        resolve();
        return;
      }
      let remaining = els.length;
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      els.forEach((el) => {
        const onEnd = (e) => {
          if (e.animationName !== 'letterFall') return;
          el.removeEventListener('animationend', onEnd);
          remaining -= 1;
          if (remaining <= 0) done();
        };
        el.addEventListener('animationend', onEnd);
      });
      // Fallback: last delay + duration + buffer
      const lastDelay = 0.25 + (els.length - 1) * 0.16;
      trackTimeout(done, (lastDelay + 1.45) * 1000);
    });
  }

  function preloadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    });
  }

  /** Bake an animation's final state into inline styles, then drop the animation. */
  function commitAnimation(anim, el, styles) {
    Object.assign(el.style, styles);
    if (anim) anim.cancel();
  }

  /**
   * STAGE 3 — the portrait RISES into the composition.
   *
   * It begins completely below the bottom edge of the overlay (whose own
   * overflow clips it), oversized and bright, then travels up into view while
   * shrinking and losing brightness, and settles a touch lower than before so
   * the silhouette reads as having emerged from below the frame and out of the
   * dark. Only the raw PNG silhouette is shown (no circle frame/ring) with a
   * restrained depth shadow, and its lower edge never becomes a hard line: the
   * image keeps its own vertical fade mask, so the shoulders dissolve into the
   * black instead of stopping at a rectangle.
   */
  async function runPortraitReveal() {
    if (!portraitEl) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // 11% smaller than before — this is what opens the breathing space under
    // the heading (the hair sits only 3% down inside the portrait box, so a
    // smaller portrait alone would otherwise bring the hair *closer*).
    const size = Math.max(209, Math.min(vh * 0.65, vw * 0.614, 712));
    const left = vw / 2 - size / 2;
    // Position solved from the gap rather than tuned by eye. The settled
    // heading's lowest glyph sits at ~26.5% of the viewport height (measured
    // from the live lifted glyph boxes) and the crown of the hair begins 3%
    // down inside the portrait box (measured from the PNG's own alpha), so
    // 0.305 - 0.03 gives the hair ~4% of the viewport of clear space below the
    // heading on every screen size. `vh * 0.98 - size` stays as an overflow
    // guard for very short viewports.
    const top = Math.max(
      vh * 0.2,
      Math.min(vh * 0.98 - size, vh * 0.305 - size * 0.03)
    );

    portraitEl.style.width = size + 'px';
    portraitEl.style.height = size + 'px';
    portraitEl.style.left = left + 'px';
    portraitEl.style.top = top + 'px';

    // Lift the settled title so it never overlaps the portrait.
    intro.classList.add('stage-portrait');

    // ENTRANCE — where the portrait comes from. The container (portraitEl) stays
    // at its fixed final dimensions throughout — only position and opacity move.
    // The inner image (portraitImg) starts enlarged and bright, then shrinks and
    // dims independently, so the frame never changes size while the image inside
    // it visibly grows-in.
    const startDepth = 80;
    const depthMag = 1500 / (1500 - startDepth);
    // Starting Y is computed so the portrait's top edge is below the viewport.
    const startY =
      (vh + vh * 0.06 - (top + size / 2)) / depthMag + size / 2;

    const duration = 1100;

    // OUTER container: upward travel + scale (1.25 → 1).
    // Scale is composed into the same transform string so there is no conflict.
    // It uses a slightly softer ease-in-out so the shrink feels cinematic and
    // independent from the movement's ease-out deceleration.
    // Starting at 125% makes the portrait noticeably large on frame 0;
    // it settles at exactly 100% (scale(1)) so no layout dimension changes.
    const startScale = 1.25;
    const rise = portraitEl.animate(
      [
        {
          transform: `perspective(1500px) translate3d(0, ${startY}px, ${startDepth}px) scale(${startScale})`,
          easing: 'cubic-bezier(0.25, 0, 0.2, 1)',
        },
        {
          transform: 'perspective(1500px) translate3d(0, 0, 0) scale(1)',
        },
      ],
      { duration, easing: 'cubic-bezier(0.33, 0, 0.2, 1)', fill: 'forwards' }
    );

    // Opacity runs on its own LINEAR ramp so the fade is clearly visible from
    // the very first frame: the portrait starts barely-there (0.05) and reaches
    // fully opaque (1) exactly when the movement ends.  Keeping this separate
    // prevents the ease-out curve from hiding the fade until the last instant.
    const fadeIn = portraitEl.animate(
      [
        { opacity: 0.05 },
        { opacity: 1 },
      ],
      { duration, easing: 'linear', fill: 'forwards' }
    );

    // INNER image: brightness only (1.5 → 1), composed with the drop-shadow.
    // Scale is handled on the outer container above; animating scale here too
    // would compound them and over-shrink the image.
    const shadowBase =
      'drop-shadow(0 26px 48px rgba(0,0,0,0.62)) drop-shadow(0 0 34px rgba(168,85,247,0.16))';
    let innerAnim = null;
    if (portraitImg) {
      innerAnim = portraitImg.animate(
        [
          { filter: `brightness(1.5) ${shadowBase}` },
          { offset: 0.45, filter: `brightness(1.2) ${shadowBase}` },
          { filter: `brightness(1) ${shadowBase}` },
        ],
        { duration, easing: 'linear', fill: 'forwards' }
      );
    }

    await rise.finished.catch(() => {});
    // Bake the final state into inline styles and cancel both animations so
    // nothing lingers to conflict with the particle dissolution phase.
    fadeIn.cancel();
    commitAnimation(rise, portraitEl, {
      opacity: '1',
      transform: 'none',
    });
    if (innerAnim) {
      commitAnimation(innerAnim, portraitImg, {
        transform: 'none',
        filter: '',   // restore CSS class filter (drop-shadow)
      });
    }
  }

  /** Make sure the destination section sits at its final, un-transformed spot. */
  function settleDestination() {
    const home = document.querySelector('.home.reveal');
    if (home && !home.classList.contains('active')) {
      const prev = home.style.transition;
      home.style.transition = 'none';
      home.classList.add('active');
      void home.offsetWidth; // flush layout at the final position
      home.style.transition = prev;
    }
  }

  /**
   * Bake one of the portrait's CSS mask-image gradients into a canvas pass.
   * `direction` selects which mask is replicated; both are pure alpha ramps,
   * composited with destination-in so sequential passes multiply like the
   * stacked CSS masks do.
   */
  function applyPortraitMask(canvasCtx, w, h, direction) {
    const grad =
      direction === 'vertical'
        ? canvasCtx.createLinearGradient(0, 0, 0, h)
        : canvasCtx.createLinearGradient(0, 0, w, 0);
    if (direction === 'vertical') {
      // .intro-portrait-img mask — 180deg
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.8, 'rgba(0,0,0,1)');
      grad.addColorStop(0.86, 'rgba(0,0,0,0.82)');
      grad.addColorStop(0.91, 'rgba(0,0,0,0.56)');
      grad.addColorStop(0.96, 'rgba(0,0,0,0.30)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      // .intro-portrait wrapper mask — 90deg
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.06, 'rgba(0,0,0,0.4)');
      grad.addColorStop(0.12, 'rgba(0,0,0,0.8)');
      grad.addColorStop(0.2, 'rgba(0,0,0,1)');
      grad.addColorStop(0.8, 'rgba(0,0,0,1)');
      grad.addColorStop(0.88, 'rgba(0,0,0,0.8)');
      grad.addColorStop(0.94, 'rgba(0,0,0,0.4)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
    }
    canvasCtx.globalCompositeOperation = 'destination-in';
    canvasCtx.fillStyle = grad;
    canvasCtx.fillRect(0, 0, w, h);
    canvasCtx.globalCompositeOperation = 'source-over';
  }

  /**
   * STAGE 4 — PARTICLE DISSOLUTION (replaces the old travel/landing hand-off).
   * The complete final composition — settled title + settled intro portrait —
   * is painted into an offscreen source canvas: letters re-drawn with the
   * same font/slots/chrome-gradient/purple glow, the portrait bitmap stamped
   * with its two CSS masks replicated, so the replica is pixel-identical. The
   * DOM layers are hidden in the very frame the replica first shows (no
   * flash), then the painting erodes: each tile lifts off as a drifting
   * fragment drawn from the pristine source canvas (every fragment carries
   * the real composition's pixels) with subtle depth scaling and fade, while
   * the backdrop cross-fades to transparent and the hero — with its own
   * untouched portrait — appears beneath.
   * IMPORTANT: no getImageData/toDataURL anywhere — the local PNG taints
   * canvases on file:// origins and readback would throw; drawImage from a
   * tainted canvas is allowed, so the effect is pixel-real and safe.
   */
  async function runIntroDissolve() {
    if (!portraitEl) return;

    // Hero at its final, un-transformed spot before the dissolution begins.
    settleDestination();

    // Brief hold on the complete composition so the final frame is seen intact.
    await wait(500);

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    /** Paint the visible composition; returns the source canvas or null. */
    const buildSnapshot = () => {
      const snap = document.createElement('canvas');
      snap.width = vw;
      snap.height = vh;
      const sctx = snap.getContext('2d');
      if (!sctx) return null;

      // Title: each settled glyph, same Cinzel 700 metrics and chrome gradient
      // as the DOM letters, plus the purple glow layers baked into the pixels.
      sctx.save();
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.shadowColor = 'rgba(168, 85, 247, 0.55)';
      sctx.shadowBlur = 22;
      for (const el of lettersRoot.querySelectorAll('.intro-letter.is-settled-title')) {
        const ch = el.textContent;
        if (!ch || ch === '\u00A0') continue;
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        const fs = parseFloat(el.style.fontSize) || r.height;
        sctx.font = `700 ${fs}px Cinzel, serif`;
        const g = sctx.createLinearGradient(0, r.top, 0, r.bottom);
        [
          [0, '#3a3a4a'], [0.15, '#1a1a2e'], [0.3, '#252535'], [0.5, '#1a1a2e'],
          [0.7, '#252535'], [0.85, '#1a1a2e'], [1, '#3a3a4a'],
        ].forEach(([o, c]) => g.addColorStop(o, c));
        sctx.fillStyle = g;
        sctx.fillText(ch, r.left + r.width / 2, r.top + r.height / 2);
      }
      sctx.restore();

      // Portrait: the bitmap drawn with object-fit:contain math, masked by its
      // two CSS ramps (masked-away pixels never become fragments), stamped
      // with a faint purple rim glow that mirrors the drop-shadow.
      if (portraitImg && portraitImg.naturalWidth) {
        const rect = portraitEl.getBoundingClientRect();
        if (rect.width > 2) {
          const tmp = document.createElement('canvas');
          tmp.width = Math.max(1, Math.round(rect.width));
          tmp.height = Math.max(1, Math.round(rect.height));
          const tctx = tmp.getContext('2d');
          if (tctx) {
            const nw = portraitImg.naturalWidth;
            const nh = portraitImg.naturalHeight;
            const scale = Math.min(tmp.width / nw, tmp.height / nh);
            const dw = nw * scale;
            const dh = nh * scale;
            tctx.drawImage(portraitImg, (tmp.width - dw) / 2, (tmp.height - dh) / 2, dw, dh);
            applyPortraitMask(tctx, tmp.width, tmp.height, 'vertical');
            applyPortraitMask(tctx, tmp.width, tmp.height, 'horizontal');
            sctx.save();
            sctx.shadowColor = 'rgba(168, 85, 247, 0.30)';
            sctx.shadowBlur = 30;
            sctx.drawImage(tmp, rect.left, rect.top);
            sctx.restore();
          }
        }
      }
      return snap;
    };

    let snap = null;
    try {
      snap = buildSnapshot();
    } catch (err) {
      snap = null; // any unexpected failure → the quiet-fade fallback below
    }
    if (!snap) {
      intro.classList.add('stage-dissolve');
      lettersRoot.style.transition = 'none';
      lettersRoot.style.opacity = '0';
      portraitEl.style.transition = 'none';
      portraitEl.style.opacity = '0';
      await wait(1400);
      return;
    }

    /* ---- Fragment lattice over the composition's actual boxes -------------- */
    // Tiles sit on a uniform grid across every glyph rect and the portrait box
    // — the exact regions the composition occupies. Transparent tiles simply
    // draw nothing, so fragments only ever originate where pixels exist.
    const TILE = 11;
    const boxes = [];
    for (const el of lettersRoot.querySelectorAll('.intro-letter.is-settled-title')) {
      const r = el.getBoundingClientRect();
      if (r.width) boxes.push([r.left, r.top, r.width, r.height, 1]); // keep all text tiles
    }
    const pRect = portraitEl.getBoundingClientRect();
    if (pRect.width > 2) boxes.push([pRect.left, pRect.top, pRect.width, pRect.height, 0.5]);

    const fragments = [];
    const cx = vw / 2;
    const cy = vh / 2;
    for (const [bx, by, bw, bh, keepRatio] of boxes) {
      for (let gy = by; gy < by + bh; gy += TILE) {
        if (gy >= vh) break;
        for (let gx = bx; gx < bx + bw; gx += TILE) {
          const cellX = Math.max(0, Math.min(gx, vw - TILE));
          const cellY = Math.max(0, Math.min(gy, vh - TILE));
          const kept = Math.random() < keepRatio;
          const ang = Math.random() * Math.PI * 2;
          const tx = (cellX + TILE / 2 - cx) / (vw * 0.7);
          const ty = (cellY + TILE / 2 - cy) / (vh * 0.7);
          const z = Math.random() * 2 - 1; // subtle depth: nearer fragments lead
          fragments.push({
            sx: cellX, // pristine source region (never mutated)
            sy: cellY,
            ox: cellX + (Math.random() - 0.5) * 5, // display-origin jitter
            oy: cellY + (Math.random() - 0.5) * 5,
            vx: Math.cos(ang) * 0.5 + tx * 0.9,
            vy: Math.sin(ang) * 0.5 + ty * 0.9 - 0.2,
            dist: (95 + Math.random() * 175) * (0.8 + (z + 1) * 0.4),
            delay: Math.random() * 620,
            z,
            kept, // non-kept tiles still erode — they just fly without a fragment
            erased: false,
          });
        }
      }
    }

    /* ---- Dissolve canvases -------------------------------------------------- */
    // DPR capped at 1.5 for the display canvas: moving fragments gain little
    // from extra resolution while the full-canvas composites per frame are
    // the main cost (notably in software rendering).
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    // Erosion canvas: the replica that loses tiles as their fragments lift.
    const erode = document.createElement('canvas');
    erode.width = vw;
    erode.height = vh;
    const ectx = erode.getContext('2d');
    // Display canvas: what the viewer sees, dpr-scaled for crisp fragments.
    const disp = document.createElement('canvas');
    disp.className = 'intro-dissolve-canvas';
    disp.width = Math.round(vw * dpr);
    disp.height = Math.round(vh * dpr);
    const dctx = disp.getContext('2d');
    if (!ectx || !dctx) return; // nothing to dissolve with; leave intro as-is
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ectx.drawImage(snap, 0, 0); // erosion copy starts identical to the source

    // Replica first, DOM hidden second — one commit, so there is no blank or
    // doubled frame. With transitions disabled the swap is instantaneous and
    // the composition on screen stays identical.
    dctx.drawImage(erode, 0, 0);
    intro.appendChild(disp);
    lettersRoot.style.transition = 'none';
    lettersRoot.style.opacity = '0';
    portraitEl.style.transition = 'none';
    portraitEl.style.opacity = '0';

    // Stop the ambient dust and cross-fade the backdrop to transparent, so the
    // hero is revealed underneath as the fragments drift and dim — no flash.
    stopParticles();
    intro.classList.add('stage-dissolve');

    /* ---- Scatter animation -------------------------------------------------- */
    const HOLD = 340;    // intact composition holds before the first tile lifts
    const SCATTER = 1600;
    const MAXDELAY = 620;
    const TOTAL = HOLD + SCATTER + MAXDELAY;

    let erasedCount = 0;
    await new Promise((resolve) => {
      const t0 = performance.now();
      const loop = (now) => {
        if (finished) {
          resolve();
          return;
        }
        const t = now - t0;
        // Erase every tile whose fragment has lifted (before the blit), so
        // the painting hollows out exactly where its pixels departed.
        if (erasedCount < fragments.length) {
          for (const f of fragments) {
            if (f.erased) continue;
            const lead = t - HOLD - f.delay;
            if (lead > 0) {
              ectx.clearRect(f.sx, f.sy, TILE, TILE);
              f.erased = true;
              erasedCount++;
            }
          }
          dctx.clearRect(0, 0, vw, vh);
          dctx.drawImage(erode, 0, 0); // the eroding composition…
        }
        // …then the airborne fragments on top.
        const ease = (k) => 1 - Math.pow(1 - k, 3); // ease-out cubic
        for (const f of fragments) {
          if (!f.kept) continue; // eroded silently, no airborne fragment
          const local = t - HOLD - f.delay;
          if (local <= 0 || !f.erased) continue;
          const k = Math.min(1, local / SCATTER);
          const e = ease(k);
          const a = Math.pow(1 - k, 1.1);
          if (a <= 0.015) continue;
          const drift = e * f.dist;
          const x = f.ox + f.vx * drift;
          const y = f.oy + f.vy * drift;
          // Subtle depth: scale breathing driven by the fragment's z value.
          const s = Math.max(0.5, TILE * 0.92 * (1 - 0.35 * e) * (1 + f.z * 0.35 * e));
          dctx.globalAlpha = a;
          dctx.drawImage(snap, f.sx, f.sy, TILE, TILE,
            x - s / 2, y - s / 2, s, s);
        }
        dctx.globalAlpha = 1;
        if (t < TOTAL) {
          dissolveRaf = requestAnimationFrame(loop);
        } else {
          resolve();
        }
      };
      dissolveRaf = requestAnimationFrame(loop);
    });

    /* ---- Cleanup ------------------------------------------------------------ */
    if (dissolveRaf) {
      cancelAnimationFrame(dissolveRaf);
      dissolveRaf = null;
    }
    disp.remove();
    erode.width = 1;
    erode.height = 1;
    snap.width = 1;
    snap.height = 1;
  }

  /**
   * Progressive character transformation from ISHAAN → PORTFOLIO
   * The visible word changes character by character through intermediate states
   */
  function runMorph(fromEls, fromSlots, toSlots, plan) {
    return new Promise((resolve) => {
      // Each character keeps the same 190ms 3D flip, but the dead pause
      // between characters is removed so the whole morph reads as one
      // continuous flow (~1.8s total instead of ~3.2s).
      const changeInterval = 11; // 11ms breather between character flips
      const flipDuration = 190; // Each character flip takes 190ms (unchanged)

      // Define the transformation sequence
      const wordSequence = [
        'ISHAAN',
        'PSHAAN',
        'POHAAN',
        'PORHAAN',
        'PORTAAN',
        'PORTFAN',
        'PORTFON',
        'PORTFOL',
        'PORTFOLI',
        'PORTFOLIO'
      ];

      // The glyph row is kept alive between steps. Rebuilding it at the next
      // word's centred coordinates made every already-placed letter jump
      // sideways in a single frame (measured: up to 34px in one frame, with the
      // letter gaps switching 13.6px -> 16.3px in one step). Sliding the
      // existing glyphs to their new slots keeps the spacing continuous.
      let els = [];
      let laid = [];

      // Function to render a word at current center position
      function renderWord(word, fontSize, trackingEm) {
        const slots = measureWordLayout(word, fontSize, trackingEm);
        lettersRoot.innerHTML = '';
        lettersRoot.setAttribute('aria-label', word);

        slots.forEach((slot) => {
          const el = createLetterEl(slot.char, slot.fontSize, slot.x, slot.y, {
            w: slot.w,
          });
          el.style.opacity = '1';
          el.style.transform = `translate3d(${slot.x}px, ${slot.y}px, 0)`;
          el.classList.add('is-settled-title');
        });
        els = Array.from(lettersRoot.children);
        laid = slots;
      }

      /**
       * Move the glyphs already on screen onto `word`'s centred layout.
       * `flipIndex` (optional) is the one glyph that changes letter; the rest
       * simply travel to their new slots so the row's spacing stays continuous.
       * Characters appended at the end are revealed by the same flip instead of
       * being skipped, which removes the dead pause after "L".
       */
      function relayout(word, fontSize, trackingEm, flipIndex) {
        const slots = measureWordLayout(word, fontSize, trackingEm);
        const halfDuration = flipDuration / 2;
        const fromSlot = flipIndex == null ? null : laid[flipIndex];

        slots.forEach((slot, idx) => {
          let el = els[idx];
          if (!el) {
            // Newly appended letter (…L -> …LI -> …LIO).
            el = createLetterEl(slot.char, slot.fontSize, slot.x, slot.y, {
              w: slot.w,
            });
            el.classList.add('is-settled-title');
            els[idx] = el;
          }

          if (idx === flipIndex) {
            // The previous glyph turns edge-on where it already stands, swaps
            // its letter while it is both edge-on and invisible, then flies to
            // its new slot as it turns back into view — so the swap is never
            // visible and the letter arrives with the rest of the row.
            el.style.transition = `transform ${halfDuration}ms ease-in-out, opacity ${halfDuration}ms ease-in-out`;
            el.style.transform = `translate3d(${fromSlot ? fromSlot.x : slot.x}px, ${slot.y}px, 0) rotateX(90deg)`;
            el.style.opacity = '0';

            setTimeout(() => {
              el.textContent = slot.char;
              el.style.width = slot.w + 'px';
              el.style.transform = `translate3d(${slot.x}px, ${slot.y}px, 0) rotateX(0deg)`;
              el.style.opacity = '1';
            }, halfDuration);
          } else {
            el.style.transition = `transform ${flipDuration}ms ease-in-out`;
            el.style.transform = `translate3d(${slot.x}px, ${slot.y}px, 0)`;
            el.textContent = slot.char;
            el.style.opacity = '1';
          }
        });

        lettersRoot.setAttribute('aria-label', word);
        laid = slots;
      }

      // Function to animate a single character change with the 3D flip.
      function flipCharacter(prevWord, nextWord, charIndex, fontSize, trackingEm) {
        return new Promise((resolve) => {
          relayout(nextWord, fontSize, trackingEm, charIndex);
          setTimeout(resolve, flipDuration);
        });
      }

      // Start the progressive transformation
      async function transformSequence() {
        const fontSize = fromSlots[0].fontSize;
        const trackingEm = 0.1; // Use ISHAAN's tracking during transformation

        // ISHAAN is already visible from falling animation
        // Just ensure it's rendered correctly
        renderWord(wordSequence[0], fontSize, trackingEm);

        // No hold here — the falling animation has already settled, so the
        // morph starts immediately (the letters are at these exact positions).

        // Progressively transform through the sequence
        for (let i = 1; i < wordSequence.length; i++) {
          const prevWord = wordSequence[i - 1];
          const nextWord = wordSequence[i];

          // Find which character changed
          let changedIndex = -1;
          for (let j = 0; j < Math.max(prevWord.length, nextWord.length); j++) {
            if (prevWord[j] !== nextWord[j]) {
              changedIndex = j;
              break;
            }
          }

          if (changedIndex !== -1) {
            // Flip the changed character with 3D effect (handles characters
            // appended at the end, e.g. the final I and O).
            await flipCharacter(prevWord, nextWord, changedIndex, fontSize, trackingEm);
          } else {
            // Word length changed, render the new word
            renderWord(nextWord, fontSize, trackingEm);
          }

          // Wait before next change
          if (i < wordSequence.length - 1) {
            await wait(changeInterval);
          }
        }

        // Final render with tighter tracking for PORTFOLIO
        const finalTracking = window.innerWidth < 768 ? 0.08 : 0.12;
        renderWord(TO_WORD, fontSize, finalTracking);
        lettersRoot.setAttribute('aria-label', TO_WORD);

        resolve();
      }

      transformSequence();
    });
  }

  async function runSequence() {
    // Start loading the portrait immediately so STAGE 3 never shows a blank image.
    const portraitReady = preloadImage(PORTRAIT_SRC);

    setupParticles();

    // Wait a frame for Cinzel to be available for measurement
    await wait(40);
    await document.fonts.ready.catch(() => {});

    const nameSize = getNameFontSize();
    const titleSize = getTitleFontSize();
    const fromSlots = measureWordLayout(FROM_WORD, nameSize, 0.1);
    const toSlots = measureWordLayout(TO_WORD, titleSize, getTitleTracking());

    // STAGE 1 — create letters off-screen and fall into place
    const fromEls = fromSlots.map((slot, i) => {
      const el = createLetterEl(slot.char, slot.fontSize, slot.x, slot.y, {
        w: slot.w,
      });
      el.style.setProperty('--fall-delay', `${0.25 + i * 0.16}s`);
      el.classList.add('is-falling');
      return el;
    });
    lettersRoot.setAttribute('aria-label', FROM_WORD);

    // waitForFall resolves on the last letter's letterFall animationend, i.e.
    // exactly when it has landed and settled — so the morph begins immediately.
    await waitForFall(fromEls);

    // STAGE 2 — progressive character transformation from ISHAAN to PORTFOLIO
    const plan = buildMorphPlan(fromSlots, toSlots);
    await runMorph(fromEls, fromSlots, toSlots, plan);

    // STAGE 3 — the portrait rises from below the frame into its resting spot
    await portraitReady;
    await runPortraitReveal();

    // STAGE 4 — the whole final composition disintegrates into particles,
    // revealing the hero beneath (no travel/landing into the hero's photo).
    await runIntroDissolve();

    finishIntro();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      requestAnimationFrame(() => runSequence());
    });
  } else {
    requestAnimationFrame(() => runSequence());
  }
})();

// Typed.js for Home section
var typed = new Typed(".text", {
    strings: ["FullStack Developer", "Data Analyst", "Software Engineer"],
    typeSpeed: 100,
    backSpeed: 60,
    backDelay: 1000,
    loop: true
});

// Cursor Glow Effect
const cursorGlow = document.querySelector('.cursor-glow');
document.addEventListener('mousemove', (e) => {
    if (!cursorGlow) return;
    cursorGlow.style.left = e.clientX + 'px';
    cursorGlow.style.top = e.clientY + 'px';
});

// Scroll Reveal with Intersection Observer
const revealElements = document.querySelectorAll('.reveal');

const revealCallback = (entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
        }
    });
};

const revealOptions = {
    threshold: 0.15,
    rootMargin: "0px 0px -50px 0px"
};

const revealObserver = new IntersectionObserver(revealCallback, revealOptions);

revealElements.forEach(el => {
    revealObserver.observe(el);
});

// Active Navigation Link Update on Scroll
const sections = document.querySelectorAll('section');
const navLinks = document.querySelectorAll('.navbar a');

window.addEventListener('scroll', () => {
    let current = '';
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (scrollY >= (sectionTop - 200)) {
            current = section.getAttribute('id');
        }
    });

    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href').includes(current)) {
            link.classList.add('active');
        }
    });
});

/* ========================================
   PREMIUM 3D CARD INTERACTION  (main portfolio only)

   Drives every .tilt-card from the data-tilt / data-tilt-max /
   data-tilt-axis / data-tilt-max-glare attributes that index.html already
   declares. It only writes two things:
     1. the card's own perspective/rotate/scale transform, and
     2. the --mx / --my custom properties that position the surface
        highlight (all the visuals live in style.css).
   One rAF loop runs per card and only while that card is being animated.
   Skipped entirely for prefers-reduced-motion and for touch-only pointers.
   The cinematic intro is not touched by any of this.

   Certification cards and project cards are excluded here. A certificate
   flies toward the centre of its grid (initCertFly, below) and a project
   showcase pushes its image plane forward (style.css section 5); neither
   of them tilts, so neither is driven from this engine.
   ======================================== */
(function initTiltCards() {
  const cards = Array.prototype.filter.call(
    document.querySelectorAll('[data-tilt]'),
    function (card) {
      return !card.closest('.cert-container') &&
             !card.closest('.projects-container');
    }
  );
  if (!cards.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (reduceMotion.matches || !finePointer.matches) return;

  const EASE = 0.16;        // per-frame approach factor (smooth, no easing lib)
  const REST_SCALE = 1.02;  // gentle hover lift

  cards.forEach(function (card) {
    const maxTilt = parseFloat(card.getAttribute('data-tilt-max')) || 7;
    const axis = card.getAttribute('data-tilt-axis') || 'both';
    const rotateXOnly = axis === 'x';  // data-tilt-axis="x"  -> rotateX only
    const rotateYOnly = axis === 'y';  // data-tilt-axis="y"  -> rotateY only

    let rect = null;
    let raf = null;
    let active = false;
    let targetX = 0, targetY = 0;   // desired rotation
    let currentX = 0, currentY = 0; // rendered rotation
    let scale = 1, targetScale = 1;

    function paint() {
      currentX += (targetX - currentX) * EASE;
      currentY += (targetY - currentY) * EASE;
      scale += (targetScale - scale) * EASE;

      const settledX = Math.abs(targetX - currentX) < 0.02;
      const settledY = Math.abs(targetY - currentY) < 0.02;
      const settledS = Math.abs(targetScale - scale) < 0.002;
      if (settledX) currentX = targetX;
      if (settledY) currentY = targetY;
      if (settledS) scale = targetScale;

      card.style.transform =
        'perspective(1000px) ' +
        'rotateX(' + currentX.toFixed(3) + 'deg) rotateY(' +
        currentY.toFixed(3) + 'deg) scale3d(' + scale.toFixed(4) + ',' + scale.toFixed(4) + ',1)';

      if (settledX && settledY && settledS && !active) {
        card.classList.remove('is-tilting');
        card.style.transform = '';
        raf = null;
        return;
      }
      raf = requestAnimationFrame(paint);
    }

    function run() {
      if (raf === null) raf = requestAnimationFrame(paint);
    }

    function onEnter(e) {
      if (e.pointerType === 'touch') return;
      rect = card.getBoundingClientRect();
      active = true;
      targetScale = REST_SCALE;
      card.classList.add('is-tilting');
      onMove(e);
    }

    function onMove(e) {
      if (!active || !rect || !rect.width) return;

      const px = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const py = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));

      card.style.setProperty('--mx', (px * 100).toFixed(2) + '%');
      card.style.setProperty('--my', (py * 100).toFixed(2) + '%');

      const dx = (px - 0.5) * 2;  // -1 .. 1
      const dy = (py - 0.5) * 2;

      targetY = rotateXOnly ? 0 : dx * maxTilt;
      targetX = rotateYOnly ? 0 : -dy * maxTilt;
      run();
    }

    function onLeave() {
      active = false;
      targetX = 0;
      targetY = 0;
      targetScale = 1;
      run();
    }

    card.addEventListener('pointerenter', onEnter, { passive: true });
    card.addEventListener('pointermove', onMove, { passive: true });
    card.addEventListener('pointerleave', onLeave, { passive: true });
  });
})();

/* ========================================
   CERTIFICATION FOCUS FLY  (certifications only)

   One interaction no other card in the site has. Hovering a certification
   card brings it forward toward the viewer AND slides it toward the
   horizontal centre of the grid, so a card on the left flies in from the
   left, a card on the right flies in from the right and a card already on
   the centre line simply comes straight forward — the certificate is
   lifted off the grid and held up in front of you.

   The travel is derived from the card's live position inside the grid at
   the moment of hover, so nothing is hard-coded and the effect re-derives
   itself when the grid reflows from three columns to two to one.

   Hover is tracked on the container and hit-tested against the cards'
   LAYOUT boxes (offsetLeft / offsetTop are immune to transforms). A card
   that slides out from under the cursor would otherwise drop :hover the
   instant it moved and flicker back and forth; testing the original
   footprint keeps the card forward until the pointer genuinely leaves it.
   Skipped for prefers-reduced-motion and for touch-only pointers.

   The card does NOT rotate. The fly-forward toward the grid centre and the
   viewer is the only transform this interaction ever writes — there is no
   pointer-driven rotateX/rotateY and no second animation competing with the
   movement.
   ======================================== */
(function initCertFly() {
  const container = document.querySelector('.cert-container');
  if (!container) return;

  const cards = Array.prototype.slice.call(
    container.querySelectorAll('[data-tilt]')
  );
  if (!cards.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (reduceMotion.matches || !finePointer.matches) return;

  const EASE = 0.16;    // per-frame approach factor (smooth settle, no easing lib)
  const SCALE = 1.05;   // extra size on top of the perspective growth
  const FACTOR = 0.42;  // how much of the run to the grid centre is travelled
  const MAX_FLY = 150;  // px cap, so a very wide grid cannot throw a card away

  // Signed horizontal distance from the card's centre to the grid's centre,
  // in untransformed layout coordinates: positive => the card sits left of
  // centre and therefore flies to the right.
  function runToCentre(card) {
    return container.clientWidth / 2 - (card.offsetLeft + card.offsetWidth / 2);
  }

  function makeEngine(card) {
    const depth = parseFloat(card.getAttribute('data-tilt-lift')) || 90;
    let raf = null;
    let focused = false;
    let scale = 1, targetScale = 1;
    let z = 0, targetZ = 0;
    let fly = 0, targetFly = 0;

    function frame() {
      scale += (targetScale - scale) * EASE;
      z += (targetZ - z) * EASE;
      fly += (targetFly - fly) * EASE;

      const settledS = Math.abs(targetScale - scale) < 0.002;
      const settledZ = Math.abs(targetZ - z) < 0.5;
      const settledF = Math.abs(targetFly - fly) < 0.5;
      if (settledS) scale = targetScale;
      if (settledZ) z = targetZ;
      if (settledF) fly = targetFly;

      // One transform, one gesture. Order matters: the slide toward the grid
      // centre happens on the surface plane, then the card is pushed along
      // the view axis so it genuinely travels toward the viewer. No rotation
      // term is written, so nothing here can change the card's angle.
      card.style.transform =
        'perspective(1000px) ' +
        'translate3d(' + fly.toFixed(2) + 'px, 0px, 0px) ' +
        'translateZ(' + z.toFixed(2) + 'px) ' +
        'scale3d(' + scale.toFixed(4) + ',' + scale.toFixed(4) + ',1)';

      if (settledS && settledZ && settledF && !focused) {
        card.classList.remove('is-tilting');
        card.style.transform = '';
        raf = null;
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function run() {
      if (raf === null) raf = requestAnimationFrame(frame);
    }

    return {
      focus: function () {
        if (focused) return;
        focused = true;
        targetScale = SCALE;
        targetZ = depth;
        targetFly = Math.max(
          -MAX_FLY,
          Math.min(MAX_FLY, runToCentre(card) * FACTOR)
        );
        card.classList.add('is-tilting');
        run();
      },
      rest: function () {
        focused = false;
        targetScale = 1;
        targetZ = 0;
        targetFly = 0;
        run();
      }
    };
  }

  const engines = new Map();
  cards.forEach(function (card) {
    engines.set(card, makeEngine(card));
  });

  let activeCard = null;

  // Which card owns this pointer position — judged against the cards' layout
  // boxes, never their transformed rendering.
  function cardAt(x, y) {
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (
        x >= c.offsetLeft && x <= c.offsetLeft + c.offsetWidth &&
        y >= c.offsetTop && y <= c.offsetTop + c.offsetHeight
      ) {
        return c;
      }
    }
    return null;
  }

  container.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    const box = container.getBoundingClientRect();
    const hit = cardAt(
      e.clientX - box.left - container.clientLeft,
      e.clientY - box.top - container.clientTop
    );
    if (hit !== activeCard) {
      if (activeCard) engines.get(activeCard).rest();
      activeCard = hit;
    }
    if (hit) engines.get(hit).focus();
  }, { passive: true });

  function release() {
    if (activeCard) {
      engines.get(activeCard).rest();
      activeCard = null;
    }
  }
  container.addEventListener('pointerleave', release, { passive: true });
  container.addEventListener('pointercancel', release, { passive: true });
})();

/* ------------------------------------------------------------------
   Background video resilience (the fixed non-hero layer in index.html)
   - Chromium can hold `autoplay` until a user gesture or until the
     element is attached late, so an explicit play() is attempted once
     the metadata is ready and again on the first pointer interaction.
   - If playback is blocked or the file fails to load/decode, the error
     handler hides the <video> and the layer's static dark gradient
     (its built-in fallback) stays on screen — no broken frame, no
     console spam loop.
   - The tab-hidden pause is a pure battery/CPU win; the video resumes
     with the same muted loop when the tab returns.
   ------------------------------------------------------------------ */
(function initSiteVideo() {
  const layer = document.querySelector('.site-video-bg');
  const video = layer && layer.querySelector('.site-video-bg__video');
  if (!video) return;

  const hideBroken = () => { video.style.display = 'none'; };

  // No movement at all when the user asked for reduced motion: the CSS
  // hides the element, but stop it here too so it never decodes frames.
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const applyMotionPreference = () => {
    if (motionQuery.matches) {
      video.pause();
      video.removeAttribute('autoplay');
    } else {
      video.setAttribute('autoplay', '');
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  };

  video.addEventListener('error', hideBroken);
  video.addEventListener('loadedmetadata', () => {
    const p = video.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  });

  // Second chance on the first gesture, for browsers that ignore
  // programmatic muted autoplay until interaction.
  const nudge = () => {
    if (video.paused && !motionQuery.matches) {
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  };
  window.addEventListener('pointerdown', nudge, { once: true, passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      video.pause();
    } else if (!motionQuery.matches && video.style.display !== 'none') {
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  });

  if (typeof motionQuery.addEventListener === 'function') {
    motionQuery.addEventListener('change', applyMotionPreference);
  }
  applyMotionPreference();
})();

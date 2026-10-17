/* ========================================
   CINEMATIC INTRO
   ISHAAN → PORTFOLIO → galaxy + photo → curtain reveal
   Plays on every full page reload; respects prefers-reduced-motion
   ======================================== */
(function initCinematicIntro() {
  const FROM_WORD = 'ISHAAN';
  const TO_WORD = 'PORTFOLIO';

  const intro = document.getElementById('cinematic-intro');
  const canvas = document.getElementById('intro-particles');
  const lettersRoot = document.getElementById('intro-letters');
  const galaxyRoot = document.getElementById('intro-galaxy');
  const galaxyCanvas = document.getElementById('intro-galaxy-canvas');
  const galaxyPortrait = document.getElementById('intro-galaxy-portrait');

  if (!intro || !lettersRoot) return;

  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const timers = [];
  let particleRaf = null;
  let morphRaf = null;
  let galaxyRaf = null;
  let ambientParticles = [];
  let trailParticles = [];
  let galaxyParticles = [];
  let particleCtx = null;
  let galaxyCtx = null;
  let onResize = null;
  let onGalaxyResize = null;
  let finished = false;

  function trackTimeout(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  function wait(ms) {
    return new Promise((resolve) => trackTimeout(resolve, ms));
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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

  function stopGalaxy() {
    if (galaxyRaf) cancelAnimationFrame(galaxyRaf);
    galaxyRaf = null;
    galaxyParticles = [];
    if (galaxyCtx && galaxyCanvas) {
      galaxyCtx.clearRect(0, 0, galaxyCanvas.width, galaxyCanvas.height);
    }
  }

  function cleanupListeners() {
    if (onResize) {
      window.removeEventListener('resize', onResize);
      onResize = null;
    }
    if (onGalaxyResize) {
      window.removeEventListener('resize', onGalaxyResize);
      onGalaxyResize = null;
    }
    timers.forEach(clearTimeout);
    timers.length = 0;
  }

  function finishIntro() {
    if (finished) return;
    finished = true;
    stopParticles();
    stopMorph();
    stopGalaxy();
    cleanupListeners();
    document.documentElement.classList.remove('intro-pending');
    document.documentElement.classList.add('intro-done');
    document.body.classList.remove('intro-active');
    intro.className = 'cinematic-intro';
    intro.setAttribute('hidden', '');
    intro.setAttribute('aria-hidden', 'true');
    if (galaxyRoot) {
      galaxyRoot.classList.remove('is-active');
      galaxyRoot.setAttribute('aria-hidden', 'true');
    }
    if (galaxyPortrait) {
      galaxyPortrait.classList.remove('is-formed', 'is-revealing', 'is-visible');
    }
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

  function waitForCurtain() {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        intro.removeEventListener('animationend', onEnd);
        resolve();
      };
      const onEnd = (e) => {
        if (e.target === intro && e.animationName === 'curtainReveal') done();
      };
      intro.addEventListener('animationend', onEnd);
      trackTimeout(done, 1400);
    });
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
      }

      // Function to animate a single character change with the 3D flip.
      // Renders the NEXT word's layout so growing words (…L → …LI → …LIO)
      // keep their correct length and centering at every step. Characters
      // appended at the end are revealed by the same flip instead of being
      // skipped, which removes the dead pause after "L".
      function flipCharacter(prevWord, nextWord, charIndex, fontSize, trackingEm) {
        return new Promise((resolve) => {
          const halfDuration = flipDuration / 2;
          const slots = measureWordLayout(nextWord, fontSize, trackingEm);
          const isBorn = charIndex >= prevWord.length; // newly appended letter

          lettersRoot.innerHTML = '';
          slots.forEach((slot, idx) => {
            const el = createLetterEl(slot.char, slot.fontSize, slot.x, slot.y, {
              w: slot.w,
            });

            if (idx === charIndex) {
              // The previous glyph flips away, the new one flips in. A born
              // letter has no predecessor, so it simply flips into place.
              el.textContent = isBorn ? slot.char : prevWord[charIndex];
              el.style.transition = `transform ${halfDuration}ms ease-in-out, opacity ${halfDuration}ms ease-in-out`;
              el.style.transform = `translate3d(${slot.x}px, ${slot.y}px, 0) rotateX(90deg)`;
              el.style.opacity = '0';

              setTimeout(() => {
                el.textContent = slot.char;
                el.style.transform = `translate3d(${slot.x}px, ${slot.y}px, 0) rotateX(0deg)`;
                el.style.opacity = '1';
              }, halfDuration);
            } else {
              el.style.opacity = '1';
              el.style.transform = `translate3d(${slot.x}px, ${slot.y}px, 0)`;
            }
            el.classList.add('is-settled-title');
          });

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

        // Wait a moment before starting transformation
        await wait(400);

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

  /**
   * Galaxy particles swirl in the space below the title and converge into a
   * FACE-ONLY particle portrait sampled from the photo's face region
   * (window.__INTRO_FACE).
   * The original photograph is never displayed — every point is drawn from
   * the sampled face pixels, so features, glasses and hair stay recognisable.
   */
  function runGalaxyReveal() {
    return new Promise((resolve) => {
      if (!galaxyRoot || !galaxyCanvas || !galaxyPortrait) {
        resolve();
        return;
      }

      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      // ---- Face particle source generated from the real photograph ----
      const src = window.__INTRO_FACE;
      let face = null;
      if (src && src.b64) {
        try {
          const bin = atob(src.b64);
          const buf = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
          face = {
            buf: buf,
            n: Math.floor(buf.length / 5), // x,y,r,g,b per point
            aspect: src.aspect || 0.608,
          };
        } catch (e) {
          face = null;
        }
      }
      // No source available: skip cleanly (never fall back to the photo).
      if (!face || !face.n) {
        done();
        return;
      }

      galaxyCtx = galaxyCanvas.getContext('2d');
      if (!galaxyCtx) {
        done();
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const resizeGalaxy = () => {
        galaxyCanvas.width = Math.floor(window.innerWidth * dpr);
        galaxyCanvas.height = Math.floor(window.innerHeight * dpr);
        galaxyCanvas.style.width = window.innerWidth + 'px';
        galaxyCanvas.style.height = window.innerHeight + 'px';
        galaxyCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      resizeGalaxy();
      onGalaxyResize = resizeGalaxy;
      window.addEventListener('resize', onGalaxyResize, { passive: true });

      intro.classList.add('stage-galaxy');
      galaxyRoot.classList.add('is-active');
      galaxyRoot.setAttribute('aria-hidden', 'false');

      const isSmall = () => window.innerWidth < 768;
      // Face geometry — mirrors .intro-galaxy-portrait in style.css.
      // faceTop sits below the lifted PORTFOLIO title; faceH is capped by the
      // remaining viewport height so the full head-to-collar always fits.
      const faceTop = () => window.innerHeight * 0.4;
      const faceH = () => {
        const vh = window.innerHeight;
        const avail = vh - faceTop() - vh * 0.04; // keep a bottom margin
        return Math.min(vh * 0.6, avail, isSmall() ? 540 : 620);
      };
      const faceW = () => faceH() * face.aspect;
      const cx = () => window.innerWidth * 0.5;

      // White / silver / subtle-blue seeds for the swirling galaxy.
      const seeds = [
        [255, 255, 255],
        [220, 230, 250],
        [180, 210, 255],
        [160, 185, 240],
      ];

      // One particle per sampled face pixel (sub-sampled on small screens).
      const stride = isSmall() ? 2 : 1;
      galaxyParticles = [];

      for (let i = 0; i < face.n; i += stride) {
        const o = i * 5;
        const seed = seeds[(i + (i >> 3)) % seeds.length];
        const sx = Math.random() * window.innerWidth;
        const sy = window.innerHeight * (0.2 + Math.random() * 0.8);
        
        // Add small jitter to targets to break the grid look.
        const jitter = (Math.random() - 0.5) * 1.8;

        galaxyParticles.push({
          nx: face.buf[o] / 255, // 0..1 across the face box
          ny: face.buf[o + 1] / 255, // 0..1 down the face box
          tr: face.buf[o + 2], 
          tg: face.buf[o + 3], 
          tb: face.buf[o + 4], 
          sr: seed[0],
          sg: seed[1],
          sb: seed[2],
          sx: sx,
          sy: sy,
          x: sx,
          y: sy,
          delay: Math.random() * 0.35, // slightly longer stagger
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.035,
          radius: Math.random() * 1.6 + 0.8,
          a: Math.random() * 0.5 + 0.5,
          phase: Math.random() * Math.PI * 2,
          tx: 0,
          ty: 0,
          jitterX: jitter,
          jitterY: jitter * 0.8,
        });
      }

      function refreshTargets() {
        const w = faceW();
        const h = faceH();
        const left = cx() - w / 2;
        const top = faceTop();
        for (const p of galaxyParticles) {
          p.tx = left + p.nx * w + p.jitterX;
          p.ty = top + p.ny * h + p.jitterY;
        }
      }
      refreshTargets();

      const start = performance.now();
      const GATHER_MS = 2200; // slightly slower for cinematic feel
      const HOLD_MS = 2000;   // 2 second hold as requested
      const END_MS = GATHER_MS + HOLD_MS;
      let formed = false;

      const tick = (now) => {
        if (finished) {
          done();
          return;
        }
        const elapsed = now - start;
        const gatherT = Math.min(1, elapsed / GATHER_MS);
        const ease = easeInOutCubic(gatherT);
        const W = window.innerWidth;
        const H = window.innerHeight;

        galaxyCtx.clearRect(0, 0, W, H);

        // Faint nebula centred on the forming face (never a rectangle).
        const fh = faceH();
        const grd = galaxyCtx.createRadialGradient(
          cx(),
          faceTop() + fh * 0.45,
          20,
          cx(),
          faceTop() + fh * 0.45,
          Math.max(fh * 0.85, 250)
        );
        grd.addColorStop(0, `rgba(110, 100, 200, ${0.12 * ease})`);
        grd.addColorStop(0.5, `rgba(60, 90, 160, ${0.08 * ease})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        galaxyCtx.fillStyle = grd;
        galaxyCtx.fillRect(0, 0, W, H);

        for (const p of galaxyParticles) {
          p.angle += p.spin;

          const lt =
            gatherT <= p.delay ? 0 : Math.min(1, (gatherT - p.delay) / (1 - p.delay));
          const e = easeInOutCubic(lt);

          const swirlX = Math.cos(p.angle + p.phase) * 35 * (1 - e);
          const swirlY = Math.sin(p.angle * 1.2 + p.phase) * 25 * (1 - e);
          p.x = p.sx + (p.tx - p.sx) * e + swirlX;
          p.y = p.sy + (p.ty - p.sy) * e + swirlY;

          const cr = (p.sr + (p.tr - p.sr) * e) | 0;
          const cg = (p.sg + (p.tg - p.sg) * e) | 0;
          const cb = (p.sb + (p.tb - p.sb) * e) | 0;

          let alpha = p.a * (0.4 + e * 0.6);
          if (gatherT >= 1) {
            alpha *= 0.75 + 0.25 * Math.sin(now * 0.0035 + p.phase);
          }

          galaxyCtx.beginPath();
          galaxyCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          galaxyCtx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
          galaxyCtx.fill();
        }

        if (!formed && elapsed >= GATHER_MS) {
          formed = true;
          galaxyPortrait.classList.add('is-formed'); 
        }

        if (elapsed >= END_MS) {
          // Do NOT call stopGalaxy() here — let the face stay visible 
          // during the stage-reveal curtain animation.
          done();
          return;
        }

        galaxyRaf = requestAnimationFrame(tick);
      };

      galaxyRaf = requestAnimationFrame(tick);
      // Safety unlock
      trackTimeout(() => {
        if (!settled) {
          stopGalaxy();
          done();
        }
      }, END_MS + 1200);
    });
  }

  async function runSequence() {
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

    await waitForFall(fromEls);
    await wait(550); // brief hold on ISHAAN

    // STAGE 2 — progressive character transformation from ISHAAN to PORTFOLIO
    const plan = buildMorphPlan(fromSlots, toSlots);
    await runMorph(fromEls, fromSlots, toSlots, plan);
    await wait(750); // hold PORTFOLIO

    // STAGE 3 — galaxy converge + actual photo materialize (intro-only)
    await runGalaxyReveal();

    // STAGE 4 — curtain reveal into existing portfolio
    intro.classList.remove('stage-galaxy');
    intro.classList.add('stage-reveal');
    await waitForCurtain();
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

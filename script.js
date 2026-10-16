/* ========================================
   CINEMATIC INTRO
   ISHAAN falls → letter morph → PORTFOLIO → curtain reveal
   Plays on every full page reload; respects prefers-reduced-motion
   ======================================== */
(function initCinematicIntro() {
  const FROM_WORD = 'ISHAAN';
  const TO_WORD = 'PORTFOLIO';

  const intro = document.getElementById('cinematic-intro');
  const canvas = document.getElementById('intro-particles');
  const lettersRoot = document.getElementById('intro-letters');

  if (!intro || !lettersRoot) return;

  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const timers = [];
  let particleRaf = null;
  let morphRaf = null;
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
    // PORTFOLIO should be the same size as ISHAAN for visual prominence
    const w = window.innerWidth;
    if (w < 480) return Math.max(42, w * 0.14);
    if (w < 768) return Math.min(72, w * 0.13);
    return Math.min(136, w * 0.11);
  }

  function getTitleTracking() {
    // Tighter spacing for PORTFOLIO (9 letters) to fit at same size as ISHAAN (6 letters)
    return window.innerWidth < 768 ? 0.08 : 0.12;
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
    cleanupListeners();
    document.documentElement.classList.remove('intro-pending');
    document.documentElement.classList.add('intro-done');
    document.body.classList.remove('intro-active');
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
   * In-place letter-by-letter morph from ISHAAN → PORTFOLIO
   * Letters transform at their current position without flying across screen
   */
  function runMorph(fromEls, fromSlots, toSlots, plan) {
    return new Promise((resolve) => {
      const letterInterval = 300; // 300ms between letter changes
      const morphDuration = 400; // Each letter takes 400ms to transform
      const actors = [];

      // Clear all existing letters and recreate them at PORTFOLIO positions
      // This ensures the word stays centered as it grows from 6 to 9 letters
      lettersRoot.innerHTML = '';

      // Create all PORTFOLIO letters initially hidden
      const toEls = toSlots.map((slot, idx) => {
        const el = createLetterEl(slot.char, slot.fontSize, slot.x, slot.y, {
          w: slot.w,
        });
        el.style.opacity = '0';
        el.style.transform = `translate3d(${slot.x}px, ${slot.y}px, 0) scale(0.8)`;
        el.style.filter = 'blur(4px)';
        el.classList.add('is-morphing');
        return el;
      });

      // Animate each letter appearing one by one at its final position
      toEls.forEach((el, idx) => {
        const slot = toSlots[idx];
        const delay = idx * letterInterval;

        actors.push({
          el,
          kind: 'appear',
          endX: slot.x,
          endY: slot.y,
          endSize: slot.fontSize,
          endW: slot.w,
          delay,
          duration: morphDuration,
        });
      });

      lettersRoot.setAttribute('aria-label', TO_WORD);
      const start = performance.now();
      let resolved = false;

      const tick = (now) => {
        if (finished) return;
        const elapsed = now - start;
        let allDone = true;

        for (const actor of actors) {
          const local = elapsed - actor.delay;
          if (local < 0) {
            allDone = false;
            continue;
          }

          const rawT = Math.min(1, local / actor.duration);
          if (rawT < 1) allDone = false;

          const t = easeOutBack(rawT);

          // Animate from small/blurry to full size/crisp
          const scale = 0.8 + t * 0.2;
          const blur = 4 * (1 - t);
          const opacity = Math.min(1, rawT * 2);

          actor.el.style.opacity = String(opacity);
          actor.el.style.transform = `translate3d(${actor.endX}px, ${actor.endY}px, 0) scale(${scale})`;
          actor.el.style.filter = blur > 0.5 ? `blur(${blur}px)` : 'none';

          // Subtle purple trail during appearance
          if (rawT > 0.1 && rawT < 0.9 && Math.random() > 0.6) {
            spawnTrail(actor.endX + actor.endW / 2, actor.endY + actor.endSize / 2, rawT);
          }

          if (rawT >= 1) {
            actor.el.style.transform = `translate3d(${actor.endX}px, ${actor.endY}px, 0) scale(1)`;
            actor.el.style.filter = 'none';
            actor.el.style.opacity = '1';
            actor.el.classList.add('is-settled-title');
            actor.el.classList.remove('is-morphing');
          }
        }

        if (!allDone) {
          morphRaf = requestAnimationFrame(tick);
        } else if (!resolved) {
          resolved = true;
          morphRaf = null;
          actors.forEach((actor) => {
            actor.el.style.filter = 'none';
            actor.el.style.opacity = '1';
            actor.el.style.transform = `translate3d(${actor.endX}px, ${actor.endY}px, 0) scale(1)`;
            actor.el.classList.add('is-settled-title');
          });
          resolve();
        }
      };

      morphRaf = requestAnimationFrame(tick);
      const totalDuration = toEls.length * letterInterval + morphDuration + 200;
      trackTimeout(() => {
        if (!resolved) {
          resolved = true;
          stopMorph();
          resolve();
        }
      }, totalDuration);
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

    // STAGE 2 — letter-by-letter progressive morph into PORTFOLIO
    const plan = buildMorphPlan(fromSlots, toSlots);
    await runMorph(fromEls, fromSlots, toSlots, plan);
    await wait(750); // hold PORTFOLIO

    // STAGE 3 — curtain reveal
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

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
    const w = window.innerWidth;
    if (w < 480) return Math.max(18, w * 0.055);
    if (w < 768) return Math.min(34, w * 0.052);
    return Math.min(54, w * 0.045);
  }

  function getTitleTracking() {
    return window.innerWidth < 768 ? 0.18 : 0.32;
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
   * Animate letters along cubic curves from ISHAAN → THE PORTFOLIO.
   */
  function runMorph(fromEls, fromSlots, toSlots, plan) {
    return new Promise((resolve) => {
      const duration = 3600;
      const actors = [];

      // Moving / morphing letters from ISHAAN
      plan.moves.forEach((move, idx) => {
        const el = fromEls[move.fromIndex];
        const from = fromSlots[move.fromIndex];
        const to = toSlots[move.toIndex];
        const startX = from.x;
        const startY = from.y;
        const endX = to.x;
        const endY = to.y;
        const dx = endX - startX;
        const dy = endY - startY;
        const dist = Math.hypot(dx, dy) || 1;
        // Perpendicular offset for a dramatic arc
        const nx = -dy / dist;
        const ny = dx / dist;
        const arc = (80 + (idx % 3) * 40) * (idx % 2 === 0 ? 1 : -1);
        const cp1x = startX + dx * 0.25 + nx * arc;
        const cp1y = startY + dy * 0.15 + ny * arc * 0.6;
        const cp2x = startX + dx * 0.75 + nx * arc * 0.35;
        const cp2y = startY + dy * 0.85 + ny * arc * 0.25;
        const delay = idx * 65;

        el.classList.remove('is-falling');
        el.classList.add('is-morphing');
        // Lock settled position before clearing the fall animation
        el.style.animation = 'none';
        el.style.transform = `translate3d(${startX}px, ${startY}px, 0)`;
        el.style.opacity = '1';
        el.style.filter = 'none';

        actors.push({
          el,
          kind: 'move',
          keepChar: move.keepChar,
          targetChar: to.char,
          swapped: false,
          startX,
          startY,
          endX,
          endY,
          cp1x,
          cp1y,
          cp2x,
          cp2y,
          startSize: from.fontSize,
          endSize: to.fontSize,
          endW: to.w,
          delay,
          duration,
        });
      });

      // New letters fly in from outside / emerge
      plan.births.forEach((toIndex, idx) => {
        const to = toSlots[toIndex];
        if (to.char === ' ') {
          // Invisible spacer — place immediately at end of morph
          const el = createLetterEl(' ', to.fontSize, to.x, to.y, { w: to.w });
          el.style.opacity = '0';
          el.classList.add('is-settled-title');
          actors.push({
            el,
            kind: 'space',
            endX: to.x,
            endY: to.y,
            endSize: to.fontSize,
            endW: to.w,
            delay: duration * 0.55,
            duration: duration * 0.4,
          });
          return;
        }

        const side = idx % 4;
        let startX;
        let startY;
        if (side === 0) {
          startX = -80 - Math.random() * 120;
          startY = to.y + (Math.random() - 0.5) * 160;
        } else if (side === 1) {
          startX = window.innerWidth + 80 + Math.random() * 120;
          startY = to.y + (Math.random() - 0.5) * 160;
        } else if (side === 2) {
          startX = to.x + (Math.random() - 0.5) * 100;
          startY = -100 - Math.random() * 80;
        } else {
          // Emerge near center with scatter
          startX = window.innerWidth / 2 + (Math.random() - 0.5) * 220;
          startY = window.innerHeight / 2 + (Math.random() - 0.5) * 160;
        }

        const el = createLetterEl(to.char, to.fontSize * 0.55, startX, startY, {
          w: to.w,
        });
        el.style.opacity = '0';
        el.classList.add('is-morphing');

        const dx = to.x - startX;
        const dy = to.y - startY;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = -dy / dist;
        const ny = dx / dist;
        const arc = 60 + Math.random() * 70;
        const sign = idx % 2 === 0 ? 1 : -1;

        actors.push({
          el,
          kind: 'birth',
          startX,
          startY,
          endX: to.x,
          endY: to.y,
          cp1x: startX + dx * 0.3 + nx * arc * sign,
          cp1y: startY + dy * 0.2 + ny * arc * sign * 0.5,
          cp2x: startX + dx * 0.7 + nx * arc * sign * 0.2,
          cp2y: startY + dy * 0.75,
          startSize: to.fontSize * 0.45,
          endSize: to.fontSize,
          endW: to.w,
          delay: 420 + idx * 100,
          duration: duration - 420 - idx * 45,
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

          if (actor.kind === 'space') {
            const t = easeOutBack(Math.min(1, rawT));
            actor.el.style.opacity = String(Math.min(1, rawT * 2));
            actor.el.style.transform = `translate3d(${actor.endX}px, ${actor.endY}px, 0)`;
            actor.el.style.fontSize = actor.endSize + 'px';
            actor.el.style.width = actor.endW + 'px';
            continue;
          }

          const t = easeInOutCubic(rawT);
          const x = cubicBezierPoint(
            actor.startX,
            actor.cp1x,
            actor.cp2x,
            actor.endX,
            t
          );
          const y = cubicBezierPoint(
            actor.startY,
            actor.cp1y,
            actor.cp2y,
            actor.endY,
            t
          );
          const size = lerp(actor.startSize, actor.endSize, t);

          // Motion blur + glow peak mid-flight
          const blur = rawT > 0.08 && rawT < 0.88 ? Math.sin(rawT * Math.PI) * 2.4 : 0;
          let opacity = 1;
          if (actor.kind === 'birth') {
            opacity = Math.min(1, rawT * 2.2);
          }

          // Mid-flight character swap for morphing letters
          if (
            actor.kind === 'move' &&
            !actor.keepChar &&
            !actor.swapped &&
            rawT >= 0.42
          ) {
            actor.swapped = true;
            actor.el.style.filter = `blur(${Math.max(blur, 6)}px)`;
            actor.el.textContent = actor.targetChar;
          }

          actor.el.style.opacity = String(opacity);
          actor.el.style.fontSize = size + 'px';
          actor.el.style.width = lerp(
            actor.kind === 'birth' ? actor.endW * 0.5 : actor.endW,
            actor.endW,
            t
          ) + 'px';
          actor.el.style.height = size + 'px';
          actor.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
          actor.el.style.filter =
            blur > 0.2 ? `blur(${blur}px)` : actor.swapped && rawT < 0.55
              ? `blur(${lerp(6, 0, (rawT - 0.42) / 0.13)}px)`
              : 'none';

          if (rawT > 0.05 && rawT < 0.95 && Math.random() > 0.45) {
            spawnTrail(x + actor.endW / 2, y + size / 2, Math.sin(rawT * Math.PI));
          }

          if (rawT >= 1) {
            actor.el.style.transform = `translate3d(${actor.endX}px, ${actor.endY}px, 0)`;
            actor.el.style.fontSize = actor.endSize + 'px';
            actor.el.style.width = actor.endW + 'px';
            actor.el.style.filter = 'none';
            actor.el.style.opacity = '1';
            actor.el.classList.add('is-settled-title');
            actor.el.classList.remove('is-morphing');
            if (actor.targetChar) actor.el.textContent = actor.targetChar;
          }
        }

        if (!allDone) {
          morphRaf = requestAnimationFrame(tick);
        } else if (!resolved) {
          resolved = true;
          morphRaf = null;
          // Snap all to final readable state
          actors.forEach((actor) => {
            actor.el.style.filter = 'none';
            actor.el.style.opacity = actor.kind === 'space' ? '0' : '1';
            actor.el.classList.add('is-settled-title');
          });
          resolve();
        }
      };

      morphRaf = requestAnimationFrame(tick);
      // Safety timeout
      trackTimeout(() => {
        if (!resolved) {
          resolved = true;
          stopMorph();
          resolve();
        }
      }, duration + 900);
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

    // STAGE 2 — continuous letter morph into PORTFOLIO
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

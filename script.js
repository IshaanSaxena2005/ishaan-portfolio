/* ========================================
   CINEMATIC INTRO
   ISHAAN → PORTFOLIO → portrait reveal → portrait travels into the home circle
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
   * Focal length for the portrait's 3D transforms. The visible strength of a
   * perspective (how much the projected box tapers) scales with the box width
   * divided by this value, so a fixed focal length looks noticeably flatter on
   * a phone than on a desktop. Shortening it on small screens keeps the depth
   * reading the same everywhere without rotating anything further.
   */
  function depthPerspective() {
    return Math.round(Math.max(780, Math.min(1150, window.innerWidth * 0.82)));
  }

  /**
   * STAGE 3 — the portrait materialises LARGE and centred, just below the
   * lifted PORTFOLIO title, with a cinematic 3D entrance, then holds so the
   * viewer can clearly see it. Only the raw PNG silhouette is shown (no circle
   * frame/ring) with a restrained depth shadow.
   */
  async function runPortraitReveal() {
    if (!portraitEl) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const persp = depthPerspective();
    // Substantially larger than before, but always inside the viewport.
    const size = Math.max(240, Math.min(vh * 0.7, vw * 0.92, 740));
    const left = vw / 2 - size / 2;
    // Sit in the lower-centre of the screen, clear of the lifted title.
    const top = Math.max(vh * 0.3, Math.min(vh * 0.32, vh * 0.97 - size));

    portraitEl.style.width = size + 'px';
    portraitEl.style.height = size + 'px';
    portraitEl.style.left = left + 'px';
    portraitEl.style.top = top + 'px';

    // Lift the settled title so it never overlaps the portrait.
    intro.classList.add('stage-portrait');

    // A tighter perspective + slightly stronger pitch/yaw give the entrance a
    // genuinely volumetric feel (the projected box visibly tapers and shears)
    // while the identity end frame keeps the landed portrait perfectly flat.
    const entrance = portraitEl.animate(
      [
        {
          opacity: 0,
          transform:
            `perspective(${persp}px) translate3d(0, 66px, -230px) scale(0.84) rotateX(12deg) rotateY(-6deg)`,
        },
        {
          opacity: 1,
          transform:
            `perspective(${persp}px) translate3d(0, -10px, -16px) scale(1.02) rotateX(-3deg) rotateY(2deg)`,
          offset: 0.7,
        },
        {
          opacity: 1,
          transform:
            `perspective(${persp}px) translate3d(0, 0, 0) scale(1) rotateX(0deg) rotateY(0deg)`,
        },
      ],
      { duration: 1050, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
    );

    // The key light lags a few pixels behind the surface, which reads as real
    // depth without moving the face. It starts and ends at identity, so
    // cancelling it after the entrance is invisible.
    const lightEl = portraitEl.querySelector('.intro-portrait-light');
    let lightAnim = null;
    if (lightEl) {
      lightAnim = lightEl.animate(
        [
          { transform: 'translate3d(0, 14px, 0)' },
          { transform: 'translate3d(-7px, -5px, 0)', offset: 0.7 },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        { duration: 1050, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
      );
    }

    await entrance.finished.catch(() => {});
    commitAnimation(entrance, portraitEl, {
      opacity: '1',
      transform: 'none',
    });
    if (lightAnim) lightAnim.cancel();

    // Hold the large portrait so the viewer can clearly see it.
    await wait(950);
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
   * STAGE 4 — the SAME portrait travels, scales down progressively and slowly,
   * and lands exactly inside the existing circular profile image. The
   * destination is measured at runtime (getBoundingClientRect), never hard-coded.
   */
  async function runPortraitTravel() {
    const target = document.querySelector('.home .profile-pic');
    if (!portraitEl || !target) return;

    settleDestination();

    // Freeze the portrait's current on-screen box as the animation origin.
    const start = portraitEl.getBoundingClientRect();
    portraitEl.style.transform = 'none';
    portraitEl.style.width = start.width + 'px';
    portraitEl.style.height = start.height + 'px';
    portraitEl.style.left = start.left + 'px';
    portraitEl.style.top = start.top + 'px';

    // The intro backdrop deliberately STAYS OPAQUE for the whole flight.
    // Revealing the portfolio any earlier would expose the real .profile-pic
    // while this portrait is still in the air — i.e. two portraits on screen
    // at once. The reveal is deferred to the hand-off further down.

    const dest = target.getBoundingClientRect();
    const scale = dest.width / start.width;
    const dx = dest.left + dest.width / 2 - (start.left + start.width / 2);
    const dy = dest.top + dest.height / 2 - (start.top + start.height / 2);
    const duration = 1700;
    const easing = 'cubic-bezier(0.4, 0, 0.2, 1)';
    const persp = depthPerspective();

    // Scale shrinks in even steps across the whole flight (never a sudden
    // drop at the end), with a deeper arc, a stronger yaw sway, a slight pitch
    // and a larger negative-Z recession so the portrait reads as travelling
    // through space rather than sliding flat. Roll is intentionally left at
    // zero so the face never tips sideways. Every 3D term is 0 at p = 0 and
    // p = 1, so the departure box and the landing box stay mathematically exact.
    const arc = Math.min(96, Math.abs(dy) * 0.16 + 40);
    const stops = [0, 0.32, 0.66, 1];
    const frames = stops.map((p) => {
      const s = 1 + (scale - 1) * p;
      const x = dx * p;
      const y = dy * p - Math.sin(Math.PI * p) * arc;
      const sway = Math.sin(Math.PI * p);
      const lean = -9 * sway;
      const tilt = 5 * sway;
      const depth = -120 * sway;
      return {
        offset: p,
        transform: `perspective(${persp}px) translate3d(${x}px, ${y}px, ${depth}px) rotateX(${tilt}deg) rotateY(${lean}deg) scale(${s})`,
      };
    });

    const travel = portraitEl.animate(frames, {
      duration,
      easing,
      fill: 'forwards',
    });

    // Counter-parallax on the key light through the flight — the highlight
    // trails the surface, which sells the depth of the movement. Identity at
    // both ends, so cancelling it after landing changes nothing.
    const lightEl = portraitEl.querySelector('.intro-portrait-light');
    let travelLightAnim = null;
    if (lightEl) {
      travelLightAnim = lightEl.animate(
        [
          { transform: 'translate3d(0, 0, 0)' },
          { transform: 'translate3d(11px, 7px, 0)', offset: 0.5 },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        { duration, easing, fill: 'forwards' }
      );
    }

    // The image itself rounds into the circle only as it arrives, matching the
    // existing .profile-pic exactly. It stays a full, uncropped photo while large.
    let shapeAnim = null;
    if (portraitImg) {
      portraitImg.style.borderRadius = '0%';
      shapeAnim = portraitImg.animate(
        [
          { borderRadius: '0%', offset: 0 },
          { borderRadius: '0%', offset: 0.55 },
          { borderRadius: '50%', offset: 1 },
        ],
        { duration, easing, fill: 'forwards' }
      );
    }

    await travel.finished.catch(() => {});

    // Snap exactly onto the real circle so the hand-off has zero jump.
    commitAnimation(travel, portraitEl, {
      width: dest.width + 'px',
      height: dest.height + 'px',
      left: dest.left + 'px',
      top: dest.top + 'px',
      transform: 'none',
    });
    if (travelLightAnim) travelLightAnim.cancel();
    if (portraitImg) portraitImg.style.borderRadius = '50%';
    if (shapeAnim) shapeAnim.cancel();

    // HAND-OFF — the travelling portrait now sits exactly on top of the real
    // circle: same image, same box, pixel-coincident. Reveal the portfolio and
    // dissolve the temporary portrait in lockstep. Because the real circle
    // appears *underneath* the temporary one (never beside it), there is no
    // flicker, no jump and no frame in which two portraits are visible.
    intro.classList.add('stage-travel');
    const fade = portraitEl.animate([{ opacity: '1' }, { opacity: '0' }], {
      duration: 500,
      easing: 'ease-in-out',
      fill: 'forwards',
    });
    await fade.finished.catch(() => {});
    portraitEl.style.opacity = '0';
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

    // STAGE 3 — large cinematic portrait reveal below the title
    await portraitReady;
    await runPortraitReveal();

    // STAGE 4 — the same portrait travels into the existing circular image
    await runPortraitTravel();

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

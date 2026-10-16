/* ========================================
   CINEMATIC INTRO
   Sequence: ISHAAN → THE PORTFOLIO → top-to-bottom reveal
   Plays once per browser session; respects prefers-reduced-motion
   ======================================== */
(function initCinematicIntro() {
  const STORAGE_KEY = 'portfolioIntroPlayed';
  const intro = document.getElementById('cinematic-intro');
  const canvas = document.getElementById('intro-particles');
  const stageName = document.getElementById('intro-stage-name');
  const stageTitle = document.getElementById('intro-stage-title');

  if (!intro) return;

  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let alreadyPlayed = false;
  try {
    alreadyPlayed = sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch (e) {
    alreadyPlayed = false;
  }

  let particleRaf = null;
  let particles = [];

  function stopParticles() {
    if (particleRaf) cancelAnimationFrame(particleRaf);
    particleRaf = null;
  }

  function finishIntro() {
    document.documentElement.classList.remove('intro-pending');
    document.documentElement.classList.add('intro-done');
    document.body.classList.remove('intro-active');
    intro.className = 'cinematic-intro';
    intro.setAttribute('hidden', '');
    intro.setAttribute('aria-hidden', 'true');
    stopParticles();
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch (e) {}
    // Ensure scroll-reveal fires for in-view sections after unlock
    window.dispatchEvent(new Event('scroll'));
  }

  if (alreadyPlayed || prefersReducedMotion) {
    finishIntro();
    return;
  }

  // Show overlay and lock scroll
  intro.removeAttribute('hidden');
  intro.setAttribute('aria-hidden', 'false');
  document.body.classList.add('intro-active');

  /* ---- Lightweight purple particles ---- */
  function setupParticles() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const count = window.innerWidth < 768 ? 36 : 58;
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.8 + 0.4,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.35 - 0.05,
      a: Math.random() * 0.45 + 0.15,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = window.innerWidth + 10;
        if (p.x > window.innerWidth + 10) p.x = -10;
        if (p.y < -10) p.y = window.innerHeight + 10;
        if (p.y > window.innerHeight + 10) p.y = -10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(192, 132, 252, ${p.a})`;
        ctx.fill();
      }
      particleRaf = requestAnimationFrame(draw);
    };
    draw();

    window.addEventListener('resize', resize, { passive: true });
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function waitForAnimation(el, fallbackMs) {
    return new Promise((resolve) => {
      if (!el) {
        setTimeout(resolve, fallbackMs);
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.removeEventListener('animationend', onEnd);
        resolve();
      };
      const onEnd = (e) => {
        if (e.target === el) finish();
      };
      el.addEventListener('animationend', onEnd);
      setTimeout(finish, fallbackMs);
    });
  }

  async function runSequence() {
    setupParticles();

    // STAGE 1 — ISHAAN letters fall
    intro.classList.add('stage-name');
    const letters = intro.querySelectorAll('.intro-letter');
    const lastLetter = letters[letters.length - 1];
    // last letter delay ~0.25 + 5*0.14 = 0.95s, duration 1.05s → ~2s
    await waitForAnimation(lastLetter, 2200);
    await wait(450);

    // Transition out name
    intro.classList.add('stage-name-exit');
    await waitForAnimation(stageName, 600);
    stageName.style.visibility = 'hidden';

    // STAGE 2 — THE PORTFOLIO
    intro.classList.add('stage-title');
    const titleEl = intro.querySelector('.intro-portfolio-title');
    await waitForAnimation(titleEl, 1300);
    await wait(900);

    intro.classList.add('stage-title-exit');
    await wait(400);

    // STAGE 3 — top-to-bottom curtain reveal
    stopParticles();
    intro.classList.add('stage-reveal');
    await waitForAnimation(intro, 1450);

    finishIntro();
  }

  // Start after first paint so fonts/layout settle
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

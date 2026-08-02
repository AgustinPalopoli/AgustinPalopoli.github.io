/* ==========================================================================
   main.js
   General interaction: header state, mobile nav, scroll reveal, custom cursor.
   ========================================================================== */
(() => {
  'use strict';

  const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;

  /* ---------------------------------------------------------------------
     Header scroll state
     --------------------------------------------------------------------- */
  const header = document.getElementById('site-header');
  const onScroll = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 12);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------------------------------------------------------------------
     Mobile menu
     --------------------------------------------------------------------- */
  const menuToggle = document.getElementById('menu-toggle');
  const mainNav = document.getElementById('main-nav');

  const closeMenu = () => {
    mainNav.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Abrir menú');
    document.body.style.overflow = '';
  };

  const openMenu = () => {
    mainNav.classList.add('is-open');
    menuToggle.setAttribute('aria-expanded', 'true');
    menuToggle.setAttribute('aria-label', 'Cerrar menú');
    document.body.style.overflow = 'hidden';
  };

  menuToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.contains('is-open');
    isOpen ? closeMenu() : openMenu();
  });

  mainNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 760) closeMenu();
  });

  /* ---------------------------------------------------------------------
     Scroll reveal
     --------------------------------------------------------------------- */
  const revealEls = document.querySelectorAll('[data-reveal]');

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  /* ---------------------------------------------------------------------
     Custom cursor — dardo/flecha, sigue al mouse con una posición directa
     (sin retraso). A diferencia del reticle anterior (que se centraba con
     translate(-50%,-50%)), acá NO centramos: la punta del SVG está en el
     (0,0) de su viewBox, así que un translate directo alinea esa punta
     exactamente con la posición real del cursor del sistema.
     --------------------------------------------------------------------- */
  if (!isTouch) {
    const cursor = document.getElementById('cursor');

    window.addEventListener('mousemove', (e) => {
      cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    });

    const hoverTargets = document.querySelectorAll('[data-cursor-hover]');
    hoverTargets.forEach((el) => {
      el.addEventListener('mouseenter', () => cursor.classList.add('is-hover'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('is-hover'));
    });

    const linkTargets = document.querySelectorAll('.main-nav ul a, .footer-links a');
    linkTargets.forEach((el) => {
      el.addEventListener('mouseenter', () => cursor.classList.add('is-link'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('is-link'));
    });

    document.addEventListener('mouseleave', () => { cursor.style.opacity = '0'; });
    document.addEventListener('mouseenter', () => { cursor.style.opacity = '1'; });
  }
})();

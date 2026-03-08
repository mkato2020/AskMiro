/* ================================================================
   ASKMIRO — SCROLL REVEAL + STAGGER
   Paste before </body>. Does NOT touch any existing scripts.
   ================================================================ */
(function () {
  'use strict';

  // ── Intersection Observer for .reveal elements ──
  const revealObs = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          const el = entry.target;

          // Stagger children if the element is a grid/list wrapper
          const children = el.querySelectorAll(
            '.bento-card, .service-card, .trust-card, .testimonial-card, .step-item, .faq-item'
          );

          if (children.length > 0) {
            children.forEach(function (child, i) {
              child.style.transitionDelay = i * 60 + 'ms';
              child.classList.add('visible');
            });
          }

          el.classList.add('visible');
          revealObs.unobserve(el);
        }
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
  );

  // Observe all .reveal elements
  document.querySelectorAll('.reveal').forEach(function (el) {
    revealObs.observe(el);
  });

  // Also reveal section-headers when they scroll in
  document.querySelectorAll('.section-header').forEach(function (el) {
    const headerObs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            el.classList.add('visible');
            headerObs.unobserve(el);
          }
        });
      },
      { threshold: 0.2 }
    );
    headerObs.observe(el);
  });

})();

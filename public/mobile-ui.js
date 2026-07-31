/* ==========================================================================
   BluPrint — mobile UI behaviour (direction "1b")
   Ported from "Mobile UI modernization exploration/BluPrint Mobile.dc.html".

   Injects the bottom dock, the home stat strip / room deck dots / resume list,
   the compact step headers, and the draggable element sheet on the plan step.
   Every DOM addition is inert above 600px (see .m-only / .m-dock in
   mobile-ui.css), so desktop is unaffected. Load with `defer`, before the
   page's own module scripts, so their querySelectorAll calls see the dock.
   ========================================================================== */
(function () {
  'use strict';

  var MQ = window.matchMedia('(max-width: 600px)');
  var body = document.body;
  if (!body) return;

  var PAGE =
    body.classList.contains('page-dashboard')  ? 'home'   :
    body.classList.contains('page-dimensions') ? 'plan'   :
    body.classList.contains('page-inspo')      ? 'inspo'  :
    body.classList.contains('page-result')     ? 'result' :
    body.classList.contains('page-projects')   ? 'rooms'  : null;

  if (!PAGE) return;

  // ---- tiny helpers ------------------------------------------------------

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  /** Run `cb` once `sel` exists — the result page mounts its chrome via React. */
  function whenReady(sel, cb) {
    var found = document.querySelector(sel);
    if (found) return cb(found);
    var obs = new MutationObserver(function () {
      var hit = document.querySelector(sel);
      if (!hit) return;
      obs.disconnect();
      cb(hit);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { obs.disconnect(); }, 15000);
  }

  function roomName() {
    var input = document.getElementById('room-name');
    if (input && input.value.trim()) return input.value.trim();
    return (localStorage.getItem('blueprintCurrentRoomName') || '').trim() || 'Your room';
  }

  var NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six',
                      'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  function spell(n) { return NUMBER_WORDS[n] || String(n); }
  function capitalise(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ======================================================================
  // Bottom dock — every page
  // ======================================================================

  var DOCK = [
    { key: 'home',   href: 'dashboard.html',        icon: 'ph:house-duotone',       label: 'Home'   },
    { key: 'rooms',  href: 'past-inspiration.html', icon: 'ph:squares-four-duotone', label: 'Rooms'  },
    { key: 'plan',   href: 'room-dimensions.html',  icon: 'ph:plus-bold',           label: 'New room', fab: true },
    { key: 'inspo',  href: 'inspo-upload.html',     icon: 'ph:sparkle-duotone',     label: 'Style'  },
    { key: 'result', href: 'room-result.html',      icon: 'ph:cube-duotone',        label: 'Design' }
  ];

  function buildDock() {
    // A <div role="navigation"> rather than a <nav>: design-system.css styles
    // bare `nav` (light background, border-bottom, 32px padding) with
    // !important for the top pill, and that would repaint the dock.
    var dock = el('div', 'm-dock');
    dock.setAttribute('role', 'navigation');
    dock.setAttribute('aria-label', 'Primary');
    DOCK.forEach(function (item) {
      var a = el('a', item.fab ? 'm-dock-fab' : 'm-dock-item');
      a.href = item.href;
      if (item.fab) {
        a.setAttribute('aria-label', item.label);
        a.innerHTML = '<iconify-icon icon="' + item.icon + '"></iconify-icon>';
      } else {
        a.innerHTML = '<iconify-icon icon="' + item.icon + '"></iconify-icon><span>' + item.label + '</span>';
        if (item.key === PAGE) {
          a.classList.add('is-active');
          a.setAttribute('aria-current', 'page');
        }
      }
      dock.appendChild(a);
    });
    document.body.appendChild(dock);
  }

  // ======================================================================
  // Compact step header — plan / style / design
  // ======================================================================

  var STEPBAR = {
    plan:   { back: 'dashboard.html',       sub: 'Step 1 of 3 · walls',  done: 1 },
    inspo:  { back: 'room-dimensions.html', sub: 'Step 2 of 3 · style',  done: 2 },
    result: { back: 'inspo-upload.html',    sub: 'Step 3 of 3 · design', done: 3 }
  };

  function buildStepbar(anchor) {
    var cfg = STEPBAR[PAGE];
    if (!cfg || !anchor) return;

    var bar = el('div', 'm-stepbar m-only');
    var back = el('a', 'm-back', '<iconify-icon icon="ph:caret-left-bold"></iconify-icon>');
    back.href = cfg.back;
    back.setAttribute('aria-label', 'Back');

    var title = el('div', 'm-stepbar-title');
    title.appendChild(el('strong', null, roomName()));
    title.appendChild(el('small', null, cfg.sub));

    var steps = el('div', 'm-steps');
    for (var i = 1; i <= 3; i++) steps.appendChild(el('i', i <= cfg.done ? 'is-done' : null));

    bar.appendChild(back);
    bar.appendChild(title);
    bar.appendChild(steps);
    anchor.parentNode.insertBefore(bar, anchor);
  }

  // ======================================================================
  // HOME — dashboard.html
  // ======================================================================

  function enhanceHome() {
    var copy = document.querySelector('.dashboard-welcome-copy');
    if (!copy) return;

    // "Welcome back" → the live date, as in 1b.
    var eyebrow = copy.querySelector('.dashboard-eyebrow');
    if (eyebrow) {
      eyebrow.classList.add('m-hidden');
      var now = new Date();
      var stamp = now.toLocaleDateString(undefined, { weekday: 'long' }) + ' · ' +
                  now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      copy.insertBefore(el('p', 'dashboard-eyebrow m-eyebrow m-only', stamp), eyebrow);
    }

    // "Prisha!" → "Hi, Prisha!"
    var h1 = copy.querySelector('h1');
    var nameEl = document.getElementById('user-name');
    if (h1 && nameEl && !h1.querySelector('.m-hi')) {
      h1.insertBefore(el('span', 'm-hi m-only', 'Hi, '), nameEl);
    }

    var quip = el('p', 'm-quip m-only', '');
    var stats = el('div', 'm-stats m-only');
    stats.innerHTML =
      '<div class="m-stat"><p class="m-stat-value" data-m-sqft>—</p>' +
        '<p class="m-stat-label">sq ft drawn</p></div>' +
      '<div class="m-stat"><p class="m-stat-value" data-m-done>—</p>' +
        '<p class="m-stat-label" data-m-done-label>rooms finished</p>' +
        '<div class="m-stat-bar"><i data-m-bar style="width:0"></i></div></div>';

    if (h1) h1.insertAdjacentElement('afterend', quip);
    else copy.appendChild(quip);

    // The stat strip spans the hero, below the avatar row.
    var heroRow = document.querySelector('.dashboard-hero-layout');
    if (heroRow) heroRow.insertAdjacentElement('afterend', stats);
    else copy.appendChild(stats);

    // The ghost floor plan is absolutely positioned against the hero row, which
    // is short on mobile. Reparent it to <header> so it backs the whole hero.
    // (CSS can't do this: the row keeps a transform from .animate-reveal, and a
    // transformed element is a containing block whatever its `position` is.)
    var blueprint = document.querySelector('.dashboard-blueprint');
    var hero = document.querySelector('.dashboard-hero');
    if (blueprint && hero && heroRow) {
      var syncBlueprint = function (matches) {
        if (matches && blueprint.parentNode !== hero) hero.insertBefore(blueprint, heroRow);
        else if (!matches && blueprint.parentNode === hero) heroRow.appendChild(blueprint);
      };
      syncBlueprint(MQ.matches);
      MQ.addEventListener('change', function (e) { syncBlueprint(e.matches); });
    }

    var grid = document.getElementById('projects-grid');
    if (!grid) return;

    // Position dots for the snapping deck.
    var heading = document.querySelector('.dashboard-section-heading');
    var dots = el('div', 'm-dots m-only');
    if (heading) heading.appendChild(dots);

    function readCards() {
      return Array.prototype.filter.call(grid.children, function (c) {
        return c.classList.contains('garden-card');
      });
    }

    function refresh() {
      var cards = readCards();

      // Stats, read straight off the rendered cards so they always agree.
      var sqft = 0, done = 0;
      cards.forEach(function (card) {
        var meta = card.querySelector('div:last-child p');
        var m = meta && /([\d,]+)\s*sq\s*ft/i.exec(meta.textContent);
        if (m) sqft += Number(m[1].replace(/,/g, '')) || 0;
        var badge = card.querySelector('div:first-child span');
        if (badge && /complete/i.test(badge.textContent)) done++;
      });

      var sqftEl = stats.querySelector('[data-m-sqft]');
      var doneEl = stats.querySelector('[data-m-done]');
      var doneLabel = stats.querySelector('[data-m-done-label]');
      var bar = stats.querySelector('[data-m-bar]');
      if (sqftEl) sqftEl.textContent = sqft ? sqft.toLocaleString() : '0';
      if (doneEl) doneEl.textContent = done + ' / ' + cards.length;
      if (doneLabel) doneLabel.textContent = 'rooms finished';
      if (bar) bar.style.width = (cards.length ? (done / cards.length) * 100 : 0) + '%';

      quip.textContent = cards.length
        ? capitalise(spell(cards.length)) + ' room' + (cards.length === 1 ? '' : 's') + '. ' +
          (done === 0 ? 'None are' : capitalise(spell(done)) + (done === 1 ? ' is' : ' are')) +
          ' finished. We don\'t bring up the office.'
        : 'No rooms yet. A blank page is also a design choice.';

      // Dots track the deck.
      dots.innerHTML = '';
      cards.forEach(function () { dots.appendChild(el('i')); });
      syncDots();

      buildResume(cards);
    }

    function syncDots() {
      var cards = readCards();
      if (!cards.length) return;
      var index = 0, best = Infinity;
      cards.forEach(function (card, i) {
        var delta = Math.abs(card.offsetLeft - grid.scrollLeft - 24);
        if (delta < best) { best = delta; index = i; }
      });
      Array.prototype.forEach.call(dots.children, function (d, i) {
        d.classList.toggle('is-active', i === index);
      });
    }

    var resume = null;
    function buildResume(cards) {
      if (resume) resume.remove();
      if (!cards.length) return;

      var pending = cards.filter(function (card) {
        var badge = card.querySelector('div:first-child span');
        return !(badge && /complete/i.test(badge.textContent));
      });
      var next = pending[0];
      var nextName = next && next.querySelector('.room-name-display');
      var label = nextName ? nextName.textContent.trim() : null;

      resume = el('section', 'm-resume m-only');
      resume.innerHTML =
        '<h2 class="m-section-label">Pick up where you left off</h2>' +
        '<div class="m-resume-list">' +
          '<a class="m-resume-row" href="room-dimensions.html">' +
            '<span class="m-resume-icon"><iconify-icon icon="ph:frame-corners-duotone"></iconify-icon></span>' +
            '<span class="m-resume-copy"><strong>' +
              (label ? 'Finish the ' + label + ' walls' : 'Draw your first set of walls') +
            '</strong><small>You stopped mid-wall. Bold choice.</small></span>' +
            '<span class="m-chev">›</span></a>' +
          '<a class="m-resume-row" href="inspo-upload.html">' +
            '<span class="m-resume-icon"><iconify-icon icon="ph:sparkle-duotone"></iconify-icon></span>' +
            '<span class="m-resume-copy"><strong>Saved photos, no style</strong>' +
            '<small>Let\'s turn the mood board into a plan.</small></span>' +
            '<span class="m-chev">›</span></a>' +
        '</div>';
      grid.parentNode.parentNode.appendChild(resume);
    }

    grid.addEventListener('scroll', syncDots, { passive: true });
    new MutationObserver(refresh).observe(grid, { childList: true });
    refresh();
  }

  // ======================================================================
  // PLAN — room-dimensions.html: draggable element sheet
  // ======================================================================

  var COLLAPSED = 250;
  function expandedHeight() { return Math.round(window.innerHeight * 0.78); }

  function enhancePlan() {
    var main = document.querySelector('.page-dimensions main');
    var canvas = document.getElementById('canvas-container');
    if (!main || !canvas) return;

    var sheet = main.querySelector('section:last-child');
    if (!sheet) return;

    buildStepbar(main);

    // Undo / redo ride along on the canvas now that the page header is gone,
    // and the area badge moves from its bottom-right wrapper to the top-left.
    // Moving (rather than cloning) keeps the editor's existing listeners.
    var undo = document.getElementById('btn-undo');
    var redo = document.getElementById('btn-redo');
    var badge = document.getElementById('area-badge');
    var tools = el('div', 'm-canvas-tools m-only');
    var toolHome = undo && undo.parentNode;
    var badgeHome = badge && badge.parentNode;

    if (undo && redo) {
      tools.appendChild(undo);
      tools.appendChild(redo);
      canvas.appendChild(tools);
    }
    if (badge) canvas.appendChild(badge);
    canvas.appendChild(el('div', 'm-canvas-hint m-only', 'TAP AN ELEMENT TO PLACE'));

    // Above 600px everything belongs back where the desktop layout expects it.
    function syncChrome(matches) {
      if (undo && redo && toolHome) {
        if (matches && undo.parentNode !== tools) {
          tools.appendChild(undo);
          tools.appendChild(redo);
        } else if (!matches && undo.parentNode === tools) {
          toolHome.appendChild(undo);
          toolHome.appendChild(redo);
        }
      }
      if (badge && badgeHome) {
        if (matches && badge.parentNode !== canvas) canvas.appendChild(badge);
        else if (!matches && badge.parentNode === canvas) badgeHome.appendChild(badge);
      }
    }
    syncChrome(MQ.matches);
    MQ.addEventListener('change', function (e) { syncChrome(e.matches); });

    // --- drag handle ------------------------------------------------------
    var grip = el('div', 'm-sheet-grip m-only', '<i></i>');
    grip.setAttribute('role', 'button');
    grip.setAttribute('tabindex', '0');
    grip.setAttribute('aria-label', 'Expand element panel');
    sheet.insertBefore(grip, sheet.firstChild);

    var startY = 0, startH = 0, dragging = false, moved = false;

    function setHeight(px) {
      var max = expandedHeight();
      // The stylesheet has to use !important to beat design-system.css, so the
      // inline override has to as well.
      sheet.style.setProperty('height', Math.max(120, Math.min(max, px)) + 'px', 'important');
    }

    function toggle() {
      var expanded = sheet.offsetHeight > (COLLAPSED + expandedHeight()) / 2;
      setHeight(expanded ? COLLAPSED : expandedHeight());
      grip.setAttribute('aria-label', expanded ? 'Expand element panel' : 'Collapse element panel');
    }

    grip.addEventListener('pointerdown', function (e) {
      if (!MQ.matches) return;
      dragging = true;
      moved = false;
      startY = e.clientY;
      startH = sheet.offsetHeight;
      sheet.classList.add('is-dragging');
      // Capture keeps the drag alive when the finger leaves the 30px grip.
      try { grip.setPointerCapture(e.pointerId); } catch (_) { /* synthetic event */ }
    });
    grip.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var delta = startY - e.clientY;
      if (Math.abs(delta) > 4) moved = true;
      setHeight(startH + delta);
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove('is-dragging');
      try {
        if (e && e.pointerId != null && grip.hasPointerCapture(e.pointerId)) {
          grip.releasePointerCapture(e.pointerId);
        }
      } catch (_) { /* capture was never taken */ }
      if (!moved) { toggle(); return; }
      // Settle to whichever detent is nearer.
      var mid = (COLLAPSED + expandedHeight()) / 2;
      setHeight(sheet.offsetHeight > mid ? expandedHeight() : COLLAPSED);
    }
    grip.addEventListener('pointerup', endDrag);
    grip.addEventListener('pointercancel', endDrag);
    // Belt and braces: if capture failed, the release still lands on window.
    window.addEventListener('pointerup', endDrag);
    grip.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });

    // A focused input inside the sheet needs the sheet open.
    sheet.addEventListener('focusin', function () {
      if (MQ.matches && sheet.offsetHeight < expandedHeight() - 1) setHeight(expandedHeight());
    });

    // Keep the CSS height in charge again when we leave mobile.
    MQ.addEventListener('change', function (e) {
      if (!e.matches) sheet.style.removeProperty('height');
      else setHeight(COLLAPSED);
    });
  }

  // ======================================================================
  // STYLE — inspo-upload.html
  // ======================================================================

  function enhanceInspo() {
    var main = document.querySelector('.page-inspo main');
    if (!main) return;

    buildStepbar(main);

    var hero = el('header', 'm-inspo-hero m-only',
      '<h1>Show us the photos you saved at 2am</h1>' +
      '<p>Up to three. We\'ll read the palette and pretend it was intentional.</p>');
    main.insertBefore(hero, main.firstChild);

    // Live budget value above the slider, mirroring 1b.
    var slider = document.getElementById('budget-slider');
    if (slider) {
      var head = el('div', 'm-budget-head m-only',
        '<h2 style="margin:0;font:500 20px Fraunces,serif;letter-spacing:-.02em">Budget</h2>' +
        '<strong data-m-budget>—</strong>');
      var scale = el('div', 'm-budget-scale m-only',
        '<span>$' + Number(slider.min || 500).toLocaleString() + '</span>' +
        '<span>$' + Number(slider.max || 25000).toLocaleString() + '</span>');
      slider.parentNode.insertBefore(head, slider);
      slider.insertAdjacentElement('afterend', scale);

      var out = head.querySelector('[data-m-budget]');
      var sync = function () {
        out.textContent = '$' + Number(slider.value || 0).toLocaleString();
      };
      slider.addEventListener('input', sync);
      slider.addEventListener('change', sync);
      sync();
    }
  }

  // ======================================================================
  // DESIGN — room-result.html (React; wait for its chrome to mount)
  // ======================================================================

  function enhanceResult() {
    whenReady('.page-result main', function (main) { buildStepbar(main); });
  }

  // ======================================================================
  // ROOMS — past-inspiration.html
  // ======================================================================

  function enhanceRooms() {
    var count = document.getElementById('project-count');
    var grid = document.getElementById('all-projects-grid');
    if (!count || !grid) return;

    // "12 rooms" → the 1b voice, recomputed whenever the grid re-renders.
    function refresh() {
      var cards = Array.prototype.filter.call(grid.children, function (c) {
        return c.classList.contains('garden-card');
      });
      if (!cards.length) return;
      var done = cards.filter(function (card) {
        var badge = card.querySelector('div:first-child span');
        return badge && /complete/i.test(badge.textContent);
      }).length;
      count.dataset.mCopy = capitalise(spell(cards.length)) + ' started. ' +
        capitalise(spell(done)) + ' finished. Math is honest.';
      if (MQ.matches) count.textContent = count.dataset.mCopy;
    }
    new MutationObserver(refresh).observe(grid, { childList: true });
    refresh();
  }

  // ---- go ----------------------------------------------------------------

  buildDock();
  if (PAGE === 'home')   enhanceHome();
  if (PAGE === 'plan')   enhancePlan();
  if (PAGE === 'inspo')  enhanceInspo();
  if (PAGE === 'result') enhanceResult();
  if (PAGE === 'rooms')  enhanceRooms();
})();

/* Entrance motion — demo dashboard.
 *
 * Everything in demo/motion.css is gated on `.dash.is-animating`, and this
 * file is the only thing that ever adds or removes that class. So the
 * contract stays simple: default (no class) is the finished page — true
 * whether or not this script ever runs — and this script's only job is to
 * start each element from that CSS-defined hidden state and let it settle
 * into the exact spot it would have occupied anyway.
 *
 * Reduced motion is handled by doing NOTHING: if the reader has asked for
 * less motion, `.is-animating` is never added, the count-up never runs, and
 * the page charts.js already rendered is exactly what gets shown. There is
 * no separate "reduced" rendering path to keep in sync with the animated
 * one — one fewer place for the two to quietly drift apart.
 */
(function () {
  'use strict';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (REDUCED) return;

  /* Longest a single `.is-animating` pass should still be doing anything —
     see motion.css's header for how that number was worked out (the
     prior-year line's own 300ms delay + 900ms draw already reaches 1200ms).
     This is the BACKSTOP for removing the class, used when the real signal
     (every triggered animation firing `animationend`) cannot be trusted to
     arrive — chiefly, a view that hides part of the dashboard with
     `display: none`, where a hidden element's animation never runs and so
     never fires the event that would otherwise tell us it is done. */
  var FALLBACK_MS = 1600;

  /* ---------------------------------------------------------- stagger index
     C3: every .kpi, .mover and .dtable row gets --i so motion.css can space
     them with `calc(var(--i, 0) * <n>ms)`. The page's two <table>s (trend,
     coverage) are indexed as one continuous sequence rather than each
     restarting at 0 — simpler to compute, and it reads as one settle rather
     than two unrelated ones if the trend table's <details> happens to
     already be open. */
  function setIndices(dash) {
    dash.querySelectorAll('.kpi').forEach(function (el, i) {
      el.style.setProperty('--i', String(i));
    });
    dash.querySelectorAll('.mover').forEach(function (el, i) {
      el.style.setProperty('--i', String(i));
    });
    dash.querySelectorAll('.dtable tbody tr').forEach(function (el, i) {
      el.style.setProperty('--i', String(i));
    });
  }

  /* ------------------------------------------------------------- entrance
     Adds `.is-animating` and takes it off again the moment every animation
     it triggered has actually finished, counted by `animationend` — so a
     later re-entrance is never cut short by a fixed timer that guessed
     wrong. FALLBACK_MS is the safety net for the case that count can never
     reach (see above). */
  function beginEntrance(dash) {
    var expected =
      dash.querySelectorAll('.kpi').length +
      dash.querySelectorAll('.exec-flag, .panel').length +
      dash.querySelectorAll('.mover-bar').length +
      dash.querySelectorAll('.dtable tbody tr').length +
      dash.querySelectorAll('.line-prior').length +
      dash.querySelectorAll('.dot-prior').length;

    if (expected === 0) {
      dash.classList.remove('is-animating');   /* nothing to animate — no-op */
      return;
    }

    var seen = 0;
    var settled = false;
    var fallback;

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(fallback);
      dash.removeEventListener('animationend', onEnd);
      dash.classList.remove('is-animating');
    }

    function onEnd() {
      seen += 1;
      if (seen >= expected) finish();
    }

    dash.addEventListener('animationend', onEnd);
    fallback = setTimeout(finish, FALLBACK_MS);
    dash.classList.add('is-animating');
  }

  /* --------------------------------------------------------------- re-entry
     A view change replays the same settle as a light "this is new" cue, but
     never the KPI count-up — the figures did not change, only the layout
     did, and re-running the count-up would make it look like the numbers
     had reset to zero and been re-measured.
     Re-adding a class that is already present does nothing on its own, and
     by the time a reader clicks a view button the initial entrance has
     normally long finished — but removing, forcing a reflow, then adding
     again makes the replay correct even in the rare case they click mid-
     entrance, when the class might still be there. */
  function reenter(dash) {
    dash.classList.remove('is-animating');
    void dash.offsetWidth;      /* flush layout so the next add is a fresh start */
    beginEntrance(dash);
  }

  /* ------------------------------------------------------------ count-up
     Parses the number OUT of the already-correct, already-final string that
     charts.js rendered — never re-derives it from window.DEMO_SALES, which
     this file has no business knowing the shape of — animates a synthetic
     value from 0 up to it, and puts the ORIGINAL string back verbatim on
     the last frame. That last step is the point: re-formatting the parsed
     number ourselves at t=1 risks a one-cent or one-carton rounding
     difference from what charts.js actually wrote, which would be a wrong
     number quietly replacing a right one.

     Shape handled: optional non-digits, then digits (with thousands commas)
     and an optional decimal part, then optional non-digits — covers every
     .kpi-value on the page today: "$5,690,536", "347,935 ctn", "73.6%",
     "$16.36". A string that does not have that shape (there is no such tile
     today) is left exactly as it was rather than guessed at. */
  function countUp(dash) {
    var DURATION = 900;
    var NUM_RE = /^(\D*)([\d,]*\d(?:\.\d+)?)(\D*)$/;

    var jobs = [];
    dash.querySelectorAll('.kpi-value').forEach(function (node) {
      var original = node.textContent;
      var m = NUM_RE.exec(original);
      if (!m) return;                          /* not a number shape — leave it */

      var digits = m[2].replace(/,/g, '');
      var target = parseFloat(digits);
      if (isNaN(target)) return;

      var dot = digits.indexOf('.');
      var decimals = dot === -1 ? 0 : digits.length - dot - 1;

      jobs.push({
        node: node,
        original: original,
        prefix: m[1],
        suffix: m[3],
        target: target,
        fmt: new Intl.NumberFormat('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        })
      });
    });
    if (!jobs.length) return;

    var start = null;

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    /* One rAF loop drives every tile together — they all reach 100% on the
       same frame, which reads as one measurement landing, not four separate
       counters that happen to be running at once. */
    function tick(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / DURATION);
      var finished = t >= 1;
      var eased = easeOutCubic(t);

      jobs.forEach(function (j) {
        j.node.textContent = finished
          ? j.original                                     /* exact, no artefact */
          : j.prefix + j.fmt.format(j.target * eased) + j.suffix;
      });

      if (!finished) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------------ init */
  function init() {
    var dash = document.querySelector('.dash');
    if (!dash) return;

    setIndices(dash);
    beginEntrance(dash);
    countUp(dash);

    /* C2 — B2 dispatches this after the view attribute changes. */
    document.addEventListener('demo:viewchange', function () {
      reenter(dash);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

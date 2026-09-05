/* Demo dashboard — view switcher (executive / analyst / phone).
 *
 * The three views are one CustomEvent's worth of state:
 * document.documentElement.dataset.view, one of "executive" | "phone", or
 * absent, which IS the analyst view -- the dashboard exactly as
 * dashboard.css already draws it. views.css does the actual hiding and
 * resizing off that attribute; this file only ever decides what the
 * attribute should be and builds the one control that lets a reader change
 * it.
 *
 * Source of truth, in order: the URL's ?view= (so a link can hand someone
 * straight into a view), then localStorage, then analyst. The page's own
 * <head> applies that same order before first paint, so there is no flash
 * from analyst to whatever was actually chosen -- this file re-derives it
 * anyway, because it also has to fold in a check the head snippet cannot:
 * whether the phone frame even makes sense on the screen it is running on.
 */
(function () {
  'use strict';

  var KEY = 'demo-view';
  var VIEWS = ['executive', 'analyst', 'phone'];
  var LABELS = { executive: 'Executive', analyst: 'Analyst', phone: 'Phone' };

  var root = document.documentElement;
  var mqNarrow = window.matchMedia('(max-width: 40rem)');

  /* rawView is the STORED preference (from the URL or localStorage); the
     view actually applied to the page is effective(rawView) below. Keeping
     the two separate means a phone preview on a real phone falls back to
     analyst without erasing "phone" as the reader's choice -- widen the
     window back out and the frame comes straight back. */
  var rawView = 'analyst';

  /* ------------------------------------------------------------ resolve */

  function readParam() {
    try {
      var v = new URLSearchParams(location.search).get('view');
      return VIEWS.indexOf(v) > -1 ? v : null;
    } catch (e) {
      return null;
    }
  }

  function readStorage() {
    try {
      var v = localStorage.getItem(KEY);
      return VIEWS.indexOf(v) > -1 ? v : null;
    } catch (e) {
      return null; // private mode, disabled storage -- fall through to default
    }
  }

  function resolve() {
    return readParam() || readStorage() || 'analyst';
  }

  function effective(v) {
    return (v === 'phone' && mqNarrow.matches) ? 'analyst' : v;
  }

  /* --------------------------------------------------------------- dom */

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function applyAttr(v) {
    if (v === 'executive' || v === 'phone') root.dataset.view = v;
    else delete root.dataset.view;
  }

  /* The phone view moves the real .dash inside a CSS phone frame rather
     than drawing a second copy of it -- what is inside the frame is
     exactly what a phone gets, because it is the same markup.

     The title, its demo nav and the view bar are the PAGE's chrome, not the
     dashboard's content -- a phone would not show the switcher that put it
     there. They step outside the frame while it is up, and back into their
     original place when it comes down, so the markup order the analyst
     view reads is restored exactly. */
  function wrapDevice() {
    var dash = document.querySelector('.dash');
    if (!dash) return;
    var parent = dash.parentNode;
    if (parent && parent.classList && parent.classList.contains('device')) return;

    var lead = h('div', 'dash-lead');
    var hero = dash.querySelector('.prose-intro-hero');
    var bar = dash.querySelector('[data-view-bar]');
    if (hero) lead.appendChild(hero);
    if (bar) lead.appendChild(bar);

    var device = h('div', 'device');
    parent.insertBefore(lead, dash);
    parent.insertBefore(device, dash);
    device.appendChild(dash);
  }

  function unwrapDevice() {
    var device = document.querySelector('.device');
    if (!device) return;
    var dash = device.querySelector('.dash');
    var parent = device.parentNode;
    if (dash && parent) parent.insertBefore(dash, device);

    var lead = parent ? parent.querySelector('.dash-lead') : null;
    if (lead && dash) {
      /* Bar first, then the hero above it: the order they had inside .dash. */
      var bar = lead.querySelector('[data-view-bar]');
      var hero = lead.querySelector('.prose-intro-hero');
      if (bar) dash.insertBefore(bar, dash.firstChild);
      if (hero) dash.insertBefore(hero, dash.firstChild);
      parent.removeChild(lead);
    }
    if (parent) parent.removeChild(device);
  }

  function applyDom(v) {
    /* Moving a node out of the document drops focus to <body>, and the
       node the reader just clicked is inside the very subtree being moved.
       Remember it, do the moves, give it back. */
    var active = document.activeElement;
    applyAttr(v);
    if (v === 'phone') wrapDevice(); else unwrapDevice();
    if (active && active !== document.body && document.contains(active) &&
        document.activeElement !== active) {
      try { active.focus({ preventScroll: true }); } catch (e) { active.focus(); }
    }
    /* The chart draws itself at its container's real pixel width and
       re-draws when that width changes. Its ResizeObserver will notice the
       frame going up or coming down -- but that observer rides the rendering
       lifecycle, which a browser can hold back (a background tab, a pane not
       yet painting). charts.js keeps window.resize as its second, independent
       trigger for exactly that reason, so fire it here and the redraw no
       longer depends on when the observer gets its turn. */
    try { window.dispatchEvent(new Event('resize')); } catch (e) { /* old engines: the observer still covers it */ }
  }

  /* -------------------------------------------------------------- bar */

  function paintBar(v) {
    var seg = document.querySelector('[data-view-bar] .seg');
    if (!seg) return;
    var buttons = seg.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var on = b.getAttribute('data-value') === v;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function buildBar(v) {
    var host = document.querySelector('[data-view-bar]');
    if (!host) return;
    host.textContent = '';
    host.appendChild(h('p', 'kpi-label', 'View'));

    var seg = h('div', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Choose view');
    VIEWS.forEach(function (name) {
      var btn = h('button', null, LABELS[name]);
      btn.type = 'button';
      btn.setAttribute('data-value', name);
      var on = name === v;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) btn.classList.add('is-on');
      seg.appendChild(btn);
    });
    seg.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-value]');
      if (!btn) return;
      select(btn.getAttribute('data-value'));
    });

    host.appendChild(seg);
    host.hidden = false;
  }

  /* -------------------------------------------------------- exec flag
   * Mirrors charts.js's signal()/SIGNAL_SHAPE -- that pair lives inside
   * charts.js's own IIFE, and reaching into another script's closure for
   * four lines would cost more than duplicating them.
   */

  function sigFor(pct, band) {
    band = (band == null) ? 2 : band;
    if (pct > band) return 'good';
    if (pct < -band) return 'bad';
    return 'flat';
  }

  var SIGNAL_SHAPE = { good: 'is-filled', flat: 'is-half', bad: 'is-open' };

  function buildExecFlag() {
    var D = window.DEMO_SALES;
    // Guarded, not assumed: other demo pages (the margin page) carry a
    // different dataset and have no coverage table to flag from.
    if (!D || !D.coverage || !D.coverage.length) return;
    if (document.querySelector('.exec-flag')) return;
    var dash = document.querySelector('.dash');
    if (!dash) return;

    var worst = D.coverage[0];
    D.coverage.forEach(function (c) {
      if (c.deltaPp < worst.deltaPp) worst = c;
    });
    var sig = sigFor(worst.deltaPp, 1); // same 1pp dead band the coverage table uses

    var flag = h('div', 'panel exec-flag is-' + sig);
    flag.appendChild(h('p', 'kpi-label', 'One thing to look at'));

    var p = h('p', 'exec-flag-text');
    var mark = h('span', 'delta-mark ' + SIGNAL_SHAPE[sig]);
    mark.setAttribute('aria-hidden', 'true');
    p.appendChild(mark);
    p.appendChild(h('strong', null, worst.distributor));
    p.appendChild(document.createTextNode(
      ' coverage fell ' + Math.abs(worst.deltaPp).toFixed(1) + ' pp to ' +
      worst.pct.toFixed(1) + '%. Worth a call.'
    ));
    flag.appendChild(p);

    var kpiSection = document.querySelector('[data-kpis]');
    kpiSection = kpiSection && kpiSection.closest('section');
    if (kpiSection && kpiSection.parentNode) {
      kpiSection.parentNode.insertBefore(flag, kpiSection.nextSibling);
    } else {
      dash.appendChild(flag);
    }
  }

  /* ------------------------------------------------------------- wiring */

  function updateUrl(v) {
    try {
      var url = new URL(location.href);
      if (v === 'analyst') url.searchParams.delete('view');
      else url.searchParams.set('view', v);
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (e) { /* not fatal -- the view still applies, it just will not be linkable */ }
  }

  function save(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* private mode etc. */ }
  }

  function render(v) {
    var eff = effective(v);
    applyDom(eff);
    paintBar(eff);
    return eff;
  }

  function select(v) {
    rawView = (VIEWS.indexOf(v) > -1) ? v : 'analyst';
    updateUrl(rawView);
    save(rawView);
    var eff = render(rawView);
    document.dispatchEvent(new CustomEvent('demo:viewchange', { detail: { view: eff } }));
  }

  /* The viewport crossing 40rem is the ONE thing that can change which view
     is effective without a click -- re-render using the stored preference,
     which may bring phone right back once the window widens again. */
  function onNarrowChange() {
    var eff = render(rawView);
    document.dispatchEvent(new CustomEvent('demo:viewchange', { detail: { view: eff } }));
  }

  function init() {
    rawView = resolve();
    var eff = effective(rawView);
    buildBar(eff);
    applyDom(eff);
    buildExecFlag();

    if (mqNarrow.addEventListener) mqNarrow.addEventListener('change', onNarrowChange);
    else if (mqNarrow.addListener) mqNarrow.addListener(onNarrowChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

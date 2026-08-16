/* Site behaviour — theme toggle.
 *
 * The theme itself is CSS: every colour token is a light-dark() pair, and
 * `color-scheme` picks the half. So all this file does is add, change, or
 * remove one attribute on <html>.
 *
 *   no data-theme        -> color-scheme: light dark -> follows the OS
 *   data-theme="light"   -> pinned light
 *   data-theme="dark"    -> pinned dark
 *
 * A one-line blocking snippet in each page's <head> applies the stored
 * choice before first paint, so a reader who picked dark never sees a white
 * flash. This file runs later and only handles the button.
 *
 * The button is markup-hidden by default and revealed here. With JavaScript
 * off there is no dead control on the page, and the OS preference still
 * works, because that path is pure CSS.
 */
(function () {
  'use strict';

  var KEY = 'theme';
  var root = document.documentElement;
  var mq = window.matchMedia('(prefers-color-scheme: dark)');

  var SUN =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
    'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="4.2"/>' +
    '<path d="M12 2.4v2.3M12 19.3v2.3M4.2 12H1.9M22.1 12h-2.3' +
    'M6.5 6.5 4.9 4.9M19.1 19.1l-1.6-1.6M17.5 6.5l1.6-1.6M4.9 19.1l1.6-1.6"/></svg>';

  var MOON =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
    'stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z"/></svg>';

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : null;
    } catch (e) {
      return null; // private mode, disabled storage — fall through to the OS
    }
  }

  function save(v) {
    try {
      if (v) localStorage.setItem(KEY, v);
      else localStorage.removeItem(KEY);
    } catch (e) { /* not fatal — the choice just will not persist */ }
  }

  /* What the reader is actually looking at right now. */
  function effective() {
    return stored() || (mq.matches ? 'dark' : 'light');
  }

  function apply(choice) {
    if (choice) root.setAttribute('data-theme', choice);
    else root.removeAttribute('data-theme');
    save(choice);
  }

  function paintButton(btn) {
    var now = effective();
    var next = now === 'dark' ? 'light' : 'dark';
    btn.innerHTML = now === 'dark' ? MOON : SUN;
    /* The label names the ACTION, not the state — that is what a screen
       reader user needs from a button. */
    btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    btn.setAttribute('title', 'Switch to ' + next + ' theme');
  }

  function init() {
    var btn = document.querySelector('.theme-toggle');
    if (!btn) return;

    btn.hidden = false;
    paintButton(btn);

    btn.addEventListener('click', function () {
      apply(effective() === 'dark' ? 'light' : 'dark');
      paintButton(btn);
    });

    /* Follow the OS live, but only while the reader has not chosen. Once
       they pick a side, their choice outranks the system. */
    var onSystemChange = function () {
      if (!stored()) paintButton(btn);
    };
    if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

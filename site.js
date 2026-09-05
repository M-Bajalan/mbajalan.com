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
 * A page may declare MORE themes than the two the site ships with, by
 * listing them on <html data-themes="light dark terminal">. The demo pages
 * do that: they load a stylesheet that defines a third set of tokens, and
 * the button cycles through whatever the page declared. A page that
 * declares nothing gets the plain light/dark pair, and a stored choice it
 * does not know about is treated as "no choice" — so picking the terminal
 * theme on a demo page never leaks onto the porch, it simply falls back to
 * the OS there.
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

  /* The themes THIS page knows how to draw, in cycling order. */
  var THEMES = (root.getAttribute('data-themes') || 'light dark')
    .split(/\s+/).filter(Boolean);

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

  /* A prompt: the terminal's own glyph. */
  var PROMPT =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M5 6.5 10.5 12 5 17.5M12.5 17.5H19"/></svg>';

  var ICON = { light: SUN, dark: MOON, terminal: PROMPT };

  function known(v) {
    return THEMES.indexOf(v) !== -1;
  }

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return known(v) ? v : null;
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

  /* The theme after this one, round the list the page declared. */
  function next() {
    var i = THEMES.indexOf(effective());
    return THEMES[(i + 1) % THEMES.length];
  }

  /* Which half of every light-dark() pair to use. The stylesheet already
     says this from the attribute; it is repeated inline so that nothing
     sitting above the stylesheet (a host page that pins its own
     color-scheme on the root, say) can outrank the reader's choice. */
  var SCHEME = { light: 'light', dark: 'dark', terminal: 'dark' };

  function apply(choice) {
    if (choice) root.setAttribute('data-theme', choice);
    else root.removeAttribute('data-theme');
    root.style.colorScheme = choice ? (SCHEME[choice] || '') : '';
    save(choice);
  }

  function paintButton(btn) {
    var now = effective();
    var to = next();
    btn.innerHTML = ICON[now] || SUN;
    /* The label names the ACTION, not the state — that is what a screen
       reader user needs from a button. */
    btn.setAttribute('aria-label', 'Switch to ' + to + ' theme');
    btn.setAttribute('title', 'Switch to ' + to + ' theme');
  }

  function init() {
    var btn = document.querySelector('.theme-toggle');
    if (!btn) return;

    btn.hidden = false;
    paintButton(btn);

    btn.addEventListener('click', function () {
      apply(next());
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

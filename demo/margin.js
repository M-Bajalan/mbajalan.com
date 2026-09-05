/* Margin & mix — the what-if.
 *
 * The sales page shows what happened. This page shows what a decision does,
 * and it exists to make one claim touchable: a sales push that quietly erodes
 * margin is not growth. Drag volume up on one product and watch the top line
 * and the bottom line move — sometimes together, often apart.
 *
 * The model is one ratio, stated on the page: every point of extra volume is
 * bought with 0.35 points of price. That is a promotion. Cost per carton does
 * not move, so the discount comes straight out of gross profit, and the
 * question the page answers is whether the extra cartons put more back than
 * the discount took. They do while a product's margin is wider than the price
 * it gives away; below that line every extra carton sells at a loss against
 * the base.
 *
 * The base numbers are the same ten product lines the sales page is drawn
 * from. At zero push, revenue here equals that page's net sales value to the
 * cent, because both are aggregated from one set of generated facts and the
 * generator refuses to write either file unless they reconcile.
 *
 * Same conventions as charts.js: no library, no external requests, hand-built
 * DOM, and ONE function decides what counts as good, steady or declining.
 */
(function () {
  'use strict';

  var M = window.DEMO_MARGIN;
  if (!M) return;

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- format */

  var fmtInt = new Intl.NumberFormat('en-US');
  var fmtPct1 = function (v) { return (v > 0 ? '+' : '') + v.toFixed(1) + '%'; };
  var fmtPp = function (v) { return (v > 0 ? '+' : '') + v.toFixed(1) + ' pp'; };

  function money(v) {
    return '$' + fmtInt.format(Math.round(v));
  }

  /* ------------------------------------------------------------ the signal
     The same rule, with the same dead band, as the sales page — so "growth"
     means one thing across both demos. Percentages get a 2-point band,
     percentage-point moves get a 1-point band, exactly as there. */

  function signal(pct, band) {
    band = (band == null) ? 2 : band;
    if (pct > band) return 'good';
    if (pct < -band) return 'bad';
    return 'flat';
  }

  var SIGNAL_WORD = { good: 'Growing', flat: 'Steady', bad: 'Declining' };
  var SIGNAL_SHAPE = { good: 'is-filled', flat: 'is-half', bad: 'is-open' };

  function pctChange(cur, base) {
    if (!base) return 0;
    return (cur - base) / base * 100;
  }

  /* ------------------------------------------------------------------ dom */

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function deltaSpan(pct, isPp, band) {
    var sig = signal(pct, band);
    var d = h('span', 'kpi-delta');
    d.appendChild(h('span', 'delta-mark ' + SIGNAL_SHAPE[sig]));
    d.appendChild(h('span', 'delta-num', isPp ? fmtPp(pct) : fmtPct1(pct)));
    return { node: d, sig: sig };
  }

  /* ----------------------------------------------------------------- state */

  var state = { sku: M.whatIf.defaultSku, push: 0 };
  var RATE = M.whatIf.discountPerPushPct;      /* price points given per volume point */

  function discountPct() {
    return RATE * state.push;                   /* e.g. 0.35 * 12 = 4.2 % off */
  }

  /* --------------------------------------------------------------- the model
     Scale the product's REAL base revenue rather than recomputing cartons ×
     price: the base figures were summed from facts rounded to the cent, so
     rebuilding them from unit price would miss the base by a few cents and the
     zero-push case would not equal the sales page. Scaling keeps that identity
     exact, and the arithmetic is the same thing. Cost per carton is unchanged
     by a promotion, so cost scales with volume only. */

  function compute() {
    var vf = 1 + state.push / 100;
    var pf = 1 - discountPct() / 100;

    var rows = M.products.map(function (p) {
      var pushed = p.sku === state.sku && state.push > 0;
      var revenue = pushed ? p.revenue * vf * pf : p.revenue;
      var cogs = pushed ? p.cogs * vf : p.cogs;
      var cartons = pushed ? p.cartons * vf : p.cartons;
      var gp = revenue - cogs;
      return {
        sku: p.sku, brand: p.brand, category: p.category,
        pushed: pushed, base: p,
        cartons: cartons, revenue: revenue, cogs: cogs, gp: gp,
        marginPct: revenue ? gp / revenue * 100 : 0
      };
    });

    var t = { cartons: 0, revenue: 0, cogs: 0, gp: 0 };
    rows.forEach(function (r) {
      t.cartons += r.cartons; t.revenue += r.revenue; t.cogs += r.cogs; t.gp += r.gp;
    });
    t.marginPct = t.revenue ? t.gp / t.revenue * 100 : 0;
    rows.forEach(function (r) { r.mixPct = t.revenue ? r.revenue / t.revenue * 100 : 0; });

    return { rows: rows, total: t };
  }

  /* A gate, in the same spirit as the generator's: at zero push this page
     must agree with its own data file to the cent. If it does not, say so
     where a developer will see it, and never quietly. */
  function selfCheck() {
    var saved = state.push;
    state.push = 0;
    var r = compute();
    state.push = saved;
    var drift = Math.abs(r.total.revenue - M.base.revenue);
    if (drift > 0.05) {
      /* eslint-disable-next-line no-console */
      console.warn('margin demo: zero-push revenue drifts from base by ' + drift.toFixed(2));
    }
  }

  /* -------------------------------------------------------------- controls */

  function productLabel(p) {
    return p.sku + ' · ' + p.marginPct.toFixed(0) + '% margin';
  }

  function renderControls() {
    var sel = document.querySelector('[data-sku]');
    var range = document.querySelector('[data-push]');
    var out = document.querySelector('[data-push-out]');
    if (!sel || !range) return;

    /* The controls ship hidden so that, without this script, the page shows
       no dropdown with nothing in it and no slider that does nothing. */
    var wrap = document.querySelector('.whatif-controls');
    if (wrap) wrap.hidden = false;

    clear(sel);
    M.products.forEach(function (p) {
      var o = h('option', null, productLabel(p));
      o.value = p.sku;
      if (p.sku === state.sku) o.selected = true;
      sel.appendChild(o);
    });

    range.min = 0;
    range.max = M.whatIf.maxPushPct;
    range.step = M.whatIf.stepPct;
    range.value = state.push;

    var update = function () {
      state.push = Number(range.value) || 0;
      state.sku = sel.value;
      if (out) out.textContent = '+' + state.push + '%';
      render();
    };

    range.addEventListener('input', update);
    sel.addEventListener('change', update);
    if (out) out.textContent = '+' + state.push + '%';
  }

  function renderReadout() {
    var node = document.querySelector('[data-push-readout]');
    if (!node) return;
    clear(node);
    if (state.push === 0) {
      node.appendChild(h('span', 'readout-hint',
        'No push. The base period, as it was.'));
      return;
    }
    node.appendChild(h('span', 'readout-month', 'Pushing'));
    node.appendChild(h('span', 'readout-val', state.sku));
    node.appendChild(h('span', 'readout-prior',
      '+' + state.push + '% volume, bought with a −' +
      discountPct().toFixed(1) + '% price cut'));
  }

  /* ------------------------------------------------------------- KPI tiles */

  function renderKpis(r) {
    var host = document.querySelector('[data-kpis]');
    if (!host) return;
    clear(host);

    var b = M.base;
    var t = r.total;
    var tiles = [
      { label: 'Revenue', cur: money(t.revenue),
        pct: pctChange(t.revenue, b.revenue),
        note: 'base ' + money(b.revenue) },
      { label: 'Gross profit', cur: money(t.gp),
        pct: pctChange(t.gp, b.grossProfit),
        note: 'base ' + money(b.grossProfit) },
      { label: 'Gross margin', cur: t.marginPct.toFixed(1) + '%',
        pct: t.marginPct - b.marginPct, isPp: true, band: 1,
        note: 'base ' + b.marginPct.toFixed(1) + '%' },
      { label: 'Cartons', cur: fmtInt.format(Math.round(t.cartons)) + ' ctn',
        pct: pctChange(t.cartons, b.cartons),
        note: 'base ' + fmtInt.format(b.cartons) + ' ctn' }
    ];

    tiles.forEach(function (tile) {
      var d = deltaSpan(tile.pct, tile.isPp, tile.band);
      var card = h('div', 'kpi is-' + d.sig);
      card.appendChild(h('p', 'kpi-label', tile.label));
      card.appendChild(h('p', 'kpi-value', tile.cur));
      var p = h('p', 'kpi-delta');
      p.appendChild(d.node.firstChild);
      p.appendChild(d.node.firstChild);
      card.appendChild(p);
      card.appendChild(h('p', 'kpi-note', tile.note));
      host.appendChild(card);
    });
  }

  /* --------------------------------------------- top line vs bottom line
     Two diverging bars, in the movers' own markup so they inherit its styling
     and its entrance. The scale floors at 10 % so a one-point move is still a
     visible sliver rather than a full-width bar pretending to be dramatic. */

  function renderTlBl(r) {
    var host = document.querySelector('[data-tlbl]');
    if (!host) return;
    clear(host);

    var b = M.base;
    var pairs = [
      { name: 'Revenue', sub: 'the top line', pct: pctChange(r.total.revenue, b.revenue) },
      { name: 'Gross profit', sub: 'the bottom line', pct: pctChange(r.total.gp, b.grossProfit) }
    ];
    var max = Math.max(10, Math.abs(pairs[0].pct), Math.abs(pairs[1].pct));

    pairs.forEach(function (m, i) {
      var sig = signal(m.pct);
      var row = h('div', 'mover is-' + sig);
      row.style.setProperty('--i', String(i));

      var name = h('div', 'mover-name');
      name.appendChild(h('span', 'mover-sku', m.name));
      name.appendChild(h('span', 'mover-cat', m.sub));
      row.appendChild(name);

      var track = h('div', 'mover-track');
      track.appendChild(h('span', 'mover-zero'));
      var bar = h('span', 'mover-bar');
      var w = (Math.abs(m.pct) / max) * 50;
      if (m.pct >= 0) { bar.style.left = '50%'; } else { bar.style.right = '50%'; }
      bar.style.width = w + '%';
      track.appendChild(bar);
      row.appendChild(track);

      var val = h('div', 'mover-val');
      val.appendChild(h('span', 'delta-mark ' + SIGNAL_SHAPE[sig]));
      val.appendChild(h('span', null, fmtPct1(m.pct)));
      row.appendChild(val);

      host.appendChild(row);
    });
  }

  /* ---------------------------------------------------------------- verdict
     A sentence, not a colour. It is built from the same signal() the tiles
     use, so the words and the marks cannot disagree. */

  function renderVerdict(r) {
    var node = document.querySelector('[data-verdict]');
    if (!node) return;
    clear(node);

    if (state.push === 0) {
      node.appendChild(h('span', 'verdict-hint',
        'Move the slider. The sentence here will tell you whether what you did was growth.'));
      return;
    }

    var b = M.base;
    var rev = pctChange(r.total.revenue, b.revenue);
    var gp = pctChange(r.total.gp, b.grossProfit);
    var sg = signal(gp);

    /* The totals give the scale; the CALL is made on the pushed line itself.
       A small product moves the company total by a fraction of a point
       whichever way it goes, and a verdict read off the total alone would
       say "too small to call" about a decision that is perfectly clear at
       the product. So: what did the push do to the gross profit of the thing
       that was pushed? That is the question a promotion is answering. */
    var line = null;
    r.rows.forEach(function (row) { if (row.pushed) line = row; });
    var lineGp = line ? pctChange(line.gp, line.base.grossProfit) : 0;
    var sl = signal(lineGp);
    var who = line ? line.sku : 'the pushed line';
    var vol = '+' + state.push + '%';

    var call;
    if (sl === 'bad') {
      call = 'Not growth. ' + who + ' sells ' + vol + ' cartons and makes ' +
        fmtPct1(lineGp) + ' gross profit — the discount bought volume with margin.';
    } else if (sl === 'good') {
      call = 'Growth. ' + who + ' sells ' + vol + ' cartons and makes ' +
        fmtPct1(lineGp) + ' gross profit — the margin was wide enough to pay for the push.';
    } else {
      call = 'A wash. ' + who + ' sells ' + vol + ' cartons for about the same gross profit (' +
        fmtPct1(lineGp) + ').';
    }

    node.appendChild(h('span', 'verdict-num', 'Revenue ' + fmtPct1(rev) + '.'));
    node.appendChild(h('span', 'verdict-num is-' + sg, 'Gross profit ' + fmtPct1(gp) + '.'));
    node.appendChild(h('strong', 'verdict-call is-' + sl, call));
  }

  /* -------------------------------------------------------------- mix table */

  function renderMix(r) {
    var body = document.querySelector('[data-mix]');
    if (!body) return;
    clear(body);

    r.rows.forEach(function (row) {
      var tr = h('tr', row.pushed ? 'is-pushed' : null);

      var th = h('th', null);
      th.setAttribute('scope', 'row');
      th.appendChild(h('span', 'mix-sku', row.sku));
      if (row.pushed) th.appendChild(h('span', 'tag-pushed', 'pushed'));
      tr.appendChild(th);

      tr.appendChild(h('td', 'num', fmtInt.format(Math.round(row.cartons))));
      tr.appendChild(h('td', 'num', money(row.revenue)));
      tr.appendChild(h('td', 'num', money(row.gp)));
      tr.appendChild(h('td', 'num', row.marginPct.toFixed(1) + '%'));
      tr.appendChild(h('td', 'num', row.mixPct.toFixed(1) + '%'));

      var d = h('td', 'num');
      if (row.pushed) {
        var pct = pctChange(row.gp, row.base.grossProfit);
        d.appendChild(h('span', 'delta-num is-' + signal(pct), fmtPct1(pct)));
      } else {
        d.textContent = '—';
      }
      tr.appendChild(d);

      body.appendChild(tr);
    });

    var t = r.total;
    var b = M.base;
    var tr = h('tr', 'is-total');
    var th = h('th', null, 'All products');
    th.setAttribute('scope', 'row');
    tr.appendChild(th);
    tr.appendChild(h('td', 'num', fmtInt.format(Math.round(t.cartons))));
    tr.appendChild(h('td', 'num', money(t.revenue)));
    tr.appendChild(h('td', 'num', money(t.gp)));
    tr.appendChild(h('td', 'num', t.marginPct.toFixed(1) + '%'));
    tr.appendChild(h('td', 'num', '100.0%'));
    var td = h('td', 'num');
    var tp = pctChange(t.gp, b.grossProfit);
    if (state.push === 0) td.textContent = '—';
    else td.appendChild(h('span', 'delta-num is-' + signal(tp), fmtPct1(tp)));
    tr.appendChild(td);
    body.appendChild(tr);
  }

  /* ----------------------------------------------------------------- render */

  function render() {
    var r = compute();
    renderReadout();
    renderKpis(r);
    renderTlBl(r);
    renderVerdict(r);
    renderMix(r);
  }

  function init() {
    selfCheck();
    renderControls();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

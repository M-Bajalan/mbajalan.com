/* Demo dashboard rendering — hand-rolled SVG and CSS bars, no chart library.
 *
 * Why no library: this site makes zero external requests and has no build
 * step. A charting library would cost both. It would also be the wrong
 * idiom — these are newspaper data graphics (dashed horizontal gridlines,
 * no axis lines, direct labelling), which is about fifty lines of SVG.
 *
 * Two deliberate choices worth naming:
 *
 *  - Charts re-render at the container's REAL pixel width rather than being
 *    scaled with preserveAspectRatio. Scaling an SVG shrinks its text along
 *    with everything else, so a chart that is legible on a laptop becomes
 *    6px type on a phone. Measuring and re-rendering keeps type at true size
 *    at every width.
 *
 *  - There is no floating tooltip. Hovering or tapping a column updates one
 *    readout line above the chart. That works identically with a mouse, a
 *    finger and a keyboard, needs no positioning maths, and cannot fall off
 *    the edge of a phone screen.
 */
(function () {
  'use strict';

  var D = window.DEMO_SALES;
  if (!D) return;

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS = 'http://www.w3.org/2000/svg';

  /* ---------------------------------------------------------------- format */

  var fmtInt = new Intl.NumberFormat('en-US');
  var fmtPct1 = function (v) { return (v > 0 ? '+' : '') + v.toFixed(1) + '%'; };
  var fmtPp = function (v) { return (v > 0 ? '+' : '') + v.toFixed(1) + ' pp'; };

  function money(v) {
    return '$' + fmtInt.format(Math.round(v));
  }

  /* Compact axis labels: $5.7M, $612K. Axis ticks must be short or they
     collide on a phone. */
  function compact(v) {
    var a = Math.abs(v);
    if (a >= 1e9) return '$' + (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (a >= 1e6) return '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return '$' + Math.round(v / 1e3) + 'K';
    return '$' + Math.round(v);
  }

  function compactQty(v) {
    var a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return Math.round(v / 1e3) + 'K';
    return String(Math.round(v));
  }

  /* ------------------------------------------------------------ the signal
     ONE function decides what counts as good, flat or bad, and everything on
     the page — KPI deltas, mover bars, coverage rows — asks it. A dashboard
     where the tiles and the table disagree about "good" is a dashboard nobody
     trusts. The dead band stops a 0.3% wobble from being painted as growth. */

  function signal(pct, band) {
    band = (band == null) ? 2 : band;
    if (pct > band) return 'good';
    if (pct < -band) return 'bad';
    return 'flat';
  }

  var SIGNAL_WORD = { good: 'Growing', flat: 'Steady', bad: 'Declining' };
  /* Shape carries the meaning too, so the colour is never the only signal. */
  var SIGNAL_SHAPE = { good: 'is-filled', flat: 'is-half', bad: 'is-open' };

  function pctChange(cur, prior) {
    if (!prior) return 0;
    return (cur - prior) / prior * 100;
  }

  /* ------------------------------------------------------------------ dom */

  function el(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ----------------------------------------------------------- KPI tiles */

  function renderKpis() {
    var host = document.querySelector('[data-kpis]');
    if (!host) return;

    var k = D.kpi;
    var tiles = [
      { label: 'Net sales value', cur: money(k.value.current),
        pct: pctChange(k.value.current, k.value.prior),
        note: 'vs ' + money(k.value.prior) + ', same months last year' },
      { label: 'Volume', cur: fmtInt.format(k.volume.current) + ' ctn',
        pct: pctChange(k.volume.current, k.volume.prior),
        note: 'vs ' + fmtInt.format(k.volume.prior) + ' ctn' },
      /* The change comes from the generator, NOT from subtracting the two
         rounded figures above it. Rounding first and subtracting second gives
         -0.5 pp here while the table's total says -0.6 pp — the same metric
         disagreeing with itself on one screen. One source, one answer. */
      { label: 'Outlet coverage', cur: k.coverage.current.toFixed(1) + '%',
        pct: D.coverageTotal.deltaPp, isPp: true,
        note: 'vs ' + k.coverage.prior.toFixed(1) + '% last year' },
      { label: 'Value per carton', cur: '$' + k.dropSize.current.toFixed(2),
        pct: pctChange(k.dropSize.current, k.dropSize.prior),
        note: 'vs $' + k.dropSize.prior.toFixed(2) }
    ];

    tiles.forEach(function (t) {
      var sig = signal(t.pct);
      var card = h('div', 'kpi is-' + sig);
      card.appendChild(h('p', 'kpi-label', t.label));
      card.appendChild(h('p', 'kpi-value', t.cur));
      var d = h('p', 'kpi-delta');
      d.appendChild(h('span', 'delta-mark ' + SIGNAL_SHAPE[sig]));
      d.appendChild(h('span', 'delta-num', t.isPp ? fmtPp(t.pct) : fmtPct1(t.pct)));
      card.appendChild(d);
      card.appendChild(h('p', 'kpi-note', t.note));
      host.appendChild(card);
    });
  }

  /* ------------------------------------------------------- trend chart
     trendScope drills the chart down to one distributor. null means "all
     distributors", which is also the only state the total coverage row can
     ever put the chart back into — the total is a sum, not a place you can
     drill into further. */

  var trendMeasure = 'value';
  var trendScope = null;

  function trendSeries() {
    var src = trendScope ? D.trend.byDistributor[trendScope] : D.trend;
    var s = src[trendMeasure];
    var base = trendMeasure === 'value' ? 'Net sales value' : 'Volume in cartons';
    return {
      current: s.current,
      prior: s.prior,
      fmt: trendMeasure === 'value' ? money : function (v) {
        return fmtInt.format(Math.round(v)) + ' ctn';
      },
      axis: trendMeasure === 'value' ? compact : compactQty,
      name: (trendScope ? trendScope + ' — ' : '') + base
    };
  }

  /* Caption text is one function so the measure toggle and the drill
     buttons cannot describe the chart two different ways. */
  function trendCaption() {
    var base = trendMeasure === 'value'
      ? 'Net sales value by month, current year against last.'
      : 'Volume in cartons by month, current year against last.';
    return trendScope ? (trendScope + ' — ' + base) : base;
  }

  function updateTrendCaption() {
    var cap = document.querySelector('[data-trend-caption]');
    if (cap) cap.textContent = trendCaption();
  }

  function niceTicks(max, count) {
    var raw = max / count;
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    var ticks = [];
    for (var v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
    return ticks;
  }

  function renderTrend() {
    var host = document.querySelector('[data-trend]');
    if (!host) return;
    var readout = document.querySelector('[data-trend-readout]');

    var s = trendSeries();
    var months = D.meta.months;
    var W = host.clientWidth || 640;
    var narrow = W < 460;
    var H = narrow ? 230 : 290;

    var padL = narrow ? 40 : 54;
    var padR = 8;
    var padT = 14;
    var padB = 30;
    var plotW = Math.max(80, W - padL - padR);
    var plotH = H - padT - padB;

    var maxCur = Math.max.apply(null, s.current);
    var maxPri = Math.max.apply(null, s.prior);
    var ticks = niceTicks(Math.max(maxCur, maxPri) * 1.06, 4);
    var top = ticks[ticks.length - 1];

    var y = function (v) { return padT + plotH - (v / top) * plotH; };
    var n = s.prior.length;                       /* 12 slots, one per month */
    var slot = plotW / n;
    var barW = Math.max(4, Math.min(slot * 0.52, 26));

    host.textContent = '';
    var svg = el('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      width: W, height: H,
      role: 'img',
      'aria-label': s.name + ' by month, ' + D.meta.currentLabel.toLowerCase() +
        ' through ' + D.meta.throughMonth + ', compared with the same months ' +
        D.meta.priorLabel.toLowerCase() +
        '. Full figures are in the data table below the chart.'
    });

    /* gridlines — dashed, horizontal only, no axis or tick lines */
    ticks.forEach(function (t) {
      svg.appendChild(el('line', {
        x1: padL, x2: W - padR, y1: y(t), y2: y(t),
        class: 'grid', 'stroke-dasharray': '3 4', 'aria-hidden': 'true'
      }));
      svg.appendChild(el('text', {
        x: padL - 8, y: y(t) + 4, class: 'axis', 'text-anchor': 'end',
        'aria-hidden': 'true'
      }, s.axis(t)));
    });

    /* current-year columns */
    s.current.forEach(function (v, i) {
      var cx = padL + slot * i + slot / 2;
      var bh = Math.max(1, (v / top) * plotH);
      var rect = el('rect', {
        x: cx - barW / 2, y: y(v), width: barW, height: bh,
        class: 'bar-current', 'aria-hidden': 'true'
      });
      /* Origin comes from CSS (transform-box: fill-box; transform-origin:
         bottom) so the columns grow up from the baseline rather than from
         the SVG's own origin. */
      if (!REDUCED) {
        rect.style.animation = 'bar-rise var(--dur-long) var(--ease-out) both';
        rect.style.animationDelay = (i * 22) + 'ms';
      }
      svg.appendChild(rect);
    });

    /* prior-year line over the top */
    var pts = s.prior.map(function (v, i) {
      return (padL + slot * i + slot / 2) + ',' + y(v);
    }).join(' ');
    svg.appendChild(el('polyline', {
      points: pts, class: 'line-prior', fill: 'none', 'aria-hidden': 'true',
      /* Normalises the line's length to 1 regardless of how many points or
         how much distance it actually spans, so motion.css can animate
         stroke-dasharray/-dashoffset between 0 and 1 without knowing the
         drawn geometry. Pure CSS/SVG feature; draws nothing on its own. */
      pathLength: '1'
    }));
    s.prior.forEach(function (v, i) {
      svg.appendChild(el('circle', {
        cx: padL + slot * i + slot / 2, cy: y(v), r: 2.5,
        class: 'dot-prior', 'aria-hidden': 'true'
      }));
    });

    /* month labels — every other one when there is no room */
    months.forEach(function (m, i) {
      if (narrow && i % 2 === 1) return;
      svg.appendChild(el('text', {
        x: padL + slot * i + slot / 2, y: H - 10,
        class: 'axis', 'text-anchor': 'middle', 'aria-hidden': 'true'
      }, m));
    });

    /* One transparent hit-strip per month. Keyboard-reachable, so the readout
       is not a mouse-only feature. */
    months.forEach(function (m, i) {
      var strip = el('rect', {
        x: padL + slot * i, y: padT, width: slot, height: plotH,
        class: 'hit', tabindex: '0', role: 'button',
        'aria-label': monthSentence(i, s)
      });
      var show = function () { setReadout(readout, i, s); strip.classList.add('is-on'); };
      var hide = function () { strip.classList.remove('is-on'); };
      strip.addEventListener('mouseenter', show);
      strip.addEventListener('mouseleave', hide);
      strip.addEventListener('focus', show);
      strip.addEventListener('blur', hide);
      svg.appendChild(strip);
    });

    host.appendChild(svg);
    setReadout(readout, null, s);
  }

  function monthSentence(i, s) {
    var m = D.meta.months[i];
    var cur = s.current[i];
    var pri = s.prior[i];
    /* Scoped state names itself first, so a screen reader landing on any one
       month still knows which distributor's figures it is hearing. */
    var prefix = trendScope ? trendScope + ', ' : '';
    if (cur == null) {
      return prefix + m + ', ' + D.meta.currentLabel.toLowerCase() + ': no data yet. ' +
        m + ', ' + D.meta.priorLabel.toLowerCase() + ': ' + s.fmt(pri) + '.';
    }
    return prefix + m + ', ' + D.meta.currentLabel.toLowerCase() + ': ' + s.fmt(cur) +
      ', against ' + s.fmt(pri) + ' the same month ' +
      D.meta.priorLabel.toLowerCase() + ', ' + fmtPct1(pctChange(cur, pri)) + '.';
  }

  function setReadout(node, i, s) {
    if (!node) return;
    node.textContent = '';
    if (i == null) {
      node.appendChild(h('span', 'readout-hint',
        'Hover, tap or tab a month to read its figures.'));
      return;
    }
    var cur = s.current[i], pri = s.prior[i];
    node.appendChild(h('strong', 'readout-month', D.meta.months[i]));
    if (cur == null) {
      node.appendChild(h('span', 'readout-val', 'no data yet'));
      node.appendChild(h('span', 'readout-prior',
        D.meta.priorLabel.toLowerCase() + ' ' + s.fmt(pri)));
      return;
    }
    var p = pctChange(cur, pri);
    node.appendChild(h('span', 'readout-val', s.fmt(cur)));
    node.appendChild(h('span', 'readout-prior',
      D.meta.priorLabel.toLowerCase() + ' ' + s.fmt(pri)));
    var sig = signal(p);
    var d = h('span', 'readout-delta is-' + sig);
    d.appendChild(h('span', 'delta-mark ' + SIGNAL_SHAPE[sig]));
    d.appendChild(h('span', null, fmtPct1(p)));
    node.appendChild(d);
  }

  /* ------------------------------------------------------- movers (CSS bars)
     Diverging bars in plain CSS rather than SVG: they reflow with the page for
     free, and the SKU names stay real selectable text instead of SVG glyphs. */

  function renderMovers() {
    var host = document.querySelector('[data-movers]');
    if (!host) return;
    var max = Math.max.apply(null, D.movers.map(function (m) {
      return Math.abs(m.pct);
    }));

    D.movers.forEach(function (m) {
      var sig = signal(m.pct);
      var row = h('div', 'mover is-' + sig);

      var name = h('div', 'mover-name');
      name.appendChild(h('span', 'mover-sku', m.sku));
      name.appendChild(h('span', 'mover-cat', m.category));
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

  /* ------------------------------------------------------- coverage table */

  /* Every distributor's <th> button, in table order, so a click can mark
     itself pressed and every sibling not — one flat list beats walking the
     DOM back up from the event target. */
  var drillButtons = [];

  function renderCoverage() {
    var body = document.querySelector('[data-coverage]');
    if (!body) return;

    D.coverage.forEach(function (c) {
      var sig = signal(c.deltaPp, 1);
      var tr = h('tr');

      var th = h('th');
      th.setAttribute('scope', 'row');
      /* A real button, not a click handler on the cell: keyboard-reachable
         and announced as interactive, same as any other control on the
         page — a coverage row you can only drill into with a mouse would
         be a screen-reader dead end. */
      var drillBtn = h('button', 'drill', c.distributor);
      drillBtn.type = 'button';
      drillBtn.setAttribute('aria-pressed', 'false');
      drillBtn.addEventListener('click', function () {
        setTrendScope(c.distributor, drillBtn);
      });
      drillButtons.push(drillBtn);
      th.appendChild(drillBtn);
      tr.appendChild(th);

      tr.appendChild(h('td', null, c.region));
      tr.appendChild(h('td', 'num', fmtInt.format(c.outlets)));
      tr.appendChild(h('td', 'num', fmtInt.format(c.covered)));
      tr.appendChild(h('td', 'num', c.pct.toFixed(1) + '%'));

      var d = h('td', 'num');
      d.appendChild(h('span', 'delta-num is-' + sig, fmtPp(c.deltaPp)));
      tr.appendChild(d);

      /* Status is a WORD first. The dot repeats it in colour AND in shape,
         so the row still reads correctly in greyscale, for a colour-blind
         reader, and for a screen reader. */
      var st = h('td', 'status');
      st.appendChild(h('span', 'delta-mark ' + SIGNAL_SHAPE[sig]));
      st.appendChild(h('span', null, SIGNAL_WORD[sig]));
      tr.appendChild(st);

      body.appendChild(tr);
    });

    var t = D.coverageTotal;
    var sig = signal(t.deltaPp, 1);
    var tr = h('tr', 'is-total');
    var th = h('th', null, 'All distributors');
    th.setAttribute('scope', 'row');
    tr.appendChild(th);
    tr.appendChild(h('td', null, '—'));
    tr.appendChild(h('td', 'num', fmtInt.format(t.outlets)));
    tr.appendChild(h('td', 'num', fmtInt.format(t.covered)));
    tr.appendChild(h('td', 'num', t.pct.toFixed(1) + '%'));
    var d = h('td', 'num');
    d.appendChild(h('span', 'delta-num is-' + sig, fmtPp(t.deltaPp)));
    tr.appendChild(d);
    var st = h('td', 'status');
    st.appendChild(h('span', 'delta-mark ' + SIGNAL_SHAPE[sig]));
    st.appendChild(h('span', null, SIGNAL_WORD[sig]));
    tr.appendChild(st);
    body.appendChild(tr);
  }

  /* --------------------------------------------------------- the drill
     One state change, three consequences: redraw the chart against the
     scoped series, redraw its table, restate the caption. Nothing here
     touches the coverage table itself — that already shows every
     distributor; the drill only changes what the CHART is scoped to. */

  function setTrendScope(name, activeBtn) {
    trendScope = name;
    drillButtons.forEach(function (b) {
      b.setAttribute('aria-pressed', b === activeBtn ? 'true' : 'false');
    });
    var reset = document.querySelector('[data-trend-reset]');
    if (reset) reset.hidden = false;
    drawTrend(true);
    renderTrendTable();
    updateTrendCaption();
  }

  function resetTrendScope() {
    trendScope = null;
    drillButtons.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    var reset = document.querySelector('[data-trend-reset]');
    if (reset) reset.hidden = true;
    drawTrend(true);
    renderTrendTable();
    updateTrendCaption();
  }

  /* The reset control only makes sense once something is drilled into, so
     it is built hidden and revealed by setTrendScope — never shown by
     markup, since with no drill active there is nothing to reset. Inserted
     ahead of the measure toggle rather than appended, so the panel-head
     reads left to right as "what you are looking at, how to get back,
     which measure" — the same order the state changes happen in. */
  function ensureTrendReset() {
    if (document.querySelector('[data-trend-reset]')) return;
    var measureGroup = document.querySelector('[data-measure]');
    if (!measureGroup || !measureGroup.parentNode) return;
    var btn = h('button', 'drill', 'All distributors');
    btn.type = 'button';
    btn.setAttribute('data-trend-reset', '');
    btn.hidden = true;
    btn.addEventListener('click', resetTrendScope);
    measureGroup.parentNode.insertBefore(btn, measureGroup);
  }

  /* ------------------------------------------- the chart's data table
     Most dashboards ship charts with no text alternative at all. This is the
     fix, and it costs one function: the same numbers, as a real table, one
     disclosure away. Screen readers get it, and so does anyone who just
     wants the figures. */

  function renderTrendTable() {
    var body = document.querySelector('[data-trend-table]');
    if (!body) return;
    body.textContent = '';
    var s = trendSeries();

    D.meta.months.forEach(function (m, i) {
      var cur = s.current[i], pri = s.prior[i];
      var tr = h('tr');
      var th = h('th', null, m);
      th.setAttribute('scope', 'row');
      tr.appendChild(th);
      tr.appendChild(h('td', 'num', cur == null ? '—' : s.fmt(cur)));
      tr.appendChild(h('td', 'num', s.fmt(pri)));
      tr.appendChild(h('td', 'num',
        cur == null ? '—' : fmtPct1(pctChange(cur, pri))));
      body.appendChild(tr);
    });
  }

  /* --------------------------------------------------------------- wiring */

  function wireMeasureToggle() {
    var group = document.querySelector('[data-measure]');
    if (!group) return;
    group.hidden = false;
    group.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-value]');
      if (!btn) return;
      trendMeasure = btn.getAttribute('data-value');
      group.querySelectorAll('button').forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      drawTrend(true);          /* the measure changed, so force the redraw */
      renderTrendTable();
      updateTrendCaption();
    });
  }

  /* --------------------------------------------------------- redraw wiring
   *
   * The chart is drawn at the container's real pixel width, so it has to be
   * redrawn when that width changes. Getting this wrong is not a cosmetic
   * problem: CSS scales the SVG to fit its box, so a chart drawn at 1095px
   * and shown in a 246px column renders its 10px axis type at about 2px.
   * A missed redraw is an illegible chart, not a slightly stale one.
   *
   * So there are two INDEPENDENT triggers, chosen because they fail
   * differently. ResizeObserver is the precise one, but it is delivered by
   * the rendering lifecycle, which browsers suspend while a tab is hidden —
   * and requestAnimationFrame is suspended by exactly the same thing, so
   * debouncing an observer with rAF would have been two mechanisms sharing
   * one failure mode. The debounce therefore uses a timeout, window.resize
   * is kept as a second path, and becoming visible forces a redraw to catch
   * any resize that happened while the tab was away.
   */

  var lastWidth = -1;
  var pending = null;

  function drawTrend(force) {
    var host = document.querySelector('[data-trend]');
    if (!host) return;
    var w = host.clientWidth;
    if (!force && w === lastWidth) return;   /* nothing moved — do no work */
    lastWidth = w;
    renderTrend();
  }

  function schedule() {
    if (pending) clearTimeout(pending);
    pending = setTimeout(function () {
      pending = null;
      drawTrend(false);
    }, 80);
  }

  function init() {
    renderKpis();
    renderMovers();
    renderCoverage();
    ensureTrendReset();
    drawTrend(true);
    renderTrendTable();
    wireMeasureToggle();

    var host = document.querySelector('[data-trend]');
    if (host && window.ResizeObserver) new ResizeObserver(schedule).observe(host);
    window.addEventListener('resize', schedule);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') drawTrend(true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

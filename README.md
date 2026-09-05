# mbajalan.com

Source for my personal site. Hand-written HTML and CSS, no build step, no dependencies, no
framework, and no third-party network requests — one self-hosted typeface (Newsreader, SIL Open Font License, in `fonts/`), no CDN, no analytics.

## Pages

| Path | What it is |
|---|---|
| `/` | The porch — who I am and what I build |
| `/kibsu/` | [kibsu](https://github.com/M-Bajalan/kibsu), the one public tool |
| `/demo/sales/` | A sales-and-distribution dashboard built on entirely synthetic data |

## Layout

```
tokens.css              design tokens — colour, type, spacing, motion
styles.css              the porch
site.js                 theme toggle
demo/dashboard.css      dashboard-only styles, loaded only under /demo/
demo/charts.js          hand-rolled SVG charts, no library
demo/build_sales_data.py  generates demo/sales-data.js
demo/sales-data.js      GENERATED — do not hand-edit
```

## Themes

Every colour token is declared as `light-dark(<light>, <dark>)`, so a colour's two values sit on
one line and cannot drift apart. Which half is used is decided by `color-scheme`:

- no `data-theme` attribute → follows the operating system
- `data-theme="light"` / `data-theme="dark"` → pinned by the reader

The toggle only ever adds, changes or removes that one attribute. A one-line blocking snippet in
each page's `<head>` applies a stored choice before first paint, so nobody gets a white flash.
The button ships `hidden` and is revealed by JavaScript, so with JavaScript off there is no dead
control and the OS preference still works.

Contrast, sRGB gamut and colour-vision-deficiency separation were measured rather than estimated
before the palette was written. Status is never encoded by colour alone — every one is a word, a
dot shape and a colour.

## The demo dashboard

**All of its data is synthetic.** The products, trading companies and regions are invented and the
figures are generated. Nothing in it comes from any employer, customer or distributor.

The KPI tiles, the chart, the movers list and the coverage table are all views of one generated
set of facts, and the generator refuses to write the data file unless the totals reconcile
against it. To regenerate:

```
python demo/build_sales_data.py
```

It is seeded, so the output is byte-identical every run and the committed file does not churn.

## Preview locally

```
python -m http.server 8790
```

Then open <http://localhost:8790>.

## Deployment

GitHub Pages, from `main`. The custom domain is set by the `CNAME` file, so don't remove or
rename it.

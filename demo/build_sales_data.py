"""Generate the synthetic consumer-goods dataset behind the demo dashboard.

EVERYTHING THIS EMITS IS INVENTED. No real customer, distributor, SKU, brand,
region or figure appears here or is derived from one. The brands, trading
companies and regions below are fictional and were made up for this file.

Why a generator instead of hand-typed numbers: the page shows KPI totals, a
monthly trend, a top-movers list and a coverage table that are all views of
the SAME underlying facts. Hand-typed numbers drift, and a dashboard whose
total does not equal the sum of its rows is the first thing anyone who builds
these for a living will notice. So the facts are generated once, every view is
aggregated from them, and the script asserts the reconciliation before it will
write anything.

Deterministic: seeded RNG, fixed calendar. Re-running produces byte-identical
output, so the committed data file never churns.

Run:  python demo/build_sales_data.py
Out:  demo/sales-data.js   (window.DEMO_SALES = {...})
"""

import json
import os
import random
from collections import defaultdict

SEED = 20260816
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

CUR_YEAR = 2025          # "current" year in the demo's own fiction
PRIOR_YEAR = 2024
CUR_THROUGH = 10         # data runs Jan..Oct of the current year

CURRENCY = "USD"

# ----------------------------------------------------------------- dimensions
# All fictional.

REGIONS = ["North", "Central", "South", "Coast"]

DISTRIBUTORS = [
    ("Northgate Trading",       "North"),
    ("Blue Cedar Distribution", "Central"),
    ("Harbour Line Co.",        "Coast"),
    ("Sandstone Wholesale",     "South"),
    ("Riverbend Trading",       "Central"),
]

# (sku, brand, category, base cartons/month, price per carton, trend per month)
SKUS = [
    ("Solara Sunflower Oil 1.8L",  "Solara",    "Edible oil",  4200, 22.40,  0.009),
    ("Solara Sunflower Oil 5L",    "Solara",    "Edible oil",  1350, 54.00,  0.014),
    ("Amberleaf Black Tea 250g",   "Amberleaf", "Hot drinks",  3100, 18.75,  0.004),
    ("Amberleaf Green Tea 100g",   "Amberleaf", "Hot drinks",   980, 15.20,  0.021),
    ("Crispa Cream Biscuit 90g",   "Crispa",    "Biscuits",    5600,  9.60,  -0.006),
    ("Crispa Wafer Multipack",     "Crispa",    "Biscuits",    2240, 14.10,  0.017),
    ("Nuvora Detergent 2kg",       "Nuvora",    "Home care",   2900, 26.30,  -0.013),
    ("Nuvora Dish Liquid 750ml",   "Nuvora",    "Home care",   3350, 11.85,  0.006),
    ("Pellara Tomato Paste 400g",  "Pellara",   "Ambient",     4750,  8.40,  0.002),
    ("Marisol Bath Soap 125g",     "Marisol",   "Personal",    3800,  6.95,  -0.019),
]

# Gentle consumer-goods seasonality — a soft summer dip, a Q4 lift.
SEASON = [1.02, 0.97, 1.00, 1.04, 1.07, 0.94,
          0.89, 0.92, 1.01, 1.06, 1.10, 1.14]

REGION_WEIGHT = {"North": 0.27, "Central": 0.34, "South": 0.21, "Coast": 0.18}

# One synthetic note, referenced by both generated files, so the two pages
# cannot drift into describing themselves differently.
SYNTHETIC_NOTE = ("Every figure on this page is generated. No real customer, "
                   "distributor, product or number appears anywhere in it.")

FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December"]

# Fictional unit cost per carton, as a ratio of price, one per category. This
# is what turns the sales facts into a margin story: the same cartons and the
# same revenue, with an invented cost line under them. Ratios were picked so
# the "push this SKU" default sits BELOW the discount cost used on the margin
# page's what-if slider, while at least one other line sits above it — the
# contrast is the point of that page, and reconcile_margin() asserts it.
COST_RATIO = {
    "Edible oil": 0.79,
    "Hot drinks": 0.56,
    "Biscuits":   0.63,
    "Home care":  0.67,
    "Ambient":    0.81,
    "Personal":   0.52,
}


def build_facts(rng):
    """One row per (year, month, distributor, sku). The single source of truth."""
    facts = []
    for year in (PRIOR_YEAR, CUR_YEAR):
        last_month = CUR_THROUGH if year == CUR_YEAR else 12
        # year-over-year lift, applied on top of each SKU's own trend
        yoy = 1.0 if year == PRIOR_YEAR else 1.061
        for m in range(1, last_month + 1):
            # months since the start of the prior year, for the SKU trend
            t = (year - PRIOR_YEAR) * 12 + (m - 1)
            for dist, region in DISTRIBUTORS:
                share = REGION_WEIGHT[region] / sum(
                    1 for _, r in DISTRIBUTORS if r == region)
                for sku, brand, cat, base, price, trend in SKUS:
                    qty = base * share * SEASON[m - 1] * yoy * ((1 + trend) ** t)
                    qty *= rng.uniform(0.88, 1.12)          # month-to-month noise
                    qty = max(0, int(round(qty)))
                    facts.append({
                        "year": year, "month": m,
                        "distributor": dist, "region": region,
                        "sku": sku, "brand": brand, "category": cat,
                        "cartons": qty,
                        "value": round(qty * price, 2),
                    })
    return facts


# Coverage is SHAPED rather than drawn at random, because the demo has a
# point to make. Total coverage lands slightly negative — inside the dead
# band, so the headline tile reads "steady" — while one trading company
# inside it has fallen off a cliff. That is the story worth showing: an
# average that hides the problem, next to a table that does not. It also
# exercises all three signal states on one page, which an all-green dashboard
# never would.
#   (outlets, prior coverage %, current coverage %)
COVERAGE_PLAN = {
    "Northgate Trading":       (1840, 78.5, 74.1),   # slipping
    "Blue Cedar Distribution": (2210, 71.2, 76.9),   # gaining
    "Harbour Line Co.":        (980,  84.6, 83.9),   # holding
    "Sandstone Wholesale":     (1370, 66.8, 58.4),   # the one to go and ask about
    "Riverbend Trading":       (1520, 73.0, 75.2),   # gaining
}


def build_coverage(rng):
    """Outlet coverage by trading company. Fictional, and deliberately mixed."""
    rows = []
    for dist, region in DISTRIBUTORS:
        universe, prior_pct, cur_pct = COVERAGE_PLAN[dist]
        rows.append({
            "distributor": dist, "region": region,
            "outlets": universe,
            "covered": int(round(universe * cur_pct / 100)),
            "priorCovered": int(round(universe * prior_pct / 100)),
        })
    return rows


# --------------------------------------------------------------- aggregations

def money(x):
    return round(x, 2)


def aggregate(facts, coverage):
    cur = [f for f in facts if f["year"] == CUR_YEAR]
    pri_full = [f for f in facts if f["year"] == PRIOR_YEAR]
    # like-for-like: prior year restricted to the same months the current year has
    pri = [f for f in pri_full if f["month"] <= CUR_THROUGH]

    def tot(rows, key):
        return sum(r[key] for r in rows)

    cur_val, pri_val = tot(cur, "value"), tot(pri, "value")
    cur_qty, pri_qty = tot(cur, "cartons"), tot(pri, "cartons")

    # monthly series, both years, both measures
    def monthly(rows, upto):
        v = [0.0] * 12
        q = [0] * 12
        for r in rows:
            v[r["month"] - 1] += r["value"]
            q[r["month"] - 1] += r["cartons"]
        return ([money(x) for x in v[:upto]], q[:upto])

    cur_v, cur_q = monthly(cur, CUR_THROUGH)
    pri_v, pri_q = monthly(pri_full, 12)

    # the same monthly series, split by distributor — this is the data behind
    # the coverage table's drill-down. Grouped once here rather than filtered
    # per click in charts.js, because a client-side filter over the same
    # facts twice is just this function with extra steps, and reconcile()
    # can only check a shape that already exists in the written file.
    by_dist = {}
    for dist, _region in DISTRIBUTORS:
        d_cur = [f for f in cur if f["distributor"] == dist]
        d_pri_full = [f for f in pri_full if f["distributor"] == dist]
        d_cur_v, d_cur_q = monthly(d_cur, CUR_THROUGH)
        d_pri_v, d_pri_q = monthly(d_pri_full, 12)
        by_dist[dist] = {
            "value":  {"current": d_cur_v, "prior": d_pri_v},
            "volume": {"current": d_cur_q, "prior": d_pri_q},
        }

    # top movers — by SKU, current vs prior like-for-like, on value
    by_sku_cur = defaultdict(float)
    by_sku_pri = defaultdict(float)
    for r in cur:
        by_sku_cur[r["sku"]] += r["value"]
    for r in pri:
        by_sku_pri[r["sku"]] += r["value"]

    movers = []
    for sku, brand, cat, _b, _p, _t in SKUS:
        c, p = by_sku_cur[sku], by_sku_pri[sku]
        movers.append({
            "sku": sku, "brand": brand, "category": cat,
            "current": money(c), "prior": money(p),
            "delta": money(c - p),
            "pct": round((c - p) / p * 100, 1) if p else 0.0,
        })
    movers.sort(key=lambda m: m["pct"], reverse=True)

    # coverage, with the same like-for-like framing
    cov = []
    tot_outlets = tot_cov = tot_prior = 0
    for row in coverage:
        pct = row["covered"] / row["outlets"] * 100
        ppct = row["priorCovered"] / row["outlets"] * 100
        cov.append({
            "distributor": row["distributor"], "region": row["region"],
            "outlets": row["outlets"], "covered": row["covered"],
            "pct": round(pct, 1), "priorPct": round(ppct, 1),
            "deltaPp": round(pct - ppct, 1),
        })
        tot_outlets += row["outlets"]
        tot_cov += row["covered"]
        tot_prior += row["priorCovered"]
    cov.sort(key=lambda c: c["pct"], reverse=True)

    coverage_pct = tot_cov / tot_outlets * 100
    coverage_prior_pct = tot_prior / tot_outlets * 100

    active = len({(f["distributor"], f["sku"]) for f in cur})

    data = {
        "meta": {
            "synthetic": True,
            "currency": CURRENCY,
            # No year NUMBERS anywhere the reader can see. A demo stamped with
            # a real year reads as stale data the moment that year passes, and
            # a static page cannot refresh itself. Relative labels never rot.
            "currentLabel": "This year",
            "priorLabel": "Last year",
            "throughMonth": MONTHS[CUR_THROUGH - 1],
            "monthsElapsed": CUR_THROUGH,
            "months": MONTHS,
            "seed": SEED,
            "note": SYNTHETIC_NOTE,
        },
        "kpi": {
            "value":    {"current": money(cur_val), "prior": money(pri_val)},
            "volume":   {"current": cur_qty,        "prior": pri_qty},
            "lines":    {"current": active,         "prior": active},
            "coverage": {"current": round(coverage_pct, 1),
                         "prior": round(coverage_prior_pct, 1)},
            "dropSize": {"current": money(cur_val / cur_qty),
                         "prior": money(pri_val / pri_qty)},
        },
        "trend": {
            "value":  {"current": cur_v, "prior": pri_v},
            "volume": {"current": cur_q, "prior": pri_q},
            "byDistributor": by_dist,
        },
        "movers": movers,
        "coverage": cov,
        "coverageTotal": {
            "outlets": tot_outlets, "covered": tot_cov,
            "pct": round(coverage_pct, 1),
            "priorPct": round(coverage_prior_pct, 1),
            "deltaPp": round(coverage_pct - coverage_prior_pct, 1),
        },
    }
    return data, cur, pri


WHAT_IF = {
    "defaultSku": "Solara Sunflower Oil 1.8L",
    "maxPushPct": 40,
    "stepPct": 1,
    "discountPerPushPct": 0.35,
}


def build_margin(cur):
    """The margin page's facts. Same current-year rows the sales page uses —
    NOT a separate draw — with one invented number, unit cost, laid on top
    of them via COST_RATIO. Product order is revenue descending, because
    that is the order a reader scanning for "what actually makes money"
    wants, not SKU-table order."""
    by_sku_val = defaultdict(float)
    by_sku_qty = defaultdict(int)
    for r in cur:
        by_sku_val[r["sku"]] += r["value"]
        by_sku_qty[r["sku"]] += r["cartons"]

    products = []
    for sku, brand, cat, _base, price, _trend in SKUS:
        cost = money(price * COST_RATIO[cat])
        cartons = by_sku_qty[sku]
        revenue = money(by_sku_val[sku])
        cogs = money(cartons * cost)
        gp = money(revenue - cogs)
        products.append({
            "sku": sku, "brand": brand, "category": cat,
            "cartons": cartons, "price": round(price, 2), "cost": cost,
            "revenue": revenue, "cogs": cogs, "grossProfit": gp,
            "marginPct": round(gp / revenue * 100, 1) if revenue else 0.0,
            "mixPct": 0.0,   # filled in below, once the base total is known
        })
    products.sort(key=lambda p: p["revenue"], reverse=True)

    base_cartons = sum(p["cartons"] for p in products)
    base_revenue = money(sum(p["revenue"] for p in products))
    base_cogs = money(sum(p["cogs"] for p in products))
    base_gp = money(base_revenue - base_cogs)
    base_margin = round(base_gp / base_revenue * 100, 1)

    for p in products:
        p["mixPct"] = round(p["revenue"] / base_revenue * 100, 1)

    return {
        "meta": {
            "synthetic": True,
            "currency": CURRENCY,
            # Same "no year numbers" rule as the sales page's meta — derived
            # from CUR_THROUGH so the label cannot drift out of step with the
            # facts it describes.
            "periodLabel": "This year, January to %s" % FULL_MONTHS[CUR_THROUGH - 1],
            "seed": SEED,
            "note": SYNTHETIC_NOTE,
        },
        "base": {
            "cartons": base_cartons, "revenue": base_revenue,
            "cogs": base_cogs, "grossProfit": base_gp, "marginPct": base_margin,
        },
        "products": products,
        "whatIf": WHAT_IF,
    }


# ------------------------------------------------------------------ the gate

def reconcile(data, cur, pri):
    """Every view must add up to the same facts. Fail loudly, never silently."""
    problems = []

    def close(a, b, tol, what):
        if abs(a - b) > tol:
            problems.append("%s: %.2f vs %.2f (diff %.2f)" % (what, a, b, a - b))

    close(sum(data["trend"]["value"]["current"]), data["kpi"]["value"]["current"],
          0.05, "trend value sum vs KPI value")
    close(sum(data["trend"]["volume"]["current"]), data["kpi"]["volume"]["current"],
          0.5, "trend volume sum vs KPI volume")
    close(sum(m["current"] for m in data["movers"]), data["kpi"]["value"]["current"],
          0.05, "movers current sum vs KPI value")
    close(sum(m["prior"] for m in data["movers"]), data["kpi"]["value"]["prior"],
          0.05, "movers prior sum vs KPI prior value")
    close(sum(r["value"] for r in cur), data["kpi"]["value"]["current"],
          0.05, "raw facts vs KPI value")
    close(sum(r["value"] for r in pri), data["kpi"]["value"]["prior"],
          0.05, "raw prior facts vs KPI prior")
    close(sum(c["covered"] for c in data["coverage"]),
          data["coverageTotal"]["covered"], 0.5, "coverage rows vs coverage total")

    # the drill-down series (C5): every distributor, every month, must sum
    # back to the page-level trend it was split from. Checked measure by
    # measure and month by month rather than as one grand total, because a
    # grand total can hide a single wrong month behind an offsetting one.
    by_dist = data["trend"]["byDistributor"]
    dist_names = [d for d, _r in DISTRIBUTORS]
    if sorted(by_dist.keys()) != sorted(dist_names):
        problems.append("byDistributor keys do not match DISTRIBUTORS")
    for i in range(CUR_THROUGH):
        close(sum(by_dist[d]["value"]["current"][i] for d in dist_names),
              data["trend"]["value"]["current"][i], 0.05,
              "byDistributor value current[%d] vs trend" % i)
        close(sum(by_dist[d]["volume"]["current"][i] for d in dist_names),
              data["trend"]["volume"]["current"][i], 0.5,
              "byDistributor volume current[%d] vs trend" % i)
    for i in range(12):
        close(sum(by_dist[d]["value"]["prior"][i] for d in dist_names),
              data["trend"]["value"]["prior"][i], 0.05,
              "byDistributor value prior[%d] vs trend" % i)
        close(sum(by_dist[d]["volume"]["prior"][i] for d in dist_names),
              data["trend"]["volume"]["prior"][i], 0.5,
              "byDistributor volume prior[%d] vs trend" % i)

    # prior-year series must hold 12 months, current must hold exactly as many
    # months as the fiction says have happened
    if len(data["trend"]["value"]["prior"]) != 12:
        problems.append("prior trend is not 12 months")
    if len(data["trend"]["value"]["current"]) != CUR_THROUGH:
        problems.append("current trend is not %d months" % CUR_THROUGH)

    # the like-for-like KPI must not silently compare 10 months against 12
    if abs(data["kpi"]["value"]["prior"] - sum(data["trend"]["value"]["prior"])) < 1:
        problems.append("KPI prior looks like a FULL prior year — "
                        "like-for-like comparison is broken")

    return problems


def reconcile_margin(margin, sales_kpi):
    """The margin page must reconcile to itself (products sum to base) AND
    to the sales page (base sums to the same KPI totals) — two pages built
    from one set of facts have to agree, or the demo's whole point is lost.
    Fail loudly, write nothing."""
    problems = []

    def close(a, b, tol, what):
        if abs(a - b) > tol:
            problems.append("%s: %.2f vs %.2f (diff %.2f)" % (what, a, b, a - b))

    base = margin["base"]
    products = margin["products"]

    close(sum(p["revenue"] for p in products), base["revenue"],
          0.05, "margin products revenue sum vs base revenue")
    close(base["revenue"], sales_kpi["value"]["current"],
          0.05, "margin base revenue vs sales KPI value")
    close(sum(p["cartons"] for p in products), base["cartons"],
          0.5, "margin products cartons sum vs base cartons")
    close(base["cartons"], sales_kpi["volume"]["current"],
          0.5, "margin base cartons vs sales KPI volume")
    close(sum(p["grossProfit"] for p in products), base["grossProfit"],
          0.05, "margin products grossProfit sum vs base grossProfit")
    close(sum(p["mixPct"] for p in products), 100.0,
          0.2, "margin mixPct sum vs 100")

    for p in products:
        if not (0 < p["marginPct"] < 100):
            problems.append("marginPct out of (0, 100) for %s: %.1f" %
                             (p["sku"], p["marginPct"]))

    # the what-if slider only makes a point if the default push target is
    # cheap to discount and at least one other line is not — otherwise
    # "push this SKU instead" has nothing to contrast against.
    threshold = margin["whatIf"]["discountPerPushPct"] * 100
    default_sku = margin["whatIf"]["defaultSku"]
    default_rows = [p for p in products if p["sku"] == default_sku]
    if not default_rows:
        problems.append("whatIf.defaultSku %r not found in products" % default_sku)
    else:
        dm = default_rows[0]["marginPct"]
        if not (dm < threshold):
            problems.append("default SKU margin %.1f is not below the %.1f "
                             "discount threshold — no story to tell" % (dm, threshold))
    if not any(p["marginPct"] > threshold for p in products):
        problems.append("no product margin exceeds the %.1f discount "
                         "threshold — the contrast the page is built on is missing" %
                         threshold)

    return problems


def write_generated(path, var_name, body_dict):
    """Both generated files share one header shape and one write pattern, so
    a reader who has seen one recognises the other instantly."""
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), path)
    body = json.dumps(body_dict, indent=2, sort_keys=False, ensure_ascii=True)
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("/* GENERATED by demo/build_sales_data.py — do not hand-edit.\n"
                 "   100%% synthetic. No real customer, distributor, product or\n"
                 "   figure appears in this file. Seed %d, so regenerating gives\n"
                 "   byte-identical output. */\n" % SEED)
        fh.write("window.%s = " % var_name)
        fh.write(body)
        fh.write(";\n")
    return out


def main():
    rng = random.Random(SEED)
    facts = build_facts(rng)
    coverage = build_coverage(rng)
    data, cur, pri = aggregate(facts, coverage)
    margin = build_margin(cur)

    # Both datasets are checked before EITHER file is written. A margin
    # failure after the sales file already landed on disk would leave a
    # half-updated pair — exactly the kind of silent drift this generator
    # exists to prevent.
    problems = reconcile(data, cur, pri)
    problems += reconcile_margin(margin, data["kpi"])
    if problems:
        print("RECONCILIATION FAILED — nothing written:")
        for p in problems:
            print("  !", p)
        raise SystemExit(1)

    sales_out = write_generated("sales-data.js", "DEMO_SALES", data)
    margin_out = write_generated("margin-data.js", "DEMO_MARGIN", margin)

    print("reconciled OK -> %s" % sales_out)
    print("  facts rows          %d" % len(facts))
    print("  KPI value current   %s %.2f" % (CURRENCY, data["kpi"]["value"]["current"]))
    print("  KPI value prior LFL %s %.2f" % (CURRENCY, data["kpi"]["value"]["prior"]))
    print("  value growth        %+.1f%%" % (
        (data["kpi"]["value"]["current"] / data["kpi"]["value"]["prior"] - 1) * 100))
    print("  coverage            %.1f%% (prior %.1f%%)" % (
        data["coverageTotal"]["pct"], data["coverageTotal"]["priorPct"]))
    print("  top mover           %s %+.1f%%" % (
        data["movers"][0]["sku"], data["movers"][0]["pct"]))
    print("  worst mover         %s %+.1f%%" % (
        data["movers"][-1]["sku"], data["movers"][-1]["pct"]))

    default_sku = margin["whatIf"]["defaultSku"]
    default_margin = next(p["marginPct"] for p in margin["products"]
                           if p["sku"] == default_sku)
    print("margin reconciled OK -> %s" % margin_out)
    print("  base revenue        %s %.2f" % (CURRENCY, margin["base"]["revenue"]))
    print("  base margin         %.1f%%" % margin["base"]["marginPct"])
    print("  push-SKU margin     %.1f%% (%s)" % (default_margin, default_sku))
    print("  discount threshold  %.1f%%" % (margin["whatIf"]["discountPerPushPct"] * 100))


if __name__ == "__main__":
    main()

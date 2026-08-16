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
            "note": ("Every figure on this page is generated. No real customer, "
                     "distributor, product or number appears anywhere in it."),
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


def main():
    rng = random.Random(SEED)
    facts = build_facts(rng)
    coverage = build_coverage(rng)
    data, cur, pri = aggregate(facts, coverage)

    problems = reconcile(data, cur, pri)
    if problems:
        print("RECONCILIATION FAILED — nothing written:")
        for p in problems:
            print("  !", p)
        raise SystemExit(1)

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sales-data.js")
    body = json.dumps(data, indent=2, sort_keys=False, ensure_ascii=True)
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("/* GENERATED by demo/build_sales_data.py — do not hand-edit.\n"
                 "   100%% synthetic. No real customer, distributor, product or\n"
                 "   figure appears in this file. Seed %d, so regenerating gives\n"
                 "   byte-identical output. */\n" % SEED)
        fh.write("window.DEMO_SALES = ")
        fh.write(body)
        fh.write(";\n")

    print("reconciled OK -> %s" % out)
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


if __name__ == "__main__":
    main()

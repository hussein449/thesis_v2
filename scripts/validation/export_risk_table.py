"""Regenerate the region x slot rate table from the leakage-corrected panel.

`ESTIMATOR_DECISION.md` fixes the Phase II input as the Poisson GLM refitted
on all 31 months and exported as R[r,b] in crashes per km-hour. The table the
application ships (`src/partitioning/data/risk-table.json`) was generated on
2026-08-09 from the panel *before* the thin-cell leakage fix, so it is not
that table.

This writes the corrected one. It is deliberately NOT written into `src/`:
the application keeps its published table so the manuscript's existing
figures stay reproducible, and the CCR-UAV sandbox consumes this file
instead.

Export follows the documented procedure in RISK_MODEL.md section 2.5:
  1. sum fitted predictions across all 31 months, per region x slot
  2. divide by summed exposure (km x hours) -> crashes per km per hour
  3. reconcile the implied annual total against the observed count

    python -I scripts/validation/export_risk_table.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import riskfit  # noqa: E402

PANEL = riskfit.ROOT / "data" / "panel" / "panel_trainsafe.csv"
OUT = riskfit.ROOT / "sandbox" / "ccr" / "risk-table-corrected.json"

# Panel slot labels in the index order the application uses (1..5).
SLOT_ORDER = [
    "Night_00_06",        # 1
    "MorningRush_06_10",  # 2
    "Daytime_10_16",      # 3
    "EveningRush_16_20",  # 4
    "LateNight_20_24",    # 5
]


def main() -> int:
    df = riskfit.load_panel(PANEL)
    res = riskfit.fit_poisson(df)
    df = df.copy()
    df["fitted"] = riskfit.predict(res, df)

    observed_total = int(df.n_crashes.sum())
    days = df[(df.region_en == df.region_en.iloc[0])
              & (df.time_slot == df.time_slot.iloc[0])].days_in_month.sum()
    observed_annual = observed_total / days * 365

    slot_hours = (df.groupby("time_slot").slot_hours.first()
                  .reindex(SLOT_ORDER).astype(int))
    if slot_hours.isna().any():
        raise ValueError(f"slot labels do not match: {sorted(df.time_slot.unique())}")

    regions = []
    g = df.groupby(["region_en", "region_km_start", "region_km_end"],
                   as_index=False)
    for (name, km_a, km_b), _ in g:
        sub = df[df.region_en == name]
        rates = {}
        for i, slot in enumerate(SLOT_ORDER, start=1):
            cell = sub[sub.time_slot == slot]
            # rate = sum(fitted crashes) / sum(exposure in km-hours)
            rates[str(i)] = float(cell.fitted.sum() / cell.exposure.sum())
        regions.append({
            "region": name,
            "kmStart": float(km_a),
            "kmEnd": float(km_b),
            "ratePerKmHour": rates,
        })
    regions.sort(key=lambda r: r["kmStart"])

    # Reconciliation: sum(rate * length * hours * 365) over regions and slots.
    implied = 0.0
    for r in regions:
        length = r["kmEnd"] - r["kmStart"]
        for i, slot in enumerate(SLOT_ORDER, start=1):
            implied += r["ratePerKmHour"][str(i)] * length * slot_hours[slot] * 365
    drift = implied - observed_annual
    if abs(drift) > 1.0:
        print(f"RECONCILIATION FAILED: implied {implied:.2f}/yr vs observed "
              f"{observed_annual:.2f}/yr (drift {drift:+.2f})")
        return 1

    corridor_km = float(df.region_km_end.max())
    table = {
        "provenance": {
            "generated": "2026-11-15",
            "source": "M51 corridor crash-frequency panel, 2016-01 to 2018-07, "
                      "leakage-corrected",
            "panelFile": "data/panel/panel_trainsafe.csv",
            "cells": int(len(df)),
            "observedCrashes": observed_total,
            "formula": riskfit.FORMULA,
            "family": "poisson",
            "dispersion": round(riskfit.pearson_dispersion(res), 6),
            "coefficients": {k: round(float(v), 5) for k, v in res.params.items()},
            "units": "crashes per km per hour",
            "note": (
                "Refitted on all 31 months after the Stage 1 leakage fix: the "
                "thin-cell fallback for V, S85, S50 and S_mean is now derived "
                "from the 21 training months only and applied frozen, where "
                "the published table averaged over all 31. Rates are annual "
                "means, so the seasonal harmonic averages out. This file is "
                "the Phase II input required by ESTIMATOR_DECISION.md and is "
                "NOT the table the application ships."
            ),
            "supersedes": "src/partitioning/data/risk-table.json (2026-08-09)",
        },
        "corridorLengthKm": corridor_km,
        "annualCrashes": round(implied, 1),
        "observedAnnualCrashes": round(observed_annual, 1),
        "slotHours": {str(i): int(slot_hours[s])
                      for i, s in enumerate(SLOT_ORDER, start=1)},
        "regions": regions,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(table, indent=2) + "\n")

    # --- comparison with the shipped table ---------------------------------
    old_path = riskfit.ROOT / "src" / "partitioning" / "data" / "risk-table.json"
    old = json.loads(old_path.read_text())
    old_by = {r["region"]: r for r in old["regions"]}

    print(f"observed {observed_annual:.1f}/yr   implied {implied:.1f}/yr   "
          f"drift {drift:+.3f}")
    print(f"\n{'region':<10}{'slot':>5}{'old':>12}{'new':>12}{'change':>9}")
    print("-" * 48)
    worst = 0.0
    for r in regions:
        o = old_by[r["region"]]
        for i in range(1, 6):
            a = o["ratePerKmHour"][str(i)]
            b = r["ratePerKmHour"][str(i)]
            pct = 100 * (b - a) / a
            worst = max(worst, abs(pct))
            if abs(pct) >= 2.0:
                print(f"{r['region']:<10}{i:>5}{a:>12.6f}{b:>12.6f}{pct:>+8.1f}%")
    print(f"\nlargest change across all 35 region x slot rates: {worst:.1f}%")
    print(f"\nwrote {OUT.relative_to(riskfit.ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

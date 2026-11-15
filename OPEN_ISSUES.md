# Open Issues — parked for later

Things found while working, not yet acted on. Each has enough detail to pick
up cold.

---

## 1. Battery / docking: paper vs code

**Status 2026-11-15:** 1a, 1b and 1c are FIXED on branch
`feat/dock-stations-battery-swap` (not merged, not pushed). **1d is still
open.** The paper text has NOT been updated yet — see "Paper text to update"
at the end of this section.

The §Operational Layer description in `main.tex:874–884` broadly matches
`src/detection/lib/detection-sim.js`, but four things do not line up.

**Matches:** 2 %/min drain, 25 % return threshold, 60 s transit, 240 s charge,
80 % ready value, 30 s spare delay, 60–100 % initial battery, and
`reserveCount = max(2, ceil(N/8))` (`detection-sim.js:397`).

### 1a. Battery does not drain while flying to the dock
`detection-sim.js:436` drains battery only inside the `patrolling` branch.
The `returning` branch (`:474`) and `docked` branch consume nothing, so the
60 s ferry flight is free. Small effect, but the paper implies a flight.

### 1b. The "returns once above 80 %" rule never binds  ← fix first
Redeploy requires `battery >= readyThreshold && t >= phaseEnd`
(`detection-sim.js:481`). At `chargeRate = 100/240` %/s a drone returning at
25 % reaches 100 % in 180 s, but `dockChargeTime = 240` holds it longer.
**Dock time is therefore always 240 s and the 80 % threshold is inert.**
The paper presents it as the governing rule.
*Fix:* either delete the 80 % sentence from the paper, or drop the 240 s floor
in the code. Do not leave both.

### 1c. There is no dock position
`dockTransitTime` is a flat 60 s from anywhere on a 28.6 km corridor — a drone
at the far end pays the same as one beside the dock. Literally consistent with
"flies to a dock (60 s)", but the paper does not say the dock is placeless.

### 1d. Two battery models exist; only one produced the results  ← reviewer risk
`src/detection/lib/batteryDocking.js` (376 lines) is a *different* model: dock
at the corridor midpoint, distance-dependent travel, **0.75 %/min** drain,
**1.0 %/min** charge, per-segment thresholds `Bcrit`/`Bmin`, reserve pool
`ceil(rho*M)`. Its own header says it is "intentionally INDEPENDENT of the
accident-detection layer".

It is imported **only** by `FleetAvailabilityPlots.jsx`. None of the paper's
results come from it. A reviewer reading the repository will find two battery
models with different constants and no statement of which was used.
*Fix:* say so explicitly, or remove it from the published repository.

### Smaller notes
- Spares teleport to the segment midpoint (`:505`) and never fly from a dock.
- Spares have **no battery of their own** — they can cover indefinitely.
- Spares are dispatched only when `effectiveCount < allocated`, so stacked
  segments do not waste them. Sensible, but undocumented in the paper.
- 240 s for a full charge is ~25 %/min. `Review_Response_Plan.pdf` already
  flags this as idealised.

**Context:** the battery sensitivity in `main.tex:1519–1523` reports only a
2.7 % change in mean alert time at 10 drones, so none of this is likely to
move the headline numbers. It is a reporting-accuracy problem, not a results
problem — but 1b and 1d are both things a reviewer can check in minutes.

---

## 1e. Paper text to update after the battery rewrite  *(open)*

Branch `feat/dock-stations-battery-swap` changes the operational layer. These
sentences in `main.tex` are now wrong:

- **`main.tex:875-877`** — "flies to a dock (60 s), recharges, and returns once
  it is above 80 %". There is no recharging and no 80 % rule. Replace with:
  flies to the **nearest** of 5 docking stations spaced along the corridor,
  draining at the same 2 %/min on the way, **swaps its battery pack** (120 s),
  and flies back to the end of its segment nearest that dock.
- **Table `tab:params`** — drop "Return-to-dock level 25 %" (still true but now
  a floor, not the only trigger), "Flight to dock 60 s" and "Charging 0 to
  100 % in 240 s". Add: docking stations 5, spaced at (i+0.5)L/n; worst-case
  distance to a dock 2.86 km; battery swap 120 s; safety margin 5 %.
- **`main.tex:1519-1523`** — the battery sensitivity (2.7 %, 129.9 s vs
  141.9 s) **must be re-run**. Measured on 20 seeds at M=10 uniform, the new
  model gives mean alert 173.8 s with the operational layer on against 186.1 s
  with it off; the old model gave 170.2 s against the same 186.1 s.
- **`main.tex:1731`** — "a drone does not leave for the dock before it reaches
  the crash" is unchanged and still a limitation.

**Also note for the write-up:** mean time off-station fell from a flat 300 s to
**210 s** (mean 85 s outbound ferry + 120 s swap + short return), so mean drones
available rose from 9.43 to 9.67 at M=10. The operational layer still *improves*
mean alert time relative to switching it off, because the reserve pool adds
coverage the no-battery case never calls on. That inversion is **pre-existing**
(measured on `main` as well) and is worth explaining in the paper rather than
leaving a reader to notice it.

---

## 2. Phase I write-up corrections

Nine tracked items in `VALIDATION_PLAN.md` → "Write-up corrections". None
applied yet; all are prose changes in the two PDFs and `main.tex`.

---

## 3. Phase I Stage 4 (optional)

Rolling backtest and leave-one-region-out, in `VALIDATION_PLAN.md`. The
rolling backtest is now more interesting than when it was written: the
holdout ran 17 % above the training rate, and 13 expanding-window months
would show whether that is a trend or a one-off.

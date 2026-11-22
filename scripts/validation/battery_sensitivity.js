/**
 * Battery / docking sensitivity — regenerated for the swap model.
 * ==============================================================
 *
 * WHY THIS EXISTS
 * ---------------
 * The manuscript's "Battery and Docking" sensitivity paragraph reported
 * 184.6 s against 179.7 s (uniform) and 129.9 s against 141.9 s
 * (risk-aware). Those came from the OLD operational layer, which charged a
 * pack 0 to 100 % in 240 s (~25 %/min, beyond any real fast charger) and
 * gated redeploy on both an 80 % ready threshold and a 240 s floor, so the
 * 80 % rule never bound. That layer has been replaced by battery SWAP at
 * docking stations placed along the corridor:
 *
 *   - dockSwapTime 120 s, a fixed land / swap / take-off dwell that does not
 *     depend on state of charge;
 *   - dockCount 5 stations at (i + 0.5) L / n, so the ferry a drone pays
 *     depends on where it actually is (worst case L / 2n = 2.86 km);
 *   - return trigger = max(lowBatteryThreshold, charge needed to reach the
 *     nearest dock + batterySafetyMargin), so no drone is scheduled to
 *     arrive empty;
 *   - no readyThreshold: the drone leaves the dock at 100 %.
 *
 * The published numbers therefore describe a model that is no longer in the
 * code. This script regenerates them from `src/` so the paragraph can be
 * rewritten against what actually runs.
 *
 * WHAT IT MEASURES
 * ----------------
 * The same contrast the paragraph makes: the operational layer ON (the
 * default) against OFF (`enableOperational: false`, i.e. drones never leave
 * patrol), at the same M = 10 and 30 trials per point the rest of the
 * sensitivity section uses, with the manuscript's seed rule
 * seed(t, M) = 42 + 1009 t + 7919 M so both arms see identical crashes.
 *
 * CCR-UAV is reported at M = 13 as well, because its 2.4 km cap is
 * infeasible at M = 10 on a 28.6 km corridor (it needs 12), and reporting it
 * at M = 10 would mean relaxing the constraint that defines it.
 *
 * HOW TO RUN
 * ----------
 * The simulator uses extensionless imports and a JSON import, so it needs
 * Vite's resolver rather than bare Node:
 *
 *   node scripts/validation/run_with_vite.mjs ./scripts/validation/battery_sensitivity.js main
 */

import { simulateOnce, DEFAULT_PARAMS } from '../../src/detection/lib/detection-sim'
import { ROADS } from '../../src/partitioning/lib/roads'

const TRIALS = 30
const BASE_SEED = 42

function m51() {
  return ROADS.find((r) => r.shortName?.includes('M51')) ?? ROADS[0]
}

/** The manuscript's seed rule, so both arms face identical accidents. */
function seedFor(t, M) {
  return BASE_SEED + t * 1009 + M * 7919
}

function mean(xs) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null
}

function runArm({ patrolMode, M, operational, trials = TRIALS }) {
  const allocation = [{ road: m51(), drones: M }]
  const params = {
    ...DEFAULT_PARAMS,
    patrolMode,
    enableOperational: operational,
  }

  const detected = []          // pooled detection times, all trials
  const trialMeans = []        // per-trial means, for the standard error
  let nTotal = 0
  let nMissed = 0

  for (let t = 0; t < trials; t++) {
    let r
    try {
      r = simulateOnce({ allocation, params, seed: seedFor(t, M) })
    } catch (err) {
      if (err?.code === 'CCR_INFEASIBLE') {
        return { infeasible: true, minimumFleet: err.minimumFleet, reason: err.reason }
      }
      throw err
    }
    detected.push(...r.detectionTimes)
    if (r.avgDetectionTime !== null) trialMeans.push(r.avgDetectionTime)
    nTotal += r.nTotal
    nMissed += r.nMissed
  }

  const m = mean(detected)
  const tm = mean(trialMeans)
  const sd = trialMeans.length > 1
    ? Math.sqrt(
      trialMeans.reduce((s, x) => s + (x - tm) ** 2, 0) / (trialMeans.length - 1)
    )
    : 0

  return {
    infeasible: false,
    events: nTotal,
    missedPct: nTotal ? +(100 * nMissed / nTotal).toFixed(2) : null,
    meanAlertS: m === null ? null : +m.toFixed(1),
    trialMeanS: tm === null ? null : +tm.toFixed(1),
    seMeanS: +(sd / Math.sqrt(Math.max(1, trialMeans.length))).toFixed(1),
    pUnder120Pct: nTotal
      ? +(100 * detected.filter((x) => x <= 120).length / nTotal).toFixed(2)
      : null,
    trialMeans,
  }
}

function pctChange(off, on) {
  if (off === null || on === null) return null
  return +(((off - on) / on) * 100).toFixed(1)
}

/**
 * Paired difference between the two arms.
 *
 * Both arms run the same seed rule, so trial t faces the SAME crashes with
 * the operational layer on and off. The unpaired standard errors (~4-5 s)
 * are dominated by which crashes a trial happens to draw, which is common
 * to both arms and cancels in the pairing. Reporting the paired difference
 * is therefore the honest test of whether the layer moves detection at all,
 * and it is what keeps a 1.7 s gap from being quoted as a real effect.
 */
function pairedDiff(off, on) {
  if (off.infeasible || on.infeasible) return null
  const n = Math.min(off.trialMeans.length, on.trialMeans.length)
  if (n < 2) return null
  const d = []
  for (let i = 0; i < n; i++) d.push(off.trialMeans[i] - on.trialMeans[i])
  const md = d.reduce((s, x) => s + x, 0) / n
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - md) ** 2, 0) / (n - 1))
  const se = sd / Math.sqrt(n)
  const crit = tCrit05(n - 1)
  return {
    n,
    meanDiffS: +md.toFixed(2),
    seDiffS: +se.toFixed(2),
    t: se > 0 ? +(md / se).toFixed(2) : null,
    tCrit05: crit,
    significant5pct: se > 0 ? Math.abs(md / se) >= crit : false,
    ci95S: se > 0
      ? [+(md - crit * se).toFixed(2), +(md + crit * se).toFixed(2)]
      : null,
  }
}

/** Two-sided 5 % critical value of Student's t, by degrees of freedom. */
function tCrit05(df) {
  const table = {
    9: 2.262, 19: 2.093, 29: 2.045, 39: 2.023, 49: 2.009,
    99: 1.984, 199: 1.972, 499: 1.965,
  }
  if (table[df]) return table[df]
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b)
  for (const k of keys) if (df <= k) return table[k]
  return 1.96 // large-sample normal limit
}

/**
 * @param {{trials?: number, fleets?: number[]}} [opts]
 *   trials — per arm. 30 matches the manuscript's sensitivity section, but
 *   the paired standard error at 30 is around 4-8 s, which cannot resolve an
 *   effect of a few seconds. Pass a larger value to settle whether a
 *   difference is real before writing it into the paper.
 */
export function main(opts = {}) {
  const trials = opts.trials ?? TRIALS
  const fleets = opts.fleets ?? [10, 13]

  const cases = []
  for (const M of fleets) {
    cases.push({ label: 'uniform', patrolMode: 'uniform', M })
    cases.push({ label: 'risk-aware', patrolMode: 'risk-aware', M })
    cases.push({ label: 'ccr', patrolMode: 'ccr', M })
  }

  const out = {
    generated: new Date().toISOString().slice(0, 10),
    model: 'battery swap at docks along the corridor',
    settings: {
      trials,
      seedRule: 'seed(t,M) = 42 + 1009*t + 7919*M',
      dockSwapTimeS: DEFAULT_PARAMS.dockSwapTime,
      dockCount: DEFAULT_PARAMS.dockCount,
      lowBatteryThresholdPct: DEFAULT_PARAMS.lowBatteryThreshold,
      batterySafetyMarginPct: DEFAULT_PARAMS.batterySafetyMargin,
      batteryDrainPctPerMin: +(DEFAULT_PARAMS.batteryDrainRate * 60).toFixed(3),
      reserveCountBase: DEFAULT_PARAMS.reserveCount,
      reserveDispatchDelayS: DEFAULT_PARAMS.reserveDispatchDelay,
      droneSpeedMs: DEFAULT_PARAMS.droneSpeed,
      sensingRangeM: DEFAULT_PARAMS.sensingRange,
      trialDays: DEFAULT_PARAMS.totalTime / 86400,
    },
    rows: [],
  }

  for (const c of cases) {
    const on = runArm({ patrolMode: c.patrolMode, M: c.M, operational: true, trials })
    const off = runArm({ patrolMode: c.patrolMode, M: c.M, operational: false, trials })
    const paired = pairedDiff(off, on)
    // Drop the per-trial arrays from the stored record; they exist only to
    // compute the paired statistic above.
    const strip = (a) => {
      const rest = { ...a }
      delete rest.trialMeans
      return rest
    }
    out.rows.push({
      plan: c.label,
      M: c.M,
      batteryOn: strip(on),
      batteryOff: strip(off),
      changeOffVsOnPct: on.infeasible || off.infeasible
        ? null
        : pctChange(off.meanAlertS, on.meanAlertS),
      paired,
    })
  }

  return out
}

/**
 * Regenerate the detection-time CDF behind Figure 10.
 * ===================================================
 *
 * Figure 10 plots, for ten drones, the share of crashes detected by each
 * time tau from 0 to 600 s. Its curve data predates the battery-swap
 * operational layer, so it is regenerated here under the same conditions as
 * the rest of the sweep: 50 trials of 30 simulated days, the manuscript's
 * seed rule, both strategies facing identical crashes.
 *
 * The share is taken over EVERY crash, not only the detected ones, so a
 * missed crash counts against the curve and the value at tau = 600 s is the
 * complement of the missed share in Table 6. That is what makes the two
 * plans comparable at the right-hand end.
 *
 *   node scripts/validation/run_with_vite.mjs \
 *     ./scripts/validation/cdf_run.js main
 */

import { simulateOnce, DEFAULT_PARAMS } from '../../src/detection/lib/detection-sim'
import { ROADS } from '../../src/partitioning/lib/roads'

const M = 10
const TRIALS = 50
const BASE_SEED = 42
const STEP = 30          // tau grid, seconds — matches the published figure

function m51() {
  return ROADS.find((r) => r.shortName?.includes('M51')) ?? ROADS[0]
}

function curveFor(patrolMode) {
  const allocation = [{ road: m51(), drones: M }]
  const params = { ...DEFAULT_PARAMS, patrolMode }
  const times = []
  let nTotal = 0

  for (let t = 0; t < TRIALS; t++) {
    let r
    try {
      r = simulateOnce({
        allocation, params, seed: BASE_SEED + t * 1009 + M * 7919,
      })
    } catch (err) {
      if (err?.code === 'CCR_INFEASIBLE') {
        return { infeasible: true, minimumFleet: err.minimumFleet }
      }
      throw err
    }
    times.push(...r.detectionTimes)
    nTotal += r.nTotal
  }

  const points = []
  for (let tau = 0; tau <= DEFAULT_PARAMS.maxDetectionWindow; tau += STEP) {
    const hit = times.filter((x) => x <= tau).length
    points.push([tau, +(hit / nTotal).toFixed(3)])
  }
  return { infeasible: false, nTotal, detected: times.length, points }
}

export function main() {
  const out = { M, trials: TRIALS, stepS: STEP, curves: {} }
  for (const mode of ['uniform', 'risk-aware', 'ccr']) {
    out.curves[mode] = curveFor(mode)
  }
  // Where the two feasible curves cross, which the text calls out.
  const u = out.curves.uniform.points
  const a = out.curves['risk-aware'].points
  let crossing = null
  for (let i = 1; i < u.length; i++) {
    const before = a[i - 1][1] - u[i - 1][1]
    const after = a[i][1] - u[i][1]
    if (before > 0 && after <= 0) { crossing = u[i][0]; break }
  }
  out.crossingTauS = crossing
  out.finalShare = {
    uniform: u[u.length - 1][1],
    'risk-aware': a[a.length - 1][1],
  }
  return out
}

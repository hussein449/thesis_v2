/**
 * Reproduce the manuscript's headline sweep against the current code.
 * ===================================================================
 *
 * WHY
 * ---
 * Table 6 (tab:sweep) and Figure 9 report average alert time, the share
 * detected within two minutes and the missed share for uniform and
 * risk-aware allocation at eleven fleet sizes, 50 trials of 30 simulated
 * days each. Those numbers predate two changes to the code:
 *
 *   - the operational layer was replaced (charge-at-dock 0-100 % in 240 s,
 *     with an 80 % ready gate, became a 120 s pack swap at five stations
 *     spaced along the corridor);
 *   - CCR-UAV was added as a third strategy.
 *
 * So the published table may no longer describe what the simulator does.
 * This script re-runs exactly the sweep the paper describes, using the
 * manuscript's own settings and seed rule, so the two can be compared
 * cell by cell instead of assumed to agree.
 *
 * WHAT IT MATCHES
 * ---------------
 * Section 3.13: M in {1,2,3,5,7,10,13,16,20,25,30}, 50 trials per point,
 * 30 simulated days, dt = 5 s, v = 8 m/s, R_IoT = 200 m, 600 s window,
 * trial start 08:00, fitted crash rate with no multiplier, and
 * seed(t, M) = 42 + 1009 t + 7919 M so both strategies see identical
 * crashes at every point.
 *
 * CCR-UAV is run at the same points and reported as infeasible below the
 * fleet its length cap requires, rather than relaxed.
 *
 * HOW TO RUN
 * ----------
 *   node scripts/validation/run_with_vite.mjs \
 *     ./scripts/validation/paper_sweep.js main > data/validation/paper_sweep.json
 */

import { simulateOnce, DEFAULT_PARAMS } from '../../src/detection/lib/detection-sim'
import { ROADS } from '../../src/partitioning/lib/roads'

const FLEETS = [1, 2, 3, 5, 7, 10, 13, 16, 20, 25, 30]
const TRIALS = 50
const BASE_SEED = 42

const PUBLISHED = {
  uniform: {
    1: [265.0, 4.2, 83.9], 2: [257.2, 9.9, 66.7], 3: [252.9, 14.0, 54.1],
    5: [245.1, 22.4, 29.0], 7: [226.5, 30.1, 11.9], 10: [176.6, 43.0, 0.2],
    13: [124.8, 55.1, 0.0], 16: [93.4, 65.4, 0.0], 20: [66.4, 77.4, 0.0],
    25: [45.6, 88.2, 0.0], 30: [31.2, 96.5, 0.0],
  },
  'risk-aware': {
    1: [265.0, 4.2, 83.9], 2: [253.5, 12.1, 61.7], 3: [245.1, 18.7, 44.8],
    5: [210.7, 29.7, 22.1], 7: [168.1, 40.7, 14.1], 10: [139.7, 52.0, 5.1],
    13: [94.7, 65.7, 7.7], 16: [73.2, 74.9, 7.6], 20: [64.7, 82.1, 0.8],
    25: [47.8, 88.1, 0.0], 30: [32.5, 95.5, 0.0],
  },
}

function m51() {
  return ROADS.find((r) => r.shortName?.includes('M51')) ?? ROADS[0]
}

function runPoint(patrolMode, M) {
  const allocation = [{ road: m51(), drones: M }]
  const params = { ...DEFAULT_PARAMS, patrolMode }

  const detected = []
  const trialMeans = []
  let nTotal = 0
  let nMissed = 0
  let nUnder120 = 0

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
    detected.push(...r.detectionTimes)
    if (r.avgDetectionTime !== null) trialMeans.push(r.avgDetectionTime)
    nTotal += r.nTotal
    nMissed += r.nMissed
    nUnder120 += r.detectionTimes.filter((x) => x <= 120).length
  }

  const mean = detected.length
    ? detected.reduce((s, x) => s + x, 0) / detected.length : null
  const tm = trialMeans.length
    ? trialMeans.reduce((s, x) => s + x, 0) / trialMeans.length : null
  const sd = trialMeans.length > 1
    ? Math.sqrt(trialMeans.reduce((s, x) => s + (x - tm) ** 2, 0)
      / (trialMeans.length - 1))
    : 0

  return {
    infeasible: false,
    events: nTotal,
    // The paper's "within 2 min" counts missed crashes against the share,
    // so the denominator is every crash, not only the detected ones.
    under120Pct: nTotal ? +(100 * nUnder120 / nTotal).toFixed(1) : null,
    missedPct: nTotal ? +(100 * nMissed / nTotal).toFixed(2) : null,
    meanAlertS: mean === null ? null : +mean.toFixed(1),
    seS: +(sd / Math.sqrt(Math.max(1, trialMeans.length))).toFixed(1),
  }
}

export function main() {
  const out = {
    generated: new Date().toISOString().slice(0, 10),
    note: 'current code, battery-swap operational layer',
    settings: {
      fleets: FLEETS,
      trials: TRIALS,
      trialDays: DEFAULT_PARAMS.totalTime / 86400,
      dtS: DEFAULT_PARAMS.dt,
      droneSpeedMs: DEFAULT_PARAMS.droneSpeed,
      sensingRangeM: DEFAULT_PARAMS.sensingRange,
      windowS: DEFAULT_PARAMS.maxDetectionWindow,
      startHour: DEFAULT_PARAMS.simStartHour,
      seedRule: 'seed(t,M) = 42 + 1009*t + 7919*M',
      operational: true,
      dockSwapTimeS: DEFAULT_PARAMS.dockSwapTime,
      dockCount: DEFAULT_PARAMS.dockCount,
    },
    rows: [],
  }

  for (const M of FLEETS) {
    const row = { M }
    for (const mode of ['uniform', 'risk-aware', 'ccr']) {
      const res = runPoint(mode, M)
      row[mode] = res
      const pub = PUBLISHED[mode]?.[M]
      if (pub && !res.infeasible) {
        row[mode].published = { meanAlertS: pub[0], under120Pct: pub[1], missedPct: pub[2] }
        row[mode].deltaMeanS = +(res.meanAlertS - pub[0]).toFixed(1)
        // Flag a gap the trial-to-trial scatter cannot explain.
        row[mode].beyondNoise = Math.abs(res.meanAlertS - pub[0]) > 2 * res.seS
      }
    }
    out.rows.push(row)
  }
  return out
}

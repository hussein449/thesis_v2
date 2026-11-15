/**
 * A1 / A2 / A3 comparison harness.
 *
 * Runs the three allocation strategies on IDENTICAL accident sequences and
 * identical seeds, which is what makes the comparison fair. `simulateOnce`
 * already draws its accident schedule from a policy-independent RNG seeded
 * only from `seed`, so the same seed gives every strategy the same crashes
 * at the same times and places.
 *
 * Uses the sandbox copy of the simulator, which differs from
 * `src/detection/lib/detection-sim.js` only in which module it imports
 * `buildPatrolSegments` from. Nothing under `src/` is modified.
 */

import { ROADS } from '../../src/partitioning/lib/roads'
import { DEFAULT_PARAMS, simulateOnce } from './detection-sim'
import { buildCcrSegments } from './ccr-uav'

export const STRATEGIES = {
  A1: { key: 'A1', label: 'Uniform', patrolMode: 'uniform' },
  A2: { key: 'A2', label: 'Risk-aware (current)', patrolMode: 'risk-aware' },
  A3: { key: 'A3', label: 'CCR-UAV', patrolMode: 'ccr' },
}

export function m51() {
  return ROADS.find((r) => r.shortName?.includes('M51')) ?? ROADS[0]
}

function summarise(runs) {
  const all = []
  let nTotal = 0
  let nMissed = 0
  let availSum = 0
  let availN = 0
  for (const r of runs) {
    all.push(...r.detectionTimes)
    nTotal += r.nTotal
    nMissed += r.nMissed
    for (const a of r.availabilityHistory) { availSum += a.available; availN++ }
  }
  const sorted = [...all].sort((a, b) => a - b)
  const q = (p) => (sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
    : null)
  return {
    events: nTotal,
    missed: nMissed,
    missedPct: nTotal ? +(100 * nMissed / nTotal).toFixed(2) : null,
    meanAlert: all.length
      ? +(all.reduce((s, x) => s + x, 0) / all.length).toFixed(1) : null,
    medianAlert: q(0.5),
    p90Alert: q(0.9),
    pUnder120: nTotal
      ? +(100 * all.filter((t) => t <= 120).length / nTotal).toFixed(2) : null,
    meanAvailable: availN ? +(availSum / availN).toFixed(2) : null,
  }
}

/**
 * Run one strategy at one fleet size.
 * Returns `{ infeasible: true, minimumFleet }` instead of metrics when the
 * length cap cannot be met — never a relaxed result.
 */
export function runStrategy({ strategy, M, trials = 20, params = {}, baseSeed = 42 }) {
  const road = m51()
  const strat = STRATEGIES[strategy] ?? STRATEGIES.A1
  const allocation = [{ road, drones: M }]
  const p = { ...params, patrolMode: strat.patrolMode }

  const runs = []
  for (let t = 0; t < trials; t++) {
    const seed = baseSeed + t * 1009 + M * 7919
    try {
      runs.push(simulateOnce({ allocation, params: p, seed }))
    } catch (err) {
      if (err?.code !== 'CCR_INFEASIBLE') throw err
      return {
        strategy, M, infeasible: true,
        minimumFleet: err.minimumFleet, reason: err.reason,
      }
    }
  }
  return { strategy, M, infeasible: false, ...summarise(runs) }
}

/** Segment geometry for one strategy — the coverage side of the comparison. */
export function geometry({ strategy, M, params = {} }) {
  const road = m51()
  const L = road.lengthKm * 1000
  if (strategy === 'A3') {
    const { segments, ccr } = buildCcrSegments({ corridorLengthM: L, M, params })
    if (!ccr.feasible) return { infeasible: true, minimumFleet: ccr.minimumFleet }
    const lens = segments.map((s) => s.length / 1000)
    return {
      longestKm: +Math.max(...lens).toFixed(3),
      shortestKm: +Math.min(...lens).toFixed(3),
      surrogateCost: +ccr.surrogateCost.toFixed(4),
    }
  }
  return null
}

/**
 * Compare all three at one fleet size.
 *
 *   await (await import('/sandbox/ccr/harness.js')).compare({ M: 16, trials: 20 })
 */
export function compare({ M, trials = 20, params = {}, baseSeed = 42 } = {}) {
  const p = { ...DEFAULT_PARAMS, ...params }
  const out = { M, trials, results: {} }
  for (const key of ['A1', 'A2', 'A3']) {
    out.results[key] = runStrategy({ strategy: key, M, trials, params: p, baseSeed })
  }
  out.ccrGeometry = geometry({ strategy: 'A3', M, params: p })
  return out
}

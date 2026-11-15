/**
 * The real CCR-UAV objective, evaluated in the simulator.
 *
 *   T~_k   = min(T_k, T_max)        truncated delay; a miss contributes T_max
 *   P_miss = Pr[T_k > T_max]
 *   J(P)   = E[T~] + gamma * T_max * P_miss
 *
 * Truncation matters. Reporting the mean delay *among detected events only*
 * rewards a plan that abandons the hard cases, because the events it fails
 * to detect simply leave the average. Every event therefore enters the mean,
 * a missed one at T_max, and misses are then penalised again through gamma.
 *
 * gamma is dimensionless and must be chosen BEFORE evaluation. It expresses
 * how many detection windows of delay a miss is considered worth.
 */

import { withSegments } from './patrol-modes'
import { simulateOnce } from './detection-sim'
import { m51 } from './harness'

export const OBJECTIVE_DEFAULTS = {
  gamma: 1.0,       // miss penalty, predeclared
  epsilon: 0.02,    // max tolerated overall miss probability
  epsilonRegion: null, // optional per-region cap
  tMax: 600,        // s — must match params.maxDetectionWindow
}

/**
 * Development seeds. Deliberately disjoint from the harness's reporting
 * seeds (base 42) so refinement never tunes on the numbers it is judged by.
 */
export const DEV_SEED_BASE = 777000

export function devSeeds(n) {
  return Array.from({ length: n }, (_, i) => DEV_SEED_BASE + i * 2671)
}

/**
 * Score one explicit partition under the full simulator.
 *
 * `seeds` are common random numbers: passing the same list to every
 * candidate means they all face the same accidents and the same operational
 * timeline, so differences are the partition's doing rather than noise.
 */
export function evaluatePartition({
  segments, M, seeds, params = {}, objective = {},
}) {
  const O = { ...OBJECTIVE_DEFAULTS, ...objective }
  const road = m51()
  const allocation = [{ road, drones: M }]
  const p = { ...params, patrolMode: 'explicit' }

  let nTotal = 0
  let nMissed = 0
  let sumTruncated = 0
  let sumDetected = 0
  let nDetected = 0
  let nUnder120 = 0

  withSegments(segments, () => {
    for (const seed of seeds) {
      const r = simulateOnce({ allocation, params: p, seed })
      nTotal += r.nTotal
      nMissed += r.nMissed
      for (const t of r.detectionTimes) {
        const tt = Math.min(t, O.tMax)
        sumTruncated += tt
        sumDetected += t
        nDetected++
        if (t <= 120) nUnder120++
      }
      sumTruncated += r.nMissed * O.tMax
    }
  })

  if (nTotal === 0) {
    return { J: Infinity, nTotal: 0, note: 'no events generated' }
  }

  const pMiss = nMissed / nTotal
  const meanTruncated = sumTruncated / nTotal
  return {
    nTotal,
    nMissed,
    pMiss,
    meanTruncated,
    // Kept for comparison with the manuscript, never used alone to rank.
    meanAmongDetected: nDetected ? sumDetected / nDetected : null,
    pUnder120: nUnder120 / nTotal,
    J: meanTruncated + O.gamma * O.tMax * pMiss,
    feasible: pMiss <= O.epsilon,
    epsilon: O.epsilon,
    gamma: O.gamma,
  }
}

/**
 * Rank two candidates the way the specification requires.
 *
 * A plan that violates the miss cap never beats one that satisfies it, no
 * matter how good its mean delay — "a low mean delay is not sufficient if
 * misses violate the constraint". Among candidates on the same side of the
 * constraint, lower J wins; among infeasible ones, lower miss probability
 * wins, which walks the candidate toward the feasible region.
 */
export function better(a, b) {
  if (!a) return false
  if (!b) return true
  if (a.feasible !== b.feasible) return a.feasible
  if (!a.feasible) return a.pMiss < b.pMiss
  return a.J < b.J
}

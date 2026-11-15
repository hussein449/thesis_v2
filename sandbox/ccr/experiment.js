/**
 * Step 6 — the controlled A1 / A2 / A3 comparison.
 *
 * Reporting rules are the specification's, not conveniences:
 *
 *   P(received <= 120 s)   fraction of ALL events, missed ones in the
 *                          denominator
 *   P_miss at 600 s        fraction not received inside the window
 *   mean among detected    reported for comparison with the manuscript,
 *                          never used alone to claim superiority
 *   truncated / penalised  J = E[min(T, T_max)] + gamma * T_max * P_miss
 *   90th / 95th percentile reported as null when the quantile falls among
 *                          missed events, because the honest value there is
 *                          "did not arrive", not a large finite number
 *
 * All three strategies see identical accidents at each (M, trial): the
 * simulator draws its schedule from a policy-independent RNG seeded only
 * from the trial seed.
 *
 * Seeds come from FROZEN.reportingSeedBase and are disjoint from the
 * development seeds Stage C refined on.
 *
 * Resumable: `runCell` does one (strategy, M) at a time so a long sweep can
 * be driven in slices.
 */

import { FROZEN, checksumValid } from './frozen-config'
import { buildCcrSegments } from './ccr-uav'
import { withSegments } from './patrol-modes'
import { simulateOnce } from './detection-sim'
import { m51 } from './harness'
import { boundariesToSegments } from './stage-c'

export const FLEET_SIZES = [3, 5, 7, 10, 12, 13, 16, 20, 25, 30]

export function reportingSeeds(n, M) {
  return Array.from(
    { length: n },
    (_, t) => FROZEN.reportingSeedBase + t * 1009 + M * 7919,
  )
}

function quantile(sortedWithInf, p) {
  if (sortedWithInf.length === 0) return null
  const i = Math.min(sortedWithInf.length - 1,
    Math.floor(p * sortedWithInf.length))
  const v = sortedWithInf[i]
  return Number.isFinite(v) ? +v.toFixed(1) : null
}

/**
 * One cell of the experiment.
 *
 * `strategy` is 'A1' | 'A2' | 'A3'. `explicitSegments` overrides the
 * strategy's own segmentation, which is how a Stage C refined plan is
 * evaluated on the reporting seeds.
 */
export function runCell({
  strategy, M, trials = 20, days = 30, explicitSegments = null,
}) {
  if (!checksumValid()) throw new Error('frozen parameters have drifted')
  const road = m51()
  const allocation = [{ road, drones: M }]
  const seeds = reportingSeeds(trials, M)
  const params = {
    totalTime: days * 24 * 3600,
    maxDetectionWindow: FROZEN.primary.tMax,
  }

  let segments = explicitSegments
  if (!segments && strategy === 'A3') {
    const built = buildCcrSegments({
      corridorLengthM: road.lengthKm * 1000, M,
    })
    if (!built.ccr.feasible) {
      return {
        strategy, M, infeasible: true,
        minimumFleet: built.ccr.minimumFleet, reason: built.ccr.reason,
      }
    }
    segments = built.segments
  }

  const mode = segments ? 'explicit'
    : (strategy === 'A2' ? 'risk-aware' : 'uniform')
  const p = { ...params, patrolMode: mode }

  let nTotal = 0
  let nMissed = 0
  let sumTrunc = 0
  let sumDet = 0
  let nDet = 0
  let nUnder120 = 0
  const all = []

  const body = () => {
    for (const seed of seeds) {
      const r = simulateOnce({ allocation, params: p, seed })
      nTotal += r.nTotal
      nMissed += r.nMissed
      for (const t of r.detectionTimes) {
        all.push(t)
        sumDet += t
        nDet++
        sumTrunc += Math.min(t, FROZEN.primary.tMax)
        if (t <= 120) nUnder120++
      }
      for (let k = 0; k < r.nMissed; k++) all.push(Infinity)
      sumTrunc += r.nMissed * FROZEN.primary.tMax
    }
  }
  if (segments) withSegments(segments, body); else body()

  all.sort((a, b) => a - b)
  const pMiss = nTotal ? nMissed / nTotal : null
  const meanTrunc = nTotal ? sumTrunc / nTotal : null
  const lens = segments ? segments.map((s) => s.length / 1000) : null

  return {
    strategy,
    M,
    infeasible: false,
    trials,
    days,
    events: nTotal,
    missed: nMissed,
    pMissPct: pMiss == null ? null : +(100 * pMiss).toFixed(2),
    pUnder120Pct: nTotal ? +(100 * nUnder120 / nTotal).toFixed(2) : null,
    meanAmongDetected: nDet ? +(sumDet / nDet).toFixed(1) : null,
    meanTruncated: meanTrunc == null ? null : +meanTrunc.toFixed(1),
    J: meanTrunc == null ? null
      : +(meanTrunc + FROZEN.primary.gamma * FROZEN.primary.tMax * pMiss)
        .toFixed(1),
    p90: quantile(all, 0.90),
    p95: quantile(all, 0.95),
    // null above means the quantile lands on a missed event.
    feasibleUnderEpsilon: pMiss == null ? null : pMiss <= FROZEN.primary.epsilon,
    longestSegKm: lens ? +Math.max(...lens).toFixed(2) : null,
  }
}

/** Evaluate a Stage C refined plan on the reporting seeds. */
export function runRefined({ M, bounds, trials = 20, days = 30 }) {
  return runCell({
    strategy: 'A3', M, trials, days,
    explicitSegments: boundariesToSegments(bounds),
  })
}

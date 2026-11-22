/**
 * Allocation Policies
 * ===================
 *
 * Two policies compared in this thesis:
 *
 *   - Uniform:    each road gets ⌊N/R⌋ drones, with leftover drones assigned
 *                 to the longest roads (length is a sensible tie-breaker
 *                 because longer roads need more coverage capacity).
 *                 [DESIGN choice; no external source claimed.]
 *
 *   - Risk-aware: drones are distributed proportional to each road's
 *                 composite risk score, using the largest-remainder
 *                 (Hamilton) apportionment method to guarantee integer
 *                 counts that sum exactly to N.
 *
 *                 Hamilton's largest-remainder method dates to
 *                 Hamilton 1792 (used for U.S. House apportionment until
 *                 1900); the algorithm is described in
 *                 Balinski & Young, "Fair Representation: Meeting the Ideal
 *                 of One Man, One Vote" (Yale, 1982).
 *
 *                 The same risk score is computed in
 *                 src/partitioning/lib/roads.js (custom multi-criteria
 *                 heuristic — see that file for the citation note).
 *
 * Both policies return an array of { road, drones } in the same shape, so
 * the simulation engine treats them identically.
 */

import { ROADS, computeRiskScore } from '../../partitioning/lib/roads'

// ---------------------------------------------------------------------------
// Uniform allocation
// ---------------------------------------------------------------------------

export function allocateUniform(totalDrones, roads = ROADS) {
  const R = roads.length
  if (R === 0 || totalDrones <= 0) {
    return roads.map((road) => ({ road, drones: 0, score: computeRiskScore(road) }))
  }

  const base = Math.floor(totalDrones / R)
  let leftover = totalDrones - base * R

  // Tie-breaker for leftover drones: longest road first.
  const order = roads
    .map((road, idx) => ({ road, idx, length: road.lengthKm }))
    .sort((a, b) => b.length - a.length)

  const counts = new Array(R).fill(base)
  for (let i = 0; i < leftover; i++) {
    counts[order[i].idx] += 1
  }

  return roads.map((road, idx) => ({
    road,
    drones: counts[idx],
    score: computeRiskScore(road),
  }))
}

// ---------------------------------------------------------------------------
// Risk-aware allocation (Hamilton method)
// ---------------------------------------------------------------------------

export function allocateRiskAware(totalDrones, roads = ROADS) {
  if (roads.length === 0 || totalDrones <= 0) {
    return roads.map((road) => ({ road, drones: 0, score: computeRiskScore(road) }))
  }

  const scored = roads.map((road) => ({ road, score: computeRiskScore(road) }))
  const totalScore = scored.reduce((s, x) => s + x.score, 0) || 1

  const items = scored.map((x) => {
    const exact = (x.score / totalScore) * totalDrones
    return {
      road: x.road,
      score: x.score,
      exact,
      drones: Math.floor(exact),
      frac: exact - Math.floor(exact),
    }
  })

  let remaining = totalDrones - items.reduce((s, i) => s + i.drones, 0)
  const byFrac = [...items].sort((a, b) => b.frac - a.frac)
  for (let i = 0; i < remaining; i++) {
    byFrac[i].drones += 1
  }

  return items.map(({ road, score, drones }) => ({ road, score, drones }))
}

// ---------------------------------------------------------------------------
// Public registry
// ---------------------------------------------------------------------------

export const POLICIES = {
  uniform: {
    key: 'uniform',
    label: 'Uniform',
    color: '#1D4ED8',
    description:
      'Equal drones per road; within each road, M equal-length patrol segments.',
    allocate: allocateUniform,
    // §6.1 — equal road length per UAV.
    patrolMode: 'uniform',
  },
  riskAware: {
    key: 'riskAware',
    label: 'Risk-aware',
    color: '#f97316',
    description:
      'Hamilton method across roads + per-road segments grouped by equal cumulative risk.',
    allocate: allocateRiskAware,
    // §6.2 — greedy equal-cumulative-risk grouping of 1-km sections.
    patrolMode: 'risk-aware',
  },
  ccr: {
    key: 'ccr',
    label: 'CCR-UAV',
    color: '#0d9488',
    description:
      'Risk-weighted segments on a 100 m grid, chosen by dynamic programming '
      + 'under a hard length cap L_max = v*T_max/2, so no segment can exceed '
      + 'what one UAV revisits inside the detection window.',
    // Road-level apportionment is unchanged; CCR acts on the segments within
    // a road, which is where its length cap applies.
    allocate: allocateRiskAware,
    // §6.3 — exact DP partition under the coverage constraint.
    patrolMode: 'ccr',
    // Unlike the other two, CCR cannot cover a corridor with an arbitrarily
    // small fleet: below ceil(L / L_max) UAVs no length-capped partition
    // exists. Callers must expect buildPatrolSegments to throw
    // CcrInfeasibleError there and report the point as not applicable rather
    // than relaxing the cap. minFleetFor() lets the UI say so in advance.
    mayBeInfeasible: true,
  },
}

/**
 * Smallest fleet for which CCR-UAV can cover `corridorLengthM` at all.
 *
 * Mirrors minimumFleet() in ccr-uav.js, but takes the speed and window from
 * the simulation parameters so the UI reports the limit for the settings the
 * user has actually chosen. Returns 1 for the policies without a cap.
 */
export function minFleetFor(policyKey, corridorLengthM, params = {}) {
  if (POLICIES[policyKey]?.patrolMode !== 'ccr') return 1
  const v = params.droneSpeed ?? 8
  const tMax = params.maxDetectionWindow ?? 600
  const lMax = (v * tMax) / 2
  return Math.max(1, Math.ceil(corridorLengthM / lMax))
}

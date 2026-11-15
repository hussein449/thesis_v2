/**
 * CCR-UAV — Coverage-Constrained Risk-Aware patrol allocation (A3)
 * ================================================================
 *
 * Third allocation strategy, beside A1 uniform (`buildUniformSegments`) and
 * A2 the existing greedy equal-risk method (`buildRiskAwareSegments`).
 *
 * The problem A2 has
 * ------------------
 * A2 gives risky stretches shorter segments, which is sensible, but nothing
 * stops the quiet stretches from becoming very long. On the M51 it leaves a
 * 9.6 km segment at M = 13 and 16. A drone patrolling 9.6 km takes over
 * 20 minutes to come back past a given point, so alerts there are missed
 * outright — A2 optimises the average and never notices it has abandoned a
 * piece of road.
 *
 * What CCR-UAV does
 * -----------------
 * ONE allocation algorithm with TWO coverage protections:
 *
 *   (i)  a hard cap on segment length, L_max = v * T_max / 2, so a single
 *        uninterrupted drone always revisits any point of its segment inside
 *        the detection window;
 *   (ii) a probabilistic cap on missed alerts, evaluated under the full
 *        operational simulator (battery, docks, spares) — stage C, which
 *        lives in the simulator rather than in this module.
 *
 * Subject to those, it minimises risk-weighted alert delay.
 *
 * This module implements stages A and B of the specification:
 *
 *   Stage A  a 100 m grid, per-cell risk weights, and a closed-form
 *            surrogate waiting time for every admissible segment
 *   Stage B  an exact dynamic program for the minimum-cost partition into M
 *            contiguous segments, each respecting L_max
 *
 * Stage C (simulator refinement of the boundaries) is deliberately NOT here:
 * the surrogate below knows nothing about docking, spare substitution or
 * neighbouring receivers, so the DP is globally optimal only for the
 * surrogate. The spec requires the final objective to be evaluated by
 * simulation.
 *
 * GUARANTEE CAVEAT. L_max = 2.4 km is a conservative *uninterrupted-revisit*
 * condition. It is NOT a 600 s guarantee once batteries, ferry flights to a
 * dock, unavailable spares or lost radio messages are in play. That is
 * exactly why constraint (ii) has to be checked in the simulator.
 */

import { rateOverSpan, SLOT_HOURS, TIME_SLOTS } from './risk-scoring'

// ---------------------------------------------------------------------------
// Defaults — spec §2
// ---------------------------------------------------------------------------

export const CCR_DEFAULTS = {
  dx: 100,        // m   — optimisation grid resolution
  v: 8,           // m/s — nominal patrol speed
  rIot: 200,      // m   — IoT alert radio range
  tMax: 600,      // s   — missed-alert threshold
}

/**
 * L_max = v * T_max / 2.
 *
 * A drone sweeping [a, b] back and forth covers the segment twice per period,
 * so the longest gap between successive passes over any point is
 * 2*(b-a)/v. Requiring that to be at most T_max gives b-a <= v*T_max/2.
 * With v = 8 m/s and T_max = 600 s that is 2400 m.
 *
 * The radio range is NOT used to relax this: an alert is only received when
 * the drone comes within rIot of the sensor, and treating that as extra slack
 * would assume the drone is always travelling toward the event.
 */
export function maxSegmentLength(params = {}) {
  const P = { ...CCR_DEFAULTS, ...params }
  return (P.v * P.tMax) / 2
}

/**
 * Smallest fleet for which a length-capped partition exists at all.
 * Below it the geometry is infeasible and CCR-UAV must say so rather than
 * quietly relaxing the cap.
 */
export function minimumFleet(corridorLengthM, params = {}) {
  return Math.ceil(corridorLengthM / maxSegmentLength(params))
}

// ---------------------------------------------------------------------------
// Stage A1 — the 100 m grid and its risk weights
// ---------------------------------------------------------------------------

/**
 * Cut the corridor into cells of `dx` metres (the last one may be shorter).
 *
 * The fine grid only improves where patrol BOUNDARIES may fall. It makes no
 * claim that crash locations are known to 100 m — they are known to the town,
 * which is why each cell simply inherits the fitted rate of the region that
 * contains it, length-weighted where a cell straddles a regional boundary.
 */
export function buildCcrGrid(corridorLengthM, params = {}) {
  const P = { ...CCR_DEFAULTS, ...params }
  if (!(corridorLengthM > 0)) throw new Error('corridorLengthM must be positive')
  // 28600.2 m at dx = 100 would leave a 0.2 m sliver as its own cell. A cell
  // that short is a numerical nuisance and a meaningless place to put a
  // patrol boundary, so any remainder below half a cell is absorbed into the
  // previous one. The M51 therefore gives the 286 cells the spec expects,
  // the last of them 100.2 m.
  let n = Math.ceil(corridorLengthM / P.dx)
  if (n > 1 && corridorLengthM - (n - 1) * P.dx < P.dx / 2) n -= 1

  const cells = []
  for (let i = 0; i < n; i++) {
    const a = i * P.dx
    const b = i === n - 1 ? corridorLengthM : (i + 1) * P.dx
    cells.push({ index: i, a, b, mid: (a + b) / 2, length: b - a })
  }
  return cells
}

/**
 * Expected crashes per day in each cell, per time slot.
 *
 *   w[i][h] = rate(crashes/km/h) * cellLength(km) * slotHours(h)
 *
 * Summed over every cell and slot this returns the corridor's fitted daily
 * total, so the weights carry units rather than being a normalised score.
 */
export function cellRiskWeights(cells) {
  const slots = TIME_SLOTS.map((s) => s.index)
  return cells.map((c) => {
    const kmA = c.a / 1000
    const kmB = c.b / 1000
    const lengthKm = kmB - kmA
    const row = slots.map((h) => {
      const rate = rateOverSpan(kmA, kmB, h)
      return rate * lengthKm * SLOT_HOURS[h]
    })
    return row
  })
}

// ---------------------------------------------------------------------------
// Stage A2 — closed-form surrogate waiting time
// ---------------------------------------------------------------------------

/**
 * Phase-averaged wait for one drone patrolling [a, b] to come within `rIot`
 * of an event at x, assuming continuous back-and-forth motion and a uniformly
 * random patrol phase.
 *
 *   l = max(a, x - rIot),  u = min(b, x + rIot)
 *   T = [ (l - a)^2 + (b - u)^2 ] / [ v * (b - a) ]
 *
 * The drone's cycle is the 2(b-a) path; averaging the first-arrival time over
 * a uniform phase gives the two squared terms, one for each direction of
 * approach. A drone already inside the alert zone waits zero.
 *
 * SURROGATE ONLY. No docking, no neighbouring segments receiving the alert,
 * no packet loss, no battery. Stage C replaces it with simulation.
 */
export function surrogateWait(x, a, b, params = {}) {
  const P = { ...CCR_DEFAULTS, ...params }
  const span = b - a
  if (span <= 0) return Infinity
  const l = Math.max(a, x - P.rIot)
  const u = Math.min(b, x + P.rIot)
  if (l > u) return Infinity              // alert zone misses the segment
  const da = l - a
  const db = b - u
  return (da * da + db * db) / (P.v * span)
}

/**
 * Risk-weighted surrogate cost of covering cells [i, j) with one drone.
 * `weights` is the output of cellRiskWeights().
 */
export function segmentCost(cells, weights, i, j, params = {}) {
  const a = cells[i].a
  const b = cells[j - 1].b
  let cost = 0
  for (let k = i; k < j; k++) {
    const t = surrogateWait(cells[k].mid, a, b, params)
    if (!isFinite(t)) return Infinity
    let wk = 0
    const row = weights[k]
    for (let h = 0; h < row.length; h++) wk += row[h]
    cost += wk * t
  }
  return cost
}

// ---------------------------------------------------------------------------
// Stage B — exact DP partition under the length cap
// ---------------------------------------------------------------------------

/**
 * Minimum-cost partition of the grid into exactly M contiguous, non-empty
 * segments, each no longer than L_max.
 *
 *   F(m, j) = min over i < j with (cells j-1 .b - cells i .a) <= L_max
 *                of  F(m-1, i) + C(i, j)
 *   F(0, 0) = 0,  F(0, j > 0) = Infinity
 *
 * Globally optimal for the additive surrogate C. It is NOT optimal for the
 * true objective: neighbour reception, spare substitution and docking couple
 * segments, and those are handled in stage C.
 *
 * Returns { feasible, boundaries, cost } where `boundaries` are cell indices
 * [0, ..., N] of length M+1.
 */
export function dpPartition(cells, weights, M, params = {}) {
  const P = { ...CCR_DEFAULTS, ...params }
  const lMax = maxSegmentLength(P)
  const N = cells.length
  if (!Number.isInteger(M) || M < 1) throw new Error('M must be a positive integer')

  const corridor = cells[N - 1].b - cells[0].a
  if (M * lMax < corridor - 1e-9) {
    return { feasible: false, reason: 'INFEASIBLE_GEOMETRY', boundaries: null,
             cost: Infinity, minimumFleet: Math.ceil(corridor / lMax) }
  }

  // Precompute admissible spans once: a segment may hold at most `maxCells`
  // cells, since every cell but possibly the last is exactly dx long.
  const F = Array.from({ length: M + 1 }, () => new Float64Array(N + 1).fill(Infinity))
  const back = Array.from({ length: M + 1 }, () => new Int32Array(N + 1).fill(-1))
  F[0][0] = 0

  for (let m = 1; m <= M; m++) {
    for (let j = m; j <= N; j++) {
      const bEnd = cells[j - 1].b
      let best = Infinity
      let bestI = -1
      for (let i = j - 1; i >= m - 1; i--) {
        if (bEnd - cells[i].a > lMax + 1e-9) break   // spans only get longer
        const prev = F[m - 1][i]
        if (!isFinite(prev)) continue
        const c = segmentCost(cells, weights, i, j, P)
        if (!isFinite(c)) continue
        const tot = prev + c
        if (tot < best) { best = tot; bestI = i }
      }
      F[m][j] = best
      back[m][j] = bestI
    }
  }

  if (!isFinite(F[M][N])) {
    return { feasible: false, reason: 'NO_FEASIBLE_PARTITION', boundaries: null,
             cost: Infinity, minimumFleet: Math.ceil(corridor / lMax) }
  }

  const boundaries = new Array(M + 1)
  boundaries[M] = N
  let j = N
  for (let m = M; m >= 1; m--) {
    const i = back[m][j]
    boundaries[m - 1] = i
    j = i
  }
  return { feasible: true, boundaries, cost: F[M][N] }
}

// ---------------------------------------------------------------------------
// Public entry point — same segment shape as the other two strategies
// ---------------------------------------------------------------------------

/**
 * Build A3 patrol segments.
 *
 * Returns segments shaped like buildUniformSegments() /
 * buildRiskAwareSegments() — { index, A, B, length, droneCount } in metres —
 * plus { riskTotal } per segment and a `ccr` block describing feasibility and
 * the surrogate objective.
 *
 * When the length cap cannot be met the function does NOT fall back to a
 * relaxed partition. It returns `feasible: false` and no segments, so the
 * caller must report the fleet size as infeasible rather than comparing a
 * silently-relaxed run against A1 and A2.
 */
export function buildCcrSegments({ corridorLengthM, M, params = {} } = {}) {
  const P = { ...CCR_DEFAULTS, ...params }
  const cells = buildCcrGrid(corridorLengthM, P)
  const weights = cellRiskWeights(cells)
  const res = dpPartition(cells, weights, M, P)

  const meta = {
    gridCells: cells.length,
    dx: P.dx,
    lMaxM: maxSegmentLength(P),
    minimumFleet: minimumFleet(corridorLengthM, P),
    surrogateCost: res.cost,
    feasible: res.feasible,
    reason: res.reason ?? null,
  }
  if (!res.feasible) return { segments: [], ccr: meta }

  const segments = []
  for (let m = 1; m <= M; m++) {
    const i = res.boundaries[m - 1]
    const j = res.boundaries[m]
    let riskTotal = 0
    for (let k = i; k < j; k++) {
      for (const w of weights[k]) riskTotal += w
    }
    segments.push({
      index: m,
      A: cells[i].a,
      B: cells[j - 1].b,
      length: cells[j - 1].b - cells[i].a,
      droneCount: 1,
      riskTotal,
      cellStart: i,
      cellEnd: j,
    })
  }
  return { segments, ccr: meta }
}

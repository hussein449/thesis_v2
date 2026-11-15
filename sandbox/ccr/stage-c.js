/**
 * Stage C — miss-aware refinement of the DP partition.
 *
 * Stage B is globally optimal for the surrogate, but the surrogate knows
 * nothing about docking, battery swaps, spare substitution, neighbouring
 * receivers or the missed-alert threshold. Stage C therefore takes the DP
 * boundaries and moves them by +/-100 and +/-200 m, scoring every candidate
 * in the full simulator against the real objective, and keeps the best
 * improving move until none remains.
 *
 * Coordinate descent, not annealing: with ~15 internal boundaries and an
 * expensive evaluation, a greedy pass that provably never accepts a worse
 * plan is easier to defend than a stochastic search whose result depends on
 * a temperature schedule nobody will reproduce.
 *
 * Every candidate is scored on the SAME development seeds (common random
 * numbers), and those seeds are disjoint from the reporting seeds.
 *
 * RESUMABLE. Each call consumes at most `budget` simulator evaluations and
 * returns state that can be passed straight back in, so a long refinement
 * can be driven in slices without blocking.
 */

import { buildCcrGrid, maxSegmentLength, buildCcrSegments } from './ccr-uav'
import { evaluatePartition, better, devSeeds } from './objective'
import { m51 } from './harness'

const STEPS_M = [100, 200, -100, -200]

/** Boundary list (metres) -> segment objects the simulator understands. */
export function boundariesToSegments(bounds) {
  const segs = []
  for (let m = 1; m < bounds.length; m++) {
    segs.push({
      index: m,
      A: bounds[m - 1],
      B: bounds[m],
      length: bounds[m] - bounds[m - 1],
      droneCount: 1,
    })
  }
  return segs
}

/** A partition is admissible if every segment is non-empty and within L_max. */
export function admissible(bounds, lMax, minLen) {
  for (let m = 1; m < bounds.length; m++) {
    const len = bounds[m] - bounds[m - 1]
    if (len < minLen - 1e-9) return false
    if (len > lMax + 1e-9) return false
  }
  return true
}

/**
 * Start a refinement from the Stage B solution.
 * Returns the state object that `refine()` consumes.
 */
export function startRefinement({
  M, trials = 6, params = {}, objective = {}, ccrParams = {},
} = {}) {
  const road = m51()
  const L = road.lengthKm * 1000
  const { segments, ccr } = buildCcrSegments({
    corridorLengthM: L, M, params: ccrParams,
  })
  if (!ccr.feasible) {
    return { done: true, infeasible: true, minimumFleet: ccr.minimumFleet, M }
  }
  const cells = buildCcrGrid(L, ccrParams)
  const bounds = [segments[0].A, ...segments.map((s) => s.B)]
  const seeds = devSeeds(trials)

  const base = evaluatePartition({
    segments: boundariesToSegments(bounds), M, seeds, params, objective,
  })

  return {
    M, L, bounds, seeds, params, objective,
    lMax: maxSegmentLength(ccrParams),
    minLen: cells[0].length,       // one grid cell
    best: base,
    initial: base,
    surrogateCost: ccr.surrogateCost,
    evaluations: 1,
    sweeps: 0,
    accepted: [],
    done: false,
    infeasible: false,
  }
}

/**
 * Advance the search by at most `budget` simulator evaluations.
 *
 * One sweep walks every internal boundary once, trying each offset, and
 * accepts a move as soon as it improves — first-improvement rather than
 * best-improvement, because each evaluation is expensive and the ordering
 * effect is small next to the cost of exhaustive search.
 */
export function refine(state, budget = 20) {
  if (state.done || state.infeasible) return state
  const s = { ...state, accepted: [...state.accepted] }
  let used = 0
  let improvedThisSweep = false

  // Resume where the previous slice stopped.
  let m = s.cursor ?? 1
  let k = s.cursorStep ?? 0

  while (used < budget) {
    if (m >= s.bounds.length - 1) {
      // finished a sweep
      s.sweeps++
      if (!improvedThisSweep) { s.done = true; break }
      improvedThisSweep = false
      m = 1
      k = 0
      continue
    }

    const step = STEPS_M[k]
    const cand = [...s.bounds]
    cand[m] = s.bounds[m] + step

    k++
    if (k >= STEPS_M.length) { k = 0; m++ }

    if (!admissible(cand, s.lMax, s.minLen)) continue

    const res = evaluatePartition({
      segments: boundariesToSegments(cand),
      M: s.M, seeds: s.seeds, params: s.params, objective: s.objective,
    })
    used++
    s.evaluations++

    if (better(res, s.best)) {
      s.accepted.push({
        boundary: m, step,
        J: +res.J.toFixed(4), pMiss: +res.pMiss.toFixed(5),
      })
      s.bounds = cand
      s.best = res
      improvedThisSweep = true
    }
  }

  s.cursor = m
  s.cursorStep = k
  s.usedThisCall = used
  return s
}

/** Human-readable summary of where a refinement has got to. */
export function report(state) {
  if (state.infeasible) {
    return { infeasible: true, M: state.M, minimumFleet: state.minimumFleet }
  }
  const lens = []
  for (let i = 1; i < state.bounds.length; i++) {
    lens.push((state.bounds[i] - state.bounds[i - 1]) / 1000)
  }
  const d = (a, b) => (a == null || b == null ? null : +(b - a).toFixed(4))
  return {
    M: state.M,
    done: state.done,
    sweeps: state.sweeps,
    evaluations: state.evaluations,
    movesAccepted: state.accepted.length,
    initial: {
      J: +state.initial.J.toFixed(3),
      meanTruncated: +state.initial.meanTruncated.toFixed(2),
      pMiss: +state.initial.pMiss.toFixed(5),
      feasible: state.initial.feasible,
    },
    refined: {
      J: +state.best.J.toFixed(3),
      meanTruncated: +state.best.meanTruncated.toFixed(2),
      pMiss: +state.best.pMiss.toFixed(5),
      feasible: state.best.feasible,
    },
    deltaJ: d(state.initial.J, state.best.J),
    longestKm: +Math.max(...lens).toFixed(3),
    shortestKm: +Math.min(...lens).toFixed(3),
    capRespected: Math.max(...lens) * 1000 <= state.lMax + 1e-6,
  }
}

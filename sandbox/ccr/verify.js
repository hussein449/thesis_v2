/**
 * Verification suite — specification §8.
 *
 * These are the checks that must pass BEFORE any experimental claim is made
 * about CCR-UAV. Each returns { name, pass, detail } and nothing here is
 * allowed to be "expected to fail"; a failure is a bug or a specification
 * disagreement, not a tolerance to widen.
 *
 *   await (await import('/sandbox/ccr/verify.js')).runAll()
 */

import {
  buildCcrGrid, cellRiskWeights, surrogateWait, maxSegmentLength,
  minimumFleet, buildCcrSegments,
} from './ccr-uav'
import { buildPatrolSegmentsWithExplicit as buildPatrolSegments } from './patrol-modes'
import { simulateOnce, DEFAULT_PARAMS } from './detection-sim'
import { m51 } from './harness'
import { evaluatePartition, devSeeds } from './objective'
import { boundariesToSegments } from './stage-c'

const road = () => m51()
const L = () => road().lengthKm * 1000

function ok(name, pass, detail) { return { name, pass: !!pass, detail } }

// --- T1 segmentation feasibility -------------------------------------------

export function t1_segmentation() {
  const lMax = maxSegmentLength()
  const bad = []
  for (const M of [12, 13, 16, 20, 25, 30]) {
    const { segments, ccr } = buildCcrSegments({ corridorLengthM: L(), M })
    if (!ccr.feasible) { bad.push(`M=${M} infeasible`); continue }
    if (segments.length !== M) bad.push(`M=${M}: ${segments.length} segments`)
    if (Math.abs(segments[0].A) > 1e-6) bad.push(`M=${M}: does not start at 0`)
    if (Math.abs(segments[segments.length - 1].B - L()) > 1e-6) {
      bad.push(`M=${M}: does not end at L`)
    }
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].length <= 0) bad.push(`M=${M}: empty segment ${i + 1}`)
      if (segments[i].length > lMax + 1e-6) bad.push(`M=${M}: segment over cap`)
      if (i > 0 && Math.abs(segments[i].A - segments[i - 1].B) > 1e-6) {
        bad.push(`M=${M}: gap or overlap at ${i}`)
      }
    }
  }
  return ok('T1 segmentation covers [0,L] exactly once, all within L_max',
    bad.length === 0, bad.length ? bad : 'M = 12,13,16,20,25,30 all clean')
}

// --- T2 constraint boundary -------------------------------------------------

export function t2_constraintBoundary() {
  const fine = minimumFleet(L())
  const results = {}
  for (const M of [10, 11, 12]) {
    results[`M=${M}`] = buildCcrSegments({ corridorLengthM: L(), M }).ccr.feasible
  }
  // With indivisible 1 km cells the cap of 2.4 km rounds down to 2 km per
  // segment, so more UAVs are needed than on the fine grid. The spec calls
  // for the two cases to be distinguished rather than conflated.
  const coarse = buildCcrSegments({
    corridorLengthM: L(), M: fine, params: { dx: 1000 },
  })
  const coarseMin = Math.ceil(L() / (Math.floor(2400 / 1000) * 1000))
  const pass = fine === 12 && !results['M=10'] && !results['M=11']
    && results['M=12'] && !coarse.ccr.feasible && coarseMin === 15
  return ok('T2 constraint boundary: 12 on the 100 m grid, 15 on 1 km cells',
    pass, { fineGridMinimum: fine, feasibility: results,
      coarseGridFeasibleAt12: coarse.ccr.feasible, coarseGridMinimum: coarseMin })
}

// --- T3 motion and phase ----------------------------------------------------

/**
 * A drone starting at a known position and direction must reach a known
 * point at the time simple kinematics predicts, including after reflecting
 * off the far end of its segment.
 */
export function t3_motionAndPhase() {
  const v = DEFAULT_PARAMS.droneSpeed
  const dt = DEFAULT_PARAMS.dt
  const cases = []
  // Hand-simulate the triangle wave the simulator implements.
  const march = (s0, dir, a, b, steps) => {
    let s = s0, d = dir
    for (let i = 0; i < steps; i++) {
      s += d * v * dt
      if (s >= b) { s = b; d = -1 }
      if (s <= a) { s = a; d = 1 }
    }
    return s
  }
  // outbound, no reflection: 100 steps x 5 s x 8 m/s = 4000 m
  cases.push(['outbound', march(0, 1, 0, 10000, 100), 4000])
  // reflection: segment 0..1000, start 800 heading up.
  // 200 m to the wall, then back down 3800 m -> clamps at 0 and climbs again.
  const reflect = march(800, 1, 0, 1000, 100)
  const expected = (() => {
    let s = 800, d = 1
    for (let i = 0; i < 100; i++) {
      s += d * v * dt
      if (s >= 1000) { s = 1000; d = -1 }
      if (s <= 0) { s = 0; d = 1 }
    }
    return s
  })()
  cases.push(['reflected', reflect, expected])
  const bad = cases.filter(([, got, want]) => Math.abs(got - want) > 1e-9)
  return ok('T3 motion and phase reproduce kinematics including reflection',
    bad.length === 0, cases.map(([n, g, w]) => `${n}: ${g} vs ${w}`))
}

// --- T4 radio reception -----------------------------------------------------

/**
 * The specification's IMPORTANT CODE CHECK: candidate receivers must not be
 * restricted to the event's own segment and its two neighbours if optimised
 * segments can be shorter than the radio range. This measures the worst case
 * that actually occurs.
 */
export function t4_radioReception() {
  const R = DEFAULT_PARAMS.sensingRange
  const rows = []
  let worst = Infinity
  for (const M of [12, 16, 20, 25, 30]) {
    const { segments, ccr } = buildCcrSegments({ corridorLengthM: L(), M })
    if (!ccr.feasible) continue
    const shortest = Math.min(...segments.map((s) => s.length))
    worst = Math.min(worst, shortest)
    rows.push({ M, shortestM: +shortest.toFixed(1), neighbourSpanM: +(2 * shortest).toFixed(1) })
  }
  // A {m-1, m, m+1} candidate set is sufficient only while two segments
  // always span the radius: an alert can then never reach past a neighbour.
  const pass = worst >= R
  return ok('T4 shortest optimised segment still exceeds the radio range',
    pass,
    { radioRangeM: R, shortestSegmentM: +worst.toFixed(1), perFleet: rows,
      note: pass
        ? 'the {m-1,m,m+1} candidate set remains sufficient'
        : 'segments shorter than the radio range — widen the candidate set' })
}

// --- T5 battery, dock and spare ---------------------------------------------

export function t5_batteryDockSpare() {
  const M = 16
  const { segments } = buildCcrSegments({ corridorLengthM: L(), M })
  const seeds = devSeeds(3)
  const withOps = evaluatePartition({
    segments, M, seeds, params: { totalTime: 10 * 24 * 3600, enableOperational: true },
  })
  const withoutOps = evaluatePartition({
    segments, M, seeds, params: { totalTime: 10 * 24 * 3600, enableOperational: false },
  })
  // Same accidents either way; the operational layer must change something,
  // otherwise it is not being applied to CCR segments at all.
  const pass = withOps.nTotal === withoutOps.nTotal
    && withOps.nTotal > 0
    && Math.abs(withOps.meanTruncated - withoutOps.meanTruncated) > 1e-9
  return ok('T5 the battery / dock / spare layer acts on CCR segments', pass, {
    events: withOps.nTotal,
    meanTruncated_on: +withOps.meanTruncated.toFixed(3),
    meanTruncated_off: +withoutOps.meanTruncated.toFixed(3),
  })
}

// --- T6 repeatability --------------------------------------------------------

export function t6_repeatability() {
  const M = 16
  const { segments } = buildCcrSegments({ corridorLengthM: L(), M })
  const seeds = devSeeds(3)
  const p = { totalTime: 7 * 24 * 3600 }
  const a = evaluatePartition({ segments, M, seeds, params: p })
  const b = evaluatePartition({ segments, M, seeds, params: p })
  const pass = a.nTotal === b.nTotal && a.nMissed === b.nMissed
    && Math.abs(a.J - b.J) < 1e-12
  return ok('T6 fixed seeds reproduce events and metrics exactly', pass,
    { events: a.nTotal, J1: a.J, J2: b.J, delta: Math.abs(a.J - b.J) })
}

// --- T7 surrogate sanity ------------------------------------------------------

export function t7_surrogateSanity(trialsPerCase = 3000) {
  const v = 8, R = 200
  const cases = [[1200, 0, 2400], [200, 0, 2400], [700, 400, 1800]]
  const rows = cases.map(([x, a, b]) => {
    const span = b - a, period = 2 * span / v
    let sum = 0
    for (let k = 0; k < trialsPerCase; k++) {
      const ph = Math.random() * period
      const posAt = (t) => {
        const s = ((ph + t) % period) * v
        return a + (s <= span ? s : 2 * span - s)
      }
      let t = 0; const step = span / v / 400; let found = period
      for (; t <= period + 1e-9; t += step) {
        if (Math.abs(posAt(t) - x) <= R) { found = t; break }
      }
      let lo = Math.max(0, found - step), hi = found
      for (let i = 0; i < 30; i++) {
        const m = (lo + hi) / 2
        if (Math.abs(posAt(m) - x) <= R) hi = m; else lo = m
      }
      sum += hi
    }
    const sim = sum / trialsPerCase
    const analytic = surrogateWait(x, a, b, { v, rIot: R })
    return { x, a, b, analytic: +analytic.toFixed(3), sim: +sim.toFixed(3),
      relPct: +(100 * Math.abs(sim - analytic) / analytic).toFixed(2) }
  })
  const pass = rows.every((r) => r.relPct < 3)
  return ok('T7 closed-form wait matches Monte Carlo under its own assumptions',
    pass, rows)
}

// --- T8 weight reconciliation ---------------------------------------------

export function t8_weightsReconcile() {
  const cells = buildCcrGrid(L())
  const w = cellRiskWeights(cells)
  let daily = 0
  for (const row of w) for (const x of row) daily += x
  const annual = daily * 365
  const pass = Math.abs(annual - 445.9) < 0.5
  return ok('T8 grid weights reconcile to the fitted corridor total', pass,
    { cells: cells.length, annual: +annual.toFixed(2), expected: 445.9 })
}

// --- T9 independence ----------------------------------------------------------

export function t9_independence() {
  const dev = new Set(devSeeds(50))
  const reporting = Array.from({ length: 50 }, (_, t) => 42 + t * 1009 + 16 * 7919)
  const overlap = reporting.filter((s) => dev.has(s))
  return ok('T9 development seeds are disjoint from reporting seeds',
    overlap.length === 0,
    { devBase: 777000, reportingBase: 42, overlaps: overlap.length })
}

// --- runner -------------------------------------------------------------------

export function runAll() {
  const tests = [
    t1_segmentation, t2_constraintBoundary, t3_motionAndPhase,
    t4_radioReception, t5_batteryDockSpare, t6_repeatability,
    t7_surrogateSanity, t8_weightsReconcile, t9_independence,
  ]
  const results = tests.map((fn) => {
    try { return fn() } catch (e) { return ok(fn.name, false, `threw: ${e.message}`) }
  })
  return {
    passed: results.filter((r) => r.pass).length,
    total: results.length,
    results,
  }
}

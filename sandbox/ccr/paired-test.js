/**
 * Paired comparison of the allocation strategies.
 *
 * The three strategies see the SAME accidents at each (M, seed), so a
 * difference can be taken event by event rather than between two separately
 * averaged numbers. That removes the accident-to-accident variation, which
 * is the dominant source of noise here, and turns a 6 s difference in means
 * into something that can actually be tested.
 *
 * Per event the penalised delay is
 *
 *   u_k = min(T_k, T_max) + gamma * T_max * 1{event k was missed}
 *
 * whose mean over all events is exactly J. Pairing on u_k therefore tests
 * the real objective rather than a proxy for it.
 *
 * Uncertainty comes from a CLUSTER bootstrap that resamples whole trials,
 * not individual events. Events inside one trial share a drone fleet, a
 * battery timeline and a dock queue, so they are not independent; resampling
 * events would understate the interval.
 *
 * Alignment is asserted, not assumed: if the accident sequences ever stop
 * matching, the pairing is meaningless and the function throws.
 */

import { FROZEN, checksumValid } from './frozen-config'
import { buildCcrSegments } from './ccr-uav'
import { withSegments } from './patrol-modes'
import { simulateOnce } from './detection-sim'
import { m51 } from './harness'
import { reportingSeeds } from './experiment'

/** Per-event penalised delay for one strategy on one seed. */
function trialVector({ strategy, M, seed, params, segments }) {
  const road = m51()
  const allocation = [{ road, drones: M }]
  const mode = segments ? 'explicit'
    : (strategy === 'A2' ? 'risk-aware' : 'uniform')
  const p = { ...params, patrolMode: mode }
  const run = () => simulateOnce({ allocation, params: p, seed })
  const r = segments ? withSegments(segments, run) : run()

  const tMax = FROZEN.primary.tMax
  const gamma = FROZEN.primary.gamma
  const u = r.accidents.map((a) => (a.missed
    ? tMax + gamma * tMax
    : Math.min(a.detectionTime, tMax)))
  const key = r.accidents.map((a) => `${a.time.toFixed(3)}@${a.s.toFixed(3)}`)
  return { u, key }
}

function segmentsFor(strategy, M) {
  if (strategy !== 'A3') return null
  const built = buildCcrSegments({
    corridorLengthM: m51().lengthKm * 1000, M,
  })
  if (!built.ccr.feasible) return { infeasible: true, ccr: built.ccr }
  return built.segments
}

/**
 * Paired comparison of `a` against `b` at one fleet size.
 * Negative mean difference means `a` is better (lower penalised delay).
 */
export function pairedCompare({
  a, b, M, trials = 20, days = 30, nBoot = 10000, bootSeed = 20261115,
}) {
  if (!checksumValid()) throw new Error('frozen parameters have drifted')
  const segA = segmentsFor(a, M)
  const segB = segmentsFor(b, M)
  if (segA?.infeasible) return { infeasible: a, minimumFleet: segA.ccr.minimumFleet }
  if (segB?.infeasible) return { infeasible: b, minimumFleet: segB.ccr.minimumFleet }

  const params = { totalTime: days * 24 * 3600, maxDetectionWindow: FROZEN.primary.tMax }
  const seeds = reportingSeeds(trials, M)

  const perTrial = []            // array of per-event difference arrays
  let nEvents = 0
  for (const seed of seeds) {
    const A = trialVector({ strategy: a, M, seed, params, segments: segA })
    const B = trialVector({ strategy: b, M, seed, params, segments: segB })
    if (A.u.length !== B.u.length) {
      throw new Error(`alignment broken at seed ${seed}: `
        + `${A.u.length} vs ${B.u.length} events`)
    }
    for (let i = 0; i < A.key.length; i++) {
      if (A.key[i] !== B.key[i]) {
        throw new Error(`alignment broken at seed ${seed}, event ${i}: `
          + `${A.key[i]} vs ${B.key[i]}`)
      }
    }
    const d = A.u.map((x, i) => x - B.u[i])
    perTrial.push(d)
    nEvents += d.length
  }

  const flat = perTrial.flat()
  const mean = flat.reduce((s, x) => s + x, 0) / flat.length

  // cluster bootstrap: resample whole trials
  let rng = bootSeed >>> 0
  const next = () => {
    rng ^= rng << 13; rng >>>= 0
    rng ^= rng >> 17
    rng ^= rng << 5; rng >>>= 0
    return rng / 4294967296
  }
  const means = new Float64Array(nBoot)
  for (let r = 0; r < nBoot; r++) {
    let sum = 0, n = 0
    for (let t = 0; t < perTrial.length; t++) {
      const pick = perTrial[Math.floor(next() * perTrial.length)]
      for (let i = 0; i < pick.length; i++) { sum += pick[i]; n++ }
    }
    means[r] = n ? sum / n : 0
  }
  means.sort()
  const lo = means[Math.floor(0.025 * nBoot)]
  const hi = means[Math.floor(0.975 * nBoot)]

  // Wilcoxon signed-rank on the non-zero event differences, normal approx.
  const nz = flat.filter((x) => Math.abs(x) > 1e-12)
  const order = nz.map((x, i) => [Math.abs(x), i]).sort((p, q) => p[0] - q[0])
  const ranks = new Float64Array(nz.length)
  for (let i = 0; i < order.length;) {
    let j = i
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++
    const avg = (i + j + 2) / 2
    for (let k = i; k <= j; k++) ranks[order[k][1]] = avg
    i = j + 1
  }
  let wPlus = 0
  for (let i = 0; i < nz.length; i++) if (nz[i] > 0) wPlus += ranks[i]
  const n = nz.length
  const muW = n * (n + 1) / 4
  const sdW = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24)
  const z = sdW > 0 ? (wPlus - muW) / sdW : 0
  const p = 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)))

  const distinguishable = lo > 0 || hi < 0
  return {
    comparison: `${a} - ${b}`,
    M,
    trials,
    events: nEvents,
    meanDiff: +mean.toFixed(3),
    ci95: [+lo.toFixed(3), +hi.toFixed(3)],
    wilcoxonP: +p.toFixed(6),
    nonTiedEvents: n,
    distinguishable,
    verdict: distinguishable
      ? (mean < 0 ? `${a} better` : `${b} better`)
      : 'indistinguishable',
  }
}

function erf(x) {
  // Abramowitz & Stegun 7.1.26, |error| < 1.5e-7
  const sign = x < 0 ? -1 : 1
  const z = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * z)
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t
  return sign * (1 - poly * Math.exp(-z * z))
}

/**
 * FROZEN EVALUATION PARAMETERS — CCR-UAV
 * ======================================
 *
 * Frozen 2026-11-15, before any experimental result was produced and before
 * the 10-month holdout was touched.
 *
 * The specification requires gamma and epsilon to be predeclared, because
 * both can be moved after the fact to make A3 look better: raise gamma and
 * a coverage-focused plan wins by construction; raise epsilon and a plan
 * that misses alerts becomes "feasible". Fixing them here, with the reasons
 * written down, is what stops the comparison being circular.
 *
 * CHANGING A VALUE IN THIS FILE INVALIDATES EVERY RESULT PRODUCED WITH IT.
 * `checksum` below is verified by the test suite, so an edit cannot pass
 * silently. If a value genuinely must change, change the checksum too, say
 * why in the commit, and re-run everything.
 */

// ---------------------------------------------------------------------------
// epsilon — maximum tolerated probability that an alert goes unanswered
// ---------------------------------------------------------------------------
//
// There is no published standard for an acceptable missed-alert rate on a
// highway patrol, so epsilon is a POLICY INPUT, not an empirical finding,
// and the paper must present it as one. It is anchored to something a
// reader can judge: the corridor's fitted rate of 445.9 crashes per year.
//
//   epsilon = 0.02  ->  about 9 unanswered alerts per year
//   epsilon = 0.05  ->  about 22 per year      <- primary
//   epsilon = 0.10  ->  about 45 per year
//
// 0.05 is the primary because it is strict enough to bind on a plan that
// abandons a stretch of road, while remaining reachable by a fleet in the
// range the study examines. All three are reported, so the conclusion does
// not rest on the choice.
//
// Deliberately NOT chosen by looking at what A3 achieves. A3 recorded zero
// misses in 480 development events at M = 16, so any of these values is
// slack there; epsilon is expected to bite at the smallest feasible fleets
// and under degraded operating conditions, which is where it matters.

// ---------------------------------------------------------------------------
// gamma — dimensionless penalty applied to a miss, on top of truncation
// ---------------------------------------------------------------------------
//
// J = E[min(T, T_max)] + gamma * T_max * P_miss
//
// A missed alert already enters the mean at T_max through truncation, so
// gamma is the EXTRA weight it carries:
//
//   gamma = 0  ->  a miss costs exactly T_max, the same as an alert answered
//                  at the last possible instant. Reported as the lower bound.
//   gamma = 1  ->  a miss costs 2 * T_max: one window of delay, and one
//                  window again for never arriving.          <- primary
//   gamma = 3  ->  a miss costs 4 * T_max, a strongly coverage-biased view.
//
// 1.0 is the primary because it is the one value with a plain reading: an
// unanswered alert is twice as bad as one answered exactly at the deadline.
// Anything higher is a judgement about emergency response that this study
// has no evidence for, so it is carried as sensitivity rather than default.

export const FROZEN = Object.freeze({
  frozenOn: '2026-11-15',
  frozenBefore: 'any experimental result; the 10-month holdout is untouched',

  primary: Object.freeze({
    gamma: 1.0,
    epsilon: 0.05,
    tMax: 600,          // s — must equal params.maxDetectionWindow
  }),

  // Predeclared sensitivity grid. Results are reported across this whole
  // set; no subset may be selected after seeing the outcome.
  sensitivity: Object.freeze({
    gamma: Object.freeze([0, 1.0, 3.0]),
    epsilon: Object.freeze([0.02, 0.05, 0.10]),
  }),

  // Development seeds used for Stage C refinement. Disjoint from the
  // reporting seeds (base 42) so refinement never tunes on the numbers it
  // will be judged by.
  devSeedBase: 777000,
  reportingSeedBase: 42,

  // Geometry and radio, from the specification. Restated here so one file
  // carries everything a result depends on.
  v: 8,                 // m/s
  rIot: 200,            // m
  dx: 100,              // m — optimisation grid
  lMax: 2400,           // m — v * tMax / 2

  checksum: 'ccr-v1-g1-e0.05-t600-dx100-v8-r200',
})

/** Recompute the checksum from the live values, for the drift test. */
export function computeChecksum(f = FROZEN) {
  const p = f.primary
  return `ccr-v1-g${p.gamma}-e${p.epsilon}-t${p.tMax}`
    + `-dx${f.dx}-v${f.v}-r${f.rIot}`
}

/** True when nothing in the frozen set has been edited without notice. */
export function checksumValid(f = FROZEN) {
  return computeChecksum(f) === f.checksum
}

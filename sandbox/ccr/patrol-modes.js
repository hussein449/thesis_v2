/**
 * Patrol-mode wrapper — adds 'ccr' without touching src/.
 *
 * `src/partitioning/lib/uav-segments.js` knows only 'uniform' and
 * 'risk-aware'. Rather than editing it, this module re-exports everything it
 * exports and intercepts the one function that needs a new case. The
 * application still imports the original and behaves exactly as it does on
 * main; only the sandbox simulator imports this.
 */

import {
  buildPatrolSegments as buildPatrolSegmentsOriginal,
} from '../../src/partitioning/lib/uav-segments'
import { buildCcrSegments } from './ccr-uav'

export * from '../../src/partitioning/lib/uav-segments'

/**
 * Thrown when CCR-UAV cannot satisfy its length cap with the fleet given.
 *
 * The specification requires an infeasible configuration to be reported as
 * infeasible rather than silently relaxed, so a sweep should catch this,
 * mark that fleet size N/A for A3 and keep the A1 / A2 results at the same
 * point.
 */
export class CcrInfeasibleError extends Error {
  constructor(reason, minimumFleet, M) {
    super(
      `CCR-UAV infeasible at M = ${M}: ${reason}. `
      + `At least ${minimumFleet} UAVs are needed to respect the `
      + 'segment-length cap.'
    )
    this.name = 'CcrInfeasibleError'
    this.code = 'CCR_INFEASIBLE'
    this.reason = reason
    this.minimumFleet = minimumFleet
    this.M = M
  }
}

/**
 * Same signature as the original, plus mode 'ccr'.
 *
 * 'ccr' reads crash rates straight from the fitted rate table rather than
 * from `sections` / `riskMatrix`, because it works on a 100 m grid rather
 * than the 1 km sections the other two strategies use.
 */
export function buildPatrolSegments(args) {
  const { mode, corridorLengthM, M, ccrParams } = args
  if (mode !== 'ccr' && mode !== 'ccrUav') {
    return buildPatrolSegmentsOriginal(args)
  }
  const { segments, ccr } = buildCcrSegments({
    corridorLengthM, M, params: ccrParams ?? {},
  })
  if (!ccr.feasible) {
    throw new CcrInfeasibleError(ccr.reason, ccr.minimumFleet, M)
  }
  // Carry the solver's metadata on the array so callers can reach the
  // surrogate objective, while the array itself keeps the same shape as the
  // other two strategies.
  segments.ccr = ccr
  return segments
}

// ---------------------------------------------------------------------------
// Explicit-segment injection (sandbox only)
// ---------------------------------------------------------------------------
//
// Stage C has to score arbitrary candidate partitions in the real simulator,
// but `simulateOnce` calls buildPatrolSegments() with a fixed argument list
// and no way to hand it a partition. Rather than change that signature in
// `src/`, this module keeps a module-level override that mode 'explicit'
// reads. `withSegments()` sets it, runs the callback and always clears it.
//
// This exists only because the sandbox must not modify the application. If
// A3 is ever integrated for real, pass the segments through properly instead.

let _explicit = null

export function withSegments(segments, fn) {
  const prev = _explicit
  _explicit = segments
  try {
    return fn()
  } finally {
    _explicit = prev
  }
}

const _originalBuild = buildPatrolSegments

export function buildPatrolSegmentsWithExplicit(args) {
  if (args?.mode === 'explicit') {
    if (!_explicit) throw new Error('mode "explicit" used outside withSegments()')
    return _explicit
  }
  return _originalBuild(args)
}

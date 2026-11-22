/**
 * CCR-UAV — re-export shim.
 * =========================
 *
 * The algorithm itself now lives in the application, at
 * `src/partitioning/lib/ccr-uav.js`, and is reached in the normal way
 * through `buildPatrolSegments({ mode: 'ccr', ... })`. It was developed
 * here first so the experiment could run without touching `src/`.
 *
 * This file stays so the frozen experiment scripts in this folder
 * (experiment.js, harness.js, paired-test.js, patrol-modes.js, stage-c.js,
 * verify.js) keep importing './ccr-uav' as they always did.
 *
 * ONE BEHAVIOURAL CHANGE comes with the move. The sandbox copy read its
 * rates from `./risk-scoring`, the local fork bound to
 * `risk-table-corrected.json`. The application copy reads
 * `src/partitioning/data/risk-table.json`, which is the table the paper
 * reports. The two differ by at most 0.6 % in every region's daytime rate
 * (5.7 % in the worst of the 35 region-slot cells, a low-rate night cell)
 * and both integrate to the same 445.9 crashes per year, so the partitions
 * are expected to be identical and the surrogate costs to shift in the
 * fourth significant figure. `verify.js` is the check on that claim: if a
 * spec test fails here, the move is what to suspect first.
 */

export {
  CCR_DEFAULTS,
  maxSegmentLength,
  minimumFleet,
  buildCcrGrid,
  cellRiskWeights,
  surrogateWait,
  segmentCost,
  dpPartition,
  buildCcrSegments,
} from '../../src/partitioning/lib/ccr-uav'

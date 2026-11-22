/**
 * Check the manuscript's quantitative claims against the code.
 * ============================================================
 *
 * Every number in Table 4 (simulation settings) and the algorithm
 * description has a counterpart in DEFAULT_PARAMS or in ccr-uav.js. This
 * script reads both and reports any that disagree, so a claim cannot drift
 * out of step with the code without someone noticing.
 *
 * It checks values, not prose. Claims it cannot reach — the fitted
 * coefficients, the data provenance — are listed as "not checked here" so
 * the gap is visible rather than implied to be covered.
 *
 *   node scripts/validation/run_with_vite.mjs \
 *     ./scripts/validation/audit_paper.js main
 */

import { DEFAULT_PARAMS } from '../../src/detection/lib/detection-sim'
import {
  CCR_DEFAULTS, maxSegmentLength, minimumFleet, buildCcrGrid,
} from '../../src/partitioning/lib/ccr-uav'
import { ROADS } from '../../src/partitioning/lib/roads'
import { buildSections } from '../../src/partitioning/lib/sections'
import table from '../../src/partitioning/data/risk-table.json' with { type: 'json' }

const m51 = ROADS.find((r) => r.shortName?.includes('M51')) ?? ROADS[0]
const L = m51.lengthKm * 1000

function check(claim, paperValue, codeValue, note = '') {
  const ok = String(paperValue) === String(codeValue)
  return { ok, claim, paper: paperValue, code: codeValue, note }
}

export function main() {
  const rows = []

  // ---- Table 4: simulation settings -------------------------------------
  rows.push(check('Time step dt', '5 s', `${DEFAULT_PARAMS.dt} s`))
  rows.push(check('Trial length', '30 days',
    `${DEFAULT_PARAMS.totalTime / 86400} days`))
  rows.push(check('Drone speed v', '8 m/s', `${DEFAULT_PARAMS.droneSpeed} m/s`))
  rows.push(check('Alert range R_IoT', '200 m',
    `${DEFAULT_PARAMS.sensingRange} m`))
  rows.push(check('Detection window', '600 s',
    `${DEFAULT_PARAMS.maxDetectionWindow} s`))
  rows.push(check('Trial start time', '08:00',
    `${String(DEFAULT_PARAMS.simStartHour).padStart(2, '0')}:00`))
  rows.push(check('Battery use', '2 %/min',
    `${+(DEFAULT_PARAMS.batteryDrainRate * 60).toFixed(3)} %/min`))
  rows.push(check('Return-to-dock level', '25 %',
    `${DEFAULT_PARAMS.lowBatteryThreshold} %`))
  rows.push(check('Battery safety margin', '5 %',
    `${DEFAULT_PARAMS.batterySafetyMargin} %`))
  rows.push(check('Battery swap at dock', '120 s',
    `${DEFAULT_PARAMS.dockSwapTime} s`))
  rows.push(check('Docking stations', '5', `${DEFAULT_PARAMS.dockCount}`))
  rows.push(check('Worst case to a dock', '2.86 km',
    `${(m51.lengthKm / (2 * DEFAULT_PARAMS.dockCount)).toFixed(2)} km`,
    'L / 2n'))
  rows.push(check('Spare drone delay', '30 s',
    `${DEFAULT_PARAMS.reserveDispatchDelay} s`))
  rows.push(check('Spare drones', 'max(2, ceil(M/8))',
    `max(${DEFAULT_PARAMS.reserveCount}, ceil(M/8))`,
    'formula read from detection-sim.js line ~524'))

  // ---- Corridor and sections --------------------------------------------
  rows.push(check('Corridor length', '28.6002 km', `${m51.lengthKm} km`))
  rows.push(check('Section size / count', '1 km (29 sections)',
    `1 km (${buildSections(m51.lengthKm).length} sections)`))

  // ---- CCR-UAV ----------------------------------------------------------
  rows.push(check('CCR grid resolution', '100 m', `${CCR_DEFAULTS.dx} m`))
  rows.push(check('CCR grid cells', '286',
    `${buildCcrGrid(L, CCR_DEFAULTS).length}`))
  rows.push(check('L_max = v*T_max/2', '2.4 km',
    `${(maxSegmentLength({ v: DEFAULT_PARAMS.droneSpeed, tMax: DEFAULT_PARAMS.maxDetectionWindow }) / 1000).toFixed(1)} km`))
  rows.push(check('CCR minimum fleet', '12',
    `${minimumFleet(L, { v: DEFAULT_PARAMS.droneSpeed, tMax: DEFAULT_PARAMS.maxDetectionWindow })}`))

  // ---- Rate table --------------------------------------------------------
  rows.push(check('Crashes per year (model output)', '445.9',
    `${table.annualCrashes}`))
  rows.push(check('Panel cells', '1,085',
    `${table.provenance.cells.toLocaleString('en-US')}`))
  rows.push(check('Observed crashes', '1,152',
    `${table.provenance.observedCrashes.toLocaleString('en-US')}`))
  rows.push(check('Residual dispersion', '1.13',
    `${(+table.provenance.dispersion).toFixed(2)}`))
  rows.push(check('Regions', '7', `${table.regions.length}`))

  // ---- Fitted coefficients quoted in Table 7 -----------------------------
  const C = table.provenance.coefficients
  const rr = (b) => Math.exp(b).toFixed(2)
  rows.push(check('RAF rate ratio', '3.84', rr(C.ln_RAF)))
  rows.push(check('Curvature rate ratio', '1.25', rr(C.ln_curv)))
  rows.push(check('Ramp rate ratio', '0.70', rr(C.ln_ramps)))
  rows.push(check('Traffic rate ratio', '1.47', rr(C.ln_V)))
  rows.push(check('Speed rate ratio', '20.29', rr(C.ln_S85)))

  const failed = rows.filter((r) => !r.ok)
  return {
    generated: new Date().toISOString().slice(0, 10),
    checked: rows.length,
    passed: rows.length - failed.length,
    failed: failed.length,
    rows,
    notCheckedHere: [
      'standard errors, p-values and confidence intervals in Table 7',
      'AIC improvements in Figure 8',
      'the data-source descriptions in Table 1 and Table 2',
      'anything requiring the restricted panel, which is not in the repo',
    ],
  }
}

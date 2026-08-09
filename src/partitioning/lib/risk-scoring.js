/**
 * Fitted Risk Rates — M51 Corridor Crash-Frequency Model
 * ======================================================
 *
 * Replaces the manual T/C/M scoring that previously stood in for a risk
 * model. Risk is no longer a 0-2 score with hand-set weights; it is a fitted
 * crash rate in CRASHES PER KILOMETRE PER HOUR, estimated from 1,085 cells of
 * observed crash data on this corridor (2016-01 to 2018-07).
 *
 *   R_{i,b}  =  rate for the region containing section i, in time slot b
 *
 * WHAT THIS CHANGES
 *
 *   Before:  R_{i,b} = a_b·T_i + c_b·C_i + m_b·M_i, with T, C, M assigned by
 *            hand in {0,1,2} and the weights a_b, c_b, m_b chosen so each
 *            slot's row summed to 1. R was unitless and ordinal — it could
 *            rank sections but could not say how often anything happened, so
 *            the corridor's accident count had to be supplied separately as
 *            an assumed 200/yr.
 *
 *   After:   R carries units. Expected crashes in section i during slot b is
 *            R_{i,b} × length_km × slot_hours, and summing that over the whole
 *            corridor and year reproduces the observed 446 crashes/yr without
 *            any tuning constant. The annual figure is now an OUTPUT.
 *
 * RESOLUTION. The model was fitted on seven corridor regions, so seven rates
 * per slot is the honest resolution. The 1-km section grid is retained because
 * accident positions, patrol segments and the map all use it — each section
 * simply takes the rate of the region containing it. Sections inside a region
 * are identical by construction; no within-region detail is invented.
 *
 * WHY THE MODEL DOES NOT NAME MERGING SEPARATELY. Ramp density is in the
 * fitted equation (`ln_ramps`), but on this corridor it fits NEGATIVE
 * (-0.361, p = 0.005) — sections with more ramps record fewer crashes, the
 * opposite of what the old M_i score assumed. That coefficient is a property
 * of the data, not an error, and it is kept. It acts inside the fitted rates
 * rather than as a visible factor, so the simulator never asserts anywhere
 * that ramps make a road safer.
 *
 * Source table: ../data/risk-table.json — see its `provenance` block for the
 * fitted equation, coefficients and dispersion.
 */

// Import attribute included so this module also loads under plain Node (for
// scripts and tests), not only through the Vite pipeline.
import table from '../data/risk-table.json' with { type: 'json' }
import { buildSections, DEFAULT_SECTION_LENGTH_KM } from './sections'

// ---------------------------------------------------------------------------
// Time slots
// ---------------------------------------------------------------------------

/**
 * Five time slots dividing the 24-hour day, indexed 1..5. These match the
 * slot definitions the model was fitted on exactly, so a slot index here and
 * a slot in the crash panel mean the same hours.
 *
 * Note the slots are NOT equal length: 6, 4, 6, 4, 4 hours. The old model
 * gave each an equal share of the day's accidents, which understated the
 * rush-hour rate per hour and overstated the night rate. Rates are per hour,
 * so the asymmetry now takes care of itself.
 */
export const TIME_SLOTS = [
  { index: 1, label: 'Night / early morning', startHour: 0,  endHour: 6  },
  { index: 2, label: 'Morning rush',          startHour: 6,  endHour: 10 },
  { index: 3, label: 'Normal day',            startHour: 10, endHour: 16 },
  { index: 4, label: 'Evening rush',          startHour: 16, endHour: 20 },
  { index: 5, label: 'Late evening',          startHour: 20, endHour: 24 },
]

/** Hours covered by each slot, indexed 1..5. */
export const SLOT_HOURS = Object.fromEntries(
  TIME_SLOTS.map((s) => [s.index, s.endHour - s.startHour])
)

/** Time slot whose [startHour, endHour) interval contains `hour` (0..24). */
export function timeSlotForHour(hour) {
  for (const slot of TIME_SLOTS) {
    if (hour >= slot.startHour && hour < slot.endHour) return slot
  }
  // hour = 24 belongs to the last slot
  return TIME_SLOTS[TIME_SLOTS.length - 1]
}

// ---------------------------------------------------------------------------
// The fitted rate table
// ---------------------------------------------------------------------------

/** Regions with their chainage bounds and per-slot rates, as fitted. */
export const RISK_TABLE = table

/** Provenance of the fitted rates — surfaced in the UI so the figures are traceable. */
export const RISK_PROVENANCE = table.provenance

/**
 * Corridor-wide expected crashes per year, implied by the rate table.
 * This is a model output, not an assumption: 445.9/yr, matching the observed
 * count over the study period.
 */
export const ANNUAL_CRASHES = table.annualCrashes

/**
 * Region whose [kmStart, kmEnd) contains chainage `km`. The last region is
 * closed on the right so km = L resolves.
 */
export function regionAtKm(km) {
  const regions = RISK_TABLE.regions
  const last = regions[regions.length - 1]
  if (km >= last.kmStart) return last
  for (const r of regions) {
    if (km >= r.kmStart && km < r.kmEnd) return r
  }
  return regions[0]
}

/**
 * Fitted crash rate at a single chainage, in crashes per km per hour.
 */
export function rateAt(km, timeSlotIndex) {
  const region = regionAtKm(km)
  const rate = region.ratePerKmHour[String(timeSlotIndex)]
  if (rate == null) {
    throw new Error(
      `No fitted rate for slot ${timeSlotIndex} in region ${region.region}`
    )
  }
  return rate
}

/**
 * Fitted rate over a span of chainage, length-weighted across every region the
 * span overlaps.
 *
 * Region boundaries sit at 6.306, 8.786, 11.969, 17.004, 19.982 and 23.082 km
 * — none of them on a 1-km mark — so six of the 29 sections straddle two
 * regions. Taking the rate at the section's midpoint would assign the whole
 * section to one side and silently move crashes between regions: it loses
 * 0.8% of the corridor total, enough that the generated annual count would no
 * longer reconcile with the fitted 446/yr. Weighting by overlap preserves it
 * exactly.
 *
 * The denominator is the length actually covered by the table rather than the
 * requested span, so a section running a hair past the final boundary through
 * floating-point slack still returns that region's rate instead of a value
 * diluted toward zero.
 */
export function rateOverSpan(kmStart, kmEnd, timeSlotIndex) {
  let weighted = 0
  let covered = 0
  for (const r of RISK_TABLE.regions) {
    const lo = Math.max(kmStart, r.kmStart)
    const hi = Math.min(kmEnd, r.kmEnd)
    if (hi > lo) {
      const rate = r.ratePerKmHour[String(timeSlotIndex)]
      if (rate == null) {
        throw new Error(
          `No fitted rate for slot ${timeSlotIndex} in region ${r.region}`
        )
      }
      weighted += rate * (hi - lo)
      covered += hi - lo
    }
  }
  if (covered <= 0) return rateAt((kmStart + kmEnd) / 2, timeSlotIndex)
  return weighted / covered
}

/** Region covering the most of [kmStart, kmEnd) — for labelling only. */
export function dominantRegion(kmStart, kmEnd) {
  let best = null
  let bestOverlap = -1
  for (const r of RISK_TABLE.regions) {
    const overlap = Math.min(kmEnd, r.kmEnd) - Math.max(kmStart, r.kmStart)
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      best = r
    }
  }
  return best ?? RISK_TABLE.regions[0]
}

// ---------------------------------------------------------------------------
// Risk matrix
// ---------------------------------------------------------------------------

/**
 * Build the full N × B risk matrix over the corridor's 1-km sections.
 *
 * Each row carries:
 *   R          — per-km-hour rate for each of the five slots
 *   lambdaDay  — expected crashes in this section per slot per day,
 *                R[b] × length × slot_hours. This is what the accident
 *                generator draws from; no renormalisation follows it.
 *   region     — name of the region supplying the rate, for display
 *
 * `T`, `C`, `M` are gone. Nothing downstream should reconstruct them: they
 * were inputs to a scoring formula this model replaces, not measurements.
 */
export function buildRiskMatrix(road, sectionLengthKm = DEFAULT_SECTION_LENGTH_KM) {
  const sections = buildSections(road.lengthKm, sectionLengthKm)
  return sections.map((sec) => {
    const region = dominantRegion(sec.sStart, sec.sEnd)
    const R = TIME_SLOTS.map((slot) => rateOverSpan(sec.sStart, sec.sEnd, slot.index))
    return {
      sectionIndex: sec.index,
      sStart: sec.sStart,
      sEnd: sec.sEnd,
      length: sec.length,
      region: region.region,
      R,
      lambdaDay: R.map((r, b) => r * sec.length * SLOT_HOURS[b + 1]),
    }
  })
}

/**
 * Daily-average risk per section, in crashes per km per hour, weighted by slot
 * length:
 *
 *   R_i = Σ_b R_{i,b}·h_b / Σ_b h_b
 *
 * The old model used a flat 1/B mean over the five slots. That treated a
 * 6-hour night and a 4-hour rush hour as equally weighted, biasing the daily
 * average toward the two long low-risk slots. Used by the risk-aware patrol
 * segmentation.
 */
export function dailyMeanRate(row) {
  let weighted = 0
  let hours = 0
  for (const slot of TIME_SLOTS) {
    weighted += row.R[slot.index - 1] * SLOT_HOURS[slot.index]
    hours += SLOT_HOURS[slot.index]
  }
  return weighted / hours
}

// ---------------------------------------------------------------------------
// Top level
// ---------------------------------------------------------------------------

/**
 * Corridor risk model: the section grid, the fitted risk matrix, and the
 * implied corridor total.
 *
 * `dailyTotal` is derived from the fitted rates rather than from an assumed
 * annual count — it is reported for display and cross-checking, and no longer
 * feeds the accident generator, which draws each section independently.
 */
export function buildCorridorRiskModel(road, sectionLengthKm = DEFAULT_SECTION_LENGTH_KM) {
  const riskMatrix = buildRiskMatrix(road, sectionLengthKm)
  const dailyTotal = riskMatrix.reduce(
    (sum, row) => sum + row.lambdaDay.reduce((a, b) => a + b, 0),
    0
  )
  return {
    riskMatrix,
    dailyTotal,
    annualTotal: dailyTotal * 365,
    timeSlots: TIME_SLOTS,
    slotHours: SLOT_HOURS,
    provenance: RISK_PROVENANCE,
  }
}

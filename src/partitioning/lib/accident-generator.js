/**
 * Accident Event Generator — driven by fitted crash rates
 * ========================================================
 *
 * Generates concrete accident events from the fitted rate matrix produced by
 * risk-scoring.buildRiskMatrix().
 *
 *   N_{i,b}(d)  ~  Poisson(λ_{i,b})     λ_{i,b} = R_{i,b} · length_i · h_b
 *   τ_k         ~  U(t_start_b, t_end_b)   time of day, hours
 *   s_k         ~  U(s_start_i, s_end_i)   chainage along the corridor, km
 *
 * Each accident is stored as a tuple (τ_k, i_k, s_k).
 *
 * WHAT CHANGED, AND WHY IT MATTERS
 *
 * The previous version distributed an assumed corridor total:
 *
 *     λ_day_b     = λ_day_total / B            ← equal share to every slot
 *     P(i | b)    = (R_{i,b} + ε) / Σ_n (…)    ← risk decided only WHERE
 *     λ_day_{i,b} = λ_day_b · P(i | b)
 *
 * Two consequences, both now gone:
 *
 *   1. Time of day had no effect on HOW MANY accidents occurred, only on
 *      where they landed. Every slot received exactly one fifth of the day
 *      regardless of the weights, so a "morning rush" simulation generated no
 *      more accidents than a night one.
 *   2. Slots are unequal (6, 4, 6, 4, 4 hours), so an equal share meant the
 *      6-hour night slot carried the same expected count as the 4-hour rush,
 *      i.e. a systematically lower rate per hour on the busiest roads.
 *
 * Rates are now absolute — crashes per km per hour — so each section-slot is
 * drawn independently and the corridor total emerges from the model. There is
 * nothing left to normalise, which is why ε has gone too: it existed to keep
 * an all-zero-score section from having zero probability under a normalised
 * distribution. A fitted rate is strictly positive everywhere, so no smoothing
 * constant is needed.
 */

import { TIME_SLOTS } from './risk-scoring'

// ---------------------------------------------------------------------------
// Poisson sampling
// ---------------------------------------------------------------------------

/**
 * Knuth's algorithm for Poisson(λ). Adequate for the small λ values we see
 * per (section, slot, day) — typically well under 1.
 *   k = 0; p = 1
 *   do { k++; p *= U; } while (p > exp(-λ))
 *   return k - 1
 */
export function samplePoisson(lambda, rng) {
  if (lambda < 0) throw new Error('lambda must be non-negative')
  if (lambda === 0) return 0
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rng()
  } while (p > L)
  return k - 1
}

// ---------------------------------------------------------------------------
// Event generation
// ---------------------------------------------------------------------------

/**
 * Generate every accident event for one calendar day from the risk matrix.
 *
 * `forceTimeSlot` (optional, 1..5 or null): when set, the whole day runs under
 * the chosen slot's risk regime — every hour of the 24-hour day is treated as
 * if it were that slot, so the day's expected count is the slot's hourly rate
 * applied for 24 hours. Use this to study one time-of-day regime without
 * losing Monte Carlo statistics to a 4-hour sub-sample.
 *
 * Note this now changes the number of accidents, not just their placement: a
 * day of morning rush genuinely produces more accidents than a day of night,
 * which is the point of the fitted rates.
 *
 * Returns events sorted by time of day. Each event is a tuple:
 *   {
 *     id:            'D{day}_{n}'   unique within the run
 *     day:           integer day number
 *     timeSlot:      1..5
 *     sectionIndex:  1..N
 *     region:        region supplying the rate, for reporting
 *     tau:           hour of day in [t_start_b, t_end_b], or [0, 24)
 *                    when forceTimeSlot is set
 *     s:             chainage in km, in [s_start_i, s_end_i]
 *   }
 */
export function generateAccidentsForDay(riskMatrix, day, rng, forceTimeSlot = null) {
  const events = []
  let seq = 1

  const push = (row, slot, tau) => {
    events.push({
      id: `D${day}_${seq++}`,
      day,
      timeSlot: slot.index,
      sectionIndex: row.sectionIndex,
      region: row.region,
      tau,
      s: row.sStart + rng() * (row.sEnd - row.sStart),
    })
  }

  if (forceTimeSlot != null) {
    if (!Number.isInteger(forceTimeSlot) ||
        forceTimeSlot < 1 || forceTimeSlot > TIME_SLOTS.length) {
      throw new Error(`forceTimeSlot must be 1..${TIME_SLOTS.length} or null`)
    }
    const b = forceTimeSlot - 1
    const slot = TIME_SLOTS[b]
    const slotHours = slot.endHour - slot.startHour
    // Stretch the slot's hourly rate over the full 24 hours.
    const dayScale = 24 / slotHours
    for (const row of riskMatrix) {
      const n = samplePoisson(row.lambdaDay[b] * dayScale, rng)
      // Arrivals spread across the whole day so drones see traffic at all
      // hours, while the risk regime stays locked to the forced slot.
      for (let k = 0; k < n; k++) push(row, slot, rng() * 24)
    }
  } else {
    for (const row of riskMatrix) {
      for (let b = 0; b < TIME_SLOTS.length; b++) {
        const slot = TIME_SLOTS[b]
        const n = samplePoisson(row.lambdaDay[b], rng)
        for (let k = 0; k < n; k++) {
          push(row, slot, slot.startHour + rng() * (slot.endHour - slot.startHour))
        }
      }
    }
  }

  events.sort((a, b) => a.tau - b.tau)
  return events
}

/**
 * Format an hour-of-day float as "HH:MM" (τ = 8.25 → 08:15).
 */
export function formatHour(hour) {
  const h = Math.floor(hour) % 24
  const m = Math.floor((hour - Math.floor(hour)) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Top-level: risk matrix → list of accident events
// ---------------------------------------------------------------------------

/**
 * Run the generator over `days` consecutive days.
 *
 *   args:
 *     riskMatrix  — output of risk-scoring.buildRiskMatrix()
 *     days        — integer ≥ 1 (default 1)
 *     rng         — seedable function returning [0, 1) (e.g. makeRng(seed))
 *
 *   returns:
 *     { riskMatrix, events, expectedPerDay }
 *
 * `expectedPerDay` is the corridor's expected accidents per day implied by the
 * fitted rates — useful as a check that the generated sample matches the model.
 */
export function generateAccidents({ riskMatrix, days = 1, rng }) {
  if (typeof rng !== 'function') {
    throw new Error('rng must be a function returning a number in [0, 1)')
  }
  if (!Array.isArray(riskMatrix) || riskMatrix.length === 0) {
    throw new Error('riskMatrix must be a non-empty array')
  }
  if (!Number.isInteger(days) || days < 1) {
    throw new Error('days must be a positive integer')
  }
  const events = []
  for (let d = 1; d <= days; d++) {
    events.push(...generateAccidentsForDay(riskMatrix, d, rng))
  }
  const expectedPerDay = riskMatrix.reduce(
    (sum, row) => sum + row.lambdaDay.reduce((a, b) => a + b, 0),
    0
  )
  return { riskMatrix, events, expectedPerDay }
}

/**
 * Lebanese South Coastal Highway (M51) — Drone Patrol Corridor
 * ============================================================
 *
 * SINGLE-ROAD CONFIGURATION
 *   This dataset has been reduced to a single corridor — the northern
 *   stretch of the M51 motorway (Lebanese South Coastal Highway, locally
 *   "أتستراد البحر" / "Autostrade el-Janoub"), from the Khalde interchange
 *   (just south of Beirut Rafic Hariri International Airport) to the Awali
 *   River bridge crossing — the administrative boundary between Mount
 *   Lebanon and South Governorate, just north of Saida (Sidon).
 *
 *   With R = 1, both Uniform and Risk-aware allocation policies trivially
 *   assign all N drones to this single road. The detection-simulation engine
 *   still divides the road into N equal patrol segments — one per drone —
 *   so the comparison of fleet sizes (N sweep) remains meaningful.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *
 * DATA STATUS — per-input sourcing:
 *
 *   ┌──────────────────────┬──────────┬─────────────────────────────────┐
 *   │ Input                │ Status   │ Source                          │
 *   ├──────────────────────┼──────────┼─────────────────────────────────┤
 *   │ Road identification  │ Real     │ OpenStreetMap (way ref=M51,     │
 *   │                      │          │ highway=motorway, name=أتستراد   │
 *   │                      │          │ البحر)                          │
 *   │ Length (28.6002 km)  │ Real     │ Measured centreline chainage,   │
 *   │                      │          │ Khalde → Awali River bridge.    │
 *   │                      │          │ The display polyline is 27.87   │
 *   │                      │          │ km — a 13-vertex simplification │
 *   │ Polyline geometry    │ Real     │ OSRM simplified route geometry  │
 *   │                      │          │ truncated at the Awali bridge   │
 *   │ Speed limit (80)     │ Real     │ OSM maxspeed=80 on M51 ways +   │
 *   │                      │          │ Lebanese Traffic Law 243/2012   │
 *   │                      │          │ Art. 84 (motorway category)     │
 *   │ AADT (90 000)        │ Real     │ World Bank GBPTP P160224 (2017) │
 *   │                      │ (range)  │ — 200 000 veh/day enter Beirut  │
 *   │                      │          │ via the southern entrance;      │
 *   │                      │          │ corridor avg ≈ 90 000 veh/day.  │
 *   │ Annual accidents     │ Real     │ Corridor crash records: 1 152   │
 *   │ (446/yr)             │          │ crashes, 2016-01 to 2018-07,    │
 *   │                      │          │ annualised. Supersedes the      │
 *   │                      │          │ earlier 150–250/yr estimate     │
 *   │ Pavement condition   │ Estimate │ Modeller, from Mapillary/SV +   │
 *   │                      │          │ World Bank P160223 PAD (2017)   │
 *   │                      │          │ which flags national highway    │
 *   │                      │          │ degradation                     │
 *   └──────────────────────┴──────────┴─────────────────────────────────┘
 *
 * ROAD IDENTIFICATION
 *   OSM ref=M51, highway=motorway, name=أتستراد البحر ("Sea Highway"),
 *   alt_name="Rue 23". Confirmed motorway from Khalde interchange south to
 *   the Awali River viaduct. Way IDs include 27114211, 30733074, 32039956,
 *   32040428 (and others). Queried via the Overpass API:
 *     way["ref"="M51"]["highway"="motorway"]
 *   © OpenStreetMap contributors, ODbL — https://www.openstreetmap.org/copyright
 *
 * LENGTH (28.6002 km)
 *   Measured centreline chainage from the Khalde M51 interchange
 *   (33.7780°N, 35.4904°E) to the Awali River bridge (33.5963°N, 35.3727°E) —
 *   the same chainage the crash panel, the region boundaries and the fitted
 *   risk table are all built on. The Awali crossing is the administrative
 *   boundary between Mount Lebanon and South Governorate and a natural
 *   terminus for the high-traffic Beirut→Saida half of the M51.
 *
 *   The `polyline` below is a 13-vertex simplification whose arc length is
 *   27.87 km: straight chords cut the corners the real road follows. It is a
 *   drawing, not a measurement. Chainage is mapped onto it by fraction in
 *   buildRoadPath() (src/lib/geometry.js), so positions stay correct across
 *   the full 28.6 km. Do not treat the two lengths as interchangeable — the
 *   previous 27.9 km value conflated them.
 *
 * SPEED LIMIT (80 km/h)
 *   OSM `maxspeed=80` tag on the M51 motorway ways. Cross-checked with
 *   Lebanese Traffic Law no. 243 of 22 October 2012, Article 84 (motorway
 *   category: 100 km/h, but 80 km/h is the posted operational limit on this
 *   2-lanes-per-direction coastal section due to mixed access).
 *
 * AADT (90 000 veh/day — corridor average)
 *   Real data point from the World Bank, "Lebanon — Greater Beirut Public
 *   Transport Project", Project Appraisal Document, Project ID P160224
 *   (2017): approximately **200 000 vehicles enter the Greater Beirut Area
 *   via the southern entrance every day** (i.e., at the Khalde interchange).
 *     https://documents.worldbank.org/curated/en/362361507193381282
 *   Volume decreases gradually along the corridor as exits diverge to
 *   Damour, Saadiyat, Jiyeh, Rmeileh, etc. The Khalde→Awali half retains
 *   the heaviest flow because most southern-suburb commuters terminate
 *   before the Awali boundary. A flow-weighted average of ~90 000 veh/day
 *   is used as the single corridor-level AADT figure for risk scoring.
 *
 * ANNUAL ACCIDENTS (446 RTA/yr — measured)
 *   Superseded the earlier 200/yr estimate when corridor crash records became
 *   available. 1 152 crashes were recorded on the Khalde → Awali stretch over
 *   the 31 months from 2016-01 to 2018-07, which annualises to 446/yr. This is
 *   a count from the corridor itself, not a share of a national total.
 *
 *   The figure is roughly double the earlier estimate. The earlier estimate
 *   was built by attributing 8 %–12 % of Lebanon's national casualty-crash
 *   count to this corridor; the records show that share was too low for this
 *   stretch. Both derivations are kept below so the change is auditable.
 *
 *   Accident GENERATION no longer uses this number at all. Expected crashes
 *   come from per-region, per-time-slot rates fitted on the same records
 *   (../data/risk-table.json), and the corridor total is an output of that
 *   model — it reproduces 446/yr without being told to.
 *
 *   SUPERSEDED — the earlier derivation, retained for reference:
 *   Estimated by independent traffic-safety groups as ≈ 8 %–12 % of national
 *   serious transit casualties attributable to the high-speed, poorly lit
 *   M51 Southern Coastal Highway corridor (specifically the Khalde → Awali
 *   stretch — the northern, highest-flow half of the M51).
 *
 *   Real inputs used in the allocation:
 *     • Baseline national average of officially reported traffic crashes
 *       resulting in casualties in Lebanon: 4 259 accidents/yr (historical
 *       state assessment). Recent Internal Security Forces (ISF) data shows
 *       varying annual figures due to underreporting. Sources:
 *         – Open Data Lebanon Crash Repository (multi-year statistics)
 *         – L'Orient Today (state-reported metrics analysis)
 *         – LBCI Lebanon Traffic Report (recent injury spikes)
 *         – AUB Data-Visualization project (spatial severity data)
 *         – UN Road Safety Assessment for Lebanon
 *     • M51 corridor share of serious transit casualties:
 *         8 %  of 4 259 ≈ 341 → lower-bound exposure
 *         12 % of 4 259 ≈ 511 → upper-bound exposure
 *       Independent traffic-safety groups report ≈ 150–250 accidents/yr on
 *       the specific Khalde→Awali M51 stretch (the figure used for risk
 *       analysis on this corridor), reflecting that not all casualty-class
 *       crashes in the national total are coded to this mainline.
 *
 *   Value formerly chosen: 200 RTA/yr, the midpoint of the 150–250 range,
 *   used to derive a corridor-wide daily total d_total_per_day = N_year / 365
 *   which was then spread across sections by manual risk scoring. Both that
 *   constant and the manual scoring have been replaced by the fitted model.
 *
 * PAVEMENT CONDITION (2.7 / 5)
 *   IRI-equivalent visual rating by the modeller from Mapillary and Google
 *   Street View imagery (2023-2024 coverage). The 2.7/5 value reflects the
 *   degraded but functional condition of the M51 mainline:
 *     • The World Bank, "Lebanon — Roads and Employment Project", Project
 *       Appraisal Document, Project ID P160223 (2017), funds a USD 200 M
 *       rehabilitation programme specifically because the Lebanese national
 *       road network has experienced significant pavement deterioration
 *       following the 2019 economic collapse. Source:
 *       https://documents1.worldbank.org/curated/en/210611486651815142/pdf/
 *         Lebanon-Roads-Employment-PAD-P160223-01262017.pdf
 *     • Visible cracking, rutting, and patchy resurfacing on the M51
 *       between Damour and the Awali River bridge (Mapillary / SV, 2023).
 *   This input is NOT extracted from a published condition survey.
 *
 * Composite risk index — Poisson-derived (Step 4 of supervisor's revision):
 *   μ = 0.40 · (accidents / 500)
 *     + 0.25 · (AADT      / 50 000)
 *     + 0.20 · (speedKmh  / 120)
 *     + 0.15 · ((5 − condition) / 4)
 *   R = 1 − exp(−μ)        ∈ (0, 1)
 *
 *   For M51 Khalde→Awali at the measured 446 acc/yr:
 *     μ = 0.40·0.892 + 0.25·1.800 + 0.20·0.667 + 0.15·0.575
 *       = 0.357 + 0.450 + 0.133 + 0.086 = 1.026
 *     R = 1 − e^(−1.026) ≈ 0.642
 *
 *   DISPLAY ONLY. This index is not the risk model. It scores a whole road
 *   from four road-level attributes and is used for cross-road comparison in
 *   the allocation table; with a single corridor it never affects allocation.
 *   Where accidents actually occur, and how often, comes from the fitted
 *   per-region rates in ../data/risk-table.json. The two are independent and
 *   will not agree — do not read this number as a validation of that model.
 *
 *   References: Hauer 1997 "Observational Before-After Studies in Road
 *   Safety"; AASHTO HSM 2010 Ch. 10 (Poisson SPFs); Lord & Mannering 2010
 *   "The statistical analysis of crash-frequency data". Weights are a
 *   modelling choice (not calibrated against Lebanese crash data).
 */

export const ROADS = [
  {
    id: 'm51_khalde_awali',
    name: 'M51 Khalde → Awali (South Coastal Highway, northern stretch)',
    shortName: 'M51 Khalde-Awali',
    color: '#ef4444',
    // Annual crashes on the Khalde-Awali M51 stretch: 446, measured — 1 152
    // crashes recorded over the 31 months from 2016-01 to 2018-07, annualised.
    // Supersedes the earlier 200 (midpoint of an assumed 150–250 range derived
    // from a national share); see the ANNUAL CRASHES note above.
    //
    // This value no longer drives accident generation — the fitted per-region
    // rates in ../data/risk-table.json do — and is retained for the composite
    // road index and for display.
    accidents: 446,
    accidentsRange: [150, 250],
    aadt: 90000,
    speedKmh: 80,
    // Measured centreline chainage, not the display polyline (27.87 km).
    // See buildRoadPath() in src/lib/geometry.js.
    lengthKm: 28.6002,
    condition: 2.7,
    source:
      'Identification: OSM way ref=M51, highway=motorway, name=أتستراد البحر ' +
      '(Sea Highway). Length 27.9 km: polyline arc-length from the Khalde ' +
      'interchange (33.7780°N, 35.4904°E) to the Awali River bridge ' +
      '(33.5963°N, 35.3727°E). ' +
      'Speed 80 km/h: OSM maxspeed=80 + Lebanese Traffic Law 243/2012, Art. 84. ' +
      'AADT 90 000 veh/day: corridor average from World Bank GBPTP P160224 (2017) ' +
      '(200 000 veh/day at Khalde southern entrance to Beirut; decreasing southward). ' +
      'Annual RTAs 200 (range 150–250): ≈ 8 %–12 % of Lebanon\'s 4 259 casualty crashes/yr ' +
      'attributed to the Khalde-Awali M51 stretch by independent traffic-safety groups; ' +
      'cross-references: Open Data Lebanon Crash Repository, L\'Orient Today, LBCI Lebanon ' +
      'Traffic Report, AUB Data-Visualization, UN Road Safety Assessment for Lebanon. ' +
      'Condition 2.7/5: visual estimate from Mapillary / Street View, ' +
      'consistent with the rehabilitation backlog documented in World Bank P160223 PAD (2017). ' +
      'Geometry: OSRM simplified route geometry on OSM motorway ways, truncated at the ' +
      'Awali bridge (© OSM contributors, ODbL — https://www.openstreetmap.org/copyright).',
    description:
      'High-speed coastal motorway running south from the Khalde interchange (just ' +
      'south of Beirut Rafic Hariri International Airport), through Damour, Jiyeh, ' +
      'Saadiyat, and Rmeileh, terminating at the Awali River bridge — the boundary ' +
      'between Mount Lebanon and South Governorate, immediately north of Saida (Sidon). ' +
      'This is the highest-flow, poorly-lit half of the M51 corridor and the focus of ' +
      'the patrol study.',
    // UNUSED by the model — retained as corridor documentation.
    //
    // Manual curvature override (C_i) per 1-km section, 0..2. These were an
    // input to the manual T/C/M risk scoring, which the fitted rate table
    // replaced; nothing reads them now. Curvature still enters the model, but
    // as measured degrees per km inside the fitted equation (`ln_curv`,
    // +0.225), not as a hand-assigned 0-2 band.
    //
    // Kept because the km-by-km description below is an accurate record of the
    // corridor's alignment and is worth not losing. Note it describes 28
    // sections against the corrected 28.6002 km length, which now yields 29.
    // The values follow the geography of the M51 corridor:
    //   km  0-2   Khalde interchange (ramps + curve) → 1
    //   km  3-5   straight motorway south of Khalde → 0
    //   km  5-7   Damour approach (coastal bend) → 1
    //   km  8-12  Damour bypass / straight stretch → 0
    //   km 12-14  Jiyeh coastal curve → 1
    //   km 14-16  straight → 0
    //   km 16-18  Saadiyat bend → 1
    //   km 18-20  straight → 0
    //   km 20-25  Rmeileh / coastal curves → 1
    //   km 25-27  Saida / Awali approach (sharper) → 2
    //   km 27-end Awali bridge → 1
    // 28 entries (one per S_i, S1..S28). Adjust freely from the map.
    sectionCurvature: [
      1, 1, 0, 0, 0,   // S1-S5   Khalde area → straight to Damour
      1, 1, 0, 0, 0,   // S6-S10  Damour approach + bypass
      0, 0, 1, 1, 0,   // S11-S15 toward Jiyeh
      0, 1, 1, 0, 0,   // S16-S20 between Jiyeh and Saadiyat
      0, 1, 1, 1, 1,   // S21-S25 toward Rmeileh
      2, 2, 1,         // S26-S28 Awali approach + bridge
    ],
    // 13-point simplified polyline (OSRM v5 / OSM motorway ways), truncated at
    // the Awali River bridge. Listed as [lat, lon] for the simulation engine.
    polyline: [
      [33.778271, 35.490479], // Khalde M51 interchange (start)
      [33.781166, 35.480057],
      [33.787520, 35.477468],
      [33.752203, 35.453366], // Damour approach
      [33.711474, 35.450026], // Damour bypass
      [33.698738, 35.438622],
      [33.691060, 35.423579],
      [33.666635, 35.428159], // Jiyeh
      [33.655155, 35.422985],
      [33.646377, 35.401627], // Saadiyat
      [33.611102, 35.405354],
      [33.603075, 35.391068], // Rmeileh
      [33.596300, 35.372700], // Awali River bridge (end)
    ],
  },
]

// ---------------------------------------------------------------------------
// Risk calculation
// ---------------------------------------------------------------------------

/**
 * Poisson-derived composite risk score for a single road.
 *
 * Model:
 *   N_i ~ Poisson(μ_i)        — accidents on road i in a unit exposure window
 *   μ_i = w1·A_i + w2·T_i + w3·S_i + w4·C_i
 *   R_i = P(N_i ≥ 1) = 1 − exp(−μ_i)
 *
 * Each predictor is min-max normalised:
 *   A_i = accidents_i / ACC_REF          (accident history)
 *   T_i = AADT_i      / AADT_REF         (traffic intensity)
 *   S_i = speedKmh_i  / SPEED_REF        (speed contribution)
 *   C_i = (5 − condition_i) / COND_RANGE (infrastructure condition, inverted)
 *
 * Weights (sum = 1):
 *   w1 = 0.40  — accident history dominates (strongest predictor)
 *   w2 = 0.25  — traffic volume (exposure)
 *   w3 = 0.20  — operating speed (severity amplifier)
 *   w4 = 0.15  — pavement condition (friction / geometry proxy)
 *
 * Ref: Hauer 1997 "Observational Before-After Studies in Road Safety";
 *      AASHTO HSM 2010 Ch. 10 (Poisson SPFs); Lord & Mannering 2010
 *      "The statistical analysis of crash-frequency data".
 */
const W1 = 0.40, W2 = 0.25, W3 = 0.20, W4 = 0.15
// ACC_REF is the reference accident count the corridor is scored against.
// Raised from 250 to 500 when the measured count replaced the 150–250
// estimate: at ACC_REF = 250 the measured 446 acc/yr gives A_norm = 1.78,
// which contradicts this block's own claim that the predictors are
// normalised into [0, 1]. At 500 — a round bound above the measured value —
// A_norm = 0.892 and the composite reads as intended.
//
// Honest caveat: these are exposure ratios against reference values, not
// min-max normalisations. T_norm has always exceeded 1 (90 000 / 50 000 =
// 1.8), and no rescaling here changes that. The index is ordinal and is
// used for display and cross-road comparison only — accident generation and
// patrol allocation are driven by the fitted rate table, not by this.
const ACC_REF   = 500   // accidents/yr reference (round bound above measured 446)
const AADT_REF  = 50000 // veh/day reference
const SPEED_REF = 120   // km/h reference
const COND_RANGE = 4    // condition scale is 1–5 → max deviation = 4

/** Poisson mean μ_i — expected accidents in the unit exposure window. */
export function computePoissonMean(road) {
  const A = road.accidents / ACC_REF
  const T = road.aadt      / AADT_REF
  const S = road.speedKmh  / SPEED_REF
  const C = (5 - road.condition) / COND_RANGE
  return W1 * A + W2 * T + W3 * S + W4 * C
}

/**
 * Risk score R_i = 1 − e^(−μ_i), the Poisson probability of at least one
 * accident in the unit exposure window.
 */
export function computeRiskScore(road) {
  return 1 - Math.exp(-computePoissonMean(road))
}

/** Returns the individual normalised components, contributions to μ, and R. */
export function computeRiskBreakdown(road) {
  const A = road.accidents / ACC_REF
  const T = road.aadt      / AADT_REF
  const S = road.speedKmh  / SPEED_REF
  const C = (5 - road.condition) / COND_RANGE
  const mu = W1 * A + W2 * T + W3 * S + W4 * C
  return {
    terms: [
      { label: 'A — Accident history',      raw: `${road.accidents} acc/yr`,          norm: A, weight: W1, contrib: W1 * A },
      { label: 'T — Traffic intensity',      raw: `${(road.aadt/1000).toFixed(0)}k veh/day`, norm: T, weight: W2, contrib: W2 * T },
      { label: 'S — Speed contribution',     raw: `${road.speedKmh} km/h`,             norm: S, weight: W3, contrib: W3 * S },
      { label: 'C — Pavement condition',     raw: `${road.condition}/5 (inverted)`,    norm: C, weight: W4, contrib: W4 * C },
    ],
    mu,
    total: 1 - Math.exp(-mu),
  }
}

/**
 * Allocate `totalDrones` across all roads proportionally to risk score.
 * Uses the Largest Remainder Method (Hamilton method) to guarantee that
 * integer counts sum exactly to `totalDrones`.
 *
 * With R = 1 (single-road configuration), this trivially assigns all drones
 * to the M51 corridor.
 *
 * Returns an array sorted by risk score descending, each element:
 * { road, score, percentage, drones, exact }
 */
export function allocateDrones(totalDrones) {
  const scored = ROADS.map(road => ({
    road,
    score: computeRiskScore(road),
  }))

  const totalScore = scored.reduce((s, r) => s + r.score, 0)

  const items = scored.map(r => {
    const proportion = r.score / totalScore
    const exact = proportion * totalDrones
    return {
      road: r.road,
      score: r.score,
      percentage: proportion * 100,
      exact,
      floor: Math.floor(exact),
      frac: exact - Math.floor(exact),
      drones: Math.floor(exact),
    }
  })

  // Distribute remaining drones to roads with highest fractional remainders
  const remaining = totalDrones - items.reduce((s, i) => s + i.drones, 0)
  items
    .slice()
    .sort((a, b) => b.frac - a.frac)
    .slice(0, remaining)
    .forEach(item => { item.drones += 1 })

  return items.sort((a, b) => b.score - a.score)
}

// ---------------------------------------------------------------------------
// Map defaults
// ---------------------------------------------------------------------------

// Centred at the midpoint of the Khalde→Awali stretch of the M51, with a
// zoom that fits the full ~28 km route in a single view.
export const BEIRUT_CENTER = [33.6873, 35.4316]
export const BEIRUT_ZOOM = 11

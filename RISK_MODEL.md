# The M51 Risk Model

**How the simulator decides where and when accidents happen.**

This document covers what the model is built from, how it was estimated, how the
simulator consumes it, and what it is honestly capable of saying.

---

## 0 · The short version

Every accident this simulator generates comes from one number:

> **R** — the expected number of crashes per kilometre of road per hour,
> for a given stretch of the M51 at a given time of day.

`R` is not a score. It has units, it was estimated from crashes that actually
happened on this road, and it can be checked against reality — summing it over
the whole corridor and a whole year returns **445.9 crashes/yr**, which is what
the records show.

```
R × section length × hours          →  expected crashes
Poisson(expected crashes)           →  actual accidents this run
```

Everything else in this document explains where `R` comes from and what it can
and cannot be trusted to say.

**Version note.** This replaced a hand-assigned scoring system in v2 of the
simulator. See [§5](#5--what-changed-from-v1) for the before/after.

---

## 1 · What it is based on

### 1.1 The corridor

| | |
|---|---|
| Road | M51 South Coastal Highway (أوتوستراد البحر), Lebanon |
| Stretch | Khalde interchange → Awali River bridge |
| Length | **28.6002 km** — measured centreline chainage |
| Study period | 2016-01-01 → 2018-07-31 (**31 months**) |
| Spatial units | **7 regions** (see §1.3 for why 7) |
| Time units | **5 time slots** per day |

> ⚠️ **Length has two values and they are not interchangeable.** 28.6002 km is
> the measured chainage. The simulator's display polyline is only 27.87 km,
> because 13 straight chords cut the corners the real road follows. The polyline
> is a *drawing*. All model quantities use chainage; `buildRoadPath()` maps
> chainage onto the drawing by fraction.

### 1.2 The five time slots

| b | Hours | Label | Length |
|---|---|---|---|
| 1 | 00–06 | Night / early morning | 6 h |
| 2 | 06–10 | Morning rush | 4 h |
| 3 | 10–16 | Normal day | 6 h |
| 4 | 16–20 | Evening rush | 4 h |
| 5 | 20–24 | Late evening | 4 h |

**The slots are not equal length.** Because `R` is a rate *per hour*, this is
handled automatically. It was not handled in v1 — see §5.

### 1.3 The crash data, and the limitation it imposes

**Source:** Lebanese Red Cross ambulance records (LOCR extracts).

**1,152 crashes** over 31 months on the corridor → **445.9 per year**.

The single most important fact about this dataset:

> **The Red Cross records carry no coordinates.** The only location field is
> `Emergency City (Case)` — a settlement name. Eight labels name a corridor
> settlement; everything else is off-corridor and excluded.

| Red Cross label | Region |
|---|---|
| `Khalde` | Khalde |
| `Naame` | Naameh |
| `Haret en Naame` | Naameh *(merged)* |
| `Damour` | Damour |
| `Jiye` | Jiyeh |
| `Saadiyat` | Saadiyat |
| `Jadra` | Jadra |
| `Rmaileh` | Rmeileh |

**Consequence — this is the binding constraint on the entire study:** crash
location resolution is the *city*, not a point. The corridor **cannot** be cut
finer than these 7 regions, because the response variable cannot follow. Any
finer spatial claim would be invented, not measured.

This is why the model is fitted on 7 regions and not on 29 one-kilometre
sections, even though geometry and landmark data *are* available per section.

### 1.4 The regions

| Region | Chainage (km) | Length | Crashes | Per year |
|---|---|---|---|---|
| Khalde | 0.000 – 6.306 | 6.306 | 437 | 169.2 |
| Naameh | 6.306 – 8.786 | 2.480 | 140 | 54.2 |
| Damour | 8.786 – 11.969 | 3.183 | 215 | 83.2 |
| Jiyeh | 11.969 – 17.004 | 5.035 | 178 | 68.9 |
| Saadiyat | 17.004 – 19.982 | 2.978 | 81 | 31.4 |
| Jadra | 19.982 – 23.082 | 3.100 | 26 | 10.1 |
| Rmeileh | 23.082 – 28.6002 | 5.518 | 75 | 29.0 |

Note that **no boundary falls on a round kilometre.** This matters later (§3.2).

### 1.5 The covariates

| Variable | What it is | Source | Varies by |
|---|---|---|---|
| `RAF` | Roadside Activity Factor — landmarks ÷ region length | 56-landmark curated set from OSM + manual survey | region |
| `V` | Traffic volume index (relative) | tari2ak GPS probe data, 113,200 points | region × slot |
| `S85` | 85th-percentile speed, km/h | same probe data | region × slot |
| `curvature` | Horizontal curvature, degrees/km | OSM geometry via the corridor centreline | region |
| `ramps_per_mile` | Ramp density | OSM ramp terminals, manually verified on satellite imagery | region |
| `W_wet_frac` | Wet-hour fraction | NOAA Beirut airport + Open-Meteo ERA5 | region × month × slot |

**Region-level values:**

| Region | RAF | Curvature (°/km) | Ramps/mile |
|---|---|---|---|
| Khalde | 4.123 | 37.2 | 2.79 |
| Damour | 3.770 | 19.0 | 3.72 |
| Naameh | 2.419 | 49.6 | 4.32 |
| Saadiyat | 1.007 | 37.1 | 1.61 |
| Jiyeh | 0.993 | 56.8 | 1.94 |
| Rmeileh | 0.725 | 55.7 | 4.84 |
| Jadra | 0.000 | 50.3 | 1.26 |

Observed ranges: `S85` 79.4 – 113.4 km/h · `V` 0.121 – 3.083.

> **`V` is *relative*, not absolute.** It is probe density divided by that
> month's corridor mean. This is deliberate: the source app lost users across
> the period (72,000 corridor points in 2015 falling to 18,500 in 2019), so raw
> counts would read as a traffic collapse that never happened. The cost is that
> genuine month-to-month corridor-wide traffic change is removed along with the
> app trend.

### 1.6 Exposure

The model does not predict a raw count — it predicts a **rate**, by carrying
exposure as a fixed offset:

```
exposure       = length_km × duration_hours
duration_hours = slot_hours × days_in_month
offset         = ln(exposure)
```

This is what makes a 6.3 km region observed over a 6-hour slot comparable with
a 2.5 km region observed over a 4-hour slot.

### 1.7 The panel

**7 regions × 31 months × 5 slots = 1,085 cells.**

**45.9% of cells have zero crashes.** This is essential, not a defect — a count
model without zero rows cannot estimate a rate, only describe crashes that
already happened. The fitting panel refuses to run without them.

---

## 2 · How we got it

### 2.1 Pipeline

```
Red Cross records ──┐
OSM geometry ───────┤
tari2ak probes ─────┼──► panel_region_time_v6.csv ──► GLM fit ──► risk-table.json
NOAA / ERA5 ────────┤         (1,085 cells)          (panel)      (simulator)
Landmark survey ────┘
```

Panel assembly lives in the `dataset_paper` project; fitting is done by the
corridor risk panel (FastAPI + statsmodels).

### 2.2 Choosing the model family

Crash counts are usually overdispersed, so the standard move is Poisson first,
negative binomial if overdispersion is confirmed. **Both were fitted.**

| Test | Value | Reading |
|---|---|---|
| Raw variance-to-mean ratio | 1.74 | looks overdispersed |
| **Residual dispersion after fitting** | **1.1275** | close to 1 |
| Decision threshold | 1.25 | not exceeded |

**Poisson was chosen**, and the reason matters: with an exposure offset and
strong covariates, a count response is routinely overdispersed *before* fitting
and adequate afterwards. The raw ratio of 1.74 is dispersion the covariates and
the offset explain. Deciding on the raw ratio would have added a parameter to
model variance that the mean structure already accounts for.

### 2.3 The fitted equation

```
n_crashes ~ ln_curv + ln_ramps + ln_RAF + ln_V + ln_S85 + sin_m + cos_m
            offset = ln(length_km × duration_hours)
            family = Poisson
```

| Term | Coefficient | Meaning |
|---|---|---|
| Intercept | −21.923 | |
| `ln_RAF` | **+1.344** | doubling roadside activity → **×2.54** crashes |
| `ln_V` | **+0.388** | doubling traffic → **×1.31** |
| `ln_S85` | **+3.010** | speed 10% higher → **×1.33** |
| `ln_curv` | **+0.225** | doubling curvature → **×1.17** |
| `ln_ramps` | **−0.361** | doubling ramp density → **×0.78** ⚠️ |
| `sin_m`, `cos_m` | −0.108, −0.125 | season — peaks July, troughs January, ×1.38 swing |

**Roadside activity is the dominant term.** Landmarks per kilometre — shops,
junctions, places people stop and turn — predicts crashes on this corridor more
strongly than curvature, ramps or speed.

> ⚠️ **The ramp coefficient is negative, and this is deliberate.**
> More ramps, *fewer* crashes (p = 0.005) — the opposite of the standard
> expectation and the opposite of what v1's hand-assigned "merging risk" score
> assumed. This is a property of the data on this corridor and it has been kept
> rather than corrected away. It acts *inside* the fitted rates and is never
> exposed as a standalone factor, so nothing in the simulator asserts anywhere
> that ramps make a road safer. Report it as a finding, not as a mechanism.

### 2.4 Tested and rejected

Honest modelling includes what did not survive:

| Candidate | Why it was dropped |
|---|---|
| **Weather** (`W_wet_frac`) | Significant only *without* a seasonal control, where it was measuring the calendar (January 0.288 wet, August 0.008). With season controlled, RR = 1.008 — rain is neutral once the wet-weather traffic drop is accounted for. |
| **Kernel-weighted RAF** | Carries four parameters, none measured on this corridor; 40 of 56 landmarks have no review data. The plain count won 7 of 8 leave-one-region-out folds. |
| **Time-varying activity** (`τ` by slot) | Collapses to near zero at night — and so does traffic. It re-encoded time of day, which `ln_V` already carries, and volume lost its sign. |
| **Probe-based exposure** | Putting traffic in the offset made the volume covariate redundant; it flipped from +0.236 to −0.847. |
| **Geometry composite** (`GF`) | A single factor fusing a curve CMF and a ramp CMF. Since those act in *opposite* directions here, the composite reported their average and fitted negative while its components fitted separately. Split into `ln_curv` and `ln_ramps`. |

### 2.5 From coefficients to the rate table

The fitted model gives a prediction per *cell* (region × month × slot). The
simulator needs a rate per region × slot. The export:

1. Sum fitted predictions across all 31 months, per region × slot.
2. Divide by summed exposure (km × hours) → **crashes per km per hour**.
3. Averaging across 31 months averages out the seasonal harmonic, so these are
   **annual-mean** rates.
4. **Reconcile:** sum `rate × length × hours × 365` over all regions and slots.

> The reconciliation check is the important step. It returns **445.9 crashes/yr**
> against an observed **445.9/yr** — exact. The export script fails hard if this
> drifts by more than 1 crash/yr.

### 2.6 The resulting rate table

Rates in **crashes per 1,000 km-hours** (multiply by 10⁻³ for the stored values):

| Region | Night | AM rush | Day | PM rush | Late eve |
|---|---|---|---|---|---|
| **Khalde** | 2.412 | 3.536 | 3.718 | 3.631 | 3.379 |
| **Damour** | 1.951 | 3.098 | 3.197 | 3.289 | 2.846 |
| **Naameh** | 1.683 | 2.227 | 2.408 | 2.312 | 2.150 |
| **Jiyeh** | 0.815 | 1.514 | 1.559 | 1.532 | 1.254 |
| **Saadiyat** | 0.827 | 1.364 | 1.411 | 1.366 | 1.084 |
| **Rmeileh** | 0.463 | 0.869 | 0.911 | 0.864 | 0.636 |
| **Jadra** | 0.366 | 0.609 | 0.613 | 0.579 | 0.491 |

Two patterns worth reading off this table:

- **Khalde is ~6× Jadra.** The dangerous end is the northern, Beirut-facing end.
  The southern end is the *quietest* part of the road.
- **Daytime is ~1.5–1.9× night** in every region. This falls out of the traffic
  term; nobody set it.

Stored at `src/partitioning/data/risk-table.json`, with a `provenance` block
carrying the formula, coefficients, family and dispersion so the numbers stay
traceable to the fit that produced them.

---

## 3 · How it works in the simulator

### 3.1 The layers

Three different things, easily confused:

| Layer | Count | What it is |
|---|---|---|
| **Regions** | 7 | Where the rates come from. The data's resolution. |
| **Sections** | 29 | 1-km grid. A *display and simulation* grid, **not** a data grid. |
| **Patrol segments** | = fleet size | One per drone. Any length. Cross regions freely. |

Rates flow **downward**: region → section. Never upward. Within a region every
section carries the same per-km rate, because the data cannot distinguish them.

### 3.2 Sections that straddle boundaries

Region boundaries land at 6.306, 8.786, 11.969, 17.004, 19.982 and 23.082 km —
never on a round kilometre. **Six of the 29 sections straddle two regions.**

A section's rate is the **overlap-length-weighted blend** of every region it
touches:

```
R_i,b = Σ_r ( rate_r,b × overlap(section_i, region_r) ) / Σ_r overlap
```

Taking the rate at the section's midpoint instead — assigning the whole section
to one side — silently moves crashes between regions and **loses 0.8% of the
corridor total**, enough that the annual count no longer reconciles.

### 3.3 Generating accidents

For each section `i` and slot `b`, per simulated day:

```
λ_i,b = R_i,b × length_i × hours_b        expected crashes
N_i,b ~ Poisson(λ_i,b)                    how many actually occur
τ     ~ Uniform(slot start, slot end)     when, within the slot
s     ~ Uniform(section start, end)       where, within the section
```

Each section-slot is drawn **independently**. There is no corridor total being
distributed, no normalisation, and no smoothing constant — a fitted rate is
strictly positive everywhere, so nothing needs propping up.

The corridor's annual count is therefore an **output**, not an input.

### 3.4 Allocating drones

Risk-aware segmentation groups consecutive sections until each drone carries an
equal share of expected crashes:

```
R_i    = Σ_b λ_i,b                 expected crashes per day in section i
target = Σ_i R_i / M               equal share for M drones
```

Greedy left-to-right walk; the boundary section goes to whichever side lands
closer to target. Where `M` exceeds the section count, surplus drones are
distributed by Hamilton's largest-remainder method weighted by segment risk, so
hot segments stack.

**Worked example — 5 drones, ~0.24 crashes/day each:**

| Segment | Chainage | Length | Regions covered |
|---|---|---|---|
| 1 | 0–3 km | 3.0 km | Khalde |
| 2 | 3–6 km | 3.0 km | Khalde |
| 3 | 6–10 km | 4.0 km | Khalde, Naameh, Damour |
| 4 | 10–15 km | 5.0 km | Damour, Jiyeh |
| 5 | 15–28.6 km | 13.6 km | Jiyeh, Saadiyat, Jadra, Rmeileh |

Two drones share the first 6 km; one covers the last 13.6 km. That is the policy
working — patrol density follows crash density.

### 3.5 Chainage vs the drawing

`buildRoadPath()` reports `totalLength` as the **chainage** (28,600.2 m) and maps
positions onto the shorter polyline by fraction:

```
polyline position = chainage × (polylineLength / chainageLength)
```

Without this, chainage past 27.87 km clamps to the final vertex — every accident
in the last 734 m would render stacked on the Awali bridge.

### 3.6 Data flow

```
risk-table.json
      │
      ▼
buildRiskMatrix(road)                    29 rows: R[5], lambdaDay[5], region
      │
      ├──► generateAccidentsForDay()  ──► Poisson draws ──► accident events
      │
      └──► buildRiskAwareSegments()   ──► patrol segments ──► drone states
```

---

## 4 · What it is used for

| Consumer | Uses | For what |
|---|---|---|
| **Accident generator** | `lambdaDay` | Where and when crashes occur in every trial |
| **Risk-aware allocation** | `lambdaDay` | Cutting patrol segments of equal crash load |
| **Monte Carlo sweep** | both | Detection time and P(detect < 2 min) vs fleet size |
| **Fleet availability** | segments | Battery/docking coverage gaps under each policy |
| **Live Trial map** | `R` | Real-time visualisation (with a display-only speed multiplier) |

### Not used for: the road composite index

A separate index exists for cross-road comparison:

```
μ = 0.40·A + 0.25·T + 0.20·S + 0.15·C        R = 1 − e^(−μ)
```

where A = accidents/500, T = AADT/50,000, S = speed/120, C = (5−condition)/4.

> **This is display only.** It scores a whole road from four road-level
> attributes and never touches accident placement or patrol allocation. With a
> single corridor it cannot affect anything. It is **not** a validation of the
> fitted model, and the two will not agree. Note also that these are exposure
> ratios against reference values, not min-max normalisations — `T` exceeds 1.

---

## 5 · What changed from v1

| | v1 — manual scoring | v2 — fitted rates |
|---|---|---|
| Risk quantity | `R = a·T + c·C + m·M`, unitless, 0–2 | crashes per km per hour |
| `T`, `C`, `M` | assigned by hand in {0,1,2} | — |
| Weights | 15 hand-set values, rows summing to 1 | — |
| Annual crashes | **200 assumed** (midpoint of a 150–250 guess) | **446 measured** — a model output |
| Spatial basis | 28 sections scored by eye | 7 regions estimated from 1,152 crashes |
| Time of day | **every slot got exactly 1/5 of the day** | each slot has its own fitted rate |
| Unequal slots | 6 h night and 4 h rush got equal counts | rates are per hour |
| Segmentation | equal share of unitless score | equal expected crashes/day |
| Corridor length | 27.9 km (the polyline, mislabelled) | 28.6002 km chainage |

Two v1 behaviours are worth calling out as defects, not just differences:

1. **Time of day changed only *where*, never *how many*.** One line —
   `perSlotTotal = dailyTotal / 5` — forced every slot to an equal count. The
   time-slot weights looked meaningful and were not.
2. **Per hour, night looked busier than rush hour.** The 6-hour night slot and
   the 4-hour rush slot received the same expected count. Exactly backwards.

v1 also placed high traffic at *both* ends of the corridor. The crash records
say the southern end is the quietest stretch on the road.

---

## 6 · Limitations

Read this section before quoting any number from this model.

1. **Crash location is city-level.** The corridor cannot be split below 7
   regions. This caps the effective sample for any region-constant covariate at
   **7**, not 1,085. It is the binding constraint on everything here.
2. **Ambulance-attended crashes only.** Red Cross records are a *lower bound* on
   true crash frequency. Crashes without an ambulance response are invisible.
3. **The southern end may be understated.** 908 records labelled "Saida" sit at
   the corridor's southern terminus with no coordinates and were excluded.
   Rmeileh's low rate should be read with that in mind.
4. **`V` is relative, not absolute.** Month-level corridor-wide traffic change
   was removed along with the app-adoption trend.
5. **22% of traffic cells are thin** (fewer than 30 probe points) and take a
   region-and-slot fallback value; `V_quality` marks them.
6. **The exposure offset assumes an elasticity of 1**, which the data reject
   (1.33, CI 1.20–1.46). Crashes rise slightly faster than exposure.
7. **The speed coefficient is large (+3.01) over a narrow observed range**
   (79–113 km/h). Do not extrapolate it beyond that band.
8. **Rates are annual means.** The seasonal harmonic (×1.38 July vs January) is
   averaged out in the export, so the simulator has no seasonal variation.
9. **Severity is not modelled.** Every generated accident is identical in kind.
10. **This is observational, not causal.** Coefficients describe association on
    one corridor over 31 months. The negative ramp term (§2.3) is the clearest
    reminder that a coefficient is not a mechanism.

---

## 7 · Files

| Path | Role |
|---|---|
| `src/partitioning/data/risk-table.json` | The rates, plus provenance |
| `src/partitioning/lib/risk-scoring.js` | Table lookup, boundary blending, risk matrix |
| `src/partitioning/lib/accident-generator.js` | Poisson draws → accident events |
| `src/partitioning/lib/uav-segments.js` | Equal-crash-load segmentation |
| `src/partitioning/lib/sections.js` | The 1-km grid |
| `src/partitioning/lib/roads.js` | Corridor facts, composite display index |
| `src/lib/geometry.js` | Chainage ↔ polyline mapping |

### Regenerating the rate table

The table is produced by an export script that fits the model and writes the
JSON. It requires the `dataset_paper` project (panel source + Python core):

```bash
cd panel/backend && python export_risk_table.py path/to/risk-table.json
```

The script re-fits from `panel/examples/m51_panel.csv` and aborts if the
reconciliation check (§2.5) fails.

---

*Model fitted on the M51 v6 panel · 1,085 cells · Poisson GLM, dispersion 1.1275*

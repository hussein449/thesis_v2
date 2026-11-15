# CCR-UAV sandbox

Development area for the third allocation strategy (A3). **Nothing under
`src/` is modified by this work.**

## The rule

- Files here may **import** from `src/` — reading is fine, and it keeps one
  source of truth for the crash-rate table, the geometry helpers and the
  simulator.
- Files here must **never be imported by** `src/`. The application does not
  know this folder exists and behaves exactly as it does on `main`.
- Where the integration would otherwise require editing a file in `src/`,
  that file is **wrapped here** instead — a thin local version that adds the
  CCR case and delegates everything else to the original.

## Layout

| File | What it is |
|---|---|
| `ccr-uav.js` | The algorithm: 100 m grid, risk weights, surrogate waiting time, exact DP partition under the 2.4 km cap. Stages A and B of the specification. |
| `patrol-modes.js` | Wrapper around `buildPatrolSegments` that adds the `'ccr'` mode. The real one in `src/` is untouched. |
| `detection-sim.js` | Copy of the simulator, identical to `src/detection/lib/detection-sim.js` apart from its import lines — it pulls `buildPatrolSegments` from `patrol-modes.js` instead. Re-sync by re-copying and rerunning the import rewrite. |
| `harness.js` | Runs A1 / A2 / A3 on identical accidents and seeds and returns comparable metrics. |

## Why the wrappers exist

`src/partitioning/lib/uav-segments.js` only knows `'uniform'` and
`'risk-aware'`, and `src/detection/lib/policies.js` only registers two
policies. Adding A3 for real means editing both, plus the Monte-Carlo runner
and the live map. That integration is deliberately deferred: the algorithm
has to be verified first, and the manuscript's existing results must stay
reproducible from unmodified application code while that happens.

`harness.js` therefore calls the real `simulateOnce()` with segments this
folder computed, rather than teaching the application a new mode.

## Running it

The dev server serves this folder like any other path, so the modules can be
exercised from the browser console or a scratch page:

```js
const h = await import('/sandbox/ccr/harness.js')
await h.compare({ M: 16, trials: 20 })
```

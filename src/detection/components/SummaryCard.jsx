import { POLICIES } from '../lib/policies'

/** Convert sweep results into a CSV string. */
function toCsv(results) {
  const header = ['policy', 'N', 'avgDetectionTime_s', 'pUnder2Min', 'detectionRate', 'nDetected', 'nMissed', 'nTotal']
  const rows = [header.join(',')]
  for (const [policy, points] of Object.entries(results)) {
    for (const p of points) {
      rows.push([
        policy,
        p.N,
        p.avgDetectionTime != null ? p.avgDetectionTime.toFixed(2) : '',
        p.pUnder2Min.toFixed(4),
        p.detectionRate.toFixed(4),
        p.nDetected,
        p.nMissed,
        p.nTotal,
      ].join(','))
    }
  }
  return rows.join('\n')
}

function downloadCsv(text, filename) {
  const blob = new Blob([text], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Compute simple summary statistics for the discussion section.
 * Shows the best policy at the smallest N, the largest N, and where the
 * crossover (if any) occurs.
 */
function computeSummary(results) {
  const policies = Object.keys(results)
  if (policies.length < 2) return null

  // Every fleet size any policy reported, in order. A policy may be missing
  // a point entirely (CCR-UAV below its length cap), so the set of sizes is
  // the union rather than one policy's list.
  const sizes = [...new Set(
    policies.flatMap((p) => results[p].map((x) => x.N))
  )].sort((x, y) => x - y)
  if (sizes.length === 0) return null

  /**
   * Rank the policies at one fleet size.
   *
   * A point is skipped when the policy could not run there at all: CCR-UAV
   * is reported infeasible below ceil(L / L_max), and showing it as a loss
   * would read as "it was slower" rather than "it was not applicable".
   */
  function rank(N) {
    const entries = []
    for (const p of policies) {
      const r = results[p].find((x) => x.N === N)
      if (!r || r.infeasible || r.avgDetectionTime == null) continue
      entries.push({ policy: p, t: r.avgDetectionTime })
    }
    entries.sort((u, v) => u.t - v.t)
    if (entries.length === 0) return null
    // Within a second of each other is a tie, as before.
    const tied = entries.filter((e) => Math.abs(e.t - entries[0].t) < 1)
    return {
      N,
      entries,
      winner: tied.length === entries.length && entries.length > 1
        ? 'tie'
        : entries[0].policy,
      tiedCount: tied.length,
    }
  }

  const small = rank(sizes[0])
  const large = rank(sizes[sizes.length - 1])
  if (!small || !large) return null

  // Fleet sizes where a policy could not run, so the card can say so
  // instead of leaving a silent gap in the comparison.
  const notApplicable = {}
  for (const p of policies) {
    const missing = sizes.filter((N) => {
      const r = results[p].find((x) => x.N === N)
      return !r || r.infeasible
    })
    if (missing.length) notApplicable[p] = missing
  }

  return { small, large, notApplicable }
}

export default function SummaryCard({ results }) {
  const summary = computeSummary(results)

  return (
    <div className="rounded-2xl ring-1 ring-slate-600/80 bg-slate-700/40 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-800" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
              Summary &amp; tradeoffs
            </span>
          </div>
          <div className="text-[10.5px] text-slate-500 mt-1.5">
            Auto-generated from the sweep. Use this as a starting point for the Step 4 discussion.
          </div>
        </div>
        <button
          onClick={() => downloadCsv(toCsv(results), 'sweep_results.csv')}
          className="px-3 py-1.5 text-[10.5px] font-medium rounded-lg ring-1 ring-slate-700 text-slate-300 hover:text-slate-100 hover:bg-slate-700/50 cursor-pointer transition-colors"
        >
          ⬇ Export CSV
        </button>
      </div>

      {!summary ? (
        <div className="text-[11.5px] text-slate-400">
          Run a sweep with at least two policies to see the comparison.
        </div>
      ) : (
        <div className="space-y-2.5 text-[11.5px] text-slate-200 leading-relaxed">
          {[['smallest', summary.small], ['largest', summary.large]].map(([which, r]) => (
            <p key={which}>
              At the {which} fleet size{' '}
              <span className="font-mono font-medium text-slate-100">N = {r.N}</span>,{' '}
              <span
                style={{ color: r.winner === 'tie' ? undefined : POLICIES[r.winner]?.color }}
                className="font-medium"
              >
                {r.winner === 'tie'
                  ? 'the strategies are within 1 s of each other'
                  : `${POLICIES[r.winner]?.label ?? r.winner} wins`}
              </span>{' '}
              <span className="text-slate-400">
                ({r.entries
                  .map((e) => `${POLICIES[e.policy]?.label ?? e.policy}: ${e.t.toFixed(0)} s`)
                  .join(' vs ')} avg detection time).
              </span>
            </p>
          ))}
          {Object.entries(summary.notApplicable).map(([p, sizes]) => (
            <p key={p} className="text-slate-400">
              <span style={{ color: POLICIES[p]?.color }} className="font-medium">
                {POLICIES[p]?.label ?? p}
              </span>{' '}
              could not cover the corridor at N = {sizes.join(', ')} and is left
              out of the comparison there: below{' '}
              <span className="font-mono">⌈L / (v·T<sub>max</sub>/2)⌉</span> UAVs no
              partition respects its length cap, and relaxing the cap would make
              it a different strategy.
            </p>
          ))}
          <p className="text-slate-400">
            Risk-aware patrol concentrates drones on high-risk sections
            (Khalde, Awali) and stretches them across the open mid-corridor,
            cutting detection time where accidents are most likely.
            Uniform spreads drones evenly along the corridor — simpler, but
            it pays a coverage tax at the risk-heavy ends. CCR-UAV keeps the
            risk weighting but refuses any segment longer than one UAV can
            revisit inside the detection window.
          </p>
        </div>
      )}
    </div>
  )
}

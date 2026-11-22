/**
 * Run a project module outside the browser, through Vite's resolver.
 * ==================================================================
 *
 * The simulation modules under `src/` use extensionless relative imports
 * ('./iot-alert') and a JSON import attribute for the rate table. Both are
 * resolved by Vite in the browser and by the dev server, but bare Node
 * rejects the extensionless form with ERR_MODULE_NOT_FOUND. This runner
 * loads a module through Vite's SSR pipeline instead, so the SAME source the
 * application ships can be driven from the command line with no changes to
 * the simulation code.
 *
 * Usage:
 *   node scripts/validation/run_with_vite.mjs <module> [exportName] [jsonArg]
 *
 * Examples:
 *   node scripts/validation/run_with_vite.mjs ./scripts/validation/battery_sensitivity.js main
 *   node scripts/validation/run_with_vite.mjs ./sandbox/ccr/verify.js runAll
 *
 * With no exportName it calls main / run / default if one is exported.
 * Whatever the function returns is printed as JSON on stdout, so the caller
 * can redirect it to a results file.
 */
import { createServer } from 'vite'

const [target, exportName, jsonArg] = process.argv.slice(2)

if (!target) {
  console.error(
    'usage: node scripts/validation/run_with_vite.mjs <module> [export] [jsonArg]'
  )
  process.exit(2)
}

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true },
})

try {
  const mod = await server.ssrLoadModule(target)
  const entry = exportName
    ? mod[exportName]
    : (mod.main ?? mod.run ?? mod.default)

  if (exportName && typeof entry !== 'function') {
    throw new Error(
      `export "${exportName}" is not a function; available: `
      + Object.keys(mod).join(', ')
    )
  }

  if (typeof entry === 'function') {
    const out = jsonArg !== undefined
      ? await entry(JSON.parse(jsonArg))
      : await entry()
    if (out !== undefined) console.log(JSON.stringify(out, null, 2))
  }
} catch (err) {
  console.error('FAILED:', err?.stack ?? err)
  process.exitCode = 1
} finally {
  await server.close()
}
